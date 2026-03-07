import type {InterpretResponse, VoiceIntentAction, VoiceTarget} from './types';
import {matchStyleFromTranscript} from './styleMapper';

type CoreTarget = Exclude<VoiceTarget, 'style'>;

interface ParseContext {
  lastTarget?: VoiceTarget | null;
}

const RESET_KEYWORDS = ['重置', '恢复默认', '还原', '撤销所有'];

const TARGET_KEYWORDS: Record<CoreTarget, string[]> = {
  exposure: ['曝光', '曝光度', '亮场', '暗场'],
  brightness: ['亮度', '提亮', '压暗', '亮一点', '暗一点', '亮', '暗', '通透'],
  contrast: ['对比度', '对比', '层次', '硬一点', '柔和一点'],
  highlights: ['高光', '亮部', '高亮', '白亮'],
  shadows: ['阴影', '暗部', '提暗部', '压暗部'],
  whites: ['白色色阶', '白场', '白位', '白点'],
  blacks: ['黑色色阶', '黑场', '黑位', '黑点'],
  temperature: ['色温', '偏暖', '偏冷', '暖一点', '冷一点', '偏黄', '偏蓝', '去黄', '黄一点', '太黄', '黄'],
  tint: ['色调', '偏洋红', '偏紫', '偏绿', '去绿'],
  vibrance: ['自然饱和度', '自然饱和', '鲜活', '通透感', '鲜明一点'],
  saturation: ['饱和度', '饱和', '鲜艳', '褪色', '灰一点', '淡一点', '浓一点'],
  redBalance: ['红色通道', '红通道', '红色'],
  greenBalance: ['绿色通道', '绿通道', '绿色'],
  blueBalance: ['蓝色通道', '蓝通道', '蓝色'],
  curve_master: ['主曲线', '整体曲线', '曲线'],
  curve_r: ['红曲线'],
  curve_g: ['绿曲线', '绿色曲线'],
  curve_b: ['蓝曲线', '蓝色曲线'],
  wheel_shadows: ['阴影色轮'],
  wheel_midtones: ['中间调色轮', '中间调色', '中间调'],
  wheel_highlights: ['高光色轮'],
};

const TARGET_LABEL: Record<CoreTarget, string> = {
  exposure: '曝光',
  brightness: '亮度',
  contrast: '对比度',
  highlights: '高光',
  shadows: '阴影',
  whites: '白色色阶',
  blacks: '黑色色阶',
  temperature: '色温',
  tint: '色调',
  vibrance: '自然饱和度',
  saturation: '饱和度',
  redBalance: '红色通道',
  greenBalance: '绿色通道',
  blueBalance: '蓝色通道',
  curve_master: '主曲线',
  curve_r: '红曲线',
  curve_g: '绿曲线',
  curve_b: '蓝曲线',
  wheel_shadows: '阴影色轮',
  wheel_midtones: '中间调色轮',
  wheel_highlights: '高光色轮',
};

const DEFAULT_DELTA: Record<CoreTarget, number> = {
  exposure: 0.2,
  brightness: 12,
  contrast: 12,
  highlights: 12,
  shadows: 12,
  whites: 10,
  blacks: 10,
  temperature: 14,
  tint: 10,
  vibrance: 10,
  saturation: 10,
  redBalance: 8,
  greenBalance: 8,
  blueBalance: 8,
  curve_master: 8,
  curve_r: 8,
  curve_g: 8,
  curve_b: 8,
  wheel_shadows: 8,
  wheel_midtones: 8,
  wheel_highlights: 8,
};

const CHINESE_NUM_MAP: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const containsAny = (text: string, keywords: string[]): boolean =>
  keywords.some(keyword => text.includes(keyword));

const splitSegments = (text: string): string[] =>
  text
    .replace(/[，。！？!?,；;]/g, '|')
    .replace(/然后|并且|同时|再来|再|而且/g, '|')
    .split('|')
    .map(segment => segment.trim())
    .filter(Boolean);

