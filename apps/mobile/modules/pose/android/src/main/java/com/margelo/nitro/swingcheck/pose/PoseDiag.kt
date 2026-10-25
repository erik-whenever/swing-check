package com.margelo.nitro.swingcheck.pose

import android.os.Process
import android.util.Log
import java.io.File
import java.util.concurrent.Callable
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * N-3.2 diagnosis (why lite takes ~180 ms on the Galaxy A16 4G instead of 20–40 ms). Knobs the
 * dev screen sets through PoseProbe, and per-frame values the detector leaves for PoseProbe to
 * read right after detect() on the same thread. None of this is part of the PoseDetector
 * contract; with the defaults the detector behaves exactly as before.
 */
internal object PoseDiag {
  private const val TAG = "SwingPose"

  /** 'camera' = VisionCamera's frame thread (as before), otherwise a dedicated thread at that priority. */
  @Volatile var inferenceThread: String = "camera"
    private set

  /** 0 = MediaPipe's Java default (TFLite CPU, cpu_num_thread -1); n > 0 = XNNPACK with n threads. CPU only. */
  @Volatile var cpuThreads: Int = 0
    private set

  /** Bumped by every change, so the detector rebuilds its landmarker on the next frame. */
  @Volatile var generation = 0
    private set

  @Synchronized
  fun set(thread: String, threads: Int) {
    require(thread in PRIORITIES) { "unknown inference thread '$thread'" }
    if (thread == inferenceThread && threads == cpuThreads) return
    inferenceThread = thread
    cpuThreads = threads
    generation++
  }

  val PRIORITIES = mapOf(
    "camera" to null,
    "default" to Process.THREAD_PRIORITY_DEFAULT,
    "urgent-display" to Process.THREAD_PRIORITY_URGENT_DISPLAY,
    "video" to Process.THREAD_PRIORITY_VIDEO,
  )

  private val executors = HashMap<String, ExecutorService>()

  /**
   * Runs [block] on the thread [mode] names and waits for it. MediaPipe's graph and XNNPACK's
   * pool are created by the thread that builds the landmarker, and Linux threads inherit the
   * creator's nice value, so building on the dedicated thread gives them its priority too.
   */
  fun <T> runOn(mode: String, block: () -> T): T {
    val priority = PRIORITIES[mode] ?: return block()
    val executor = synchronized(executors) {
      executors.getOrPut(mode) {
        Executors.newSingleThreadExecutor { r ->
          Thread({
            Process.setThreadPriority(priority)
            r.run()
          }, "SwingPose-$mode").apply { isDaemon = true }
        }
      }
    }
    return try {
      executor.submit(Callable { block() }).get()
    } catch (e: java.util.concurrent.ExecutionException) {
      throw e.cause ?: e
    }
  }

  // The latest frame, written by detect() on the thread that runs it.
  @Volatile var wrapMs = 0.0
  @Volatile var detectMs = 0.0
  @Volatile var packMs = 0.0
  @Volatile var inferenceCpu = -1
  @Volatile var callerCpu = -1
  @Volatile var inferenceNice = 0

  /** Field 39 of /proc/self/task/<tid>/stat: the CPU the thread last ran on. */
  fun cpuOf(tid: Int): Int = stat(tid)?.let { it.getOrNull(PROCESSOR)?.toIntOrNull() } ?: -1

  /**
   * The fields after "(comm)", re-indexed so that [PROCESSOR] etc. match proc(5)'s 1-based field
   * numbers. comm may contain spaces, so the split starts after the last ')'.
   */
  private fun stat(tid: Int): List<String>? =
    try {
      val s = File("/proc/self/task/$tid/stat").readText()
      val close = s.lastIndexOf(')')
      listOf("", s.substring(0, s.indexOf(' ')), s.substring(s.indexOf('(') + 1, close)) +
        s.substring(close + 2).trim().split(' ')
    } catch (_: Exception) {
      null
    }

  private const val UTIME = 14
  private const val STIME = 15
  private const val NICE = 19
  private const val PROCESSOR = 39

  // Thread sampling (1 Hz from the JS thread): CPU time per thread and the cores it was seen on.
  private class ThreadAcc(val name: String) {
    var firstTicks = -1L
    var lastTicks = 0L
    var nice = 0
    val cores = HashMap<Int, Int>()
  }

  private val threads = HashMap<Int, ThreadAcc>()
  private var sampleStartMs = 0L
  private var sampleLastMs = 0L

  @Synchronized
  fun resetThreadSamples() {
    threads.clear()
    sampleStartMs = 0L
  }

