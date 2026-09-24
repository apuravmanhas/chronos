import type { Decision, PolicyDecisionResult } from './decisions.js';

/** A stored decision record in the append-only log */
export interface DecisionRecord {
  /** Unique record ID (crn_ prefix + UUID) */
  id: string;
  /** Trace ID linking this record to the decision execution */
  traceId: string;
  /** Name of the policy that was evaluated */
  policyName: string;
  /** Semver version of the policy */
  policyVersion: string;
  /** SHA-256 hash of the input state */
  stateHash: string;
  /** The full input state (null if redacted) */
  state: unknown;
  /** All question decision results */
  questions: Record<string, Decision>;
  /** How the decision was routed */
  routingOutcome: 'acted' | 'fell_back' | 'escalated';
  /** Names of guards that passed */
  guardsPassed: string[];
  /** Names of guards that failed */
  guardsFailed: string[];
  /** Which provider produced the decision */
  providerUsed: string;
  /** Total decision latency in milliseconds */
  latencyMs: number;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Hash of the previous record (tamper-evident chain) */
  prevHash: string;
  /** SHA-256 hash of this record (chain link) */
  recordHash: string;
}

/** Configuration for the decision store */
export interface DecisionStoreConfig {
  /** Store backend type */
  type: 'json-file' | 'memory';
  /** File path for json-file store */
  path?: string;
}

/** Interface for the decision store (append-only log) */
export interface DecisionStore {
  /** Append a decision result to the store */
  append(
    result: PolicyDecisionResult,
    state: unknown,
    options?: { redactState?: boolean },
  ): DecisionRecord;

  /** Query decisions with filters */
  query(filters: {
    policyName?: string;
    policyVersion?: string;
    routingOutcome?: string;
    providerUsed?: string;
    fromTimestamp?: string;
    toTimestamp?: string;
    limit?: number;
    offset?: number;
  }): DecisionRecord[];

  /** Get a single decision by trace ID */
  getByTraceId(traceId: string): DecisionRecord | null;

  /** Verify the integrity of the hash chain */
  verifyChainIntegrity(): {
    valid: boolean;
    brokenAtId?: string;
    totalRecords: number;
  };

  /** Iterate over decisions for replay */
  replayIterator(filters?: {
    policyName?: string;
    fromTimestamp?: string;
    toTimestamp?: string;
  }): Generator<DecisionRecord>;

  /** Get statistics about the store */
  stats(): {
    totalDecisions: number;
    byPolicy: Record<string, number>;
    byProvider: Record<string, number>;
    byRoutingOutcome: Record<string, number>;
    avgLatencyMs: number;
  };

  /** Close the store and release resources */
  close(): void;
}
