import { createHash } from 'node:crypto';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import type { DecisionRecord, DecisionStore } from '../types/store.js';
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
  const ordered: Record<string, unknown> = {};
  for (const k of keys) {
    ordered[k] = record[k];
  }
  return JSON.stringify(ordered);
}

/**
 * A durable, append-only decision store using JSON Lines files.
 * 
 * Each decision is written as a single JSON line to a `.jsonl` file.
 * Records are hash-chained for tamper evidence.
 * No native dependencies required.
 */
export class JsonFileDecisionStore implements DecisionStore {
  private filePath: string;
  private lastHash: string;
  private cachedRecords: DecisionRecord[] | null = null;

  constructor(filePath: string) {
    this.filePath = filePath;

    // Load last hash from existing file
    if (existsSync(filePath)) {
      const lines = readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean);
      if (lines.length > 0) {
        const lastRecord = JSON.parse(lines[lines.length - 1]) as DecisionRecord;
        this.lastHash = lastRecord.recordHash;
      } else {
        this.lastHash = '0'.repeat(64);
      }
    } else {
      this.lastHash = '0'.repeat(64);
    }
  }

  append(result: PolicyDecisionResult, state: unknown, options?: { redactState?: boolean }): DecisionRecord {
    try {
      const id = generateId();
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
      const record: DecisionRecord = { ...recordWithoutHash, recordHash };

      appendFileSync(this.filePath, JSON.stringify(record) + '\n', 'utf-8');
      this.lastHash = recordHash;
      this.cachedRecords = null; // invalidate cache

      return record;
    } catch (error) {
      throw new DecisionStoreError(`Failed to append record to file: ${error}`);
    }
  }

  private loadAll(): DecisionRecord[] {
    if (this.cachedRecords) return this.cachedRecords;
    if (!existsSync(this.filePath)) {
      this.cachedRecords = [];
      return this.cachedRecords;
    }
    const content = readFileSync(this.filePath, 'utf-8').trim();
    if (!content) {
      this.cachedRecords = [];
      return this.cachedRecords;
    }
    const lines = content.split('\n').filter(Boolean);
    this.cachedRecords = lines.map((line: string) => JSON.parse(line) as DecisionRecord);
    return this.cachedRecords;
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
    let results = this.loadAll().filter((r) => {
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
    return this.loadAll().find((r) => r.traceId === traceId) || null;
  }

  verifyChainIntegrity(): { valid: boolean; brokenAtId?: string; totalRecords: number } {
    const records = this.loadAll();
    let currentPrev = '0'.repeat(64);
    for (const record of records) {
      if (record.prevHash !== currentPrev) {
        return { valid: false, brokenAtId: record.id, totalRecords: records.length };
      }
      const { recordHash, ...rest } = record;
      const expectedHash = computeHash(record.prevHash + serializeForHash(rest));
      if (expectedHash !== recordHash) {
        return { valid: false, brokenAtId: record.id, totalRecords: records.length };
      }
      currentPrev = recordHash;
    }
    return { valid: true, totalRecords: records.length };
  }

  *replayIterator(filters?: { policyName?: string; fromTimestamp?: string; toTimestamp?: string }): Generator<DecisionRecord> {
    for (const record of this.loadAll()) {
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
    const records = this.loadAll();
    const stats = {
      totalDecisions: records.length,
      byPolicy: {} as Record<string, number>,
      byProvider: {} as Record<string, number>,
      byRoutingOutcome: {} as Record<string, number>,
      avgLatencyMs: 0,
    };
    let totalLatency = 0;
    for (const r of records) {
      stats.byPolicy[r.policyName] = (stats.byPolicy[r.policyName] || 0) + 1;
      stats.byProvider[r.providerUsed] = (stats.byProvider[r.providerUsed] || 0) + 1;
      stats.byRoutingOutcome[r.routingOutcome] = (stats.byRoutingOutcome[r.routingOutcome] || 0) + 1;
      totalLatency += r.latencyMs;
    }
    if (records.length > 0) {
      stats.avgLatencyMs = totalLatency / records.length;
    }
    return stats;
  }

  close(): void {
    this.cachedRecords = null;
  }
}
