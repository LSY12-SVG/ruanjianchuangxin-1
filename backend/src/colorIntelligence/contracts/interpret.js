const {pickDefined, isObject, toNumberIfFinite} = require('./shared');

const normalizeImagePayload = imageRaw => {
  if (!isObject(imageRaw)) {
    return imageRaw;
  }
  return {
    mimeType: pickDefined(imageRaw.mimeType, imageRaw.mime_type),
    width: toNumberIfFinite(imageRaw.width),
    height: toNumberIfFinite(imageRaw.height),
    base64: pickDefined(imageRaw.base64, imageRaw.base_64),
  };
};

const normalizeImageStats = statsRaw => {
  if (!isObject(statsRaw)) {
    return statsRaw;
  }
  return {
    lumaMean: toNumberIfFinite(pickDefined(statsRaw.lumaMean, statsRaw.luma_mean)),
    lumaStd: toNumberIfFinite(pickDefined(statsRaw.lumaStd, statsRaw.luma_std)),
    highlightClipPct: toNumberIfFinite(
      pickDefined(statsRaw.highlightClipPct, statsRaw.highlight_clip_pct),
    ),
    shadowClipPct: toNumberIfFinite(pickDefined(statsRaw.shadowClipPct, statsRaw.shadow_clip_pct)),
    saturationMean: toNumberIfFinite(
      pickDefined(statsRaw.saturationMean, statsRaw.saturation_mean),
    ),
    skinPct: toNumberIfFinite(pickDefined(statsRaw.skinPct, statsRaw.skin_pct)),
    skyPct: toNumberIfFinite(pickDefined(statsRaw.skyPct, statsRaw.sky_pct)),
    greenPct: toNumberIfFinite(pickDefined(statsRaw.greenPct, statsRaw.green_pct)),
  };
};

const normalizeInterpretRequest = body => {
  if (!isObject(body)) {
    return body;
  }

  return {
    mode: pickDefined(body.mode, body.request_mode),
    transcript: pickDefined(body.transcript, body.text, body.userText),
    currentParams: pickDefined(body.currentParams, body.current_params),
    locale: pickDefined(body.locale, body.lang),
    sceneHints: pickDefined(body.sceneHints, body.scene_hints),
    image: normalizeImagePayload(body.image),
    imageStats: normalizeImageStats(pickDefined(body.imageStats, body.image_stats)),
  };
};

module.exports = {
  normalizeInterpretRequest,
};
