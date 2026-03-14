#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"

#include "pro_engine/pro_engine.h"

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <stdexcept>

#include "libraw/libraw.h"

namespace visiongenie {

namespace {

bool IsRawPath(const std::string& path) {
  const std::string ext = std::filesystem::path(path).extension().string();
  return ext == ".dng" || ext == ".cr2" || ext == ".cr3" || ext == ".nef" || ext == ".arw" ||
         ext == ".raf" || ext == ".raw";
}

bool IsValidLut(const LutTransform& lut) {
  if (!lut.enabled || lut.size < 2) {
    return false;
  }
  const size_t requiredSize = static_cast<size_t>(lut.size) * lut.size * lut.size * 3;
  return lut.data.size() >= requiredSize;
}

float Clamp01(float value) {
  return std::max(0.0f, std::min(1.0f, value));
}

float Catmull(float p0, float p1, float p2, float p3, float t) {
  const float t2 = t * t;
  const float t3 = t2 * t;
  return 0.5f * ((2.0f * p1) + (-p0 + p2) * t + (2.0f * p0 - 5.0f * p1 + 4.0f * p2 - p3) * t2 +
                 (-p0 + 3.0f * p1 - 3.0f * p2 + p3) * t3);
}

float CurveSample(float x, const std::vector<double>& curves, int offset) {
  const float y0 = static_cast<float>(curves[offset]);
  const float y1 = static_cast<float>(curves[offset + 1]);
  const float y2 = static_cast<float>(curves[offset + 2]);
  const float y3 = static_cast<float>(curves[offset + 3]);
  const float y4 = static_cast<float>(curves[offset + 4]);
  const float t = Clamp01(x);
  if (t < 0.25f) {
    return Clamp01(Catmull(y0, y0, y1, y2, t / 0.25f));
  }
  if (t < 0.5f) {
    return Clamp01(Catmull(y0, y1, y2, y3, (t - 0.25f) / 0.25f));
  }
  if (t < 0.75f) {
    return Clamp01(Catmull(y1, y2, y3, y4, (t - 0.5f) / 0.25f));
  }
  return Clamp01(Catmull(y2, y3, y4, y4, (t - 0.75f) / 0.25f));
}

struct Float3 {
  float r;
  float g;
  float b;
};

struct HslColor {
  float h;
  float s;
  float l;
};

Float3 Linearize(Float3 c) {
  const auto toLinear = [](float v) {
    const float clamped = Clamp01(v);
    if (clamped <= 0.04045f) {
      return clamped / 12.92f;
    }
    return std::pow((clamped + 0.055f) / 1.055f, 2.4f);
  };
  return {toLinear(c.r), toLinear(c.g), toLinear(c.b)};
}

Float3 HueTint(float degrees) {
  const float radians = degrees * 0.01745329252f;
  return {std::cos(radians), std::cos(radians - 2.0943951f), std::cos(radians + 2.0943951f)};
}

float DotLuma(const Float3& c) {
  return c.r * 0.2126f + c.g * 0.7152f + c.b * 0.0722f;
}

Float3 ApplyWheel(Float3 color, float mask, float hue, float sat, float lumaShift) {
  const Float3 tint = HueTint(hue);
  const float satScale = sat / 100.0f;
  color.r += tint.r * satScale * mask * 0.26f + lumaShift / 100.0f * mask * 0.24f;
  color.g += tint.g * satScale * mask * 0.26f + lumaShift / 100.0f * mask * 0.24f;
  color.b += tint.b * satScale * mask * 0.26f + lumaShift / 100.0f * mask * 0.24f;
  return color;
}

Float3 ApplyLocalAdjustments(Float3 color, float mask, const double* slot) {
  if (mask <= 0.001f) {
    return color;
  }
  Float3 local = color;
  const float exposure = static_cast<float>(slot[1]);
  const float temp = static_cast<float>(slot[2] / 100.0);
  const float sat = static_cast<float>(slot[3] / 100.0);
  const float clarity = static_cast<float>(slot[4] / 100.0);
  const float denoise = Clamp01(static_cast<float>(slot[5] / 100.0));

  const float expFactor = std::pow(2.0f, exposure);
  local.r *= expFactor;
  local.g *= expFactor;
  local.b *= expFactor;
  local.r += temp * 0.18f;
  local.b -= temp * 0.18f;
  const float luma = DotLuma(local);
  local.r = luma + (local.r - luma) * Clamp01(1.0f + sat);
  local.g = luma + (local.g - luma) * Clamp01(1.0f + sat);
  local.b = luma + (local.b - luma) * Clamp01(1.0f + sat);
  const float localContrast = 1.0f + clarity * 0.6f;
  local.r = (local.r - 0.5f) * localContrast + 0.5f;
  local.g = (local.g - 0.5f) * localContrast + 0.5f;
  local.b = (local.b - 0.5f) * localContrast + 0.5f;
  local.r = local.r * (1.0f - denoise * 0.35f) + luma * denoise * 0.35f;
  local.g = local.g * (1.0f - denoise * 0.35f) + luma * denoise * 0.35f;
  local.b = local.b * (1.0f - denoise * 0.35f) + luma * denoise * 0.35f;

  color.r = color.r * (1.0f - mask) + local.r * mask;
  color.g = color.g * (1.0f - mask) + local.g * mask;
  color.b = color.b * (1.0f - mask) + local.b * mask;
  return color;
}

float Fract(float value) {
  return value - std::floor(value);
}

float HueToRgb(float p, float q, float t) {
  if (t < 0.0f) {
    t += 1.0f;
  }
  if (t > 1.0f) {
    t -= 1.0f;
  }
  if (t < 1.0f / 6.0f) {
    return p + (q - p) * 6.0f * t;
  }
  if (t < 0.5f) {
    return q;
  }
  if (t < 2.0f / 3.0f) {
    return p + (q - p) * (2.0f / 3.0f - t) * 6.0f;
  }
  return p;
}

HslColor RgbToHsl(const Float3& color) {
  const float maxC = std::max({color.r, color.g, color.b});
  const float minC = std::min({color.r, color.g, color.b});
  const float delta = maxC - minC;
  const float l = (maxC + minC) * 0.5f;

  if (delta < 0.00001f) {
    return {0.0f, 0.0f, l};
  }

  const float s = l > 0.5f ? delta / (2.0f - maxC - minC) : delta / (maxC + minC);
  float h = 0.0f;
  if (maxC == color.r) {
    h = (color.g - color.b) / delta + (color.g < color.b ? 6.0f : 0.0f);
  } else if (maxC == color.g) {
    h = (color.b - color.r) / delta + 2.0f;
  } else {
    h = (color.r - color.g) / delta + 4.0f;
  }
  h /= 6.0f;
  return {h, s, l};
}

Float3 HslToRgb(const HslColor& hsl) {
  if (hsl.s < 0.00001f) {
    return {hsl.l, hsl.l, hsl.l};
  }

  const float q = hsl.l < 0.5f ? hsl.l * (1.0f + hsl.s) : hsl.l + hsl.s - hsl.l * hsl.s;
  const float p = 2.0f * hsl.l - q;
  return {
    HueToRgb(p, q, hsl.h + 1.0f / 3.0f),
    HueToRgb(p, q, hsl.h),
    HueToRgb(p, q, hsl.h - 1.0f / 3.0f),
  };
}

float BandWeight(float h, float center, float width) {
  float distance = std::abs(h - center);
  distance = std::min(distance, 1.0f - distance);
  return Clamp01((width - distance) / std::max(0.0001f, width));
}

Float3 ApplyHslAdjustments(Float3 color, const std::vector<double>& hsl) {
  if (hsl.size() < 24) {
    return color;
  }

  HslColor hslColor = RgbToHsl(color);
  const float weights[8] = {
    BandWeight(hslColor.h, 0.0f, 0.08f),
    BandWeight(hslColor.h, 0.08f, 0.08f),
    BandWeight(hslColor.h, 0.16f, 0.08f),
    BandWeight(hslColor.h, 0.33f, 0.1f),
    BandWeight(hslColor.h, 0.45f, 0.1f),
    BandWeight(hslColor.h, 0.58f, 0.1f),
    BandWeight(hslColor.h, 0.72f, 0.1f),
    BandWeight(hslColor.h, 0.86f, 0.1f),
  };

  float hueShift = 0.0f;
  float satShift = 0.0f;
  float lumShift = 0.0f;
  for (int band = 0; band < 8; ++band) {
    const int offset = band * 3;
    hueShift += static_cast<float>(hsl[offset] / 360.0) * weights[band];
    satShift += static_cast<float>(hsl[offset + 1] / 100.0) * weights[band];
    lumShift += static_cast<float>(hsl[offset + 2] / 100.0) * weights[band];
  }

  hslColor.h = Fract(hslColor.h + hueShift);
  hslColor.s = Clamp01(hslColor.s + satShift);
  hslColor.l = Clamp01(hslColor.l + lumShift);
  return HslToRgb(hslColor);
}

float ResolveDomainValue(const std::vector<double>& domain, int index, float fallback) {
  if (domain.size() <= static_cast<size_t>(index)) {
    return fallback;
  }
  return static_cast<float>(domain[static_cast<size_t>(index)]);
}

Float3 SampleLut(int size, int r, int g, int b, const std::vector<double>& data) {
  const int rr = std::clamp(r, 0, size - 1);
  const int gg = std::clamp(g, 0, size - 1);
  const int bb = std::clamp(b, 0, size - 1);
  const size_t index = static_cast<size_t>((bb * size * size + gg * size + rr) * 3);
  if (index + 2 >= data.size()) {
    return {0.0f, 0.0f, 0.0f};
  }
  return {
    Clamp01(static_cast<float>(data[index])),
    Clamp01(static_cast<float>(data[index + 1])),
    Clamp01(static_cast<float>(data[index + 2])),
  };
}

Float3 Lerp(const Float3& a, const Float3& b, float t) {
  return {
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
  };
}

Float3 Multiply3x3(const float matrix[9], const Float3& value) {
  return {
    matrix[0] * value.r + matrix[1] * value.g + matrix[2] * value.b,
    matrix[3] * value.r + matrix[4] * value.g + matrix[5] * value.b,
    matrix[6] * value.r + matrix[7] * value.g + matrix[8] * value.b,
  };
}

Float3 WorkingToLinearSrgb(const Float3& color, const std::string& workingSpace) {
  if (workingSpace != "linear_prophoto") {
    return color;
  }

  constexpr float kProPhotoToXyzD50[9] = {
    0.7976749f, 0.1351917f, 0.0313534f,
    0.2880402f, 0.7118741f, 0.0000857f,
    0.0f, 0.0f, 0.8252100f,
  };
  constexpr float kXyzToSrgb[9] = {
    3.2404542f, -1.5371385f, -0.4985314f,
    -0.9692660f, 1.8760108f, 0.0415560f,
    0.0556434f, -0.2040259f, 1.0572252f,
  };
  const Float3 xyz = Multiply3x3(kProPhotoToXyzD50, color);
  return Multiply3x3(kXyzToSrgb, xyz);
}

Float3 LinearSrgbToWorking(const Float3& color, const std::string& workingSpace) {
  if (workingSpace != "linear_prophoto") {
    return color;
  }

  constexpr float kSrgbToXyz[9] = {
    0.4124564f, 0.3575761f, 0.1804375f,
    0.2126729f, 0.7151522f, 0.0721750f,
    0.0193339f, 0.1191920f, 0.9503041f,
  };
  constexpr float kXyzD50ToProPhoto[9] = {
    1.3459433f, -0.2556075f, -0.0511118f,
    -0.5445989f, 1.5081673f, 0.0205351f,
    0.0f, 0.0f, 1.2118128f,
  };
  const Float3 xyz = Multiply3x3(kSrgbToXyz, color);
  return Multiply3x3(kXyzD50ToProPhoto, xyz);
}

float FilmicSoftShoulder(float value) {
  constexpr float kKnee = 0.82f;
  constexpr float kShoulder = 2.6f;
  if (value <= kKnee) {
    return value;
  }
  const float t = Clamp01((value - kKnee) / (1.0f - kKnee));
  const float mapped = (1.0f - std::exp(-kShoulder * t)) / (1.0f - std::exp(-kShoulder));
  return kKnee + (1.0f - kKnee) * mapped;
}

Float3 ApplyHighlightRolloffFilmicSoft(const Float3& color) {
  const float peak = std::max({color.r, color.g, color.b});
  if (peak <= 0.82f) {
    return color;
  }
  const float mappedPeak = FilmicSoftShoulder(peak);
  const float ratio = mappedPeak / std::max(0.0001f, peak);
  return {
    color.r * ratio,
    color.g * ratio,
    color.b * ratio,
  };
}

Float3 ApplyPerceptualGamutMapToSrgb(const Float3& color, const std::string& workingSpace) {
  Float3 srgb = WorkingToLinearSrgb(color, workingSpace);
  const bool outOfGamut =
    srgb.r < 0.0f || srgb.r > 1.0f ||
    srgb.g < 0.0f || srgb.g > 1.0f ||
    srgb.b < 0.0f || srgb.b > 1.0f;
  if (!outOfGamut) {
    return color;
  }

  float luma = DotLuma(srgb);
  luma = Clamp01(luma);
  Float3 chroma{
    srgb.r - luma,
    srgb.g - luma,
    srgb.b - luma,
  };

  float maxScale = 1.0f;
  const float channels[3] = {chroma.r, chroma.g, chroma.b};
  for (float component : channels) {
    if (component > 0.00001f) {
      maxScale = std::min(maxScale, (1.0f - luma) / component);
    } else if (component < -0.00001f) {
      maxScale = std::min(maxScale, (0.0f - luma) / component);
    }
  }
  maxScale = Clamp01(maxScale);
  const float perceptualScale = Clamp01(maxScale * 0.95f);
  srgb = {
    Clamp01(luma + chroma.r * perceptualScale),
    Clamp01(luma + chroma.g * perceptualScale),
    Clamp01(luma + chroma.b * perceptualScale),
  };
  return LinearSrgbToWorking(srgb, workingSpace);
}

Float3 ApplyLut3D(Float3 color, const LutTransform& lut) {
  if (!lut.enabled || lut.strength <= 0.0001 || lut.size < 2) {
    return color;
  }

  const size_t requiredSize = static_cast<size_t>(lut.size) * lut.size * lut.size * 3;
  if (lut.data.size() < requiredSize) {
    return color;
  }

  const float minR = ResolveDomainValue(lut.domainMin, 0, 0.0f);
  const float minG = ResolveDomainValue(lut.domainMin, 1, 0.0f);
  const float minB = ResolveDomainValue(lut.domainMin, 2, 0.0f);
  const float maxR = ResolveDomainValue(lut.domainMax, 0, 1.0f);
  const float maxG = ResolveDomainValue(lut.domainMax, 1, 1.0f);
  const float maxB = ResolveDomainValue(lut.domainMax, 2, 1.0f);

  const float denomR = std::max(0.0001f, maxR - minR);
  const float denomG = std::max(0.0001f, maxG - minG);
  const float denomB = std::max(0.0001f, maxB - minB);
  const float normalizedR = Clamp01((color.r - minR) / denomR);
  const float normalizedG = Clamp01((color.g - minG) / denomG);
  const float normalizedB = Clamp01((color.b - minB) / denomB);

  const float scaledR = normalizedR * static_cast<float>(lut.size - 1);
  const float scaledG = normalizedG * static_cast<float>(lut.size - 1);
  const float scaledB = normalizedB * static_cast<float>(lut.size - 1);

  const int r0 = static_cast<int>(std::floor(scaledR));
  const int g0 = static_cast<int>(std::floor(scaledG));
  const int b0 = static_cast<int>(std::floor(scaledB));
  const int r1 = std::min(lut.size - 1, r0 + 1);
  const int g1 = std::min(lut.size - 1, g0 + 1);
  const int b1 = std::min(lut.size - 1, b0 + 1);

  const float tr = scaledR - static_cast<float>(r0);
  const float tg = scaledG - static_cast<float>(g0);
  const float tb = scaledB - static_cast<float>(b0);

  const Float3 c000 = SampleLut(lut.size, r0, g0, b0, lut.data);
  const Float3 c100 = SampleLut(lut.size, r1, g0, b0, lut.data);
  const Float3 c010 = SampleLut(lut.size, r0, g1, b0, lut.data);
  const Float3 c110 = SampleLut(lut.size, r1, g1, b0, lut.data);
  const Float3 c001 = SampleLut(lut.size, r0, g0, b1, lut.data);
  const Float3 c101 = SampleLut(lut.size, r1, g0, b1, lut.data);
  const Float3 c011 = SampleLut(lut.size, r0, g1, b1, lut.data);
  const Float3 c111 = SampleLut(lut.size, r1, g1, b1, lut.data);

  const Float3 c00 = Lerp(c000, c100, tr);
  const Float3 c10 = Lerp(c010, c110, tr);
  const Float3 c01 = Lerp(c001, c101, tr);
  const Float3 c11 = Lerp(c011, c111, tr);
  const Float3 c0 = Lerp(c00, c10, tg);
  const Float3 c1 = Lerp(c01, c11, tg);
  const Float3 mapped = Lerp(c0, c1, tb);

  const float strength = Clamp01(static_cast<float>(lut.strength));
  return Lerp(color, mapped, strength);
}

ImageBuffer16 DecodeCommonImage(const std::string& sourcePath, int* outBitDepth) {
  int width = 0;
  int height = 0;
  int channels = 0;
  ImageBuffer16 image;
  if (stbi_is_16_bit(sourcePath.c_str())) {
    uint16_t* pixels = stbi_load_16(sourcePath.c_str(), &width, &height, &channels, 3);
    if (!pixels) {
      throw std::runtime_error("Failed to decode bitmap source");
    }
    image.width = width;
    image.height = height;
    image.pixels.assign(pixels, pixels + width * height * 3);
    stbi_image_free(pixels);
    *outBitDepth = 16;
  } else {
    unsigned char* pixels = stbi_load(sourcePath.c_str(), &width, &height, &channels, 3);
    if (!pixels) {
      throw std::runtime_error("Failed to decode bitmap source");
    }
    image.width = width;
    image.height = height;
    image.pixels.resize(width * height * 3);
    for (int index = 0; index < width * height * 3; ++index) {
      image.pixels[index] = static_cast<uint16_t>(pixels[index] * 257u);
    }
    stbi_image_free(pixels);
    *outBitDepth = 8;
  }
  image.isLinear = false;
  return image;
}

ImageBuffer16 DecodeRawImage(const std::string& sourcePath, const std::string& workingSpace, int* outBitDepth) {
  LibRaw raw;
  raw.imgdata.params.use_camera_wb = 1;
  raw.imgdata.params.no_auto_bright = 1;
  raw.imgdata.params.output_bps = 16;
  raw.imgdata.params.gamm[0] = 1.0f;
  raw.imgdata.params.gamm[1] = 1.0f;
  raw.imgdata.params.output_color = workingSpace == "linear_prophoto" ? 4 : 1;

  if (raw.open_file(sourcePath.c_str()) != LIBRAW_SUCCESS ||
      raw.unpack() != LIBRAW_SUCCESS ||
      raw.dcraw_process() != LIBRAW_SUCCESS) {
    throw std::runtime_error("LibRaw decode pipeline failed");
  }

  int errorCode = LIBRAW_SUCCESS;
  libraw_processed_image_t* processed = raw.dcraw_make_mem_image(&errorCode);
  if (!processed || errorCode != LIBRAW_SUCCESS) {
    throw std::runtime_error("LibRaw make_mem_image failed");
  }

  ImageBuffer16 image;
  image.width = processed->width;
  image.height = processed->height;
  image.isLinear = true;
  image.pixels.resize(static_cast<size_t>(processed->width) * processed->height * 3);

  if (processed->bits == 16) {
    const auto* input = reinterpret_cast<const uint16_t*>(processed->data);
    std::copy(input, input + image.pixels.size(), image.pixels.begin());
    *outBitDepth = 16;
  } else {
    const auto* input = reinterpret_cast<const unsigned char*>(processed->data);
    for (size_t index = 0; index < image.pixels.size(); ++index) {
      image.pixels[index] = static_cast<uint16_t>(input[index] * 257u);
    }
    *outBitDepth = 8;
  }

  LibRaw::dcraw_clear_mem(processed);
  raw.recycle();
  return image;
}

ImageBuffer16 DownscaleNearest(const ImageBuffer16& source, int maxDimension) {
  if (source.width <= maxDimension && source.height <= maxDimension) {
    return source;
  }

  const double scale =
    static_cast<double>(maxDimension) / static_cast<double>(std::max(source.width, source.height));
  const int targetWidth = std::max(1, static_cast<int>(source.width * scale));
  const int targetHeight = std::max(1, static_cast<int>(source.height * scale));
  ImageBuffer16 output;
  output.width = targetWidth;
  output.height = targetHeight;
  output.isLinear = source.isLinear;
  output.pixels.resize(static_cast<size_t>(targetWidth) * targetHeight * 3);

  for (int y = 0; y < targetHeight; ++y) {
    const int srcY = std::min(source.height - 1, static_cast<int>(y / scale));
    for (int x = 0; x < targetWidth; ++x) {
      const int srcX = std::min(source.width - 1, static_cast<int>(x / scale));
      const size_t srcOffset = static_cast<size_t>(srcY * source.width + srcX) * 3;
      const size_t dstOffset = static_cast<size_t>(y * targetWidth + x) * 3;
      output.pixels[dstOffset] = source.pixels[srcOffset];
      output.pixels[dstOffset + 1] = source.pixels[srcOffset + 1];
      output.pixels[dstOffset + 2] = source.pixels[srcOffset + 2];
    }
  }

  return output;
}

}  // namespace

ImageBuffer16 DecodeImage16(
  const std::string& sourcePath,
  bool rawHint,
  const std::string& workingSpace,
  int* outBitDepth) {
  if (rawHint || IsRawPath(sourcePath)) {
    return DecodeRawImage(sourcePath, workingSpace, outBitDepth);
  }
  return DecodeCommonImage(sourcePath, outBitDepth);
}

void ApplyGrade(
  ImageBuffer16& image,
  const BasicColorGrade& grade,
  const std::vector<double>& curves,
  const std::vector<double>& wheels,
  const std::vector<double>& hsl,
  const LutTransform& lut,
  const std::vector<double>& localMasks,
  const std::string& workingSpace,
  const std::string& outputProfile) {
  if (image.pixels.empty()) {
    return;
  }

  for (int pixelIndex = 0; pixelIndex < image.width * image.height; ++pixelIndex) {
    const size_t offset = static_cast<size_t>(pixelIndex) * 3;
    Float3 color{
      image.pixels[offset] / 65535.0f,
      image.pixels[offset + 1] / 65535.0f,
      image.pixels[offset + 2] / 65535.0f,
    };
    if (!image.isLinear) {
      color = Linearize(color);
    }

    const float rawLuma = DotLuma(color);
    const float skinMask = Clamp01((color.r - 0.15f) * 2.2f) * Clamp01((0.58f - color.b) * 2.4f) *
                           Clamp01((rawLuma - 0.2f) * 2.0f);
    const float expFactor = std::pow(2.0f, static_cast<float>(grade.exposure));
    color.r *= expFactor;
    color.g *= expFactor;
    color.b *= expFactor;

    const float temp = static_cast<float>(grade.temperature / 100.0);
    const float tint = static_cast<float>(grade.tint / 100.0);
    const float tempStrength = 1.0f - skinMask * 0.35f;
    color.r += temp * 0.20f * tempStrength + tint * 0.06f * tempStrength;
    color.g += tint * 0.12f * tempStrength;
    color.b -= temp * 0.20f * tempStrength - tint * 0.06f * tempStrength;
    color.r *= 1.0f + static_cast<float>(grade.redBalance / 100.0) * 0.35f;
    color.g *= 1.0f + static_cast<float>(grade.greenBalance / 100.0) * 0.35f;
    color.b *= 1.0f + static_cast<float>(grade.blueBalance / 100.0) * 0.35f;

    if (curves.size() >= 20) {
      const float lumaForCurve = DotLuma(color);
      const float master = CurveSample(lumaForCurve, curves, 0);
      const float delta = master - lumaForCurve;
      color.r = CurveSample(color.r + delta, curves, 5);
      color.g = CurveSample(color.g + delta, curves, 10);
      color.b = CurveSample(color.b + delta, curves, 15);
    }

    const float luma = DotLuma(color);
    const float satScale = Clamp01(1.0f + static_cast<float>(grade.saturation / 100.0));
    color.r = luma + (color.r - luma) * satScale;
    color.g = luma + (color.g - luma) * satScale;
    color.b = luma + (color.b - luma) * satScale;

    const float maxC = std::max({color.r, color.g, color.b});
    const float minC = std::min({color.r, color.g, color.b});
    const float chroma = maxC - minC;
    const float vibranceMask = 1.0f - Clamp01(chroma / 0.8f);
    const float vibScale = Clamp01(1.0f + static_cast<float>(grade.vibrance / 100.0) * vibranceMask);
    color.r = luma + (color.r - luma) * vibScale;
    color.g = luma + (color.g - luma) * vibScale;
    color.b = luma + (color.b - luma) * vibScale;

    const float toneLuma = DotLuma(color);
    const float shadowMask = 1.0f - Clamp01((toneLuma - 0.18f) / 0.44f);
    const float highlightMask = Clamp01((toneLuma - 0.38f) / 0.48f);
    const float midtoneMask = Clamp01(1.0f - shadowMask - highlightMask);
    const float blackMask = 1.0f - Clamp01(toneLuma / 0.25f);
    const float whiteMask = Clamp01((toneLuma - 0.75f) / 0.25f);

    if (wheels.size() >= 9) {
      color = ApplyWheel(color, shadowMask, static_cast<float>(wheels[0]), static_cast<float>(wheels[1]), static_cast<float>(wheels[2]));
      color = ApplyWheel(color, midtoneMask, static_cast<float>(wheels[3]), static_cast<float>(wheels[4]), static_cast<float>(wheels[5]));
      color = ApplyWheel(color, highlightMask, static_cast<float>(wheels[6]), static_cast<float>(wheels[7]), static_cast<float>(wheels[8]));
    }

    color.r += shadowMask * static_cast<float>(grade.shadows / 100.0) * 0.28f +
               highlightMask * static_cast<float>(grade.highlights / 100.0) * 0.28f +
               blackMask * static_cast<float>(grade.blacks / 100.0) * 0.32f +
               whiteMask * static_cast<float>(grade.whites / 100.0) * 0.32f;
    color.g += shadowMask * static_cast<float>(grade.shadows / 100.0) * 0.28f +
               highlightMask * static_cast<float>(grade.highlights / 100.0) * 0.28f +
               blackMask * static_cast<float>(grade.blacks / 100.0) * 0.32f +
               whiteMask * static_cast<float>(grade.whites / 100.0) * 0.32f;
    color.b += shadowMask * static_cast<float>(grade.shadows / 100.0) * 0.28f +
               highlightMask * static_cast<float>(grade.highlights / 100.0) * 0.28f +
               blackMask * static_cast<float>(grade.blacks / 100.0) * 0.32f +
               whiteMask * static_cast<float>(grade.whites / 100.0) * 0.32f;

    color = ApplyHslAdjustments(color, hsl);
    color = ApplyLut3D(color, lut);

    if (localMasks.size() >= 24) {
      const float localLuma = DotLuma(color);
      const float localMaxC = std::max({color.r, color.g, color.b});
      const float localMinC = std::min({color.r, color.g, color.b});
      const float localChroma = localMaxC - localMinC;
      const float skyMask = Clamp01((color.b - std::max(color.r, color.g) - 0.05f) * 3.0f) * Clamp01((localLuma - 0.35f) * 2.0f);
      const float subjectMask = Clamp01((localChroma - 0.18f) * 2.2f) * Clamp01((localLuma - 0.2f) * 1.6f);
      const float backgroundMask = Clamp01(1.0f - std::max({skinMask, subjectMask, skyMask}));
      color = ApplyLocalAdjustments(color, subjectMask * static_cast<float>(localMasks[0]), localMasks.data());
      color = ApplyLocalAdjustments(color, skyMask * static_cast<float>(localMasks[6]), localMasks.data() + 6);
      color = ApplyLocalAdjustments(color, skinMask * static_cast<float>(localMasks[12]), localMasks.data() + 12);
      color = ApplyLocalAdjustments(color, backgroundMask * static_cast<float>(localMasks[18]), localMasks.data() + 18);
    }

    const float contrast = 1.0f + static_cast<float>(grade.contrast / 100.0) * 0.75f;
    color.r = Clamp01((color.r - 0.5f) * contrast + 0.5f + static_cast<float>(grade.brightness / 100.0) * 0.25f);
    color.g = Clamp01((color.g - 0.5f) * contrast + 0.5f + static_cast<float>(grade.brightness / 100.0) * 0.25f);
    color.b = Clamp01((color.b - 0.5f) * contrast + 0.5f + static_cast<float>(grade.brightness / 100.0) * 0.25f);

    color = ApplyHighlightRolloffFilmicSoft(color);
    if (outputProfile == "srgb") {
      color = ApplyPerceptualGamutMapToSrgb(color, workingSpace);
    }
    color.r = Clamp01(color.r);
    color.g = Clamp01(color.g);
    color.b = Clamp01(color.b);

    image.pixels[offset] = static_cast<uint16_t>(std::round(color.r * 65535.0f));
    image.pixels[offset + 1] = static_cast<uint16_t>(std::round(color.g * 65535.0f));
    image.pixels[offset + 2] = static_cast<uint16_t>(std::round(color.b * 65535.0f));
  }

  image.isLinear = true;
}

DecodeResult DecodeSourcePreview(
  const std::string& sourcePath,
  int maxDimension,
  const std::string& cacheDir) {
  int bitDepth = 8;
  const bool isRaw = IsRawPath(sourcePath);
  ImageBuffer16 image = DecodeImage16(sourcePath, isRaw, isRaw ? "linear_prophoto" : "linear_srgb", &bitDepth);
  ImageBuffer16 preview = DownscaleNearest(image, maxDimension);
  TransformImageToProfile(preview, isRaw ? "linear_prophoto" : "linear_srgb", "srgb");

  const std::filesystem::path previewPath =
    std::filesystem::path(cacheDir) / ("raw_preview_" + std::to_string(std::hash<std::string>{}(sourcePath)) + ".png");

  std::string error;
  if (!WritePng8Preview(previewPath.string(), preview, &error)) {
    throw std::runtime_error(error);
  }

  return {
    previewPath.string(),
    sourcePath,
    preview.width,
    preview.height,
    bitDepth,
    isRaw ? "linear_prophoto" : "linear_srgb",
    isRaw ? "raw" : "bitmap",
  };
}

ExportResultNative ExportImageNative(const ExportOptions& options) {
  int sourceBitDepth = 8;
  ImageBuffer16 image = DecodeImage16(options.sourcePath, options.isRawSource, options.workingSpace, &sourceBitDepth);
  const bool lutRequested = options.lut.enabled;
  const bool validLut = IsValidLut(options.lut);
  LutTransform resolvedLut = options.lut;
  if (lutRequested && !validLut) {
    resolvedLut.enabled = false;
  }
  ApplyGrade(
    image,
    options.grade,
    options.curves,
    options.wheels,
    options.hsl,
    resolvedLut,
    options.localMasks,
    options.workingSpace,
    options.iccProfile);
  TransformImageToProfile(image, options.workingSpace, options.iccProfile);

  const std::vector<unsigned char> icc = BuildICCProfile(options.iccProfile);
  std::string error;
  bool ok = false;
  if (options.format == "tiff16") {
    ok = WriteTiff16(options.outputPath, image, icc, &error);
  } else {
    ok = WritePng16(options.outputPath, image, icc, &error);
  }
  if (!ok) {
    throw std::runtime_error(error);
  }

  ExportResultNative result;
  result.uri = options.outputPath;
  result.width = image.width;
  result.height = image.height;
  result.fileSize = static_cast<int>(std::filesystem::file_size(options.outputPath));
  result.format = options.format == "tiff16" ? "tiff16" : "png16";
  result.bitDepth = 16;
  result.iccProfile = options.iccProfile;
  result.toneMapApplied = true;
  result.gamutMappingApplied = options.iccProfile == "srgb";
  if (lutRequested && !validLut) {
    result.warnings.emplace_back("LUT 数据无效，已跳过 LUT 节点。");
  }
  if (!options.isRawSource && sourceBitDepth < 16) {
    result.warnings.emplace_back("非 RAW 输入经原始位深扩展后导出为 16-bit 容器。");
  }
  return result;
}

}  // namespace visiongenie
