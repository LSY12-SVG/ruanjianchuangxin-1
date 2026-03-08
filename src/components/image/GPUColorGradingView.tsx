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
import {
  composeColorMatrices,
  createBrightnessMatrix,
  createContrastMatrix,
  createExposureMatrix,
  createSaturationMatrix,
  createTemperatureMatrix,
  createTintMatrix,
} from '../../utils/colorMatrix';

const COLOR_GRADING_SHADER_SOURCE = `
uniform shader image;
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

const COLOR_GRADING_RUNTIME_EFFECT =
  Skia.RuntimeEffect?.Make?.(COLOR_GRADING_SHADER_SOURCE) ?? null;

interface GPUColorGradingViewProps {
  image: SkImage;
  params: ColorGradingParams;
  displayWidth: number;
  displayHeight: number;
  onShaderAvailabilityChange?: (available: boolean) => void;
}

export const GPUColorGradingView: React.FC<GPUColorGradingViewProps> = ({
  image,
  params,
  displayWidth,
  displayHeight,
  onShaderAvailabilityChange,
}) => {
  const shaderSupported = Boolean(COLOR_GRADING_RUNTIME_EFFECT);

  useEffect(() => {
    onShaderAvailabilityChange?.(shaderSupported);
  }, [onShaderAvailabilityChange, shaderSupported]);

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
    }),
    [params],
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
      {shaderSupported && COLOR_GRADING_RUNTIME_EFFECT ? (
        <Canvas style={styles.canvas}>
          <Fill>
            <Shader source={COLOR_GRADING_RUNTIME_EFFECT} uniforms={shaderUniforms}>
              <ImageShader
                image={image}
                x={0}
                y={0}
                width={displayWidth}
                height={displayHeight}
                fit="contain"
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
