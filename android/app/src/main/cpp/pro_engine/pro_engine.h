#pragma once

#include <string>
#include <vector>

namespace visiongenie {

struct ImageBuffer16 {
  int width = 0;
  int height = 0;
  bool isLinear = true;
  std::vector<uint16_t> pixels;
};

struct BasicColorGrade {
  double exposure = 0.0;
  double contrast = 0.0;
  double brightness = 0.0;
  double highlights = 0.0;
  double shadows = 0.0;
  double whites = 0.0;
  double blacks = 0.0;
  double temperature = 0.0;
  double tint = 0.0;
  double saturation = 0.0;
  double vibrance = 0.0;
  double redBalance = 0.0;
  double greenBalance = 0.0;
  double blueBalance = 0.0;
};

struct LutTransform {
  bool enabled = false;
  double strength = 0.0;
  int size = 0;
  std::vector<double> domainMin{0.0, 0.0, 0.0};
  std::vector<double> domainMax{1.0, 1.0, 1.0};
  std::vector<double> data;
};

struct ExportOptions {
  std::string sourcePath;
  std::string outputPath;
  std::string format;
  int bitDepth = 16;
  std::string iccProfile;
  double quality = 1.0;
  std::string workingSpace;
  bool isRawSource = false;
  BasicColorGrade grade;
  std::vector<double> curves;
  std::vector<double> wheels;
  std::vector<double> hsl;
  LutTransform lut;
  std::vector<double> localMasks;
};

struct DecodeResult {
  std::string previewPath;
  std::string nativeSourcePath;
  int width = 0;
  int height = 0;
  int bitDepthHint = 8;
  std::string workingSpace;
  std::string sourceType;
};

struct ExportResultNative {
  std::string uri;
  int width = 0;
  int height = 0;
  int fileSize = 0;
  std::string format;
  int bitDepth = 16;
  std::string iccProfile;
  bool gamutMappingApplied = false;
  bool toneMapApplied = false;
  std::vector<std::string> warnings;
};

DecodeResult DecodeSourcePreview(
  const std::string& sourcePath,
  int maxDimension,
  const std::string& cacheDir);

ExportResultNative ExportImageNative(const ExportOptions& options);

ImageBuffer16 DecodeImage16(
  const std::string& sourcePath,
  bool rawHint,
  const std::string& workingSpace,
  int* outBitDepth);

void ApplyGrade(
  ImageBuffer16& image,
  const BasicColorGrade& grade,
  const std::vector<double>& curves,
  const std::vector<double>& wheels,
  const std::vector<double>& hsl,
  const LutTransform& lut,
  const std::vector<double>& localMasks,
  const std::string& workingSpace,
  const std::string& outputProfile);

std::vector<unsigned char> BuildICCProfile(const std::string& iccProfile);

void TransformImageToProfile(
  ImageBuffer16& image,
  const std::string& workingSpace,
  const std::string& iccProfile);

bool WritePng16(
  const std::string& outputPath,
  const ImageBuffer16& image,
  const std::vector<unsigned char>& iccProfile,
  std::string* error);

bool WritePng8Preview(
  const std::string& outputPath,
  const ImageBuffer16& image,
  std::string* error);

bool WriteTiff16(
  const std::string& outputPath,
  const ImageBuffer16& image,
  const std::vector<unsigned char>& iccProfile,
  std::string* error);

}  // namespace visiongenie
