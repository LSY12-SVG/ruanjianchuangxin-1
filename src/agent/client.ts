import {NativeModules} from 'react-native';
import type {
  AgentAction,
  AgentMemoryUpsertRequest,
  AgentPlanRequest,
  AgentPlanResponse,
  AgentRiskLevel,
} from './types';

const DEFAULT_AGENT_BASE = 'http://127.0.0.1:8787';
const MAX_RETRIES = 0;

const timeoutFetch = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
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
    if (!parsed.hostname) {
      return null;
    }
    return `${parsed.protocol}//${parsed.hostname}:8787`;
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
  const scriptBase = buildBaseFromScriptURL();
  if (scriptBase) {
    set.add(scriptBase);
  }
  set.add(DEFAULT_AGENT_BASE);
  set.add('http://localhost:8787');
  set.add('http://10.0.2.2:8787');
  set.add('http://10.0.3.2:8787');
  return Array.from(set);
};

const asRisk = (value: unknown): AgentRiskLevel =>
  value === 'high' || value === 'medium' ? value : 'low';

const normalizeAction = (value: unknown): AgentAction | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.domain !== 'string' || typeof record.operation !== 'string') {
    return null;
  }

  return {
    id: typeof record.id === 'string' ? record.id : undefined,
    domain: record.domain as AgentAction['domain'],
    operation: record.operation,
    args:
      record.args && typeof record.args === 'object'
        ? (record.args as Record<string, unknown>)
        : undefined,
    riskLevel: asRisk(record.riskLevel),
    requiresConfirmation: Boolean(record.requiresConfirmation),
  };
};

const normalizePlan = (value: unknown): AgentPlanResponse | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const actionsRaw = Array.isArray(record.actions) ? record.actions : [];
  const actions = actionsRaw.map(normalizeAction).filter((item): item is AgentAction => Boolean(item));
  if (actions.length === 0) {
    return null;
  }

  return {
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
  };
};

const postAgentJson = async (
  path: string,
  payload: unknown,
  endpoint?: string,
): Promise<unknown | null> => {
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
          1800,
        );
        if (!response.ok) {
          throw new Error(`HTTP_${response.status}`);
        }
        return await response.json();
      } catch {
        // try next endpoint
      }
    }
  }

  return null;
};

export const planAgentWithCloud = async (
  request: AgentPlanRequest,
  endpoint?: string,
): Promise<AgentPlanResponse | null> => {
  const response = await postAgentJson('/v1/agent/plan', request, endpoint);
  return normalizePlan(response);
};

export const upsertAgentMemory = async (
  request: AgentMemoryUpsertRequest,
  endpoint?: string,
): Promise<void> => {
  await postAgentJson('/v1/agent/memory/upsert', request, endpoint);
};
