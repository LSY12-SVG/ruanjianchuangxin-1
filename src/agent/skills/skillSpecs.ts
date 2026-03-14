import {PERMISSION_GATE_SKILL_NAME} from './permissionGateSkill';
import {TASK_PLANNER_SKILL_NAME} from './taskPlannerSkill';
import {TOOL_ROUTER_SKILL_NAME} from './toolRouterSkill';
import type {AgentAction, AgentRiskLevel} from '../types';

export interface AgentSkillSpec {
  name: string;
  trigger: string;
  operationWhitelist: string[] | '*';
  maxRiskLevel: AgentRiskLevel;
  maxRetryAttempts: number;
}

const riskRank: Record<AgentRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const SKILL_SPECS: Record<string, AgentSkillSpec> = {
  [TASK_PLANNER_SKILL_NAME]: {
    name: TASK_PLANNER_SKILL_NAME,
    trigger: '意图归一化与低风险任务模板',
    operationWhitelist: ['grading.apply_visual_suggest', 'community.create_draft', 'app.summarize_current_page'],
    maxRiskLevel: 'medium',
    maxRetryAttempts: 2,
  },
  [TOOL_ROUTER_SKILL_NAME]: {
    name: TOOL_ROUTER_SKILL_NAME,
    trigger: '能力映射与页面跳转编排',
    operationWhitelist: ['navigation.navigate_tab'],
    maxRiskLevel: 'low',
    maxRetryAttempts: 1,
  },
  [PERMISSION_GATE_SKILL_NAME]: {
    name: PERMISSION_GATE_SKILL_NAME,
    trigger: '中高风险动作权限门禁',
    operationWhitelist: '*',
    maxRiskLevel: 'high',
    maxRetryAttempts: 1,
  },
};

export const getSkillSpec = (skillName: string): AgentSkillSpec | null =>
  SKILL_SPECS[skillName] || null;

export const validateActionBySkill = (
  action: AgentAction,
): {allowed: boolean; reason?: string} => {
  const skillName = action.skillName || TOOL_ROUTER_SKILL_NAME;
  const spec = getSkillSpec(skillName);
  if (!spec) {
    return {
      allowed: false,
      reason: `invalid_skill:${skillName}`,
    };
  }
  if (riskRank[action.riskLevel] > riskRank[spec.maxRiskLevel]) {
    return {
      allowed: false,
      reason: `skill_risk_exceeded:${skillName}`,
    };
  }
  if (spec.operationWhitelist !== '*') {
    const opKey = `${action.domain}.${action.operation}`;
    if (!spec.operationWhitelist.includes(opKey)) {
      return {
        allowed: false,
        reason: `skill_operation_blocked:${skillName}:${opKey}`,
      };
    }
  }
  return {allowed: true};
};
