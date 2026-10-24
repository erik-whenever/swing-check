// YUV_420_888 → downscaled, rotated, upright RGBA for MediaPipe (N-3.2, ADR-0004 tillägget).
// One JNI call per frame, on the camera thread, over buffers that Kotlin owns and reuses:
//   1. chroma to planar I420 if the camera interleaves it (pixel stride 2, NV12/NV21),
//   2. I420Scale to the output size in the buffer's own orientation (box filter),
//   3. I420Rotate by ImageInfo.rotationDegrees (clockwise, the CameraX convention),
//   4. J420ToABGR: full-range BT.601 → R,G,B,A bytes (libyuv's "ABGR" is RGBA in memory).
// Scaling first means steps 3–4 only touch the 720×1280 pixels, not the 1080p ones.
#include <jni.h>
#include <cstdint>

#include "libyuv/convert_argb.h"
#include "libyuv/convert_from_argb.h"
#include "libyuv/rotate.h"
#include "libyuv/rotate_argb.h"
#include "libyuv/scale.h"
#include "libyuv/version.h"

namespace {

inline int half(int v) { return (v + 1) >> 1; }

// Scratch layout, in order: deinterleaved chroma at source size (U, V), the scaled I420
// (Y, U, V) and the rotated I420 (Y, U, V). sw × sh is the output size before rotation.
struct Layout {
  size_t srcChroma, scaledY, scaledC, total;
};

Layout layout(int width, int height, int sw, int sh) {
  Layout l{};
  l.srcChroma = (size_t)half(width) * half(height);
  l.scaledY = (size_t)sw * sh;
  l.scaledC = (size_t)half(sw) * half(sh);
  l.total = 2 * l.srcChroma + 2 * (l.scaledY + 2 * l.scaledC);
  return l;
}

uint8_t* addr(JNIEnv* env, jobject buffer, jint offset) {
  auto* base = static_cast<uint8_t*>(env->GetDirectBufferAddress(buffer));
  return base == nullptr ? nullptr : base + offset;
}

}  // namespace

