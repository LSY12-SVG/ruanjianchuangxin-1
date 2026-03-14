import React, {useEffect} from 'react';
import {act, create} from 'react-test-renderer';
import {AgentRuntimeProvider, useAgentRuntime} from '../../src/agent/runtimeContext';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const RuntimeProbe: React.FC<{onReady: (runtime: ReturnType<typeof useAgentRuntime>) => void}> = ({
  onReady,
}) => {
  const runtime = useAgentRuntime();
  useEffect(() => {
    onReady(runtime);
  }, [onReady, runtime]);
  return null;
};

const OperationRegistrar: React.FC<{withConvert?: boolean; withScopedCommunity?: boolean}> = ({
  withConvert = false,
  withScopedCommunity = false,
}) => {
  const {registerOperation} = useAgentRuntime();
  useEffect(() => {
    const unregisterList: Array<() => void> = [];
    unregisterList.push(
      registerOperation({
        domain: 'navigation',
        operation: 'navigate_tab',
        description: 'nav',
        defaultRisk: 'low',
        defaultIdempotent: true,
        execute: async () => ({ok: true, message: 'nav', rollback: () => undefined}),
      }),
    );
    unregisterList.push(
      registerOperation({
        domain: 'app',
        operation: 'summarize_current_page',
        description: 'summary',
        defaultRisk: 'low',
        defaultIdempotent: true,
        execute: async () => ({ok: true, message: 'summary'}),
      }),
    );
    if (withConvert) {
      unregisterList.push(
        registerOperation({
          domain: 'convert',
          operation: 'start_task',
          description: 'convert',
          defaultRisk: 'medium',
          defaultRequiresConfirmation: true,
          execute: async () => ({ok: true, message: 'convert'}),
        }),
      );
    }
    if (withScopedCommunity) {
      unregisterList.push(
        registerOperation({
          domain: 'community',
          operation: 'create_draft',
          description: 'community',
          defaultRisk: 'low',
          defaultRequiredScopes: ['community:write'],
          execute: async () => ({ok: true, message: 'community'}),
        }),
      );
    }
    return () => unregisterList.forEach(unregister => unregister());
  }, [registerOperation, withConvert, withScopedCommunity]);
  return null;
};

describe('agent runtime context', () => {
  test('runs local plan and supports rollback by execution scope', async () => {
    let runtime: ReturnType<typeof useAgentRuntime> | null = null;
    await act(async () => {
      create(
        <AgentRuntimeProvider currentTab="home" endpoint="http://127.0.0.1:9">
          <OperationRegistrar />
          <RuntimeProbe onReady={value => (runtime = value)} />
        </AgentRuntimeProvider>,
      );
      await flush();
    });
    expect(runtime).not.toBeNull();

    await act(async () => {
      await runtime?.submitGoal('总结当前页面');
      await flush();
    });

    expect(runtime?.phase).toBe('applied');
    expect(runtime?.latestExecution?.status).toBe('applied');
    expect(runtime?.latestExecution?.appliedActions.length).toBeGreaterThan(0);

    await act(async () => {
      await runtime?.undoLastExecution();
      await flush();
    });
    expect(runtime?.phase).toBe('rolled_back');
  });

  test('continue task does not replay applied actions', async () => {
    let runtime: ReturnType<typeof useAgentRuntime> | null = null;
    await act(async () => {
      create(
        <AgentRuntimeProvider currentTab="home" endpoint="http://127.0.0.1:9">
          <OperationRegistrar withConvert />
          <RuntimeProbe onReady={value => (runtime = value)} />
        </AgentRuntimeProvider>,
      );
      await flush();
    });
    expect(runtime).not.toBeNull();

    await act(async () => {
      await runtime?.submitGoal('请启动建模任务');
      await flush();
    });
    expect(runtime?.phase).toBe('pending_confirm');
    expect(runtime?.pendingActions.length).toBe(1);

    await act(async () => {
      await runtime?.continueLastTask();
      await flush();
    });

    expect(runtime?.latestExecution?.appliedActions.length).toBe(0);
    expect(runtime?.phase).toBe('pending_confirm');
  });

  test('blocks action when scope precheck fails', async () => {
    let runtime: ReturnType<typeof useAgentRuntime> | null = null;
    await act(async () => {
      create(
        <AgentRuntimeProvider
          currentTab="community"
          endpoint="http://127.0.0.1:9"
          grantedScopes={[]}
          debugPermissionOverride={false}>
          <OperationRegistrar withScopedCommunity />
          <RuntimeProbe onReady={value => (runtime = value)} />
        </AgentRuntimeProvider>,
      );
      await flush();
    });

    await act(async () => {
      await runtime?.submitGoal('帮我发布社区帖子');
      await flush();
    });

    expect(runtime?.phase).toBe('failed');
    expect(runtime?.latestExecution?.failedActions[0]?.errorCode).toBe('forbidden_scope');
  });
});
