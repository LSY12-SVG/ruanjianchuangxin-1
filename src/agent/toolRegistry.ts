import type {
  AgentAction,
  AgentCapabilityDescriptor,
  AgentRegisteredOperation,
  AgentToolExecutionResult,
} from './types';

interface RegisteredRecord extends AgentRegisteredOperation {}

const keyOf = (domain: string, operation: string): string => `${domain}::${operation}`;

export class AgentToolRegistry {
  private readonly operations = new Map<string, RegisteredRecord>();

  register(operation: AgentRegisteredOperation): () => void {
    const key = keyOf(operation.domain, operation.operation);
    this.operations.set(key, operation);
    return () => {
      const current = this.operations.get(key);
      if (current && current.execute === operation.execute) {
        this.operations.delete(key);
      }
    };
  }

  listCapabilities(): AgentCapabilityDescriptor[] {
    return Array.from(this.operations.values()).map(operation => ({
      domain: operation.domain,
      operation: operation.operation,
      description: operation.description,
      riskLevel: operation.defaultRisk,
      requiresConfirmation: Boolean(operation.defaultRequiresConfirmation),
      idempotent: Boolean(operation.defaultIdempotent),
    }));
  }

  collectSnapshots(): Record<string, Record<string, unknown>> {
    const snapshot: Record<string, Record<string, unknown>> = {};
    for (const operation of this.operations.values()) {
      if (!operation.snapshot) {
        continue;
      }
      const data = operation.snapshot();
      if (!data) {
        continue;
      }
      snapshot[keyOf(operation.domain, operation.operation)] = data;
    }
    return snapshot;
  }

  has(action: AgentAction): boolean {
    return this.operations.has(keyOf(action.domain, action.operation));
  }

  toExecutableAction(action: AgentAction): AgentAction {
    const operation = this.operations.get(keyOf(action.domain, action.operation));
    const actionId = action.actionId || action.id || `${action.domain}.${action.operation}.${Date.now()}`;
    if (!operation) {
      return {
        ...action,
        actionId,
      };
    }

    return {
      ...action,
      actionId,
      riskLevel: action.riskLevel || operation.defaultRisk,
      requiresConfirmation:
        typeof action.requiresConfirmation === 'boolean'
          ? action.requiresConfirmation
          : Boolean(operation.defaultRequiresConfirmation),
      idempotent:
        typeof action.idempotent === 'boolean'
          ? action.idempotent
          : Boolean(operation.defaultIdempotent),
      requiredScopes:
        Array.isArray(action.requiredScopes) && action.requiredScopes.length
          ? action.requiredScopes
          : operation.defaultRequiredScopes || [],
      skillName:
        typeof action.skillName === 'string' && action.skillName
          ? action.skillName
          : operation.defaultSkillName || 'agent-tool-router',
    };
  }

  async execute(action: AgentAction): Promise<AgentToolExecutionResult> {
    const operation = this.operations.get(keyOf(action.domain, action.operation));
    if (!operation) {
      return {
        ok: false,
        message: `未注册工具能力: ${action.domain}.${action.operation}`,
      };
    }
    return operation.execute(action);
  }
}