const parseChineseNumber = (token: string): number | null => {
  if (!token) {
    return null;
  }

  if (token === '一百') {
    return 100;
  }

  if (token.includes('百')) {
    const [left, right] = token.split('百');
    const hundreds = CHINESE_NUM_MAP[left] ?? 1;
    const suffix = parseChineseNumber(right || '');
    return hundreds * 100 + (suffix ?? 0);
  }

  if (token.includes('十')) {
    const [left, right] = token.split('十');
    const tens = left ? CHINESE_NUM_MAP[left] ?? 0 : 1;
    const ones = right ? CHINESE_NUM_MAP[right] ?? 0 : 0;
    return tens * 10 + ones;
  }

  if (token.length === 1 && token in CHINESE_NUM_MAP) {
    return CHINESE_NUM_MAP[token];
  }

  return null;
};

const parseNumber = (text: string): number | null => {
  const numericMatch = text.match(/[-+]?\d+(\.\d+)?/);
  if (numericMatch) {
    const value = Number(numericMatch[0]);
    return Number.isFinite(value) ? value : null;
  }

  const chineseMatch = text.match(/(负|正)?[零一二两三四五六七八九十百]+/);
  if (!chineseMatch) {
    return null;
  }

  const raw = chineseMatch[0];
  const sign = raw.startsWith('负') ? -1 : 1;
  const token = raw.replace(/^负|^正/, '');
  const chineseValue = parseChineseNumber(token);
  if (chineseValue === null) {
    return null;
  }

  return sign * chineseValue;
};

const detectTarget = (text: string): CoreTarget | null => {
  let bestTarget: CoreTarget | null = null;
  let bestScore = 0;

  (Object.keys(TARGET_KEYWORDS) as CoreTarget[]).forEach(target => {
    const score = TARGET_KEYWORDS[target].reduce((acc, keyword) => {
      return acc + (text.includes(keyword) ? keyword.length : 0);
    }, 0);

    if (score > 0 && score > bestScore) {
      bestTarget = target;
      bestScore = score;
    }
  });

  return bestTarget;
};

const detectDirection = (text: string, target: CoreTarget): 1 | -1 | 0 => {
  const upWords = ['增加', '加', '提高', '增强', '更高', '更强', '多一点', '提一点', '升一点'];
  const downWords = ['降低', '减', '减少', '压低', '更低', '少一点', '降一点'];

  if (target === 'exposure') {
    if (containsAny(text, ['提亮', '亮一点', '更亮', '曝光加'])) {
      return 1;
    }
    if (containsAny(text, ['压暗', '暗一点', '更暗', '曝光减'])) {
      return -1;
    }
  }

  if (target === 'brightness') {
    if (containsAny(text, ['提亮', '亮一点', '更亮', '通透'])) {
      return 1;
    }
    if (containsAny(text, ['压暗', '暗一点', '更暗'])) {
      return -1;
    }
  }

  if (target === 'temperature') {
    if (containsAny(text, ['暖', '偏黄', '黄一点'])) {
      return 1;
    }
    if (containsAny(text, ['冷', '偏蓝', '去黄', '不要太黄', '别太黄'])) {
      return -1;
    }
  }

  if (target === 'tint') {
    if (containsAny(text, ['偏洋红', '偏紫'])) {
      return 1;
    }
    if (containsAny(text, ['偏绿', '去绿'])) {
      return -1;
    }
  }

  if (target === 'saturation') {
    if (containsAny(text, ['鲜艳', '更艳', '更饱和'])) {
      return 1;
    }
    if (containsAny(text, ['灰一点', '褪色', '淡一点', '低饱和'])) {
      return -1;
    }
  }

  if (target === 'vibrance') {
    if (containsAny(text, ['更鲜活', '更通透', '鲜明', '自然饱和加'])) {
      return 1;
    }
    if (containsAny(text, ['自然一点', '别太艳', '自然饱和减'])) {
      return -1;
    }
  }

  if (target === 'highlights') {
    if (containsAny(text, ['高光提一点', '亮部提一点', '亮部增强'])) {
      return 1;
    }
    if (containsAny(text, ['压高光', '高光减', '亮部压低'])) {
      return -1;
    }
  }

  if (target === 'shadows') {
    if (containsAny(text, ['提阴影', '暗部提亮', '阴影加'])) {
      return 1;
    }
    if (containsAny(text, ['压阴影', '暗部更暗', '阴影减'])) {
      return -1;
    }
  }

  if (target === 'whites') {
    if (containsAny(text, ['白场提', '白位提', '白点提'])) {
      return 1;
    }
    if (containsAny(text, ['白场压', '白位降', '白点降'])) {
      return -1;
    }
  }

  if (target === 'blacks') {
    if (containsAny(text, ['黑场抬', '黑位抬', '黑点抬'])) {
      return 1;
    }
    if (containsAny(text, ['黑场压', '黑位压', '黑点压'])) {
      return -1;
    }
  }

  if (
    target === 'redBalance' ||
    target === 'greenBalance' ||
    target === 'blueBalance' ||
    target === 'curve_master' ||
    target === 'curve_r' ||
    target === 'curve_g' ||
    target === 'curve_b' ||
    target === 'wheel_shadows' ||
    target === 'wheel_midtones' ||
    target === 'wheel_highlights'
  ) {
    if (containsAny(text, ['偏多', '多一点', '加一点', '增强'])) {
      return 1;
    }
    if (containsAny(text, ['偏少', '少一点', '减一点', '降低'])) {
      return -1;
    }
  }

  const hasUp = containsAny(text, upWords);
  const hasDown = containsAny(text, downWords);

  if (hasUp && !hasDown) {
    return 1;
  }
  if (hasDown && !hasUp) {
    return -1;
  }

  return 0;
};

