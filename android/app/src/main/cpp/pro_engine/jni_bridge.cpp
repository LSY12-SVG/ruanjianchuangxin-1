#include "pro_engine/pro_engine.h"

#include <jni.h>

#include <sstream>
#include <string>
#include <vector>

namespace {

std::string JStringToString(JNIEnv* env, jstring value) {
  if (value == nullptr) {
    return "";
  }
  const char* chars = env->GetStringUTFChars(value, nullptr);
  std::string out(chars ? chars : "");
  env->ReleaseStringUTFChars(value, chars);
  return out;
}

std::vector<double> JDoubleArrayToVector(JNIEnv* env, jdoubleArray values) {
  std::vector<double> result;
  if (values == nullptr) {
    return result;
  }
  const jsize size = env->GetArrayLength(values);
  result.resize(size);
  env->GetDoubleArrayRegion(values, 0, size, result.data());
  return result;
}

std::string JsonEscape(const std::string& value) {
  std::string escaped;
  escaped.reserve(value.size() + 8);
  for (char ch : value) {
    switch (ch) {
      case '\\':
        escaped += "\\\\";
        break;
      case '"':
        escaped += "\\\"";
        break;
      case '\n':
        escaped += "\\n";
        break;
      default:
        escaped += ch;
        break;
    }
  }
  return escaped;
}

std::string WarningsToJson(const std::vector<std::string>& warnings) {
  std::ostringstream stream;
  stream << "[";
  for (size_t index = 0; index < warnings.size(); ++index) {
    if (index > 0) {
      stream << ",";
    }
    stream << "\"" << JsonEscape(warnings[index]) << "\"";
  }
  stream << "]";
  return stream.str();
}

}  // namespace

extern "C" JNIEXPORT jstring JNICALL
Java_com_visiongenieapp_colorengine_ProColorEngineModule_nativeDecodeSource(
  JNIEnv* env,
  jobject /* thiz */,
  jstring sourcePath,
  jint maxDimension,
  jstring cacheDir) {
  try {
    const auto result = visiongenie::DecodeSourcePreview(
      JStringToString(env, sourcePath),
      static_cast<int>(maxDimension),
      JStringToString(env, cacheDir));
    std::ostringstream json;
    json << "{"
         << "\"previewPath\":\"" << JsonEscape(result.previewPath) << "\","
         << "\"nativeSourcePath\":\"" << JsonEscape(result.nativeSourcePath) << "\","
         << "\"width\":" << result.width << ","
         << "\"height\":" << result.height << ","
         << "\"bitDepthHint\":" << result.bitDepthHint << ","
         << "\"workingSpace\":\"" << JsonEscape(result.workingSpace) << "\","
         << "\"sourceType\":\"" << JsonEscape(result.sourceType) << "\""
         << "}";
    return env->NewStringUTF(json.str().c_str());
  } catch (const std::exception& error) {
    const std::string message = std::string("{\"error\":\"") + JsonEscape(error.what()) + "\"}";
    return env->NewStringUTF(message.c_str());
  }
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_visiongenieapp_colorengine_ProColorEngineModule_nativeExportImage(
  JNIEnv* env,
  jobject /* thiz */,
  jstring sourcePath,
  jstring outputPath,
  jstring format,
  jint bitDepth,
  jstring iccProfile,
  jdouble quality,
  jstring workingSpace,
  jdoubleArray basicAndColor,
  jdoubleArray curves,
  jdoubleArray wheels,
  jdoubleArray hsl,
  jdoubleArray lutMeta,
  jdoubleArray lutData,
  jdoubleArray localMasks,
  jboolean isRawSource) {
  try {
    const auto flatBasic = JDoubleArrayToVector(env, basicAndColor);
    visiongenie::BasicColorGrade grade;
    if (flatBasic.size() >= 14) {
      grade.exposure = flatBasic[0];
      grade.contrast = flatBasic[1];
      grade.brightness = flatBasic[2];
      grade.highlights = flatBasic[3];
      grade.shadows = flatBasic[4];
      grade.whites = flatBasic[5];
      grade.blacks = flatBasic[6];
      grade.temperature = flatBasic[7];
      grade.tint = flatBasic[8];
      grade.saturation = flatBasic[9];
      grade.vibrance = flatBasic[10];
      grade.redBalance = flatBasic[11];
      grade.greenBalance = flatBasic[12];
      grade.blueBalance = flatBasic[13];
    }

    visiongenie::ExportOptions options;
    options.sourcePath = JStringToString(env, sourcePath);
    options.outputPath = JStringToString(env, outputPath);
    options.format = JStringToString(env, format);
    options.bitDepth = static_cast<int>(bitDepth);
    options.iccProfile = JStringToString(env, iccProfile);
    options.quality = static_cast<double>(quality);
    options.workingSpace = JStringToString(env, workingSpace);
    options.isRawSource = static_cast<bool>(isRawSource);
    options.grade = grade;
    options.curves = JDoubleArrayToVector(env, curves);
    options.wheels = JDoubleArrayToVector(env, wheels);
    options.hsl = JDoubleArrayToVector(env, hsl);
    const auto flatLutMeta = JDoubleArrayToVector(env, lutMeta);
    if (flatLutMeta.size() >= 9) {
      options.lut.enabled = flatLutMeta[0] > 0.5;
      options.lut.strength = flatLutMeta[1];
      options.lut.size = static_cast<int>(flatLutMeta[2]);
      options.lut.domainMin = {flatLutMeta[3], flatLutMeta[4], flatLutMeta[5]};
      options.lut.domainMax = {flatLutMeta[6], flatLutMeta[7], flatLutMeta[8]};
    }
    options.lut.data = JDoubleArrayToVector(env, lutData);
    options.localMasks = JDoubleArrayToVector(env, localMasks);

    const auto result = visiongenie::ExportImageNative(options);
    std::ostringstream json;
    json << "{"
         << "\"uri\":\"" << JsonEscape(result.uri) << "\","
         << "\"width\":" << result.width << ","
         << "\"height\":" << result.height << ","
         << "\"fileSize\":" << result.fileSize << ","
         << "\"format\":\"" << JsonEscape(result.format) << "\","
         << "\"bitDepth\":" << result.bitDepth << ","
         << "\"iccProfile\":\"" << JsonEscape(result.iccProfile) << "\","
         << "\"gamutMappingApplied\":" << (result.gamutMappingApplied ? "true" : "false") << ","
         << "\"toneMapApplied\":" << (result.toneMapApplied ? "true" : "false") << ","
         << "\"warnings\":" << WarningsToJson(result.warnings)
         << "}";
    return env->NewStringUTF(json.str().c_str());
  } catch (const std::exception& error) {
    const std::string message = std::string("{\"error\":\"") + JsonEscape(error.what()) + "\"}";
    return env->NewStringUTF(message.c_str());
  }
}
