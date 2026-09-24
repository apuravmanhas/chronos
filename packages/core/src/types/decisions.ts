/**
 * All decision-related types
 */

/** Base decision result from any provider */
export interface BaseDecision<T> {
  value: T;
  /** 0.0 - 1.0 (calibrated) */
  confidence: number;
  /** 'jev' | 'rules' | 'human' | 'local' */
  provider: string;
  latencyMs: number;
  traceId: string;
  /** ISO 8601 */
  timestamp: string;
  /** Shannon entropy of probability distribution */
  entropy: number;
}

/** Boolean probability decision (Jev Noul) */
export interface NoulDecision extends BaseDecision<boolean> {
  type: 'noul';
  /** P(true), 0.0 - 1.0 */
  probability: number;
}

/** Multi-class choice decision (Jev Choice) */
export interface ChoiceDecision<T extends string = string> extends BaseDecision<T> {
  type: 'choice';
  probabilities: Record<T, number>;
}

/** Scalar score decision (Jev Score) */
export interface ScoreDecision extends BaseDecision<number> {
  type: 'score';
  min: number;
  max: number;
  /** 0.0 - 1.0 */
  normalized: number;
  /** per-rubric-level probabilities */
  probabilities: Record<string, number>;
}

/** Union of all decision types */
export type Decision = NoulDecision | ChoiceDecision | ScoreDecision;

/** Result of executing a full policy decision */
export interface PolicyDecisionResult {
  policyName: string;
  policyVersion: string;
  questions: Record<string, Decision>;
  routingOutcome: 'acted' | 'fell_back' | 'escalated';
  providerUsed: string;
  guardsPassed: string[];
  guardsFailed: string[];
  totalLatencyMs: number;
  traceId: string;
  timestamp: string;
}
