# libyuv as a static library for the pose module (YUV → downscaled, rotated RGBA, N-3.2).
# Mirrors upstream CMakeLists.txt at the vendored commit (third_party/libyuv/README.swingcheck.md):
# the same file lists and per-architecture flags, minus tools, tests, JPEG and install rules.
# Row functions are picked at run time by cpu_id, so the SVE/SME objects only run on CPUs that
# have them.
include(CheckCSourceCompiles)

set(LY_DIR ${CMAKE_CURRENT_LIST_DIR}/libyuv)
set(LY_SRC ${LY_DIR}/source)

set(LY_COMMON
  ${LY_SRC}/compare.cc ${LY_SRC}/compare_common.cc ${LY_SRC}/compare_gcc.cc ${LY_SRC}/compare_win.cc
  ${LY_SRC}/convert.cc ${LY_SRC}/convert_argb.cc ${LY_SRC}/convert_from.cc ${LY_SRC}/convert_from_argb.cc
  ${LY_SRC}/convert_jpeg.cc ${LY_SRC}/convert_to_argb.cc ${LY_SRC}/convert_to_i420.cc ${LY_SRC}/cpu_id.cc
  ${LY_SRC}/mjpeg_decoder.cc ${LY_SRC}/mjpeg_validate.cc ${LY_SRC}/planar_functions.cc
  ${LY_SRC}/rotate.cc ${LY_SRC}/rotate_any.cc ${LY_SRC}/rotate_argb.cc ${LY_SRC}/rotate_common.cc
  ${LY_SRC}/rotate_gcc.cc ${LY_SRC}/rotate_win.cc
  ${LY_SRC}/row_any.cc ${LY_SRC}/row_common.cc ${LY_SRC}/row_gcc.cc ${LY_SRC}/row_rvv.cc ${LY_SRC}/row_win.cc
  ${LY_SRC}/scale.cc ${LY_SRC}/scale_any.cc ${LY_SRC}/scale_argb.cc ${LY_SRC}/scale_common.cc
  ${LY_SRC}/scale_gcc.cc ${LY_SRC}/scale_rgb.cc ${LY_SRC}/scale_rvv.cc ${LY_SRC}/scale_uv.cc ${LY_SRC}/scale_win.cc
  ${LY_SRC}/video_common.cc)

set(LY_DEFS LIBYUV_DISABLE_RVV)
set(LY_OBJECTS)

function(ly_objects name flags)
  add_library(${name} OBJECT ${ARGN})
  target_include_directories(${name} PRIVATE ${LY_DIR}/include)
  target_compile_definitions(${name} PRIVATE ${LY_DEFS})
  set_target_properties(${name} PROPERTIES POSITION_INDEPENDENT_CODE ON)
  # The dev client is a debug build (-O1 from build.gradle's cppFlags). The conversion is
  # measured (convertMs), so libyuv is always optimized; the later -O3 wins.
  target_compile_options(${name} PRIVATE -O3)
  if(flags)
    target_compile_options(${name} PRIVATE ${flags})
  endif()
endfunction()

if(ANDROID_ABI STREQUAL "armeabi-v7a")
  list(APPEND LY_DEFS LIBYUV_NEON=1)
  ly_objects(yuv_neon "-mfpu=neon"
    ${LY_SRC}/compare_neon.cc ${LY_SRC}/rotate_neon.cc ${LY_SRC}/row_neon.cc ${LY_SRC}/scale_neon.cc)
  list(APPEND LY_OBJECTS $<TARGET_OBJECTS:yuv_neon>)
elseif(ANDROID_ABI STREQUAL "arm64-v8a")
  set(OLD_FLAGS ${CMAKE_REQUIRED_FLAGS})
  set(OLD_TYPE ${CMAKE_TRY_COMPILE_TARGET_TYPE})
  set(CMAKE_REQUIRED_FLAGS "${CMAKE_REQUIRED_FLAGS} -march=armv8.5-a+i8mm+sme")
  set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)
  check_c_source_compiles("
__arm_locally_streaming void func(void) { }
int main(void) { return 0; }
  " LY_CAN_COMPILE_SME)
  set(CMAKE_REQUIRED_FLAGS ${OLD_FLAGS})
  set(CMAKE_TRY_COMPILE_TARGET_TYPE ${OLD_TYPE})
  if(NOT LY_CAN_COMPILE_SME)
    list(APPEND LY_DEFS LIBYUV_DISABLE_SME)
  endif()

  ly_objects(yuv_neon64 "-march=armv8.2-a+dotprod+i8mm"
    ${LY_SRC}/compare_neon64.cc ${LY_SRC}/rotate_neon64.cc ${LY_SRC}/row_neon64.cc ${LY_SRC}/scale_neon64.cc)
  ly_objects(yuv_sve "-march=armv8.5-a+i8mm+sve2" ${LY_SRC}/row_sve.cc)
  list(APPEND LY_OBJECTS $<TARGET_OBJECTS:yuv_neon64> $<TARGET_OBJECTS:yuv_sve>)
  if(LY_CAN_COMPILE_SME)
    ly_objects(yuv_sme "-march=armv8.5-a+i8mm+sme"
      ${LY_SRC}/rotate_sme.cc ${LY_SRC}/row_sme.cc ${LY_SRC}/scale_sme.cc)
    list(APPEND LY_OBJECTS $<TARGET_OBJECTS:yuv_sme>)
  endif()
endif()

# After the ABI branch, so the common objects see the same definitions (LIBYUV_NEON,
# LIBYUV_DISABLE_SME) as the architecture objects, as upstream's add_definitions gives.
ly_objects(yuv_common "" ${LY_COMMON})
add_library(yuv STATIC $<TARGET_OBJECTS:yuv_common> ${LY_OBJECTS})
target_include_directories(yuv PUBLIC ${LY_DIR}/include)
target_compile_definitions(yuv PUBLIC ${LY_DEFS})
