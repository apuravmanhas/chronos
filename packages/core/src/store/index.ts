import type { DecisionStoreConfig, DecisionStore } from '../types/store.js';
import { MemoryDecisionStore } from './memory-store.js';
import { JsonFileDecisionStore } from './json-file-store.js';

/**
 * Factory function to create a decision store based on configuration.
 *
 * For MVP, supports 'memory' (in-process) and 'json-file' (append-only JSON Lines file).
 * SQLite support will be added in v1.1 via an optional peer dependency.
 */
export function createStore(config: DecisionStoreConfig): DecisionStore {
  if (config.type === 'json-file') {
    return new JsonFileDecisionStore(config.path || './chronos-decisions.jsonl');
  }
  return new MemoryDecisionStore();
}

export { MemoryDecisionStore, JsonFileDecisionStore };
