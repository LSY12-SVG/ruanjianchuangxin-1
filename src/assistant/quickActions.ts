import type {ModuleCapabilityItem} from '../modules/api';

export type FloatingAssistantTab = 'create' | 'model' | 'agent' | 'community';

export interface AssistantQuickActionDescriptor {
  id: string;
  intentKey: string;
  icon: string;
  label: string;
  subtitle?: string;
  goalTemplate: string;
  requiredCapabilities?: string[];
  fallbackIntentKey?: string;
  riskHint?: 'low' | 'medium' | 'high';
}

interface ResolveQuickActionsInput {
  tab: FloatingAssistantTab;
  capabilities: ModuleCapabilityItem[];
  hasColorContext: boolean;
  hasModelingContext: boolean;
}

const ACTION_CATALOG: Record<string, AssistantQuickActionDescriptor> = {
  optimize_image: {
    id: 'optimize_image',
    intentKey: 'grading.apply_visual_suggest',
    icon: 'sparkles',
    label: '调色建议',
    subtitle: '分析并执行首轮优化动作',
    goalTemplate: '分析当前图片并执行首轮调色建议。',
    requiredCapabilities: ['agent', 'color'],
    fallbackIntentKey: 'app.summarize_current_page',
    riskHint: 'low',
  },
  warm_cinema: {
    id: 'warm_cinema',
    intentKey: 'grading.apply_visual_suggest',
    icon: 'sunny',
    label: '风格调整',
    subtitle: '根据当前内容应用自然风格',
    goalTemplate: '对当前照片做自然风格调整并应用建议动作。',
    requiredCapabilities: ['agent', 'color'],
    fallbackIntentKey: 'app.summarize_current_page',
    riskHint: 'low',
  },
  model_task: {
    id: 'model_task',
    intentKey: 'convert.start_task',
    icon: 'cube',
    label: '发起建模',
    subtitle: '2D 转 3D 任务',
    goalTemplate: '请开始建模任务，把当前图片用于 2D 转 3D 重建。',
    requiredCapabilities: ['agent', 'modeling'],
    fallbackIntentKey: 'app.summarize_current_page',
    riskHint: 'medium',
  },
  community_publish: {
    id: 'community_publish',
    intentKey: 'community.publish_draft',
    icon: 'paper-plane',
    label: '社区发布',
    subtitle: '生成草稿并提交发布',
    goalTemplate: '帮我生成社区草稿并执行发布流程。',
    requiredCapabilities: ['agent', 'community'],
    fallbackIntentKey: 'app.summarize_current_page',
    riskHint: 'high',
  },
  community_draft: {
    id: 'community_draft',
    intentKey: 'community.create_draft',
    icon: 'create',
    label: '生成草稿',
    subtitle: '先整理可发布文案',
    goalTemplate: '根据当前内容生成社区草稿并给我一版标题与正文。',
    requiredCapabilities: ['agent', 'community'],
    fallbackIntentKey: 'app.summarize_current_page',
    riskHint: 'low',
  },
  settings_patch: {
    id: 'settings_patch',
    intentKey: 'settings.apply_patch',
    icon: 'settings',
    label: '智能设置',
    subtitle: '同步建议配置',
    goalTemplate: '根据当前状态优化设置并应用推荐配置。',
    requiredCapabilities: ['agent'],
    fallbackIntentKey: 'app.summarize_current_page',
    riskHint: 'medium',
  },
  summarize_page: {
    id: 'summarize_page',
    intentKey: 'app.summarize_current_page',
    icon: 'compass',
    label: '下一步建议',
    subtitle: '总结当前页并给出动作',
    goalTemplate: '总结当前页面并给出下一步自动操作建议。',
    requiredCapabilities: ['agent'],
    riskHint: 'low',
  },
};

const PRIORITY_BY_TAB: Record<FloatingAssistantTab, string[]> = {
  create: ['optimize_image', 'warm_cinema', 'community_draft', 'model_task', 'summarize_page'],
  model: ['model_task', 'community_draft', 'optimize_image', 'summarize_page', 'settings_patch'],
  agent: ['optimize_image', 'model_task', 'community_publish', 'summarize_page', 'settings_patch'],
  community: ['community_publish', 'community_draft', 'optimize_image', 'summarize_page', 'settings_patch'],
};

const hasModule = (capabilities: ModuleCapabilityItem[], moduleName: string): boolean =>
  capabilities.some(item => item.module === moduleName && item.enabled);

const canRun = (
  descriptor: AssistantQuickActionDescriptor,
  capabilities: ModuleCapabilityItem[],
  flags: Pick<ResolveQuickActionsInput, 'hasColorContext' | 'hasModelingContext'>,
): boolean => {
  const required = descriptor.requiredCapabilities || [];
  if (required.some(name => !hasModule(capabilities, name))) {
    return false;
  }
  if (descriptor.intentKey === 'grading.apply_visual_suggest' && !flags.hasColorContext) {
    return false;
  }
  if (descriptor.intentKey === 'convert.start_task' && !flags.hasModelingContext) {
    return false;
  }
  return true;
};

export const resolveAssistantQuickActions = (
  input: ResolveQuickActionsInput,
): AssistantQuickActionDescriptor[] => {
  const candidates = PRIORITY_BY_TAB[input.tab]
    .map(key => ACTION_CATALOG[key])
    .filter(Boolean);
  const runnable = candidates.filter(item =>
    canRun(item, input.capabilities, {
      hasColorContext: input.hasColorContext,
      hasModelingContext: input.hasModelingContext,
    }),
  );

  if (runnable.length >= 3) {
    return runnable.slice(0, 3);
  }

  const filled = [...runnable];
  for (const item of candidates) {
    if (filled.find(existing => existing.id === item.id)) {
      continue;
    }
    filled.push(item);
    if (filled.length >= 3) {
      break;
    }
  }

  if (filled.length === 0) {
    filled.push(ACTION_CATALOG.summarize_page);
  }
  return filled.slice(0, 3);
};
