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
    }));
  }

  has(action: AgentAction): boolean {
    return this.operations.has(keyOf(action.domain, action.operation));
  }

  toExecutableAction(action: AgentAction): AgentAction {
    const operation = this.operations.get(keyOf(action.domain, action.operation));
    if (!operation) {
      return action;
    }

    return {
      ...action,
      riskLevel: action.riskLevel || operation.defaultRisk,
      requiresConfirmation:
        typeof action.requiresConfirmation === 'boolean'
          ? action.requiresConfirmation
          : Boolean(operation.defaultRequiresConfirmation),
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