const isSetCommand = (text: string): boolean =>
  containsAny(text, ['调到', '设为', '设成', '改成', '固定在', '保持在', '等于', '拉到', '设置']);

const detectStyleStrength = (text: string): number => {
  if (containsAny(text, ['非常', '很', '强烈', '明显'])) {
    return 1.3;
  }
  if (containsAny(text, ['一点', '稍微', '轻微'])) {
    return 0.65;
  }
  return 1;
};

const parseSegment = (segment: string): VoiceIntentAction[] => {
  if (!segment) {
    return [];
  }

  if (RESET_KEYWORDS.some(keyword => segment.includes(keyword))) {
    return [{action: 'reset', target: 'style'}];
  }

  const actions: VoiceIntentAction[] = [];
  const style = matchStyleFromTranscript(segment);
  if (style) {
    actions.push({
      action: 'apply_style',
      target: 'style',
      style,
      strength: detectStyleStrength(segment),
    });
  }

  const target = detectTarget(segment);
  if (!target) {
    return actions;
  }

  const rawNumber = parseNumber(segment);
  const setCommand = isSetCommand(segment);
  const direction = detectDirection(segment, target);

  if (setCommand && rawNumber !== null) {
    actions.push({
      action: 'set_param',
      target,
      value: rawNumber,
    });
    return actions;
  }

  if (rawNumber !== null) {
    if (rawNumber < 0) {
      actions.push({
        action: 'adjust_param',
        target,
        delta: rawNumber,
      });
      return actions;
    }

    const sign = direction === -1 ? -1 : 1;
    actions.push({
      action: 'adjust_param',
      target,
      delta: Math.abs(rawNumber) * sign,
    });
    return actions;
  }

  if (direction !== 0) {
    actions.push({
      action: 'adjust_param',
      target,
      delta: DEFAULT_DELTA[target] * direction,
    });
  }

  return actions;
};

const isFollowUpSegment = (segment: string): boolean =>
  containsAny(segment, ['再来', '继续', '再', '还是', '一点', '再加', '再减']);

