package com.margelo.nitro.swingcheck.pose

import android.graphics.PixelFormat
import androidx.camera.core.ImageProxy
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** JNI entry points in libSwingPose.so (src/main/cpp/yuv_convert.cpp). */
internal object YuvNative {
  @JvmStatic external fun version(): Int

  @JvmStatic external fun scratchBytes(width: Int, height: Int, scaledWidth: Int, scaledHeight: Int): Long

  @JvmStatic external fun convert(
    y: ByteBuffer, yOff: Int, yRowStride: Int,
    u: ByteBuffer, uOff: Int, v: ByteBuffer, vOff: Int, uvRowStride: Int, uvPixelStride: Int,
    width: Int, height: Int, rotation: Int,
    scaledWidth: Int, scaledHeight: Int,
    scratch: ByteBuffer, out: ByteBuffer,
  ): Int

  @JvmStatic external fun rotateRgba(
    src: ByteBuffer, srcOff: Int, srcRowStride: Int, width: Int, height: Int, rotation: Int, out: ByteBuffer,
  ): Int

  @JvmStatic external fun rgbaToJ420(rgba: ByteBuffer, width: Int, height: Int, dst: ByteBuffer): Int
}

/**
 * Camera frame → upright RGBA for MediaPipe, in buffers reused between frames. Not thread-safe:
 * one instance per caller thread (the detector's lives on the camera thread).
 */
internal class FrameConverter {
  class Output(val buffer: ByteBuffer, val width: Int, val height: Int)

  private var scratch: ByteBuffer? = null
  private var out: ByteBuffer? = null

  /**
   * YUV_420_888 (pixelFormat 'yuv') → downscaled to [LONG_SIDE] and rotated by [rotation];
   * RGBA_8888 ('rgb', the comparison path) → rotated only, at the camera's size.
   */
  fun convert(image: ImageProxy, rotation: Int): Output {
    val planes = image.planes
    return if (image.format == PixelFormat.RGBA_8888 || planes.size == 1) {
      val p = planes[0]
      rgba(p.buffer, p.buffer.position(), p.rowStride, image.width, image.height, rotation)
    } else {
      val y = planes[0]
      val u = planes[1]
      val v = planes[2]
      yuv(
        y.buffer, y.buffer.position(), y.rowStride,
        u.buffer, u.buffer.position(), v.buffer, v.buffer.position(), u.rowStride, u.pixelStride,
        image.width, image.height, rotation,
      )
    }
  }

  fun yuv(
    y: ByteBuffer, yOff: Int, yRowStride: Int,
    u: ByteBuffer, uOff: Int, v: ByteBuffer, vOff: Int, uvRowStride: Int, uvPixelStride: Int,
    width: Int, height: Int, rotation: Int, longSide: Int = LONG_SIDE,
  ): Output {
    val s = min(1.0, longSide.toDouble() / max(width, height))
    val sw = even(width * s)
    val sh = even(height * s)
    val scratch = scratch(YuvNative.scratchBytes(width, height, sw, sh).toInt())
    val out = out(sw * sh * 4)
    val rc = YuvNative.convert(
      y, yOff, yRowStride, u, uOff, v, vOff, uvRowStride, uvPixelStride,
      width, height, rotation, sw, sh, scratch, out,
    )
    check(rc == 0) { "libyuv conversion failed in step ${-rc}" }
    return upright(out, sw, sh, rotation)
  }

  fun rgba(src: ByteBuffer, srcOff: Int, rowStride: Int, width: Int, height: Int, rotation: Int): Output {
    val out = out(width * height * 4)
    val rc = YuvNative.rotateRgba(src, srcOff, rowStride, width, height, rotation, out)
    check(rc == 0) { "libyuv ARGBRotate failed ($rc)" }
    return upright(out, width, height, rotation)
  }

  private fun upright(out: ByteBuffer, w: Int, h: Int, rotation: Int): Output {
    out.rewind()
    return if (rotation == 90 || rotation == 270) Output(out, h, w) else Output(out, w, h)
  }

  private fun scratch(bytes: Int): ByteBuffer =
    scratch?.takeIf { it.capacity() >= bytes } ?: direct(bytes).also { scratch = it }

  private fun out(bytes: Int): ByteBuffer =
    out?.takeIf { it.capacity() >= bytes } ?: direct(bytes).also { out = it }

  companion object {
    /** Long side of the upright input to MediaPipe: the web asks for 1280×720 (useCamera.ts). */
    const val LONG_SIDE = 1280

    fun direct(bytes: Int): ByteBuffer = ByteBuffer.allocateDirect(bytes).order(ByteOrder.nativeOrder())

    private fun even(v: Double): Int = max(2, (v / 2).roundToInt() * 2)
  }
}
