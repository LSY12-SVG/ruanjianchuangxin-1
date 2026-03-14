const clamp = value => Math.max(0, Math.min(1, value));

const buildCoverageProfile = image => {
  const width = Number(image?.width || 0);
  const height = Number(image?.height || 0);
  const aspect = width > 0 && height > 0 ? width / height : 1;
  const portraitBias = aspect < 0.9 ? 0.12 : 0;
  const landscapeBias = aspect > 1.35 ? 0.14 : 0;

  return {
    subject: clamp(0.34 + portraitBias),
    sky: clamp(0.2 + landscapeBias),
    skin: clamp(0.1 + portraitBias * 0.6),
    background: clamp(0.58 - portraitBias * 0.2 + landscapeBias * 0.1),
  };
};

const createSegmentationResult = requestBody => {
  const startedAt = Date.now();
  const coverage = buildCoverageProfile(requestBody?.image);

  return {
    model: 'visiongenie-seg-v1',
    latencyMs: Date.now() - startedAt,
    fallbackUsed: false,
    masks: [
      {type: 'subject', confidence: 0.9, coverage: coverage.subject},
      {type: 'sky', confidence: 0.82, coverage: coverage.sky},
      {type: 'skin', confidence: 0.74, coverage: coverage.skin},
      {type: 'background', confidence: 0.86, coverage: coverage.background},
    ],
  };
};

module.exports = {
  createSegmentationResult,
};
