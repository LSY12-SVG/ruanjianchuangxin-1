#include "pro_engine/pro_engine.h"

#include <algorithm>
#include <fstream>
#include <string>
#include <vector>

#include "lodepng.h"

namespace visiongenie {

namespace {

void WriteLe16(std::ofstream& out, uint16_t value) {
  out.put(static_cast<char>(value & 0xFF));
  out.put(static_cast<char>((value >> 8) & 0xFF));
}

void WriteLe32(std::ofstream& out, uint32_t value) {
  out.put(static_cast<char>(value & 0xFF));
  out.put(static_cast<char>((value >> 8) & 0xFF));
  out.put(static_cast<char>((value >> 16) & 0xFF));
  out.put(static_cast<char>((value >> 24) & 0xFF));
}

std::vector<unsigned char> ToPng16Bytes(const ImageBuffer16& image) {
  std::vector<unsigned char> bytes(image.pixels.size() * 2);
  for (size_t index = 0; index < image.pixels.size(); ++index) {
    const uint16_t value = image.pixels[index];
    bytes[index * 2] = static_cast<unsigned char>((value >> 8) & 0xFF);
    bytes[index * 2 + 1] = static_cast<unsigned char>(value & 0xFF);
  }
  return bytes;
}

std::vector<unsigned char> ToPng8Bytes(const ImageBuffer16& image) {
  std::vector<unsigned char> bytes(image.pixels.size());
  for (size_t index = 0; index < image.pixels.size(); ++index) {
    bytes[index] = static_cast<unsigned char>(std::clamp<int>(image.pixels[index] / 257, 0, 255));
  }
  return bytes;
}

}  // namespace

bool WritePng16(
  const std::string& outputPath,
  const ImageBuffer16& image,
  const std::vector<unsigned char>& iccProfile,
  std::string* error) {
  lodepng::State state;
  state.info_raw.colortype = LCT_RGB;
  state.info_raw.bitdepth = 16;
  state.info_png.color.colortype = LCT_RGB;
  state.info_png.color.bitdepth = 16;
  state.encoder.auto_convert = 0;
  if (!iccProfile.empty()) {
    lodepng_set_icc(
      &state.info_png,
      "VisionGenie ICC",
      iccProfile.data(),
      static_cast<unsigned>(iccProfile.size()));
  }

  const std::vector<unsigned char> imageBytes = ToPng16Bytes(image);
  std::vector<unsigned char> encoded;
  const unsigned code = lodepng::encode(encoded, imageBytes, image.width, image.height, state);

  if (code != 0) {
    if (error) {
      *error = lodepng_error_text(code);
    }
    return false;
  }

  std::ofstream out(outputPath, std::ios::binary);
  out.write(reinterpret_cast<const char*>(encoded.data()), static_cast<std::streamsize>(encoded.size()));
  return out.good();
}

bool WritePng8Preview(
  const std::string& outputPath,
  const ImageBuffer16& image,
  std::string* error) {
  lodepng::State state;
  state.info_raw.colortype = LCT_RGB;
  state.info_raw.bitdepth = 8;
  state.info_png.color.colortype = LCT_RGB;
  state.info_png.color.bitdepth = 8;
  state.encoder.auto_convert = 0;

  const std::vector<unsigned char> imageBytes = ToPng8Bytes(image);
  std::vector<unsigned char> encoded;
  const unsigned code = lodepng::encode(encoded, imageBytes, image.width, image.height, state);

  if (code != 0) {
    if (error) {
      *error = lodepng_error_text(code);
    }
    return false;
  }

  std::ofstream out(outputPath, std::ios::binary);
  out.write(reinterpret_cast<const char*>(encoded.data()), static_cast<std::streamsize>(encoded.size()));
  return out.good();
}

bool WriteTiff16(
  const std::string& outputPath,
  const ImageBuffer16& image,
  const std::vector<unsigned char>& iccProfile,
  std::string* error) {
  std::ofstream out(outputPath, std::ios::binary);
  if (!out.good()) {
    if (error) {
      *error = "Failed to open TIFF output";
    }
    return false;
  }

  constexpr uint16_t kEntryCount = 10;
  const uint32_t ifdOffset = 8;
  const uint32_t bitsOffset = ifdOffset + 2 + kEntryCount * 12 + 4;
  const uint32_t iccOffset = bitsOffset + 6;
  const uint32_t pixelOffset = iccOffset + static_cast<uint32_t>(iccProfile.size());
  const uint32_t byteCount = static_cast<uint32_t>(image.pixels.size() * sizeof(uint16_t));

  out.write("II", 2);
  WriteLe16(out, 42);
  WriteLe32(out, ifdOffset);

  out.seekp(ifdOffset);
  WriteLe16(out, kEntryCount);

  auto writeEntry = [&out](uint16_t tag, uint16_t type, uint32_t count, uint32_t value) {
    WriteLe16(out, tag);
    WriteLe16(out, type);
    WriteLe32(out, count);
    WriteLe32(out, value);
  };

  writeEntry(256, 4, 1, static_cast<uint32_t>(image.width));
  writeEntry(257, 4, 1, static_cast<uint32_t>(image.height));
  writeEntry(258, 3, 3, bitsOffset);
  writeEntry(259, 3, 1, 1);
  writeEntry(262, 3, 1, 2);
  writeEntry(273, 4, 1, pixelOffset);
  writeEntry(277, 3, 1, 3);
  writeEntry(278, 4, 1, static_cast<uint32_t>(image.height));
  writeEntry(279, 4, 1, byteCount);
  writeEntry(34675, 1, static_cast<uint32_t>(iccProfile.size()), iccOffset);
  WriteLe32(out, 0);

  out.seekp(bitsOffset);
  WriteLe16(out, 16);
  WriteLe16(out, 16);
  WriteLe16(out, 16);

  out.seekp(iccOffset);
  if (!iccProfile.empty()) {
    out.write(reinterpret_cast<const char*>(iccProfile.data()), static_cast<std::streamsize>(iccProfile.size()));
  }

  out.seekp(pixelOffset);
  for (uint16_t value : image.pixels) {
    WriteLe16(out, value);
  }

  if (!out.good()) {
    if (error) {
      *error = "Failed while writing TIFF";
    }
    return false;
  }
  return true;
}

}  // namespace visiongenie
