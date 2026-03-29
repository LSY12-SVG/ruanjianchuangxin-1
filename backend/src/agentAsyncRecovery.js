const cloneJson = value => JSON.parse(JSON.stringify(value));

const findWaitingAsyncAction = latestExecuteResult => {
  const actionResults = Array.isArray(latestExecuteResult?.actionResults)
    ? latestExecuteResult.actionResults
    : [];
  return actionResults.find(item => item?.status === 'waiting_async_result') || null;
};

const toActionKey = action =>
  `${String(action?.domain || '').trim()}.${String(action?.operation || '').trim()}`;

const normalizeTaskFailure = taskStatus => {
  if (taskStatus === 'expired') {
    return {status: 'failed', errorCode: 'expired', message: 'modeling_task_expired'};
  }
  if (taskStatus === 'not_found') {
    return {status: 'failed', errorCode: 'not_found', message: 'modeling_task_not_found'};
  }
  return {status: 'failed', errorCode: 'tool_error', message: 'modeling_task_failed'};
};

const createAgentAsyncRecoveryRegistry = ({
  getModelingService,
  getModelingConfig,
  rebuildExecutePayload,
} = {}) => {
  const refreshConvertTask = async ({record, latestExecuteResult, waitingResult}) => {
    const modelingService =
      (typeof getModelingService === 'function' ? getModelingService() : null) || null;
    if (!modelingService || typeof modelingService.getTask !== 'function') {
      return {
        result: latestExecuteResult,
        changed: false,
      };
    }

    const pendingTask = latestExecuteResult?.workflowRun?.pendingTask || waitingResult?.output || {};
    const taskId = String(pendingTask.taskId || '').trim();
    if (!taskId) {
      return {
        result: latestExecuteResult,
        changed: false,
      };
    }

    const task = await modelingService.getTask(taskId);
    const publicTask =
      task && typeof modelingService.toPublicTask === 'function'
        ? modelingService.toPublicTask(task)
        : task;

    const taskStatus = task
      ? String(publicTask?.status || task?.status || '').trim() || 'processing'
      : 'not_found';
    const pollAfterMs = Math.max(
      1500,
      Number(publicTask?.pollAfterMs || pendingTask.pollAfterMs || getModelingConfig?.()?.pollAfterMs || 5000),
    );

    let nextActionStatus = 'waiting_async_result';
    let nextErrorCode;
    let nextMessage = 'modeling_task_pending';
    if (taskStatus === 'succeeded') {
      nextActionStatus = 'applied';
      nextMessage = 'modeling_task_completed';
    } else if (taskStatus === 'failed' || taskStatus === 'expired' || taskStatus === 'not_found') {
      const failure = normalizeTaskFailure(taskStatus);
      nextActionStatus = failure.status;
      nextErrorCode = failure.errorCode;
      nextMessage = failure.message;
    }

    const previousOutput = waitingResult?.output || {};
    const changed =
      String(waitingResult?.status || '') !== nextActionStatus ||
      String(previousOutput?.status || '') !== taskStatus ||
      Number(previousOutput?.pollAfterMs || 0) !== pollAfterMs;

    if (!changed) {
      return {
        result: latestExecuteResult,
        changed: false,
      };
    }

    const nextActionResults = (Array.isArray(latestExecuteResult?.actionResults)
      ? latestExecuteResult.actionResults
      : []
    ).map(item => {
      if (String(item?.action?.actionId || '') !== String(waitingResult?.action?.actionId || '')) {
        return item;
      }
      return {
        ...item,
        status: nextActionStatus,
        message:
          nextActionStatus === 'failed'
            ? String(task?.errorMessage || task?.message || nextMessage)
            : nextMessage,
        errorCode: nextActionStatus === 'failed' ? nextErrorCode : undefined,
        output: {
          ...(item.output || {}),
          ...(publicTask && typeof publicTask === 'object' ? publicTask : {}),
          taskId,
          status: taskStatus,
          pollAfterMs,
        },
      };
    });

    const rebuilt = rebuildExecutePayload({
      runId: String(
        record.runId || latestExecuteResult.workflowRun?.runId || latestExecuteResult.executionId,
      ),
      executionId: String(latestExecuteResult.executionId || `resume_${Date.now()}`),
      planId: String(latestExecuteResult.planId || record.planId || ''),
      namespace: String(record.namespace || latestExecuteResult.namespace || 'app.agent'),
      actions: Array.isArray(record.actions) ? cloneJson(record.actions) : [],
      actionResults: nextActionResults,
      toolCalls: latestExecuteResult.toolCalls || [],
      auditId: latestExecuteResult.auditId,
      traceId: latestExecuteResult.traceId,
      pageSummary: latestExecuteResult.pageSummary,
      clientHandledActions: latestExecuteResult.clientHandledActions,
      appliedStrategy: latestExecuteResult.appliedStrategy,
      outcomeRecorded: latestExecuteResult.outcomeRecorded,
    });

    if (rebuilt?.workflowRun) {
      rebuilt.workflowRun.lastWorkerAt = new Date().toISOString();
      rebuilt.workflowRun.nextPollAt =
        nextActionStatus === 'waiting_async_result'
          ? new Date(Date.now() + pollAfterMs).toISOString()
          : null;
    }

    return {
      result: rebuilt,
      changed: true,
      recoveryEvent: {
        type: 'async_refreshed',
        status: String(rebuilt?.workflowRun?.status || rebuilt?.status || '').trim(),
        message:
          nextActionStatus === 'applied'
            ? '后台任务已完成'
            : nextActionStatus === 'failed'
              ? '后台任务执行失败'
              : '后台任务状态已刷新',
        details: {
          runId: String(record.runId || ''),
          actionId: String(waitingResult?.action?.actionId || ''),
          toolName: 'convert.start_task',
          errorCode: nextActionStatus === 'failed' ? nextErrorCode : undefined,
          previousStatus: 'waiting_async_result',
          nextStatus: nextActionStatus,
          pollAfterMs,
        },
      },
    };
  };

  const handlers = {
    'convert.start_task': refreshConvertTask,
  };

  const refreshRecord = async record => {
    const latestExecuteResult = cloneJson(record?.latestExecuteResult || null);
    if (!latestExecuteResult || latestExecuteResult?.workflowRun?.status !== 'waiting_async_result') {
      return {
        result: latestExecuteResult,
        changed: false,
      };
    }
    const waitingResult = findWaitingAsyncAction(latestExecuteResult);
    if (!waitingResult?.action) {
      return {
        result: latestExecuteResult,
        changed: false,
      };
    }
    const handler = handlers[toActionKey(waitingResult.action)];
    if (typeof handler !== 'function') {
      return {
        result: latestExecuteResult,
        changed: false,
        recoveryEvent: {
          type: 'async_recovery_skipped',
          status: String(
            latestExecuteResult?.workflowRun?.status || latestExecuteResult?.status || '',
          ).trim(),
          message: '未注册该动作的异步恢复器',
          details: {
            runId: String(record.runId || ''),
            actionId: String(waitingResult?.action?.actionId || ''),
            toolName: toActionKey(waitingResult.action),
          },
        },
      };
    }
    return handler({record, latestExecuteResult, waitingResult});
  };

  return {
    refreshRecord,
  };
};

module.exports = {
  createAgentAsyncRecoveryRegistry,
};