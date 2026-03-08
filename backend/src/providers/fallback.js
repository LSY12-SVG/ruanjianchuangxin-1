const {
  estimateSceneProfile,
  detectQualityRiskFlags,
  recommendIntensity,
} = require('./quality');

const pickStyle = text => {
  if (
    text.includes('清冷') ||
    text.includes('冷色') ||
    text.includes('电影冷') ||
    text.includes('高级冷')
  ) {
    return 'cinematic_cool';
  }
  if (
    text.includes('暖色') ||
    text.includes('温暖') ||
    text.includes('日落') ||
    text.includes('电影暖')
  ) {
    return 'cinematic_warm';
  }
  if (
    text.includes('人像') ||
    text.includes('通透') ||
    text.includes('肤色') ||
    text.includes('柔光')
  ) {
    return 'portrait_clean';
  }
  if (text.includes('复古') || text.includes('胶片') || text.includes('怀旧')) {
    return 'vintage_fade';
  }
  if (text.includes('情绪') || text.includes('暗调') || text.includes('低沉')) {
    return 'moody_dark';
  }
  if (text.includes('清新') || text.includes('明亮')) {
    return 'fresh_bright';
  }
  return null;
};

const estimateProfile = imageStats => {
  if (!imageStats) {
    return 'general';
  }
  if ((imageStats.skinPct || 0) > 0.18) {
    return 'portrait';
  }
  if ((imageStats.lumaMean || 0) < 0.25) {
    return 'night';
  }
  if ((imageStats.skyPct || 0) > 0.2 || (imageStats.greenPct || 0) > 0.2) {
    return 'landscape';
  }
  return 'general';
};

const estimateAnalysis = imageStats => {
  if (!imageStats) {
    return '缺少图像统计，按通用风格模板生成。';
  }
  const tokens = [];
  if (imageStats.highlightClipPct > 0.05) {
    tokens.push('高光偏溢出');
  }
  if (imageStats.shadowClipPct > 0.06) {
    tokens.push('暗部压缩较重');
  }
  if (imageStats.lumaMean < 0.3) {
    tokens.push('整体偏暗');
  } else if (imageStats.lumaMean > 0.72) {
    tokens.push('整体偏亮');
  }
  if (imageStats.saturationMean < 0.2) {
    tokens.push('色彩偏灰');
  } else if (imageStats.saturationMean > 0.58) {
    tokens.push('颜色较浓');
  }
  if (tokens.length === 0) {
    return '曝光与色彩分布较均衡，按风格需求做温和优化。';
  }
  return `${tokens.join('，')}，已按风格需求生成保守调色建议。`;
};

const fallbackInterpret = request => {
  const mode =
    request.mode === 'initial_visual_suggest' || request.mode === 'voice_refine'
      ? request.mode
      : 'voice_refine';
  const text = String(request.transcript || '').trim().toLowerCase();
  const imageStats = request.imageStats || null;
  const inferredProfile = estimateProfile(imageStats);
  const sceneProfile = estimateSceneProfile(imageStats, request.sceneHints);
  const appliedProfile = inferredProfile === 'general' ? sceneProfile : inferredProfile;
  const qualityRiskFlags = detectQualityRiskFlags(imageStats);
  const recommendedIntensity = recommendIntensity({imageStats, sceneProfile});
  const analysisSummary = estimateAnalysis(imageStats);

  if (!text) {
    if (mode === 'initial_visual_suggest') {
      return {
        actions: [
          {
            action: 'apply_style',
            target: 'style',
            style: imageStats && imageStats.lumaMean < 0.28 ? 'moody_dark' : 'fresh_bright',
            strength: 0.9,
          },
        ],
        confidence: 0.45,
        reasoning_summary: 'initial visual fallback style',
        fallback_used: true,
        needsConfirmation: false,
        message: '云端不可用，已按图像统计做首轮兜底建议',
        source: 'fallback',
        analysis_summary: analysisSummary,
        applied_profile: appliedProfile,
        scene_profile: sceneProfile,
        scene_confidence: imageStats ? 0.58 : 0.4,
        quality_risk_flags: qualityRiskFlags,
        recommended_intensity: recommendedIntensity,
      };
    }
    return {
      actions: [],
      confidence: 0,
      reasoning_summary: 'empty transcript',
      fallback_used: true,
      needsConfirmation: false,
      message: '没有识别到风格需求',
      source: 'fallback',
      analysis_summary: analysisSummary,
      applied_profile: appliedProfile,
      scene_profile: sceneProfile,
      scene_confidence: imageStats ? 0.58 : 0.4,
      quality_risk_flags: qualityRiskFlags,
      recommended_intensity: recommendedIntensity,
    };
  }

  if (text.includes('重置') || text.includes('还原')) {
    return {
      actions: [{action: 'reset', target: 'style'}],
      confidence: 0.95,
      reasoning_summary: 'fallback reset matched',
      fallback_used: true,
      needsConfirmation: false,
      message: '将重置全部参数',
      source: 'fallback',
      analysis_summary: analysisSummary,
      applied_profile: appliedProfile,
      scene_profile: sceneProfile,
      scene_confidence: imageStats ? 0.58 : 0.4,
      quality_risk_flags: qualityRiskFlags,
      recommended_intensity: recommendedIntensity,
    };
  }

  const style = pickStyle(text) || 'fresh_bright';
  let strength = 1;
  if (text.includes('一点') || text.includes('稍微')) {
    strength = 0.7;
  } else if (text.includes('很') || text.includes('非常') || text.includes('强烈')) {
    strength = 1.25;
  }
  if (text.includes('别太黄') || text.includes('不要太黄')) {
    strength = Math.min(strength, 0.8);
  }

  return {
    actions: [
      {
        action: 'apply_style',
        target: 'style',
        style,
        strength,
      },
    ],
    confidence: 0.62,
    reasoning_summary: 'fallback style requirement matched',
    fallback_used: true,
    needsConfirmation: false,
    message: '已使用风格语义兜底生成建议',
    source: 'fallback',
    analysis_summary: analysisSummary,
    applied_profile: appliedProfile,
    scene_profile: sceneProfile,
    scene_confidence: imageStats ? 0.58 : 0.4,
    quality_risk_flags: qualityRiskFlags,
    recommended_intensity: recommendedIntensity,
  };
};

module.exports = {
  fallbackInterpret,
};