extern "C" {

JNIEXPORT jint JNICALL
Java_com_margelo_nitro_swingcheck_pose_YuvNative_version(JNIEnv*, jclass) {
  return LIBYUV_VERSION;
}

JNIEXPORT jlong JNICALL
Java_com_margelo_nitro_swingcheck_pose_YuvNative_scratchBytes(JNIEnv*, jclass, jint width, jint height,
                                                              jint scaledWidth, jint scaledHeight) {
  return (jlong)layout(width, height, scaledWidth, scaledHeight).total;
}

/**
 * Returns 0 on success, a negative step number on failure. Never throws: the caller turns a
 * failure into status 'error' for that frame (pose-android.md §1, VC #4219).
 * scaledWidth × scaledHeight is the size before rotation; the RGBA in `out` is the rotated
 * size (swapped for 90/270), tightly packed.
 */
JNIEXPORT jint JNICALL
Java_com_margelo_nitro_swingcheck_pose_YuvNative_convert(
    JNIEnv* env, jclass,
    jobject yBuf, jint yOff, jint yRowStride,
    jobject uBuf, jint uOff, jobject vBuf, jint vOff, jint uvRowStride, jint uvPixelStride,
    jint width, jint height, jint rotation,
    jint scaledWidth, jint scaledHeight,
    jobject scratchBuf, jobject outBuf) {
  const uint8_t* srcY = addr(env, yBuf, yOff);
  const uint8_t* srcU = addr(env, uBuf, uOff);
  const uint8_t* srcV = addr(env, vBuf, vOff);
  uint8_t* scratch = addr(env, scratchBuf, 0);
  uint8_t* out = addr(env, outBuf, 0);
  if (!srcY || !srcU || !srcV || !scratch || !out) return -1;
  const Layout l = layout(width, height, scaledWidth, scaledHeight);
  if (env->GetDirectBufferCapacity(scratchBuf) < (jlong)l.total) return -1;

  // 1. Planar chroma at source size. Pixel stride 1 is already I420: read it in place.
  int strideU = uvRowStride, strideV = uvRowStride;
  if (uvPixelStride != 1) {
    uint8_t* u = scratch;
    uint8_t* v = scratch + l.srcChroma;
    // dst_y = nullptr: chroma only (libyuv skips the Y plane). Handles NV12, NV21 and any
    // other pixel stride.
    if (libyuv::Android420ToI420Rotate(nullptr, 0, srcU, uvRowStride, srcV, uvRowStride, uvPixelStride,
                                       nullptr, 0, u, half(width), v, half(width), width, height,
                                       libyuv::kRotate0) != 0) {
      return -2;
    }
    srcU = u;
    srcV = v;
    strideU = strideV = half(width);
  }

  // 2. Scale. Box averages every source pixel, which is closest to the camera's own downscaling.
  // OSÄKER: kFilterBox kostar mer än kFilterBilinear. Om convertMs blir för högt på Helio G99 är
  // bytet en rad; pose bör inte märka skillnaden vid 1,5× nedskalning.
  uint8_t* sY = scratch + 2 * l.srcChroma;
  uint8_t* sU = sY + l.scaledY;
  uint8_t* sV = sU + l.scaledC;
  const int sw = scaledWidth, sh = scaledHeight;
  if (libyuv::I420Scale(srcY, yRowStride, srcU, strideU, srcV, strideV, width, height,
                        sY, sw, sU, half(sw), sV, half(sw), sw, sh, libyuv::kFilterBox) != 0) {
    return -3;
  }

  // 3. Rotate to upright.
  const uint8_t* rY = sY;
  const uint8_t* rU = sU;
  const uint8_t* rV = sV;
  int ow = sw, oh = sh;
  if (rotation != 0) {
    if (rotation == 90 || rotation == 270) {
      ow = sh;
      oh = sw;
    }
    uint8_t* dY = sV + l.scaledC;
    uint8_t* dU = dY + l.scaledY;
    uint8_t* dV = dU + l.scaledC;
    if (libyuv::I420Rotate(sY, sw, sU, half(sw), sV, half(sw), dY, ow, dU, half(ow), dV, half(ow), sw, sh,
                           static_cast<libyuv::RotationMode>(rotation)) != 0) {
      return -4;
    }
    rY = dY;
    rU = dU;
    rV = dV;
  }
  if (env->GetDirectBufferCapacity(outBuf) < (jlong)ow * oh * 4) return -5;

  // 4. To RGBA. Full range (JFIF), the range Camera2 specifies for YUV_420_888 streams.
  // OSÄKER: CameraX:s egen RGBA-väg ('rgb') räknar med begränsat omfång (BT.601 limited), och
  // en enhet som levererar begränsat omfång ger något lägre kontrast här. Paritetsbilden går genom
  // samma funktion (detectImage viaYuv) och visar effekten på landmärkena.
  if (libyuv::J420ToABGR(rY, ow, rU, half(ow), rV, half(ow), out, ow * 4, ow, oh) != 0) return -6;
  return 0;
}

/** Tightly packed RGBA → full-range planar I420 (Y, then U, then V). For the parity round trip. */
JNIEXPORT jint JNICALL
Java_com_margelo_nitro_swingcheck_pose_YuvNative_rgbaToJ420(JNIEnv* env, jclass, jobject rgbaBuf, jint width,
                                                            jint height, jobject dstBuf) {
  const uint8_t* rgba = addr(env, rgbaBuf, 0);
  uint8_t* y = addr(env, dstBuf, 0);
  if (!rgba || !y) return -1;
  const size_t ySize = (size_t)width * height;
  const size_t cSize = (size_t)half(width) * half(height);
  if (env->GetDirectBufferCapacity(dstBuf) < (jlong)(ySize + 2 * cSize)) return -1;
  uint8_t* u = y + ySize;
  uint8_t* v = u + cSize;
  return libyuv::ABGRToJ420(rgba, width * 4, y, width, u, half(width), v, half(width), width, height);
}

}  // extern "C"
