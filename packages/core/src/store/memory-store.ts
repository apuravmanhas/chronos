import { createHash } from 'node:crypto';
import type { DecisionRecord, DecisionStoreConfig, DecisionStore } from '../types/store.js';
import type { PolicyDecisionResult } from '../types/decisions.js';
import { DecisionStoreError } from '../types/errors.js';

function computeHash(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function generateId(): string {
  return `crn_${crypto.randomUUID()}`;
}

function serializeForHash(record: Omit<DecisionRecord, 'recordHash'>): string {
  const keys = Object.keys(record).sort() as Array<keyof typeof record>;
  const ordered: any = {};
  for (const k of keys) {
    ordered[k] = record[k];
  }
  return JSON.stringify(ordered);
}

export class MemoryDecisionStore implements DecisionStore {
  private records: DecisionRecord[] = [];
  private lastHash: string = '0'.repeat(64);

  constructor() {}

  append(result: PolicyDecisionResult, state: unknown, options?: { redactState?: boolean }): DecisionRecord {
    try {
      const id = generateId();
      const stateStr = options?.redactState ? null : JSON.stringify(state);
      const stateHash = computeHash(JSON.stringify(state));
      const timestamp = new Date().toISOString();
      const prevHash = this.lastHash;

      const recordWithoutHash: Omit<DecisionRecord, 'recordHash'> = {
        id,
        traceId: result.traceId || crypto.randomUUID(),
        policyName: result.policyName,
        policyVersion: result.policyVersion,
        stateHash,
        state: options?.redactState ? null : state,
        questions: result.questions,
        routingOutcome: result.routingOutcome,
        guardsPassed: result.guardsPassed || [],
        guardsFailed: result.guardsFailed || [],
        providerUsed: result.providerUsed,
        latencyMs: result.totalLatencyMs,
        timestamp,
        prevHash,
      };

      const recordHash = computeHash(prevHash + serializeForHash(recordWithoutHash));
      
      const record: DecisionRecord = {
        ...recordWithoutHash,
        recordHash,
      };

      this.records.push(record);
      this.lastHash = recordHash;

      return record;
    } catch (error) {
      throw new DecisionStoreError(`Failed to append memory record: ${error}`);
    }
  }

  query(filters: {
    policyName?: string;
    policyVersion?: string;
    routingOutcome?: string;
    providerUsed?: string;
    fromTimestamp?: string;
    toTimestamp?: string;
    limit?: number;
    offset?: number;
  }): DecisionRecord[] {
    let results = this.records.filter((r) => {
      if (filters.policyName && r.policyName !== filters.policyName) return false;
      if (filters.policyVersion && r.policyVersion !== filters.policyVersion) return false;
      if (filters.routingOutcome && r.routingOutcome !== filters.routingOutcome) return false;
      if (filters.providerUsed && r.providerUsed !== filters.providerUsed) return false;
      if (filters.fromTimestamp && new Date(r.timestamp) < new Date(filters.fromTimestamp)) return false;
      if (filters.toTimestamp && new Date(r.timestamp) > new Date(filters.toTimestamp)) return false;
      return true;
    });

    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (filters.offset !== undefined) {
      results = results.slice(filters.offset);
    }
    if (filters.limit !== undefined) {
      results = results.slice(0, filters.limit);
    }
    return results;
  }

  getByTraceId(traceId: string): DecisionRecord | null {
    return this.records.find((r) => r.traceId === traceId) || null;
  }

  verifyChainIntegrity(): { valid: boolean; brokenAtId?: string; totalRecords: number } {
    let currentPrev = '0'.repeat(64);
    for (const record of this.records) {
      if (record.prevHash !== currentPrev) {
        return { valid: false, brokenAtId: record.id, totalRecords: this.records.length };
      }
      const { recordHash, ...rest } = record;
      const expectedHash = computeHash(record.prevHash + serializeForHash(rest));
      if (expectedHash !== recordHash) {
         return { valid: false, brokenAtId: record.id, totalRecords: this.records.length };
      }
      currentPrev = recordHash;
    }
    return { valid: true, totalRecords: this.records.length };
  }

  *replayIterator(filters?: { policyName?: string; fromTimestamp?: string; toTimestamp?: string }): Generator<DecisionRecord> {
    for (const record of this.records) {
      if (filters?.policyName && record.policyName !== filters.policyName) continue;
      if (filters?.fromTimestamp && new Date(record.timestamp) < new Date(filters.fromTimestamp)) continue;
      if (filters?.toTimestamp && new Date(record.timestamp) > new Date(filters.toTimestamp)) continue;
      yield record;
    }
  }

  stats(): {
    totalDecisions: number;
    byPolicy: Record<string, number>;
    byProvider: Record<string, number>;
    byRoutingOutcome: Record<string, number>;
    avgLatencyMs: number;
  } {
    const stats = {
      totalDecisions: this.records.length,
      byPolicy: {} as Record<string, number>,
      byProvider: {} as Record<string, number>,
      byRoutingOutcome: {} as Record<string, number>,
      avgLatencyMs: 0,
    };
    let totalLatency = 0;

    for (const r of this.records) {
      stats.byPolicy[r.policyName] = (stats.byPolicy[r.policyName] || 0) + 1;
      stats.byProvider[r.providerUsed] = (stats.byProvider[r.providerUsed] || 0) + 1;
      stats.byRoutingOutcome[r.routingOutcome] = (stats.byRoutingOutcome[r.routingOutcome] || 0) + 1;
      totalLatency += r.latencyMs;
    }
    if (this.records.length > 0) {
      stats.avgLatencyMs = totalLatency / this.records.length;
    }
    return stats;
  }

  close(): void {
    this.records = [];
  }
}
