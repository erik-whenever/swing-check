project(SwingPose)
cmake_minimum_required(VERSION 3.9.0)

set (PACKAGE_NAME SwingPose)
set (CMAKE_VERBOSE_MAKEFILE ON)
set (CMAKE_CXX_STANDARD 20)

# libyuv, vendored (third_party/libyuv/README.swingcheck.md): YUV → downscaled, rotated RGBA.
include(${CMAKE_SOURCE_DIR}/third_party/libyuv.cmake)

# Define C++ library and add all sources
add_library(${PACKAGE_NAME} SHARED
        src/main/cpp/cpp-adapter.cpp
        src/main/cpp/yuv_convert.cpp
)
# Measured per frame (convertMs): optimized in the debug dev client too.
set_source_files_properties(src/main/cpp/yuv_convert.cpp PROPERTIES COMPILE_OPTIONS "-O3")

# Add Nitrogen specs :)
include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/SwingPose+autolinking.cmake)

# Set up local includes
include_directories(
        "src/main/cpp"
        "../cpp"
)

find_library(LOG_LIB log)
find_package(react-native-vision-camera REQUIRED)   # <-- for the HybridFrameSpec

# Link all libraries together
target_link_libraries(
        ${PACKAGE_NAME}
        ${LOG_LIB}
        android                                   # <-- Android core
        react-native-vision-camera::VisionCamera
        yuv
)
