import {
  normalizeLocalMaskLayer,
  type LocalMaskLayer,
  type LocalMaskAdjustments,
} from '../types/colorEngine';

export interface LocalMaskUniforms {
  subjectStrength: number;
  subjectExposure: number;
  subjectTemperature: number;
  subjectSaturation: number;
  subjectClarity: number;
  subjectDenoise: number;
  skyStrength: number;
  skyExposure: number;
  skyTemperature: number;
  skySaturation: number;
  skyClarity: number;
  skyDenoise: number;
  skinStrength: number;
  skinExposure: number;
  skinTemperature: number;
  skinSaturation: number;
  skinClarity: number;
  skinDenoise: number;
  backgroundStrength: number;
  backgroundExposure: number;
  backgroundTemperature: number;
  backgroundSaturation: number;
  backgroundClarity: number;
  backgroundDenoise: number;
}

const emptyUniforms: LocalMaskUniforms = {
  subjectStrength: 0,
  subjectExposure: 0,
  subjectTemperature: 0,
  subjectSaturation: 0,
  subjectClarity: 0,
  subjectDenoise: 0,
  skyStrength: 0,
  skyExposure: 0,
  skyTemperature: 0,
  skySaturation: 0,
  skyClarity: 0,
  skyDenoise: 0,
  skinStrength: 0,
  skinExposure: 0,
  skinTemperature: 0,
  skinSaturation: 0,
  skinClarity: 0,
  skinDenoise: 0,
  backgroundStrength: 0,
  backgroundExposure: 0,
  backgroundTemperature: 0,
  backgroundSaturation: 0,
  backgroundClarity: 0,
  backgroundDenoise: 0,
};

const scaleAdjustments = (adjustments: LocalMaskAdjustments, strength: number) => ({
  exposure: adjustments.exposure * strength,
  temperature: adjustments.temperature * strength,
  saturation: adjustments.saturation * strength,
  clarity: adjustments.clarity * strength,
  denoise: adjustments.denoise * strength,
});

const chooseLayer = (layers: LocalMaskLayer[], type: LocalMaskLayer['type']) => {
  let best: LocalMaskLayer | null = null;
  let bestScore = 0;

  layers.forEach(layer => {
    const normalized = normalizeLocalMaskLayer(layer);
    if (!layer.enabled || layer.type !== type) {
      return;
    }
    const baseScore =
      Math.max(0, Math.min(1, normalized.strength)) *
      normalized.confidence *
      Math.max(0, Math.min(1, normalized.density || 1));
    const score = normalized.invert ? 1 - baseScore : baseScore;
    if (score > bestScore) {
      bestScore = score;
      best = normalized;
    }
  });

  return best ? {layer: best, score: bestScore} : null;
};

export const resolveLocalMaskUniforms = (layers: LocalMaskLayer[]): LocalMaskUniforms => {
  if (!layers || layers.length === 0) {
    return emptyUniforms;
  }

  const next: LocalMaskUniforms = {...emptyUniforms};

  const applyLayer = (
    target: 'subject' | 'sky' | 'skin' | 'background',
    result: {layer: LocalMaskLayer; score: number} | null,
  ) => {
    if (!result) {
      return;
    }
    const scaled = scaleAdjustments(result.layer.adjustments, result.score);

    next[`${target}Strength` as keyof LocalMaskUniforms] = result.score;
    next[`${target}Exposure` as keyof LocalMaskUniforms] = scaled.exposure;
    next[`${target}Temperature` as keyof LocalMaskUniforms] = scaled.temperature / 100;
    next[`${target}Saturation` as keyof LocalMaskUniforms] = scaled.saturation / 100;
    next[`${target}Clarity` as keyof LocalMaskUniforms] = scaled.clarity / 100;
    next[`${target}Denoise` as keyof LocalMaskUniforms] = scaled.denoise / 100;
  };

  applyLayer('subject', chooseLayer(layers, 'subject'));
  applyLayer('sky', chooseLayer(layers, 'sky'));
  applyLayer('skin', chooseLayer(layers, 'skin'));
  applyLayer('background', chooseLayer(layers, 'background'));

  return next;
};
