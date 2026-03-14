#include "pro_engine/pro_engine.h"

#include <memory>
#include <stdexcept>

#include "lcms2.h"

namespace visiongenie {

namespace {

cmsCIExyY MakeWhitePoint(double x, double y) {
  cmsCIExyY whitePoint{};
  whitePoint.x = x;
  whitePoint.y = y;
  whitePoint.Y = 1.0;
  return whitePoint;
}

cmsCIExyYTRIPLE MakePrimaries(
  double rx,
  double ry,
  double gx,
  double gy,
  double bx,
  double by) {
  cmsCIExyYTRIPLE triple{};
  triple.Red = MakeWhitePoint(rx, ry);
  triple.Green = MakeWhitePoint(gx, gy);
  triple.Blue = MakeWhitePoint(bx, by);
  return triple;
}

cmsHPROFILE CreateCustomRgbProfile(
  const cmsCIExyY& whitePoint,
  const cmsCIExyYTRIPLE& primaries,
  double gammaValue) {
  cmsToneCurve* baseCurve = cmsBuildGamma(nullptr, gammaValue);
  cmsToneCurve* curves[3] = {baseCurve, baseCurve, baseCurve};
  cmsHPROFILE profile = cmsCreateRGBProfile(&whitePoint, &primaries, curves);
  cmsFreeToneCurve(baseCurve);
  if (!profile) {
    throw std::runtime_error("Failed to create ICC profile");
  }
  return profile;
}

cmsHPROFILE CreateWorkingProfile(const std::string& workingSpace) {
  if (workingSpace == "linear_prophoto") {
    return CreateCustomRgbProfile(
      MakeWhitePoint(0.3457, 0.3585),
      MakePrimaries(0.7347, 0.2653, 0.1596, 0.8404, 0.0366, 0.0001),
      1.0);
  }

  return CreateCustomRgbProfile(
    MakeWhitePoint(0.3127, 0.3290),
    MakePrimaries(0.64, 0.33, 0.30, 0.60, 0.15, 0.06),
    1.0);
}

cmsHPROFILE CreateOutputProfile(const std::string& iccProfile) {
  if (iccProfile == "srgb") {
    return cmsCreate_sRGBProfile();
  }

  if (iccProfile == "display_p3") {
    return CreateCustomRgbProfile(
      MakeWhitePoint(0.3127, 0.3290),
      MakePrimaries(0.68, 0.32, 0.265, 0.69, 0.15, 0.06),
      2.2);
  }

  return CreateCustomRgbProfile(
    MakeWhitePoint(0.3457, 0.3585),
    MakePrimaries(0.7347, 0.2653, 0.1596, 0.8404, 0.0366, 0.0001),
    1.8);
}

}  // namespace

std::vector<unsigned char> BuildICCProfile(const std::string& iccProfile) {
  std::unique_ptr<void, decltype(&cmsCloseProfile)> profile(
    CreateOutputProfile(iccProfile),
    &cmsCloseProfile);

  cmsUInt32Number size = 0;
  cmsSaveProfileToMem(profile.get(), nullptr, &size);
  std::vector<unsigned char> bytes(size);
  cmsSaveProfileToMem(profile.get(), bytes.data(), &size);
  bytes.resize(size);
  return bytes;
}

void TransformImageToProfile(
  ImageBuffer16& image,
  const std::string& workingSpace,
  const std::string& iccProfile) {
  if (image.pixels.empty()) {
    return;
  }

  std::unique_ptr<void, decltype(&cmsCloseProfile)> inputProfile(
    CreateWorkingProfile(workingSpace),
    &cmsCloseProfile);
  std::unique_ptr<void, decltype(&cmsCloseProfile)> outputProfile(
    CreateOutputProfile(iccProfile),
    &cmsCloseProfile);

  cmsHTRANSFORM transform = cmsCreateTransform(
    inputProfile.get(),
    TYPE_RGB_16,
    outputProfile.get(),
    TYPE_RGB_16,
    INTENT_PERCEPTUAL,
    0);
  if (!transform) {
    throw std::runtime_error("Failed to create ICC transform");
  }

  std::vector<uint16_t> transformed(image.pixels.size());
  cmsDoTransform(transform, image.pixels.data(), transformed.data(), image.width * image.height);
  cmsDeleteTransform(transform);
  image.pixels.swap(transformed);
  image.isLinear = false;
}

}  // namespace visiongenie
