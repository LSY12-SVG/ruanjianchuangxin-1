const crypto = require('node:crypto');
const {sanitizeToolInput, sanitizeToolOutput} = require('./toolSchemas');

const KNOWN_ERROR_CODES = new Set([
  'invalid_action',
  'forbidden_scope',
  'confirmation_required',
  'timeout',
  'tool_error',
  'client_required',
]);

class McpGatewayError extends Error {
  constructor({code = 'tool_error', message = 'mcp_gateway_error', retryable = false, details} = {}) {
    super(message);
    this.name = 'McpGatewayError';
    this.code = KNOWN_ERROR_CODES.has(code) ? code : 'tool_error';
    this.retryable = Boolean(retryable);
    this.details = details;
  }
}

const asTrimmed = value => (typeof value === 'string' ? value.trim() : '');
const isObject = value => typeof value === 'object' && value !== null;

const normalizeServerConfig = (server, index) => {
  if (!isObject(server)) {
    return null;
  }
  const serverId = asTrimmed(server.serverId || server.id) || `server_${index + 1}`;
  const allowToolsRaw = Array.isArray(server.allowTools)
    ? server.allowTools
    : Array.isArray(server.allowlist)
      ? server.allowlist
      : [];
  const allowTools = new Set(allowToolsRaw.map(asTrimmed).filter(Boolean));
  return {
    ...server,
    serverId,
    allowTools,
    enabled: server.enabled !== false,
  };
};

const normalizeGatewayResult = ({result, serverId, toolName, requestId, latencyMs}) => {
  const statusRaw = String(result?.status || 'applied').trim();
  const status = ['applied', 'failed', 'pending_confirm', 'client_required', 'waiting_async_result'].includes(statusRaw)
    ? statusRaw
    : 'failed';
  const errorCodeRaw = result?.errorCode || result?.code;
  const errorCode = KNOWN_ERROR_CODES.has(errorCodeRaw) ? errorCodeRaw : status === 'failed' ? 'tool_error' : undefined;
  const retryable =
    typeof result?.retryable === 'boolean'
      ? result.retryable
      : errorCode === 'timeout' || errorCode === 'tool_error';
  const output = sanitizeToolOutput({toolName, output: result?.output});
  return {
    status,
    message: asTrimmed(result?.message) || (status === 'applied' ? 'applied' : 'tool_execution_failed'),
    errorCode,
    retryable: Boolean(retryable),
    output,
    serverId,
    toolName,
    requestId,
    latencyMs: Number.isFinite(Number(latencyMs)) ? Number(latencyMs) : 0,
  };
};

const buildHttpInvoker = async ({
  endpoint,
  credential,
  toolName,
  args,
  context,
  requestId,
  timeoutMs,
}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      'content-type': 'application/json',
      'x-mcp-request-id': requestId,
    };
    if (credential) {
      headers.authorization = `Bearer ${credential}`;
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        toolName,
        arguments: args,
        context: {
          userId: context.userId,
          planId: context.planId,
          actionId: context.actionId,
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new McpGatewayError({
        code: payload?.errorCode || 'tool_error',
        message: payload?.message || `external_mcp_http_${response.status}`,
        retryable: response.status >= 500,
      });
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new McpGatewayError({
        code: 'timeout',
        message: 'mcp_tool_timeout',
        retryable: true,
      });
    }
    if (error instanceof McpGatewayError) {
      throw error;
    }
    throw new McpGatewayError({
      code: 'tool_error',
      message: error?.message || 'external_mcp_tool_failed',
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
};

const createMcpGateway = ({
  builtInServers = [],
  externalServers = [],
  externalInvoker = null,
  emergencyDisabled = false,
} = {}) => {
  const serverMap = new Map();
  [...builtInServers, ...externalServers]
    .map((server, index) => normalizeServerConfig(server, index))
    .filter(Boolean)
    .forEach(server => {
      serverMap.set(server.serverId, server);
    });

  const listServerIds = () =>
    Array.from(serverMap.values())
      .filter(server => server.enabled !== false)
      .map(server => server.serverId);

  const hasEnabledExternalServers = () =>
    Array.from(serverMap.values()).some(
      server => typeof server.invokeTool !== 'function' && server.enabled !== false,
    );

  const invokeTool = async ({
    serverId,
    toolName,
    args,
    context = {},
    timeoutMs = 15000,
  }) => {
    if (emergencyDisabled) {
      throw new McpGatewayError({
        code: 'tool_error',
        message: 'mcp_gateway_disabled',
      });
    }

    const normalizedServerId = asTrimmed(serverId);
    const normalizedToolName = asTrimmed(toolName);
    if (!normalizedServerId || !normalizedToolName) {
      throw new McpGatewayError({
        code: 'invalid_action',
        message: 'missing_tool_ref',
      });
    }
    const server = serverMap.get(normalizedServerId);
    if (!server) {
      throw new McpGatewayError({
        code: 'forbidden_scope',
        message: `mcp_server_not_allowlisted:${normalizedServerId}`,
      });
    }
    if (server.enabled === false) {
      throw new McpGatewayError({
        code: 'forbidden_scope',
        message: `mcp_server_disabled:${normalizedServerId}`,
      });
    }
    if (!server.allowTools.has(normalizedToolName)) {
      throw new McpGatewayError({
        code: 'forbidden_scope',
        message: `mcp_tool_not_allowlisted:${normalizedServerId}.${normalizedToolName}`,
      });
    }

    const requestId = `mcp_${crypto.randomBytes(6).toString('hex')}`;
    const startedAt = Date.now();
    const sanitizedArgs = sanitizeToolInput({
      toolName: normalizedToolName,
      args: isObject(args) ? args : {},
    });
    try {
      let rawResult = null;
      if (typeof server.invokeTool === 'function') {
        rawResult = await server.invokeTool({
          serverId: normalizedServerId,
          toolName: normalizedToolName,
          args: sanitizedArgs,
          context,
          timeoutMs,
          requestId,
        });
      } else {
        const credentialEnv = asTrimmed(server.credentialEnv);
        const credential = credentialEnv ? asTrimmed(process.env[credentialEnv]) : '';
        const invoker = typeof externalInvoker === 'function' ? externalInvoker : buildHttpInvoker;
        rawResult = await invoker({
          endpoint: asTrimmed(server.endpoint),
          credential,
          toolName: normalizedToolName,
          args: sanitizedArgs,
          context,
          timeoutMs,
          requestId,
        });
      }
      return normalizeGatewayResult({
        result: rawResult,
        serverId: normalizedServerId,
        toolName: normalizedToolName,
        requestId,
        latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      const failure =
        error instanceof McpGatewayError
          ? error
          : new McpGatewayError({
              code: KNOWN_ERROR_CODES.has(error?.code) ? error.code : 'tool_error',
              message: error?.message || 'mcp_tool_invocation_failed',
              retryable: typeof error?.retryable === 'boolean' ? error.retryable : true,
              details: error?.details,
            });
      return normalizeGatewayResult({
        result: {
          status: failure.code === 'client_required' ? 'client_required' : 'failed',
          message: failure.message,
          errorCode: failure.code,
          retryable: failure.retryable,
        },
        serverId: normalizedServerId,
        toolName: normalizedToolName,
        requestId,
        latencyMs: Date.now() - startedAt,
      });
    }
  };

  return {
    invokeTool,
    listServerIds,
    hasEnabledExternalServers,
  };
};

module.exports = {
  createMcpGateway,
  McpGatewayError,
};