  @Synchronized
  fun sampleThreads() {
    val now = android.os.SystemClock.elapsedRealtime()
    if (sampleStartMs == 0L) sampleStartMs = now
    sampleLastMs = now
    val dir = File("/proc/self/task").listFiles() ?: return
    for (d in dir) {
      val tid = d.name.toIntOrNull() ?: continue
      val f = stat(tid) ?: continue
      val ticks = (f.getOrNull(UTIME)?.toLongOrNull() ?: 0L) + (f.getOrNull(STIME)?.toLongOrNull() ?: 0L)
      val acc = threads.getOrPut(tid) { ThreadAcc(f[2]) }
      if (acc.firstTicks < 0) acc.firstTicks = ticks
      // Only count a core when the thread ran since the last sample: an idle thread's
      // "last CPU" says nothing about where the work goes.
      val ran = ticks > acc.lastTicks && acc.lastTicks > 0
      acc.lastTicks = ticks
      acc.nice = f.getOrNull(NICE)?.toIntOrNull() ?: 0
      val cpu = f.getOrNull(PROCESSOR)?.toIntOrNull() ?: -1
      if (ran) acc.cores[cpu] = (acc.cores[cpu] ?: 0) + 1
    }
  }

  /**
   * JSON: the threads that used ≥ 1 % of one core over the sampled span, busiest first, with
   * CPU share (100 = one full core), nice value and the cores they were seen running on.
   */
  @Synchronized
  fun threadReport(): String {
    val spanS = (sampleLastMs - sampleStartMs) / 1000.0
    if (spanS <= 0) return "{\"spanS\":0,\"threads\":[]}"
    val hz = 100.0 // USER_HZ is 100 on Android
    val rows = threads.entries
      .map { (tid, a) -> Triple(tid, a, 100.0 * (a.lastTicks - a.firstTicks) / hz / spanS) }
      .filter { it.third >= 1.0 }
      .sortedByDescending { it.third }
    val body = rows.joinToString(",") { (tid, a, pct) ->
      val cores = a.cores.entries.sortedBy { it.key }.joinToString(",") { "\"${it.key}\":${it.value}" }
      "{\"tid\":$tid,\"name\":${json(a.name)},\"cpuPct\":${"%.1f".format(java.util.Locale.ROOT, pct)},\"nice\":${a.nice},\"cores\":{$cores}}"
    }
    return "{\"spanS\":${"%.1f".format(java.util.Locale.ROOT, spanS)},\"threads\":[$body]}"
  }

  /** "0-5:2000,6-7:2200" (MHz, cpuinfo_max_freq): which cores are big. */
  fun cpuClusters(): String {
    val freqs = (0 until 16).mapNotNull { i ->
      try {
        i to File("/sys/devices/system/cpu/cpu$i/cpufreq/cpuinfo_max_freq").readText().trim().toLong() / 1000
      } catch (_: Exception) {
        null
      }
    }
    if (freqs.isEmpty()) return "?"
    val groups = mutableListOf<Triple<Int, Int, Long>>()
    for ((i, f) in freqs) {
      val g = groups.lastOrNull()
      if (g != null && g.third == f && g.second == i - 1) groups[groups.size - 1] = Triple(g.first, i, f) else groups.add(Triple(i, i, f))
    }
    return groups.joinToString(",") { (a, b, f) -> (if (a == b) "$a" else "$a-$b") + ":$f" }
  }

  private val LOG_PATTERN = Regex(
    "tflite|TfLite|XNNPACK|xnnpack|OpenCL|OpenGL|GPU|gpu|delegate|Delegate|mediapipe|MediaPipe|SwingPose|calculator",
  )

  /**
   * This process's own logcat lines that mention TFLite, the delegates or MediaPipe (an app may
   * read its own log without READ_LOGS). Shows whether the GPU delegate came up on OpenCL or
   * OpenGL, fell back, or left ops on the CPU.
   */
  fun logcat(maxLines: Int): String =
    try {
      val p = ProcessBuilder("logcat", "-d", "-v", "threadtime", "--pid=${Process.myPid()}")
        .redirectErrorStream(true)
        .start()
      val lines = p.inputStream.bufferedReader().readLines().filter { LOG_PATTERN.containsMatchIn(it) }
      p.waitFor()
      lines.takeLast(maxLines).joinToString("\n")
    } catch (e: Exception) {
      Log.w(TAG, "logcat failed", e)
      "logcat: ${e.message}"
    }

  private fun json(s: String): String = "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
}
