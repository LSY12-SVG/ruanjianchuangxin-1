import React, {createContext, useCallback, useContext, useMemo, useRef, useState} from 'react';
import {planAgentWithCloud, upsertAgentMemory} from './client';
import {buildLocalAgentPlan} from './localPlanner';
import {AgentMemoryStore} from './memoryStore';
import {requiresConfirmationByPolicy} from './policyGuard';
import {
  evaluateActionPermission,
  PERMISSION_GATE_SKILL_NAME,
} from './skills/permissionGateSkill';
import {
  chooseRetryAttempts,
  normalizeIntentGoal,
  TASK_PLANNER_SKILL_NAME,
} from './skills/taskPlannerSkill';
import {routeActionsByCapability, TOOL_ROUTER_SKILL_NAME} from './skills/toolRouterSkill';
import {validateActionBySkill} from './skills/skillSpecs';
import {AgentToolRegistry} from './toolRegistry';
import type {
  AgentAction,
  AgentActionExecution,
  AgentActionFailure,
  AgentAppTab,
  AgentErrorCode,
  AgentExecutionResult,
  AgentMemorySnapshot,
  AgentPlanResponse,
  AgentRegisteredOperation,
  AgentRuntimePhase,
} from './types';

const DEFAULT_ACTION_TIMEOUT_MS = 6000;
const AGENT_MEMORY_USER_ID = 'local_debug_user';
const AGENT_MEMORY_NAMESPACE = 'runtime';

const isDevRuntime = (): boolean =>
  (globalThis as {__DEV__?: boolean}).__DEV__ === true;

interface AgentRuntimeProviderProps {
  children: React.ReactNode;
  currentTab: AgentAppTab;
  endpoint?: string;
  contextSnapshot?: () => Record<string, unknown>;
  userId?: string;
  namespace?: string;
  grantedScopes?: string[];
  debugPermissionOverride?: boolean;
}

interface AgentRuntimeContextValue {
  currentTab: AgentAppTab;
  phase: AgentRuntimePhase;
  spriteState: 'idle' | 'planning' | 'executing' | 'confirm';
  panelVisible: boolean;
  goalInput: string;
  lastReasoning: string;
  lastMessage: string;
  lastError: string;
  latestPlan: AgentPlanResponse | null;
  latestExecution: AgentExecutionResult | null;
  pendingActions: AgentAction[];
  memory: AgentMemorySnapshot;
  setGoalInput: (value: string) => void;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  registerOperation: (operation: AgentRegisteredOperation) => () => void;
  submitGoal: (goal?: string) => Promise<void>;
  runQuickOptimizeCurrentPage: () => Promise<void>;
  continueLastTask: () => Promise<void>;
  confirmPendingActions: () => Promise<void>;
  dismissPendingActions: () => void;
  undoLastExecution: () => Promise<void>;
}

interface ActionRunOutcome {
  execution: AgentActionExecution;
  failure?: AgentActionFailure;
  rollback?: (() => Promise<void> | void) | null;
}

const AgentRuntimeContext = createContext<AgentRuntimeContextValue | null>(null);

