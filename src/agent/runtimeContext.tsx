import React, {createContext, useCallback, useContext, useMemo, useRef, useState} from 'react';
import {planAgentWithCloud, upsertAgentMemory} from './client';
import {buildLocalAgentPlan} from './localPlanner';
import {AgentMemoryStore} from './memoryStore';
import {requiresConfirmationByPolicy} from './policyGuard';
import {AgentToolRegistry} from './toolRegistry';
import type {
  AgentAction,
  AgentAppTab,
  AgentExecutionResult,
  AgentMemorySnapshot,
  AgentPlanResponse,
  AgentRegisteredOperation,
  AgentRuntimePhase,
} from './types';

interface AgentRuntimeProviderProps {
  children: React.ReactNode;
  currentTab: AgentAppTab;
  endpoint?: string;
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

export const AgentRuntimeProvider: React.FC<AgentRuntimeProviderProps> = ({
  children,
  currentTab,
  endpoint,
}) => {
  const toolRegistryRef = useRef(new AgentToolRegistry());
  const memoryStoreRef = useRef(new AgentMemoryStore());
  const rollbackHandlersRef = useRef<Array<() => Promise<void> | void>>([]);

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
        id: `${Date.now()}`,
        goal,
        tab: currentTab,
        createdAt: new Date().toISOString(),
        plan,
        execution,
      });
      setMemory(snapshot);
      upsertAgentMemory(
        {
          key: 'last_history',
          value: snapshot.history[0],
        },
        endpoint,
      ).catch(() => undefined);
    },
    [currentTab, endpoint],
  );

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

      setPhase('executing');
      setLastError('');

      const appliedActions: AgentAction[] = [];
      const failedActions: Array<{action: AgentAction; reason: string}> = [];
      const nextPending: AgentAction[] = [];

      for (const action of actions) {
        const executable = toolRegistryRef.current.toExecutableAction(action);
        if (requiresConfirmationByPolicy(executable) && !options.allowConfirmActions) {
          nextPending.push(executable);
          continue;
        }

        const result = await toolRegistryRef.current.execute(executable);
        if (result.ok) {
          appliedActions.push(executable);
          if (result.rollback) {
            rollbackHandlersRef.current.push(result.rollback);
          }
        } else {
          failedActions.push({
            action: executable,
            reason: result.message || '执行失败',
          });
        }
      }

      setPendingActions(nextPending);
      const execution: AgentExecutionResult = {
        appliedActions,
        failedActions,
        rollbackAvailable: rollbackHandlersRef.current.length > 0,
      };
      setLatestExecution(execution);
      await commitHistory(options.historyGoal, options.historyPlan, execution);

      if (nextPending.length > 0) {
        setPhase('done');
        setLastMessage(`已自动执行 ${appliedActions.length} 项，${nextPending.length} 项等待确认。`);
      } else if (failedActions.length > 0) {
        setPhase('error');
        setLastError(failedActions[0].reason);
      } else {
        setPhase('done');
        setLastMessage(`执行完成，共应用 ${appliedActions.length} 项操作。`);
      }
    },
    [commitHistory],
  );

  const makePlan = useCallback(
    async (goal: string): Promise<AgentPlanResponse> => {
      const request = {
        intent: {
          goal,
          priority: 'normal' as const,
          context: {
            currentTab,
          },
        },
        currentTab,
        capabilities: toolRegistryRef.current.listCapabilities(),
      };

      const remotePlan = await planAgentWithCloud(request, endpoint);
      return remotePlan || buildLocalAgentPlan(request);
    },
    [currentTab, endpoint],
  );

  const submitGoal = useCallback(
    async (goal?: string) => {
      const finalGoal = (goal ?? goalInput).trim();
      if (!finalGoal) {
        setLastError('请输入任务目标后再执行。');
        return;
      }

      setGoalInput(finalGoal);
      setLastError('');
      setPhase('planning');

      try {
        const plan = await makePlan(finalGoal);
        setLatestPlan(plan);
        setLastReasoning(plan.reasoningSummary);
        await runActions(plan.actions, {
          allowConfirmActions: false,
          historyGoal: finalGoal,
          historyPlan: plan,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '规划失败';
        setLastError(message);
        setPhase('error');
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
    setLatestPlan(last.plan);
    setLastReasoning(`继续任务: ${last.goal}`);
    await runActions(last.plan.actions, {
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
    setLastMessage('已取消待确认动作。');
  }, []);

  const undoLastExecution = useCallback(async () => {
    if (rollbackHandlersRef.current.length === 0) {
      setLastError('当前没有可撤销的自动操作。');
      return;
    }

    const handlers = [...rollbackHandlersRef.current].reverse();
    rollbackHandlersRef.current = [];
    for (const rollback of handlers) {
      await rollback();
    }
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
    if (phase === 'planning') {
      return 'planning' as const;
    }
    if (phase === 'executing') {
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
