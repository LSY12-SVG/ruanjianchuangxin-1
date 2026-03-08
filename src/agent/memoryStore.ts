import type {AgentHistoryEntry, AgentMemorySnapshot} from './types';

const MAX_HISTORY = 30;

export class AgentMemoryStore {
  private readonly preferences: Record<string, string | number | boolean> = {};
  private history: AgentHistoryEntry[] = [];

  upsertPreference(key: string, value: string | number | boolean): AgentMemorySnapshot {
    this.preferences[key] = value;
    return this.snapshot();
  }

  appendHistory(entry: AgentHistoryEntry): AgentMemorySnapshot {
    this.history = [entry, ...this.history].slice(0, MAX_HISTORY);
    return this.snapshot();
  }

  lastHistory(): AgentHistoryEntry | null {
    return this.history[0] || null;
  }

  snapshot(): AgentMemorySnapshot {
    return {
      preferences: {...this.preferences},
      history: [...this.history],
    };
  }
}