const quickGoalByTab = (tab: AgentAppTab): string => {
  if (tab === 'home') {
    return '根据首页上下文选择调色或建模模块并执行优化';
  }
  if (tab === 'community') {
    return '生成当前内容的社区发布草稿';
  }
  if (tab === 'profile') {
    return '根据当前配置提供并应用设置优化建议';
  }
  return '总结当前页面并给出下一步自动操作';
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('action_timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const resolveErrorCode = (reason: string): AgentErrorCode => {
  if (reason === 'action_timeout') {
    return 'timeout';
  }
  if (reason.includes('forbidden_scope')) {
    return 'forbidden_scope';
  }
  if (reason.includes('未注册工具能力')) {
    return 'not_registered';
  }
  if (reason.includes('confirm')) {
    return 'confirmation_required';
  }
  return 'tool_error';
};

export const AgentRuntimeProvider: React.FC<AgentRuntimeProviderProps> = ({
  children,
  currentTab,
  endpoint,
  contextSnapshot,
  userId = AGENT_MEMORY_USER_ID,
  namespace = AGENT_MEMORY_NAMESPACE,
  grantedScopes = [],
  debugPermissionOverride = isDevRuntime(),
}) => {
  const toolRegistryRef = useRef(new AgentToolRegistry());
  const memoryStoreRef = useRef(new AgentMemoryStore());
  const rollbackByExecutionRef = useRef<Map<string, Array<() => Promise<void> | void>>>(new Map());
  const latestExecutionIdRef = useRef<string>('');

  const [phase, setPhase] = useState<AgentRuntimePhase>('idle');
  const [panelVisible, setPanelVisible] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [lastReasoning, setLastReasoning] = useState('');
  const [lastMessage, setLastMessage] = useState('');
  const [lastError, setLastError] = useState('');
  const [latestPlan, setLatestPlan] = useState<AgentPlanResponse | null>(null);
  const [latestExecution, setLatestExecution] = useState<AgentExecutionResult | null>(null);
  const [pendingActions, setPendingActions] = useState<AgentAction[]>([]);
  const [memory, setMemory] = useState<AgentMemorySnapshot>(memoryStoreRef.current.snapshot());

  const commitHistory = useCallback(
    async (goal: string, plan: AgentPlanResponse, execution: AgentExecutionResult) => {
      const snapshot = memoryStoreRef.current.appendHistory({
        id: execution.executionId,
        goal,
        tab: currentTab,
        createdAt: execution.endedAt,
        plan,
        execution,
      });
      setMemory(snapshot);
      upsertAgentMemory(
        {
          userId,
          namespace,
          key: 'last_history',
          value: snapshot.history[0],
          ttlSeconds: 7 * 24 * 60 * 60,
        },
        endpoint,
      ).catch(() => undefined);
    },
    [currentTab, endpoint, namespace, userId],
  );

  const runSingleAction = useCallback(async (action: AgentAction): Promise<ActionRunOutcome> => {
    const startedAt = Date.now();
    const timeoutMs = action.timeoutMs && action.timeoutMs > 0 ? action.timeoutMs : DEFAULT_ACTION_TIMEOUT_MS;
    const maxAttempts = chooseRetryAttempts(action);
    let attempts = 0;
    let lastReason = 'unknown_error';
    let lastRetryable = false;

    while (attempts < maxAttempts) {
      attempts += 1;
      try {
        const result = await withTimeout(toolRegistryRef.current.execute(action), timeoutMs);
        if (result.ok) {
          return {
            execution: {
              action,
              status: 'applied',
              message: result.message || 'ok',
              retryable: false,
              attempts,
              durationMs: Date.now() - startedAt,
              skillName: action.skillName || TOOL_ROUTER_SKILL_NAME,
            },
            rollback: result.rollback || null,
          };
        }
        lastReason = result.message || 'tool_execution_failed';
        lastRetryable = Boolean(result.retryable ?? action.idempotent);
        if (!lastRetryable) {
          break;
        }
      } catch (error) {
        lastReason = error instanceof Error ? error.message : 'tool_execution_exception';
        lastRetryable = Boolean(action.idempotent && lastReason === 'action_timeout');
        if (!lastRetryable) {
          break;
        }
      }
    }

    const errorCode = resolveErrorCode(lastReason);
    const failure: AgentActionFailure = {
      action,
      reason: lastReason,
      errorCode,
      retryable: lastRetryable,
    };
    return {
      execution: {
        action,
        status: 'failed',
        message: lastReason,
        errorCode,
        retryable: lastRetryable,
        attempts,
        durationMs: Date.now() - startedAt,
        skillName: action.skillName || TOOL_ROUTER_SKILL_NAME,
      },
      failure,
    };
  }, []);

  const runActions = useCallback(
    async (
      actions: AgentAction[],
      options: {
        allowConfirmActions: boolean;
        historyGoal: string;
        historyPlan: AgentPlanResponse;
      },
    ) => {
      if (actions.length === 0) {
        setLastMessage('没有可执行动作。');
        return;
      }

      setPhase('running');
      setLastError('');

      const startedAt = new Date().toISOString();
      const executionId = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      const {routable, rejected} = routeActionsByCapability({
        actions,
        hasOperation: action => toolRegistryRef.current.has(action),
      });
      const actionResults: AgentActionExecution[] = [];
      const appliedActions: AgentAction[] = [];
      const failedActions: AgentActionFailure[] = [];
      const nextPending: AgentAction[] = [];
      const rollbackHandlers: Array<() => Promise<void> | void> = [];
      let blockedByPolicyCount = 0;

      for (const action of rejected) {
        const candidate = toolRegistryRef.current.toExecutableAction(action);
        const reason = `未注册工具能力: ${candidate.domain}.${candidate.operation}`;
        actionResults.push({
          action: candidate,
          status: 'failed',
          message: reason,
          errorCode: 'not_registered',
          retryable: false,
          attempts: 0,
          durationMs: 0,
          skillName: TOOL_ROUTER_SKILL_NAME,
        });
        failedActions.push({
          action: candidate,
          reason,
          errorCode: 'not_registered',
          retryable: false,
        });
      }

      for (const action of routable) {
        const executable = toolRegistryRef.current.toExecutableAction(action);
        const skillValidation = validateActionBySkill(executable);
        if (!skillValidation.allowed) {
          blockedByPolicyCount += 1;
          actionResults.push({
            action: executable,
            status: 'failed',
            message: skillValidation.reason || 'invalid_skill_policy',
            errorCode: 'invalid_action',
            retryable: false,
            attempts: 0,
            durationMs: 0,
            skillName: executable.skillName || TOOL_ROUTER_SKILL_NAME,
          });
          failedActions.push({
            action: executable,
            reason: skillValidation.reason || 'invalid_skill_policy',
            errorCode: 'invalid_action',
            retryable: false,
          });
          continue;
        }
        const permission = evaluateActionPermission(executable, {
          grantedScopes,
          debugOverride: debugPermissionOverride,
        });
        if (!permission.allowed) {
          const reason = `forbidden_scope: ${permission.missingScopes.join(',')}`;
          if (executable.riskLevel !== 'low' && !options.allowConfirmActions) {
            blockedByPolicyCount += 1;
            nextPending.push(executable);
            actionResults.push({
              action: executable,
              status: 'pending_confirm',
              message: 'confirmation_required',
              errorCode: 'confirmation_required',
              retryable: false,
              attempts: 0,
              durationMs: 0,
              skillName: PERMISSION_GATE_SKILL_NAME,
            });
            continue;
          }
          blockedByPolicyCount += 1;
          actionResults.push({
            action: executable,
            status: 'failed',
            message: reason,
            errorCode: 'forbidden_scope',
            retryable: false,
            attempts: 0,
            durationMs: 0,
            skillName: PERMISSION_GATE_SKILL_NAME,
          });
          failedActions.push({
            action: executable,
            reason,
            errorCode: 'forbidden_scope',
            retryable: false,
          });
          continue;
        }

        if (requiresConfirmationByPolicy(executable) && !options.allowConfirmActions) {
          blockedByPolicyCount += 1;
          nextPending.push(executable);
          actionResults.push({
            action: executable,
            status: 'pending_confirm',
            message: 'confirmation_required',
            errorCode: 'confirmation_required',
            retryable: true,
            attempts: 0,
            durationMs: 0,
            skillName: PERMISSION_GATE_SKILL_NAME,
          });
          continue;
        }

        const outcome = await runSingleAction(executable);
        actionResults.push(outcome.execution);
        if (outcome.execution.status === 'applied') {
          appliedActions.push(executable);
          if (outcome.rollback) {
            rollbackHandlers.push(outcome.rollback);
          }
        }
        if (outcome.failure) {
          failedActions.push(outcome.failure);
        }
      }

      const status: AgentExecutionResult['status'] =
        nextPending.length > 0 ? 'pending_confirm' : failedActions.length > 0 ? 'failed' : 'applied';
      const execution: AgentExecutionResult = {
        executionId,
        planId: options.historyPlan.planId,
        status,
        actionResults,
        appliedActions,
        failedActions,
        pendingActions: nextPending,
        rollbackAvailable: rollbackHandlers.length > 0,
        startedAt,
        endedAt: new Date().toISOString(),
      };
      latestExecutionIdRef.current = executionId;
      if (rollbackHandlers.length > 0) {
        rollbackByExecutionRef.current.set(executionId, rollbackHandlers);
      }

      const scopeCheckedCount = actionResults.filter(
        result => Array.isArray(result.action.requiredScopes) && result.action.requiredScopes.length > 0,
      ).length;
      const scopePassCount = actionResults.filter(
        result =>
          Array.isArray(result.action.requiredScopes) &&
          result.action.requiredScopes.length > 0 &&
          result.errorCode !== 'forbidden_scope',
      ).length;
      console.log(
        '[agent-runtime] metrics',
        JSON.stringify({
          plan_source: options.historyPlan.plannerSource,
          skill_name: TASK_PLANNER_SKILL_NAME,
          scope_check_pass_rate:
            scopeCheckedCount > 0 ? Number((scopePassCount / scopeCheckedCount).toFixed(3)) : 1,
          confirm_rate:
            actionResults.length > 0
              ? Number(
                  (
                    actionResults.filter(result => result.status === 'pending_confirm').length /
                    actionResults.length
                  ).toFixed(3),
                )
              : 0,
          blocked_by_policy_count: blockedByPolicyCount,
          debug_override: debugPermissionOverride,
        }),
      );
      for (const resultItem of actionResults) {
        console.log(
          '[agent-runtime] action',
          JSON.stringify({
            planId: options.historyPlan.planId,
            actionId: resultItem.action.actionId,
            userId,
            namespace,
            scope: resultItem.action.requiredScopes || [],
            result: resultItem.status,
            errorCode: resultItem.errorCode || '',
            latencyMs: resultItem.durationMs,
            skillName: resultItem.skillName || resultItem.action.skillName || TOOL_ROUTER_SKILL_NAME,
          }),
        );
      }

      setLatestExecution(execution);
      setPendingActions(nextPending);
      await commitHistory(options.historyGoal, options.historyPlan, execution);

      if (status === 'pending_confirm') {
        setPhase('pending_confirm');
        setLastMessage(`已自动执行 ${appliedActions.length} 项，${nextPending.length} 项等待确认。`);
        return;
      }
      if (status === 'failed') {
        setPhase('failed');
        setLastError(failedActions[0].reason);
        return;
      }
      setPhase('applied');
      setLastMessage(`执行完成，共应用 ${appliedActions.length} 项操作。`);
    },
    [commitHistory, debugPermissionOverride, grantedScopes, namespace, runSingleAction, userId],
  );

  const makePlan = useCallback(
    async (goal: string): Promise<AgentPlanResponse> => {
      const normalizedGoal = normalizeIntentGoal(goal);
      const pageSnapshot = {
        ...toolRegistryRef.current.collectSnapshots(),
        ...(contextSnapshot ? contextSnapshot() : {}),
      };
      const request = {
        intent: {
          goal: normalizedGoal,
          priority: 'normal' as const,
          context: {
            currentTab,
          },
        },
        currentTab,
        capabilities: toolRegistryRef.current.listCapabilities(),
        pageSnapshot,
        lastExecution: latestExecution
          ? {
              status: latestExecution.status,
              actionResults: latestExecution.actionResults,
              failedActions: latestExecution.failedActions,
            }
          : null,
      };

      const remotePlan = await planAgentWithCloud(request, endpoint);
      if (remotePlan) {
        return remotePlan;
      }
      return buildLocalAgentPlan(request);
    },
    [contextSnapshot, currentTab, endpoint, latestExecution],
  );

  const submitGoal = useCallback(
    async (goal?: string) => {
      const finalGoal = normalizeIntentGoal(goal ?? goalInput);
      if (!finalGoal) {
        setLastError('请输入任务目标后再执行。');
        return;
      }

      setGoalInput(finalGoal);
      setLastError('');

      try {
        const plan = await makePlan(finalGoal);
        setPhase('planned');
        setLatestPlan(plan);
        setLastReasoning(`[${plan.plannerSource}] ${plan.reasoningSummary}`);
        await runActions(plan.actions, {
          allowConfirmActions: false,
          historyGoal: finalGoal,
          historyPlan: plan,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '规划失败';
        setLastError(message);
        setPhase('failed');
      }
    },
    [goalInput, makePlan, runActions],
  );

  const runQuickOptimizeCurrentPage = useCallback(async () => {
    const quickGoal = quickGoalByTab(currentTab);
    await submitGoal(quickGoal);
  }, [currentTab, submitGoal]);

  const continueLastTask = useCallback(async () => {
    const last = memoryStoreRef.current.lastHistory();
    if (!last) {
      setLastError('暂无可继续的历史任务。');
      return;
    }
    const remaining = last.execution.actionResults
      .filter(
        result =>
          result.status === 'pending_confirm' || (result.status === 'failed' && Boolean(result.retryable)),
      )
      .map(result => result.action);

    if (!remaining.length) {
      setLastMessage('最近任务没有可继续动作。');
      return;
    }

    setLatestPlan(last.plan);
    setLastReasoning(`继续任务: ${last.goal}`);
    await runActions(remaining, {
      allowConfirmActions: false,
      historyGoal: `${last.goal}（继续）`,
      historyPlan: last.plan,
    });
  }, [runActions]);

  const confirmPendingActions = useCallback(async () => {
    if (pendingActions.length === 0 || !latestPlan) {
      return;
    }
    await runActions(pendingActions, {
      allowConfirmActions: true,
      historyGoal: goalInput || '已确认动作',
      historyPlan: latestPlan,
    });
  }, [goalInput, latestPlan, pendingActions, runActions]);

  const dismissPendingActions = useCallback(() => {
    setPendingActions([]);
    setPhase('applied');
    setLastMessage('已取消待确认动作。');
  }, []);

  const undoLastExecution = useCallback(async () => {
    const executionId = latestExecutionIdRef.current;
    if (!executionId) {
      setLastError('当前没有可撤销的自动操作。');
      return;
    }
    const handlers = rollbackByExecutionRef.current.get(executionId);
    if (!handlers || handlers.length === 0) {
      setLastError('最近一次执行没有可回滚动作。');
      return;
    }

    rollbackByExecutionRef.current.delete(executionId);
    for (const rollback of [...handlers].reverse()) {
      await rollback();
    }
    setPhase('rolled_back');
    setLastMessage('已撤销最近一次 Agent 自动执行。');
  }, []);

  const registerOperation = useCallback((operation: AgentRegisteredOperation) => {
    const unregister = toolRegistryRef.current.register(operation);
    return () => {
      unregister();
    };
  }, []);

  const spriteState = useMemo(() => {
    if (pendingActions.length > 0) {
      return 'confirm' as const;
    }
    if (phase === 'planned') {
      return 'planning' as const;
    }
    if (phase === 'running') {
      return 'executing' as const;
    }
    return 'idle' as const;
  }, [pendingActions.length, phase]);

  const value = useMemo<AgentRuntimeContextValue>(
    () => ({
      currentTab,
      phase,
      spriteState,
      panelVisible,
      goalInput,
      lastReasoning,
      lastMessage,
      lastError,
      latestPlan,
      latestExecution,
      pendingActions,
      memory,
      setGoalInput,
      openPanel: () => setPanelVisible(true),
      closePanel: () => setPanelVisible(false),
      togglePanel: () => setPanelVisible(visible => !visible),
      registerOperation,
      submitGoal,
      runQuickOptimizeCurrentPage,
      continueLastTask,
      confirmPendingActions,
      dismissPendingActions,
      undoLastExecution,
    }),
    [
      confirmPendingActions,
      continueLastTask,
      currentTab,
      dismissPendingActions,
      goalInput,
      lastError,
      lastMessage,
      lastReasoning,
      latestExecution,
      latestPlan,
      memory,
      panelVisible,
      pendingActions,
      phase,
      registerOperation,
      runQuickOptimizeCurrentPage,
      spriteState,
      submitGoal,
      undoLastExecution,
    ],
  );

  return <AgentRuntimeContext.Provider value={value}>{children}</AgentRuntimeContext.Provider>;
};

export const useAgentRuntime = (): AgentRuntimeContextValue => {
  const context = useContext(AgentRuntimeContext);
  if (!context) {
    throw new Error('useAgentRuntime must be used within AgentRuntimeProvider');
  }
  return context;
};
