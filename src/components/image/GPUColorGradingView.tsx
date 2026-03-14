import React, {useEffect, useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import {
  Canvas,
  ColorMatrix,
  Fill,
  Image as SkiaImage,
  ImageShader,
  Shader,
  Skia,
} from '@shopify/react-native-skia';
import type {SkImage} from '@shopify/react-native-skia';
import type {ColorGradingParams} from '../../types/colorGrading.ts';
import type {
  HslSecondaryAdjustments,
  Lut3D,
  LutSlot,
  LocalMaskLayer,
  ResolvedColorEngineMode,
} from '../../types/colorEngine';
import {
  composeColorMatrices,
  createBrightnessMatrix,
  createContrastMatrix,
  createExposureMatrix,
  createSaturationMatrix,
  createTemperatureMatrix,
  createTintMatrix,
} from '../../utils/colorMatrix';
import {defaultHslSecondaryAdjustments} from '../../types/colorEngine';
import {resolveLocalMaskUniforms} from '../../colorEngine/localMask';
import {buildIdentityLut, createLutRuntimeTexture} from '../../colorEngine/lut/runtime';

const LEGACY_COLOR_GRADING_SHADER_SOURCE = `
uniform shader image;
uniform shader lutTexture;
uniform float lutSize;
uniform float lutStrength;
uniform float exposure;
uniform float temperature;
uniform float tint;
uniform float redBalance;
uniform float greenBalance;
uniform float blueBalance;
uniform float saturation;
uniform float vibrance;
uniform float shadows;
uniform float highlights;
uniform float whites;
uniform float blacks;
uniform float contrast;
uniform float brightness;
uniform float curveMaster0;
uniform float curveMaster1;
uniform float curveMaster2;
uniform float curveMaster3;
uniform float curveMaster4;
uniform float curveR0;
uniform float curveR1;
uniform float curveR2;
uniform float curveR3;
uniform float curveR4;
uniform float curveG0;
uniform float curveG1;
uniform float curveG2;
uniform float curveG3;
uniform float curveG4;
uniform float curveB0;
uniform float curveB1;
uniform float curveB2;
uniform float curveB3;
uniform float curveB4;
uniform float wheelShadowsHue;
uniform float wheelShadowsSat;
uniform float wheelShadowsLuma;
uniform float wheelMidtonesHue;
uniform float wheelMidtonesSat;
uniform float wheelMidtonesLuma;
uniform float wheelHighlightsHue;
uniform float wheelHighlightsSat;
uniform float wheelHighlightsLuma;

float catmull(float p0, float p1, float p2, float p3, float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  return 0.5 * (
    (2.0 * p1) +
    (-p0 + p2) * t +
    (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
    (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
  );
}

float curveSample(float x, float y0, float y1, float y2, float y3, float y4) {
  float t = clamp(x, 0.0, 1.0);
  float localT;
  if (t < 0.25) {
    localT = t / 0.25;
    return clamp(catmull(y0, y0, y1, y2, localT), 0.0, 1.0);
  }
  if (t < 0.5) {
    localT = (t - 0.25) / 0.25;
    return clamp(catmull(y0, y1, y2, y3, localT), 0.0, 1.0);
  }
  if (t < 0.75) {
    localT = (t - 0.5) / 0.25;
    return clamp(catmull(y1, y2, y3, y4, localT), 0.0, 1.0);
  }
  localT = (t - 0.75) / 0.25;
  return clamp(catmull(y2, y3, y4, y4, localT), 0.0, 1.0);
}

float3 hueTint(float hueDeg) {
  float r = radians(hueDeg);
  return normalize(float3(
    cos(r),
    cos(r - 2.0943951),
    cos(r + 2.0943951)
  ));
}

float3 linearize(float3 color) {
  return pow(clamp(color, 0.0, 1.0), float3(2.2));
}

float3 delinearize(float3 color) {
  return pow(clamp(color, 0.0, 1.0), float3(0.45454545));
}

float3 applyLut3D(float3 color) {
  float strength = clamp(lutStrength, 0.0, 1.0);
  if (strength <= 0.0001) {
    return color;
  }

  float size = max(2.0, lutSize);
  float3 clamped = clamp(color, 0.0, 1.0);
  float blueIndex = clamped.b * (size - 1.0);
  float z0 = floor(blueIndex);
  float z1 = min(size - 1.0, z0 + 1.0);
  float zMix = blueIndex - z0;
  float x0 = z0 * size + clamped.r * (size - 1.0) + 0.5;
  float x1 = z1 * size + clamped.r * (size - 1.0) + 0.5;
  float y = clamped.g * (size - 1.0) + 0.5;

  float3 lutA = clamp(lutTexture.eval(float2(x0, y)).rgb, 0.0, 1.0);
  float3 lutB = clamp(lutTexture.eval(float2(x1, y)).rgb, 0.0, 1.0);
  float3 mapped = mix(lutA, lutB, zMix);
  return mix(color, mapped, strength);
}

float3 applyWheel(float3 color, float luma, float mask, float hue, float sat, float lumaShift) {
  float satScale = clamp(sat, 0.0, 1.0);
  float3 tintVec = hueTint(hue);
  color += tintVec * satScale * mask * 0.26;
  color += lumaShift * mask * 0.24;
  return color;
}

half4 main(float2 xy) {
  half4 src = image.eval(xy);
  float3 color = linearize(clamp(src.rgb, 0.0, 1.0));

  float rawLuma = dot(color, float3(0.2126, 0.7152, 0.0722));
  float skinMask = smoothstep(0.15, 0.6, color.r) *
    smoothstep(0.08, 0.48, color.g) *
    (1.0 - smoothstep(0.16, 0.58, color.b)) *
    smoothstep(0.2, 0.8, rawLuma);

  float expFactor = pow(2.0, exposure);
  color *= expFactor;

  float tempStrength = mix(1.0, 0.65, skinMask);
  color.r += temperature * 0.20 * tempStrength;
  color.b -= temperature * 0.20 * tempStrength;
  color.r += tint * 0.06 * tempStrength;
  color.g += tint * 0.12 * tempStrength;
  color.b += tint * 0.06 * tempStrength;

  color.r *= (1.0 + redBalance * 0.35);
  color.g *= (1.0 + greenBalance * 0.35);
  color.b *= (1.0 + blueBalance * 0.35);

  float lumaForCurve = dot(color, float3(0.2126, 0.7152, 0.0722));
  float masterMapped = curveSample(
    lumaForCurve,
    curveMaster0,
    curveMaster1,
    curveMaster2,
    curveMaster3,
    curveMaster4
  );
  float lumaDelta = masterMapped - lumaForCurve;
  color += lumaDelta;
  color.r = curveSample(color.r, curveR0, curveR1, curveR2, curveR3, curveR4);
  color.g = curveSample(color.g, curveG0, curveG1, curveG2, curveG3, curveG4);
  color.b = curveSample(color.b, curveB0, curveB1, curveB2, curveB3, curveB4);

  float luma = dot(color, float3(0.2126, 0.7152, 0.0722));
  float satScale = clamp(1.0 + saturation * mix(1.0, 0.7, skinMask), 0.0, 1.75);
  color = mix(float3(luma), color, satScale);

  float maxC = max(max(color.r, color.g), color.b);
  float minC = min(min(color.r, color.g), color.b);
  float chroma = maxC - minC;
  float vibranceMask = 1.0 - smoothstep(0.0, 0.8, chroma);
  float vibScale = clamp(
    1.0 + vibrance * vibranceMask * mix(1.0, 0.55, skinMask),
    0.0,
    1.65
  );
  float vibLuma = dot(color, float3(0.2126, 0.7152, 0.0722));
  color = mix(float3(vibLuma), color, vibScale);
  color = applyLut3D(color);

  float toneLuma = dot(color, float3(0.2126, 0.7152, 0.0722));
  float shadowMask = 1.0 - smoothstep(0.18, 0.62, toneLuma);
  float midtoneMask = smoothstep(0.18, 0.48, toneLuma) *
    (1.0 - smoothstep(0.52, 0.82, toneLuma));
  float highlightMask = smoothstep(0.38, 0.86, toneLuma);
  float tonalNorm = max(0.001, shadowMask + midtoneMask + highlightMask);
  shadowMask /= tonalNorm;
  midtoneMask /= tonalNorm;
  highlightMask /= tonalNorm;
  float blackMask = 1.0 - smoothstep(0.0, 0.25, toneLuma);
  float whiteMask = smoothstep(0.75, 1.0, toneLuma);

  color = applyWheel(
    color,
    toneLuma,
    shadowMask,
    wheelShadowsHue,
    wheelShadowsSat,
    wheelShadowsLuma
  );
  color = applyWheel(
    color,
    toneLuma,
    midtoneMask,
    wheelMidtonesHue,
    wheelMidtonesSat,
    wheelMidtonesLuma
  );
  color = applyWheel(
    color,
    toneLuma,
    highlightMask,
    wheelHighlightsHue,
    wheelHighlightsSat,
    wheelHighlightsLuma
  );

  color += shadowMask * shadows * 0.28;
  color += highlightMask * highlights * 0.28;
  color += blackMask * blacks * 0.32;
  color += whiteMask * whites * 0.32;

  color = (color - 0.5) * (1.0 + contrast * 0.75) + 0.5;
  color += brightness * 0.25;
  color = clamp(color, 0.0, 1.0);
  color = delinearize(color);
  color = clamp(color, 0.0, 1.0);

  return half4(half3(color), src.a);
}
`;

const PRO_COLOR_GRADING_SHADER_SOURCE = `
uniform shader image;
uniform shader lutTexture;
uniform float lutSize;
uniform float lutStrength;
uniform float exposure;
uniform float temperature;
uniform float tint;
uniform float redBalance;
uniform float greenBalance;
uniform float blueBalance;
uniform float saturation;
uniform float vibrance;
uniform float shadows;
uniform float highlights;
uniform float whites;
uniform float blacks;
uniform float contrast;
uniform float brightness;
uniform float curveMaster0;
uniform float curveMaster1;
uniform float curveMaster2;
uniform float curveMaster3;
uniform float curveMaster4;
uniform float curveR0;
uniform float curveR1;
uniform float curveR2;
uniform float curveR3;
uniform float curveR4;
uniform float curveG0;
uniform float curveG1;
uniform float curveG2;
uniform float curveG3;
uniform float curveG4;
uniform float curveB0;
uniform float curveB1;
uniform float curveB2;
uniform float curveB3;
uniform float curveB4;
uniform float wheelShadowsHue;
uniform float wheelShadowsSat;
uniform float wheelShadowsLuma;
uniform float wheelMidtonesHue;
uniform float wheelMidtonesSat;
uniform float wheelMidtonesLuma;
uniform float wheelHighlightsHue;
uniform float wheelHighlightsSat;
uniform float wheelHighlightsLuma;
uniform float hslRedHue;
uniform float hslRedSat;
uniform float hslRedLum;
uniform float hslOrangeHue;
uniform float hslOrangeSat;
uniform float hslOrangeLum;
uniform float hslYellowHue;
uniform float hslYellowSat;
uniform float hslYellowLum;
uniform float hslGreenHue;
uniform float hslGreenSat;
uniform float hslGreenLum;
uniform float hslAquaHue;
uniform float hslAquaSat;
uniform float hslAquaLum;
uniform float hslBlueHue;
uniform float hslBlueSat;
uniform float hslBlueLum;
uniform float hslPurpleHue;
uniform float hslPurpleSat;
uniform float hslPurpleLum;
uniform float hslMagentaHue;
uniform float hslMagentaSat;
uniform float hslMagentaLum;
uniform float subjectStrength;
uniform float subjectExposure;
uniform float subjectTemperature;
uniform float subjectSaturation;
uniform float subjectClarity;
uniform float subjectDenoise;
uniform float skyStrength;
uniform float skyExposure;
uniform float skyTemperature;
uniform float skySaturation;
uniform float skyClarity;
uniform float skyDenoise;
uniform float skinStrength;
uniform float skinExposure;
uniform float skinTemperature;
uniform float skinSaturation;
uniform float skinClarity;
uniform float skinDenoise;
uniform float backgroundStrength;
uniform float backgroundExposure;
uniform float backgroundTemperature;
uniform float backgroundSaturation;
uniform float backgroundClarity;
uniform float backgroundDenoise;

float catmull(float p0, float p1, float p2, float p3, float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  return 0.5 * (
    (2.0 * p1) +
    (-p0 + p2) * t +
    (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
    (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
  );
}

float curveSample(float x, float y0, float y1, float y2, float y3, float y4) {
  float t = clamp(x, 0.0, 1.0);
  float localT;
  if (t < 0.25) {
    localT = t / 0.25;
    return clamp(catmull(y0, y0, y1, y2, localT), 0.0, 1.0);
  }
  if (t < 0.5) {
    localT = (t - 0.25) / 0.25;
    return clamp(catmull(y0, y1, y2, y3, localT), 0.0, 1.0);
  }
  if (t < 0.75) {
    localT = (t - 0.5) / 0.25;
    return clamp(catmull(y1, y2, y3, y4, localT), 0.0, 1.0);
  }
  localT = (t - 0.75) / 0.25;
  return clamp(catmull(y2, y3, y4, y4, localT), 0.0, 1.0);
}

float3 hueTint(float hueDeg) {
  float r = radians(hueDeg);
  return normalize(float3(
    cos(r),
    cos(r - 2.0943951),
    cos(r + 2.0943951)
  ));
}

float eotfSrgb(float v) {
  float c = clamp(v, 0.0, 1.0);
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return pow((c + 0.055) / 1.055, 2.4);
}

float oetfSrgb(float v) {
  float c = max(0.0, v);
  if (c <= 0.0031308) {
    return c * 12.92;
  }
  return 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

float3 applyEotfSrgb(float3 color) {
  return float3(eotfSrgb(color.r), eotfSrgb(color.g), eotfSrgb(color.b));
}

float3 applyOetfSrgb(float3 color) {
  return float3(oetfSrgb(color.r), oetfSrgb(color.g), oetfSrgb(color.b));
}

float3 applyLut3D(float3 color) {
  float strength = clamp(lutStrength, 0.0, 1.0);
  if (strength <= 0.0001) {
    return color;
  }

  float size = max(2.0, lutSize);
  float3 clamped = clamp(color, 0.0, 1.0);
  float blueIndex = clamped.b * (size - 1.0);
  float z0 = floor(blueIndex);
  float z1 = min(size - 1.0, z0 + 1.0);
  float zMix = blueIndex - z0;
  float x0 = z0 * size + clamped.r * (size - 1.0) + 0.5;
  float x1 = z1 * size + clamped.r * (size - 1.0) + 0.5;
  float y = clamped.g * (size - 1.0) + 0.5;

  float3 lutA = clamp(lutTexture.eval(float2(x0, y)).rgb, 0.0, 1.0);
  float3 lutB = clamp(lutTexture.eval(float2(x1, y)).rgb, 0.0, 1.0);
  float3 mapped = mix(lutA, lutB, zMix);
  return mix(color, mapped, strength);
}

float3 applyWheel(float3 color, float luma, float mask, float hue, float sat, float lumaShift) {
  float satScale = clamp(sat, 0.0, 1.0);
  float3 tintVec = hueTint(hue);
  color += tintVec * satScale * mask * 0.26;
  color += lumaShift * mask * 0.24;
  return color;
}

float3 applyLocalAdjustments(
  float3 color,
  float mask,
  float exposureAdj,
  float tempAdj,
  float satAdj,
  float clarityAdj,
  float denoiseAdj
) {
  if (mask <= 0.001) {
    return color;
  }

  float3 local = color;
  local *= pow(2.0, exposureAdj);
  local.r += tempAdj * 0.18;
  local.b -= tempAdj * 0.18;
  float luma = dot(local, float3(0.2126, 0.7152, 0.0722));
  local = mix(float3(luma), local, clamp(1.0 + satAdj, 0.0, 1.8));
  local = (local - 0.5) * (1.0 + clarityAdj * 0.6) + 0.5;
  float denoise = clamp(denoiseAdj, 0.0, 1.0);
  local = mix(local, float3(luma), denoise * 0.35);

  return mix(color, local, mask);
}

float3 rgbToHsl(float3 color) {
  float maxC = max(max(color.r, color.g), color.b);
  float minC = min(min(color.r, color.g), color.b);
  float delta = maxC - minC;
  float l = (maxC + minC) * 0.5;

  float s = 0.0;
  if (delta > 0.0001) {
    s = l > 0.5 ? delta / (2.0 - maxC - minC) : delta / (maxC + minC);
  }

  float h = 0.0;
  if (delta > 0.0001) {
    if (maxC == color.r) {
      h = (color.g - color.b) / delta + (color.g < color.b ? 6.0 : 0.0);
    } else if (maxC == color.g) {
      h = (color.b - color.r) / delta + 2.0;
    } else {
      h = (color.r - color.g) / delta + 4.0;
    }
    h /= 6.0;
  }

  return float3(h, s, l);
}

float hueToRgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0/2.0) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}

float3 hslToRgb(float3 hsl) {
  float h = hsl.x;
  float s = hsl.y;
  float l = hsl.z;

  if (s < 0.0001) {
    return float3(l, l, l);
  }

  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  float r = hueToRgb(p, q, h + 1.0/3.0);
  float g = hueToRgb(p, q, h);
  float b = hueToRgb(p, q, h - 1.0/3.0);
  return float3(r, g, b);
}

float bandWeight(float h, float center, float width) {
  float d = abs(h - center);
  d = min(d, 1.0 - d);
  return smoothstep(width, 0.0, d);
}

float filmicSoftShoulder(float x) {
  const float knee = 0.82;
  const float shoulder = 2.6;
  if (x <= knee) {
    return x;
  }
  float t = clamp((x - knee) / (1.0 - knee), 0.0, 1.0);
  float mapped = (1.0 - exp(-shoulder * t)) / (1.0 - exp(-shoulder));
  return knee + (1.0 - knee) * mapped;
}

float3 applyHighlightRolloffFilmicSoft(float3 color) {
  float peak = max(max(color.r, color.g), color.b);
  if (peak <= 0.82) {
    return color;
  }
  float mappedPeak = filmicSoftShoulder(peak);
  float ratio = mappedPeak / max(peak, 0.0001);
  return color * ratio;
}

float3 applyPerceptualGamutMapToSrgb(float3 color) {
  bool outOfGamut = color.r < 0.0 || color.r > 1.0 || color.g < 0.0 || color.g > 1.0 || color.b < 0.0 || color.b > 1.0;
  if (!outOfGamut) {
    return color;
  }

  float luma = clamp(dot(color, float3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  float3 chroma = color - float3(luma);
  float maxScale = 1.0;

  if (chroma.r > 0.00001) maxScale = min(maxScale, (1.0 - luma) / chroma.r);
  if (chroma.r < -0.00001) maxScale = min(maxScale, (0.0 - luma) / chroma.r);
  if (chroma.g > 0.00001) maxScale = min(maxScale, (1.0 - luma) / chroma.g);
  if (chroma.g < -0.00001) maxScale = min(maxScale, (0.0 - luma) / chroma.g);
  if (chroma.b > 0.00001) maxScale = min(maxScale, (1.0 - luma) / chroma.b);
  if (chroma.b < -0.00001) maxScale = min(maxScale, (0.0 - luma) / chroma.b);

  float perceptualScale = clamp(maxScale * 0.95, 0.0, 1.0);
  return clamp(float3(luma) + chroma * perceptualScale, 0.0, 1.0);
}

half4 main(float2 xy) {
  half4 src = image.eval(xy);
  float3 color = applyEotfSrgb(clamp(src.rgb, 0.0, 1.0));

  float rawLuma = dot(color, float3(0.2126, 0.7152, 0.0722));
  float skinMask = smoothstep(0.15, 0.6, color.r) *
    smoothstep(0.08, 0.48, color.g) *
    (1.0 - smoothstep(0.16, 0.58, color.b)) *
    smoothstep(0.2, 0.8, rawLuma);

  float expFactor = pow(2.0, exposure);
  color *= expFactor;

  float tempStrength = mix(1.0, 0.65, skinMask);
  color.r += temperature * 0.20 * tempStrength;
  color.b -= temperature * 0.20 * tempStrength;
  color.r += tint * 0.06 * tempStrength;
  color.g += tint * 0.12 * tempStrength;
  color.b += tint * 0.06 * tempStrength;

  color.r *= (1.0 + redBalance * 0.35);
  color.g *= (1.0 + greenBalance * 0.35);
  color.b *= (1.0 + blueBalance * 0.35);

  float lumaForCurve = dot(color, float3(0.2126, 0.7152, 0.0722));
  float masterMapped = curveSample(
    lumaForCurve,
    curveMaster0,
    curveMaster1,
    curveMaster2,
    curveMaster3,
    curveMaster4
  );
  float lumaDelta = masterMapped - lumaForCurve;
  color += lumaDelta;
  color.r = curveSample(color.r, curveR0, curveR1, curveR2, curveR3, curveR4);
  color.g = curveSample(color.g, curveG0, curveG1, curveG2, curveG3, curveG4);
  color.b = curveSample(color.b, curveB0, curveB1, curveB2, curveB3, curveB4);

  float luma = dot(color, float3(0.2126, 0.7152, 0.0722));
  float satScale = clamp(1.0 + saturation * mix(1.0, 0.7, skinMask), 0.0, 1.75);
  color = mix(float3(luma), color, satScale);

  float maxC = max(max(color.r, color.g), color.b);
  float minC = min(min(color.r, color.g), color.b);
  float chroma = maxC - minC;
  float vibranceMask = 1.0 - smoothstep(0.0, 0.8, chroma);
  float vibScale = clamp(
    1.0 + vibrance * vibranceMask * mix(1.0, 0.55, skinMask),
    0.0,
    1.65
  );
  float vibLuma = dot(color, float3(0.2126, 0.7152, 0.0722));
  color = mix(float3(vibLuma), color, vibScale);

  float toneLuma = dot(color, float3(0.2126, 0.7152, 0.0722));
  float shadowMask = 1.0 - smoothstep(0.18, 0.62, toneLuma);
  float midtoneMask = smoothstep(0.18, 0.48, toneLuma) *
    (1.0 - smoothstep(0.52, 0.82, toneLuma));
  float highlightMask = smoothstep(0.38, 0.86, toneLuma);
  float tonalNorm = max(0.001, shadowMask + midtoneMask + highlightMask);
  shadowMask /= tonalNorm;
  midtoneMask /= tonalNorm;
  highlightMask /= tonalNorm;
  float blackMask = 1.0 - smoothstep(0.0, 0.25, toneLuma);
  float whiteMask = smoothstep(0.75, 1.0, toneLuma);

  color = applyWheel(
    color,
    toneLuma,
    shadowMask,
    wheelShadowsHue,
    wheelShadowsSat,
    wheelShadowsLuma
  );
  color = applyWheel(
    color,
    toneLuma,
    midtoneMask,
    wheelMidtonesHue,
    wheelMidtonesSat,
    wheelMidtonesLuma
  );
  color = applyWheel(
    color,
    toneLuma,
    highlightMask,
    wheelHighlightsHue,
    wheelHighlightsSat,
    wheelHighlightsLuma
  );

  color += shadowMask * shadows * 0.28;
  color += highlightMask * highlights * 0.28;
  color += blackMask * blacks * 0.32;
  color += whiteMask * whites * 0.32;

  float3 hsl = rgbToHsl(color);
  float wRed = bandWeight(hsl.x, 0.0, 0.08);
  float wOrange = bandWeight(hsl.x, 0.08, 0.08);
  float wYellow = bandWeight(hsl.x, 0.16, 0.08);
  float wGreen = bandWeight(hsl.x, 0.33, 0.1);
  float wAqua = bandWeight(hsl.x, 0.45, 0.1);
  float wBlue = bandWeight(hsl.x, 0.58, 0.1);
  float wPurple = bandWeight(hsl.x, 0.72, 0.1);
  float wMagenta = bandWeight(hsl.x, 0.86, 0.1);

  float hueShift = (
    hslRedHue * wRed +
    hslOrangeHue * wOrange +
    hslYellowHue * wYellow +
    hslGreenHue * wGreen +
    hslAquaHue * wAqua +
    hslBlueHue * wBlue +
    hslPurpleHue * wPurple +
    hslMagentaHue * wMagenta
  ) / 360.0;

  float satShift = (
    hslRedSat * wRed +
    hslOrangeSat * wOrange +
    hslYellowSat * wYellow +
    hslGreenSat * wGreen +
    hslAquaSat * wAqua +
    hslBlueSat * wBlue +
    hslPurpleSat * wPurple +
    hslMagentaSat * wMagenta
  ) / 100.0;

  float lumShift = (
    hslRedLum * wRed +
    hslOrangeLum * wOrange +
    hslYellowLum * wYellow +
    hslGreenLum * wGreen +
    hslAquaLum * wAqua +
    hslBlueLum * wBlue +
    hslPurpleLum * wPurple +
    hslMagentaLum * wMagenta
  ) / 100.0;

  hsl.x = fract(hsl.x + hueShift);
  hsl.y = clamp(hsl.y + satShift, 0.0, 1.0);
  hsl.z = clamp(hsl.z + lumShift, 0.0, 1.0);
  color = hslToRgb(hsl);
  color = applyLut3D(color);

  float skyMask = smoothstep(0.25, 0.85, color.b - max(color.r, color.g)) *
    smoothstep(0.35, 0.9, toneLuma);
  float subjectMask = smoothstep(0.2, 0.75, chroma) * smoothstep(0.2, 0.8, toneLuma);
  float backgroundMask = clamp(1.0 - max(max(skinMask, subjectMask), skyMask), 0.0, 1.0);

  color = applyLocalAdjustments(color, subjectMask * subjectStrength, subjectExposure, subjectTemperature, subjectSaturation, subjectClarity, subjectDenoise);
  color = applyLocalAdjustments(color, skyMask * skyStrength, skyExposure, skyTemperature, skySaturation, skyClarity, skyDenoise);
  color = applyLocalAdjustments(color, skinMask * skinStrength, skinExposure, skinTemperature, skinSaturation, skinClarity, skinDenoise);
  color = applyLocalAdjustments(color, backgroundMask * backgroundStrength, backgroundExposure, backgroundTemperature, backgroundSaturation, backgroundClarity, backgroundDenoise);
  color = applyHighlightRolloffFilmicSoft(color);
  color = applyPerceptualGamutMapToSrgb(color);

  color = (color - 0.5) * (1.0 + contrast * 0.75) + 0.5;
  color += brightness * 0.25;
  color = clamp(color, 0.0, 1.0);
  color = applyOetfSrgb(color);
  color = clamp(color, 0.0, 1.0);

  return half4(half3(color), src.a);
}
`;

const LEGACY_COLOR_GRADING_RUNTIME_EFFECT =
  Skia.RuntimeEffect?.Make?.(LEGACY_COLOR_GRADING_SHADER_SOURCE) ?? null;

const PRO_COLOR_GRADING_RUNTIME_EFFECT =
  Skia.RuntimeEffect?.Make?.(PRO_COLOR_GRADING_SHADER_SOURCE) ?? null;

interface GPUColorGradingViewProps {
  image: SkImage;
  params: ColorGradingParams;
  displayWidth: number;
  displayHeight: number;
  engineMode?: ResolvedColorEngineMode;
  localMasks?: LocalMaskLayer[];
  hsl?: HslSecondaryAdjustments;
  lut?: LutSlot | null;
  lutLibrary?: Record<string, Lut3D>;
  onShaderAvailabilityChange?: (available: boolean) => void;
}

export const GPUColorGradingView: React.FC<GPUColorGradingViewProps> = ({
  image,
  params,
  displayWidth,
  displayHeight,
  engineMode = 'legacy',
  localMasks,
  hsl,
  lut,
  lutLibrary,
  onShaderAvailabilityChange,
}) => {
  const runtimeEffect =
    engineMode === 'pro' ? PRO_COLOR_GRADING_RUNTIME_EFFECT : LEGACY_COLOR_GRADING_RUNTIME_EFFECT;
  const shaderSupported = Boolean(runtimeEffect);

  useEffect(() => {
    onShaderAvailabilityChange?.(shaderSupported);
  }, [onShaderAvailabilityChange, shaderSupported]);

  const resolvedHsl = hsl || defaultHslSecondaryAdjustments();
  const maskUniforms = useMemo(() => resolveLocalMaskUniforms(localMasks || []), [localMasks]);
  const identityLut = useMemo(() => buildIdentityLut(16), []);
  const selectedLut = useMemo(() => {
    if (!lut?.enabled || !lutLibrary) {
      return null;
    }
    return lutLibrary[lut.lutId] || null;
  }, [lut, lutLibrary]);
  const lutRuntime = useMemo(
    () => createLutRuntimeTexture(selectedLut || identityLut),
    [identityLut, selectedLut],
  );
  const lutStrength = useMemo(() => {
    if (!selectedLut || !lut?.enabled || !lutRuntime.image) {
      return 0;
    }
    return Math.max(0, Math.min(1, lut.strength));
  }, [lut, lutRuntime.image, selectedLut]);

  const shaderUniforms = useMemo(
    () => ({
      exposure: Math.max(-2, Math.min(2, params.basic.exposure)),
      temperature: params.colorBalance.temperature / 100,
      tint: params.colorBalance.tint / 100,
      redBalance: params.colorBalance.redBalance / 100,
      greenBalance: params.colorBalance.greenBalance / 100,
      blueBalance: params.colorBalance.blueBalance / 100,
      saturation: params.colorBalance.saturation / 100,
      vibrance: params.colorBalance.vibrance / 100,
      shadows: params.basic.shadows / 100,
      highlights: params.basic.highlights / 100,
      whites: params.basic.whites / 100,
      blacks: params.basic.blacks / 100,
      contrast: params.basic.contrast / 100,
      brightness: params.basic.brightness / 100,
      curveMaster0: params.pro.curves.master[0],
      curveMaster1: params.pro.curves.master[1],
      curveMaster2: params.pro.curves.master[2],
      curveMaster3: params.pro.curves.master[3],
      curveMaster4: params.pro.curves.master[4],
      curveR0: params.pro.curves.r[0],
      curveR1: params.pro.curves.r[1],
      curveR2: params.pro.curves.r[2],
      curveR3: params.pro.curves.r[3],
      curveR4: params.pro.curves.r[4],
      curveG0: params.pro.curves.g[0],
      curveG1: params.pro.curves.g[1],
      curveG2: params.pro.curves.g[2],
      curveG3: params.pro.curves.g[3],
      curveG4: params.pro.curves.g[4],
      curveB0: params.pro.curves.b[0],
      curveB1: params.pro.curves.b[1],
      curveB2: params.pro.curves.b[2],
      curveB3: params.pro.curves.b[3],
      curveB4: params.pro.curves.b[4],
      wheelShadowsHue: params.pro.wheels.shadows.hue,
      wheelShadowsSat: params.pro.wheels.shadows.sat / 100,
      wheelShadowsLuma: params.pro.wheels.shadows.luma / 100,
      wheelMidtonesHue: params.pro.wheels.midtones.hue,
      wheelMidtonesSat: params.pro.wheels.midtones.sat / 100,
      wheelMidtonesLuma: params.pro.wheels.midtones.luma / 100,
      wheelHighlightsHue: params.pro.wheels.highlights.hue,
      wheelHighlightsSat: params.pro.wheels.highlights.sat / 100,
      wheelHighlightsLuma: params.pro.wheels.highlights.luma / 100,
      hslRedHue: resolvedHsl.red.hue,
      hslRedSat: resolvedHsl.red.saturation,
      hslRedLum: resolvedHsl.red.luminance,
      hslOrangeHue: resolvedHsl.orange.hue,
      hslOrangeSat: resolvedHsl.orange.saturation,
      hslOrangeLum: resolvedHsl.orange.luminance,
      hslYellowHue: resolvedHsl.yellow.hue,
      hslYellowSat: resolvedHsl.yellow.saturation,
      hslYellowLum: resolvedHsl.yellow.luminance,
      hslGreenHue: resolvedHsl.green.hue,
      hslGreenSat: resolvedHsl.green.saturation,
      hslGreenLum: resolvedHsl.green.luminance,
      hslAquaHue: resolvedHsl.aqua.hue,
      hslAquaSat: resolvedHsl.aqua.saturation,
      hslAquaLum: resolvedHsl.aqua.luminance,
      hslBlueHue: resolvedHsl.blue.hue,
      hslBlueSat: resolvedHsl.blue.saturation,
      hslBlueLum: resolvedHsl.blue.luminance,
      hslPurpleHue: resolvedHsl.purple.hue,
      hslPurpleSat: resolvedHsl.purple.saturation,
      hslPurpleLum: resolvedHsl.purple.luminance,
      hslMagentaHue: resolvedHsl.magenta.hue,
      hslMagentaSat: resolvedHsl.magenta.saturation,
      hslMagentaLum: resolvedHsl.magenta.luminance,
      lutSize: lutRuntime.size,
      lutStrength,
      ...maskUniforms,
    }),
    [lutRuntime.size, lutStrength, maskUniforms, params, resolvedHsl],
  );

  const fallbackMatrix = useMemo(() => {
    const matrices: number[][] = [];

    if (params.basic.exposure !== 0) {
      matrices.push(createExposureMatrix(params.basic.exposure));
    }
    if (params.basic.brightness !== 0) {
      matrices.push(createBrightnessMatrix(params.basic.brightness));
    }
    if (params.basic.contrast !== 0) {
      matrices.push(createContrastMatrix(params.basic.contrast));
    }
    if (params.colorBalance.temperature !== 0) {
      matrices.push(createTemperatureMatrix(params.colorBalance.temperature));
    }
    if (params.colorBalance.tint !== 0) {
      matrices.push(createTintMatrix(params.colorBalance.tint));
    }
    if (params.colorBalance.saturation !== 0) {
      matrices.push(createSaturationMatrix(params.colorBalance.saturation));
    }

    return matrices.length > 0 ? composeColorMatrices(matrices) : null;
  }, [params]);

  return (
    <View style={[styles.container, {width: displayWidth, height: displayHeight}]}>
      {shaderSupported && runtimeEffect ? (
        <Canvas style={styles.canvas}>
          <Fill>
            <Shader source={runtimeEffect} uniforms={shaderUniforms}>
              <ImageShader
                image={image}
                x={0}
                y={0}
                width={displayWidth}
                height={displayHeight}
                fit="contain"
              />
              <ImageShader
                image={lutRuntime.image || image}
                x={0}
                y={0}
                width={lutRuntime.width}
                height={lutRuntime.height}
                fit="fill"
              />
            </Shader>
          </Fill>
        </Canvas>
      ) : (
        <Canvas style={styles.canvas}>
          <SkiaImage
            image={image}
            x={0}
            y={0}
            width={displayWidth}
            height={displayHeight}
            fit="contain">
            {fallbackMatrix && <ColorMatrix matrix={fallbackMatrix} />}
          </SkiaImage>
        </Canvas>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  canvas: {
    flex: 1,
  },
});
