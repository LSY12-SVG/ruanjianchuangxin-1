import {NativeModules} from 'react-native';
import type {
  AgentAction,
  AgentExecuteRequest,
  AgentExecuteResponse,
  AgentMemoryQueryRequest,
  AgentMemoryQueryResponse,
  AgentMemoryUpsertRequest,
  AgentPlanRequest,
  AgentPlanResponse,
  AgentPlannerSource,
  AgentRiskLevel,
} from './types';

const DEFAULT_AGENT_BASE = 'http://127.0.0.1:8787';
const MAX_RETRIES = 1;

const isIpv4Host = (hostname: string): boolean => /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);

const isUsableDevHost = (hostname: string): boolean => {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '10.0.2.2' ||
    normalized === '10.0.3.2'
  ) {
    return true;
  }
  if (isIpv4Host(normalized)) {
    return true;
  }
  return normalized.includes('.');
};

const timeoutFetch = async (url: string, init: RequestInit, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const buildBaseFromScriptURL = (): string | null => {
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  if (typeof scriptURL !== 'string' || scriptURL.length === 0) {
    return null;
  }
  try {
    const parsed = new URL(scriptURL);
    const hostname = parsed.hostname || '';
    if (!isUsableDevHost(hostname)) {
      return null;
    }
    return `${parsed.protocol}//${hostname}:8787`;
  } catch {
    return null;
  }
};

const resolveBases = (override?: string): string[] => {
  if (override && override.trim()) {
    const trimmed = override.trim();
    if (trimmed.includes('/v1/agent/')) {
      return [trimmed.split('/v1/agent/')[0]];
    }
    return [trimmed.replace(/\/$/, '')];
  }
  const set = new Set<string>();
  set.add(DEFAULT_AGENT_BASE);
  set.add('http://localhost:8787');
  set.add('http://10.0.2.2:8787');
  set.add('http://10.0.3.2:8787');
  const scriptBase = buildBaseFromScriptURL();
  if (scriptBase) {
    set.add(scriptBase);
  }
  return Array.from(set);
};

const asRisk = (value: unknown): AgentRiskLevel => (value === 'high' || value === 'medium' ? value : 'low');

const asPlannerSource = (value: unknown): AgentPlannerSource => (value === 'local' ? 'local' : 'cloud');

const normalizeAction = (value: unknown, index: number, planId: string): AgentAction | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.domain !== 'string' || typeof record.operation !== 'string') {
    return null;
  }

  const actionIdCandidate =
    typeof record.actionId === 'string'
      ? record.actionId
      : typeof record.action_id === 'string'
        ? record.action_id
        : typeof record.id === 'string'
          ? record.id
          : `${planId}_${index + 1}`;

  return {
    actionId: actionIdCandidate,
    id: typeof record.id === 'string' ? record.id : actionIdCandidate,
    domain: record.domain as AgentAction['domain'],
    operation: record.operation,
    args: record.args && typeof record.args === 'object' ? (record.args as Record<string, unknown>) : undefined,
    riskLevel: asRisk(record.riskLevel ?? record.risk_level),
    requiresConfirmation: Boolean(record.requiresConfirmation ?? record.requires_confirmation),
    idempotent: Boolean(record.idempotent),
    requiredScopes: Array.isArray(record.requiredScopes)
      ? record.requiredScopes.filter((item): item is string => typeof item === 'string')
      : Array.isArray(record.required_scopes)
        ? record.required_scopes.filter((item): item is string => typeof item === 'string')
        : [],
    skillName:
      typeof record.skillName === 'string'
        ? record.skillName
        : typeof record.skill_name === 'string'
          ? record.skill_name
          : undefined,
    timeoutMs:
      typeof record.timeoutMs === 'number'
        ? record.timeoutMs
        : typeof record.timeout_ms === 'number'
          ? record.timeout_ms
          : undefined,
  };
};

const normalizePlan = (value: unknown): AgentPlanResponse | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const planId =
    typeof record.planId === 'string'
      ? record.planId
      : typeof record.plan_id === 'string'
        ? record.plan_id
        : `cloud_${Date.now()}`;
  const actionsRaw = Array.isArray(record.actions) ? record.actions : [];
  const actions = actionsRaw
    .map((item, index) => normalizeAction(item, index, planId))
    .filter((item): item is AgentAction => Boolean(item));
  if (actions.length === 0) {
    return null;
  }

  return {
    planId,
    actions,
    reasoningSummary:
      typeof record.reasoningSummary === 'string'
        ? record.reasoningSummary
        : typeof record.reasoning_summary === 'string'
          ? record.reasoning_summary
          : 'Agent plan generated.',
    estimatedSteps:
      typeof record.estimatedSteps === 'number'
        ? record.estimatedSteps
        : typeof record.estimated_steps === 'number'
          ? record.estimated_steps
          : actions.length,
    undoPlan: Array.isArray(record.undoPlan)
      ? record.undoPlan.filter((item): item is string => typeof item === 'string')
      : Array.isArray(record.undo_plan)
        ? record.undo_plan.filter((item): item is string => typeof item === 'string')
        : [],
    plannerSource: asPlannerSource(record.plannerSource ?? record.planner_source),
  };
};

const postAgentJson = async <T>(path: string, payload: unknown, endpoint?: string): Promise<T | null> => {
  const bases = resolveBases(endpoint);
  for (const base of bases) {
    let attempt = 0;
    while (attempt <= MAX_RETRIES) {
      attempt += 1;
      try {
        const response = await timeoutFetch(
          `${base}${path}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          },
          2400,
        );
        if (!response.ok) {
          throw new Error(`HTTP_${response.status}`);
        }
        return (await response.json()) as T;
      } catch {
        // try next endpoint
      }
    }
  }
  return null;
};

export const planAgentWithCloud = async (request: AgentPlanRequest, endpoint?: string): Promise<AgentPlanResponse | null> => {
  const response = await postAgentJson<unknown>('/v1/agent/plan', request, endpoint);
  return normalizePlan(response);
};

export const executeAgentWithCloud = async (
  request: AgentExecuteRequest,
  endpoint?: string,
): Promise<AgentExecuteResponse | null> => {
  return postAgentJson<AgentExecuteResponse>('/v1/agent/execute', request, endpoint);
};

export const upsertAgentMemory = async (request: AgentMemoryUpsertRequest, endpoint?: string): Promise<void> => {
  await postAgentJson('/v1/agent/memory/upsert', request, endpoint);
};

export const queryAgentMemory = async (
  request: AgentMemoryQueryRequest,
  endpoint?: string,
): Promise<AgentMemoryQueryResponse | null> => {
  return postAgentJson<AgentMemoryQueryResponse>('/v1/agent/memory/query', request, endpoint);
};
