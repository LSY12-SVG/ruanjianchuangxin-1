cmake_minimum_required(VERSION 3.22.1)

# React Native new architecture expects this exact shared lib to exist.
project(appmodules)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

set(THIRD_PARTY_DIR ${CMAKE_CURRENT_SOURCE_DIR}/third_party)
set(LCMS2_DIR ${THIRD_PARTY_DIR}/Little-CMS-master)
set(LIBRAW_DIR ${THIRD_PARTY_DIR}/libraw)

file(GLOB LCMS2_SOURCES ${LCMS2_DIR}/src/*.c)

file(GLOB LIBRAW_ROOT_SOURCES
  ${LIBRAW_DIR}/src/libraw_c_api.cpp
  ${LIBRAW_DIR}/src/libraw_datastream.cpp
)

file(GLOB LIBRAW_SOURCES
  ${LIBRAW_DIR}/src/decoders/*.cpp
  ${LIBRAW_DIR}/src/decompressors/*.cpp
  ${LIBRAW_DIR}/src/demosaic/*.cpp
  ${LIBRAW_DIR}/src/metadata/*.cpp
  ${LIBRAW_DIR}/src/postprocessing/*.cpp
  ${LIBRAW_DIR}/src/preprocessing/*.cpp
  ${LIBRAW_DIR}/src/tables/*.cpp
  ${LIBRAW_DIR}/src/utils/*.cpp
  ${LIBRAW_DIR}/src/write/*.cpp
)

add_library(lcms2 STATIC ${LCMS2_SOURCES})
target_include_directories(lcms2 PUBLIC ${LCMS2_DIR}/include ${LCMS2_DIR}/src)

add_library(libraw STATIC ${LIBRAW_ROOT_SOURCES} ${LIBRAW_SOURCES})
target_include_directories(libraw PUBLIC ${LIBRAW_DIR} ${LIBRAW_DIR}/libraw)
target_compile_definitions(libraw PRIVATE LIBRAW_NODLL)

add_library(
  procolorengine
  SHARED
  pro_engine/jni_bridge.cpp
  pro_engine/pipeline.cpp
  pro_engine/icc_lcms.cpp
  pro_engine/export.cpp
  ${THIRD_PARTY_DIR}/lodepng.cpp
)

target_include_directories(
  procolorengine
  PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${THIRD_PARTY_DIR}
  ${LCMS2_DIR}/include
  ${LIBRAW_DIR}
  ${LIBRAW_DIR}/libraw
)

find_library(log-lib log)
find_library(jnigraphics-lib jnigraphics)

target_link_libraries(
  procolorengine
  lcms2
  libraw
  ${log-lib}
  ${jnigraphics-lib}
)