const parseFollowUp = (
  segment: string,
  context?: ParseContext,
): VoiceIntentAction[] => {
  const fallbackTarget = context?.lastTarget;
  if (!fallbackTarget || fallbackTarget === 'style') {
    return [];
  }

  const coreTarget = fallbackTarget as CoreTarget;
  if (!isFollowUpSegment(segment)) {
    return [];
  }

  const rawNumber = parseNumber(segment);
  const direction = detectDirection(segment, coreTarget);

  if (rawNumber !== null) {
    if (rawNumber < 0) {
      return [
        {
          action: 'adjust_param',
          target: coreTarget,
          delta: rawNumber,
        },
      ];
    }

    const sign = direction === -1 ? -1 : 1;
    return [
      {
        action: 'adjust_param',
        target: coreTarget,
        delta: Math.abs(rawNumber) * sign,
      },
    ];
  }

  if (direction !== 0) {
    return [
      {
        action: 'adjust_param',
        target: coreTarget,
        delta: DEFAULT_DELTA[coreTarget] * direction,
      },
    ];
  }

  return [
    {
      action: 'adjust_param',
      target: coreTarget,
      delta: DEFAULT_DELTA[coreTarget] * 0.5,
    },
  ];
};

const dedupeActions = (actions: VoiceIntentAction[]): VoiceIntentAction[] => {
  if (actions.some(action => action.action === 'reset')) {
    return [{action: 'reset', target: 'style'}];
  }

  const merged: VoiceIntentAction[] = [];

  actions.forEach(action => {
    if (action.action === 'apply_style') {
      merged.push(action);
      return;
    }

    const existingIndex = merged.findIndex(
      item => item.target === action.target && item.action !== 'apply_style',
    );

    if (existingIndex >= 0) {
      merged[existingIndex] = action;
    } else {
      merged.push(action);
    }
  });

  return merged;
};

const summarizeActions = (actions: VoiceIntentAction[]): string =>
  actions
    .map(action => {
      if (action.action === 'reset') {
        return '重置参数';
      }

      if (action.action === 'apply_style') {
        return `风格(${action.style})`;
      }

      if (action.target in TARGET_LABEL) {
        const targetLabel = TARGET_LABEL[action.target as CoreTarget];
        if (action.action === 'set_param') {
          return `${targetLabel}设为${action.value}`;
        }
        return `${targetLabel}${(action.delta || 0) > 0 ? '+' : ''}${action.delta}`;
      }

      return action.action;
    })
    .join(' | ');

export const parseLocalVoiceCommand = (
  transcript: string,
  context?: ParseContext,
): InterpretResponse => {
  const normalized = transcript.trim().toLowerCase();

  if (!normalized) {
    return {
      actions: [],
      confidence: 0,
      needsConfirmation: true,
      fallbackUsed: true,
      reasoningSummary: '未识别到有效语音文本',
      message: '没有识别到可执行指令，请再说一次。',
      source: 'fallback',
    };
  }

  const segments = splitSegments(normalized);
  const parsedActions = segments.flatMap(segment => {
    const direct = parseSegment(segment);
    if (direct.length > 0) {
      return direct;
    }
    return parseFollowUp(segment, context);
  });
  const actions = dedupeActions(parsedActions);

  if (actions.length === 0) {
    return {
      actions: [],
      confidence: 0.3,
      needsConfirmation: true,
      fallbackUsed: true,
      reasoningSummary: '本地未命中',
      message:
        '未识别到明确调色命令。你可以说：亮度加10、色温冷一点、饱和度减5。',
      source: 'fallback',
    };
  }

  const hasParamAction = actions.some(
    action => action.action === 'set_param' || action.action === 'adjust_param' || action.action === 'reset',
  );

  return {
    actions,
    confidence: hasParamAction ? 0.9 : 0.68,
    needsConfirmation: true,
    fallbackUsed: !hasParamAction,
    reasoningSummary: hasParamAction ? '本地命中参数指令' : '本地命中风格语义',
    message: `已识别: ${summarizeActions(actions)}`,
    source: hasParamAction ? 'local' : 'fallback',
  };
};
