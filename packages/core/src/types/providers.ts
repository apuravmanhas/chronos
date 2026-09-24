import { QuestionDefinition } from './policy';
import { Decision } from './decisions';

/** Raw result from a provider before policy routing */
export interface RawDecisionResult {
  questions: Record<string, Decision>;
  provider: string;
  latencyMs: number;
  timestamp: string;
}

/** Interface for all decision providers (e.g. Jev, rules) */
export interface DecisionProvider {
  name: string;
  /** Executes a decision */
  decide(state: unknown, questions: Record<string, QuestionDefinition>): Promise<RawDecisionResult>;
  /** Returns true if provider is healthy */
  healthCheck(): Promise<boolean>;
  /** Returns an estimated cost in cents */
  estimateCost(stateTokens: number): number;
  /** Returns estimated latency in milliseconds */
  estimateLatencyMs(): number;
}
