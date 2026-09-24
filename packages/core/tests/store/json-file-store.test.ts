import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonFileDecisionStore } from '../../src/store/json-file-store.js';
import type { PolicyDecisionResult, NoulDecision } from '../../src/types/decisions.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

function mockNoul(probability: number): NoulDecision {
  return { type: 'noul', value: probability >= 0.5, probability, confidence: Math.max(probability, 1 - probability), provider: 'test', latencyMs: 10, traceId: 'test', timestamp: new Date().toISOString(), entropy: 0 };
}

function mockResult(overrides?: Partial<PolicyDecisionResult>): PolicyDecisionResult {
  return {
    policyName: 'test-policy',
    policyVersion: '1.0.0',
    questions: { q1: mockNoul(0.9) },
    routingOutcome: 'acted',
    providerUsed: 'test',
    guardsPassed: ['g1'],
    guardsFailed: [],
    totalLatencyMs: 50,
    traceId: 'crn_test_' + Math.random().toString(36).slice(2),
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('JsonFileDecisionStore', () => {
  let store: JsonFileDecisionStore;
  let tempFilePath: string;

  beforeEach(() => {
    tempFilePath = path.join(os.tmpdir(), `crn_test_store_${Math.random().toString(36).slice(2)}.jsonl`);
    store = new JsonFileDecisionStore(tempFilePath);
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  });

  it('Creates file on first append', () => {
    store.append(mockResult(), { some: 'state' });
    expect(fs.existsSync(tempFilePath)).toBe(true);
  });

  it('Reads back records correctly', () => {
    store.append(mockResult({ traceId: 'trace-1' }), { some: 'state' });
    const records = store.query({});
    expect(records).toHaveLength(1);
    expect(records[0].traceId).toBe('trace-1');
  });

  it('Hash chain is valid across multiple appends', () => {
    const r1 = store.append(mockResult(), { s: 1 });
    const r2 = store.append(mockResult(), { s: 2 });
    expect(r2.prevHash).toBe(r1.recordHash);
  });

  it('verifyChainIntegrity() returns valid result for valid chain', () => {
    store.append(mockResult(), {});
    store.append(mockResult(), {});
    const result = store.verifyChainIntegrity();
    expect(result.valid).toBe(true);
    expect(result.totalRecords).toBe(2);
  });

  it('Query filters work', () => {
    store.append(mockResult({ policyName: 'pA', routingOutcome: 'acted' }), {});
    store.append(mockResult({ policyName: 'pB', routingOutcome: 'escalated' }), {});

    const results = store.query({ policyName: 'pB' });
    expect(results).toHaveLength(1);
    expect(results[0].routingOutcome).toBe('escalated');
  });

  it('Stats are correct', () => {
    store.append(mockResult({ routingOutcome: 'acted' }), {});
    store.append(mockResult({ routingOutcome: 'fell_back' }), {});
    const stats = store.stats();
    expect(stats.totalDecisions).toBe(2);
    expect(stats.byRoutingOutcome['acted']).toBe(1);
    expect(stats.byRoutingOutcome['fell_back']).toBe(1);
  });
});
