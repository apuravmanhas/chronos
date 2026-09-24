import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryDecisionStore } from '../../src/store/memory-store.js';
import type { PolicyDecisionResult, NoulDecision } from '../../src/types/decisions.js';

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

describe('MemoryDecisionStore', () => {
  let store: MemoryDecisionStore;

  beforeEach(() => {
    store = new MemoryDecisionStore();
  });

  it('append() creates a record with generated id starting with crn_', () => {
    const record = store.append(mockResult(), { some: 'state' });
    expect(record.id).toMatch(/^crn_/);
  });

  it('append() creates SHA-256 stateHash', () => {
    const record = store.append(mockResult(), { some: 'state' });
    expect(record.stateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('append() chains hashes (first record prevHash is 0s)', () => {
    const record = store.append(mockResult(), { some: 'state' });
    expect(record.prevHash).toBe('0'.repeat(64));
  });

  it('append() second record prevHash equals first record recordHash', () => {
    const record1 = store.append(mockResult(), { some: 'state' });
    const record2 = store.append(mockResult(), { some: 'state' });
    expect(record2.prevHash).toBe(record1.recordHash);
  });

  it('query() filters by policyName', () => {
    store.append(mockResult({ policyName: 'p1' }), {});
    store.append(mockResult({ policyName: 'p2' }), {});
    const results = store.query({ policyName: 'p1' });
    expect(results).toHaveLength(1);
    expect(results[0].policyName).toBe('p1');
  });

  it('query() filters by routingOutcome', () => {
    store.append(mockResult({ routingOutcome: 'acted' }), {});
    store.append(mockResult({ routingOutcome: 'escalated' }), {});
    const results = store.query({ routingOutcome: 'escalated' });
    expect(results).toHaveLength(1);
    expect(results[0].routingOutcome).toBe('escalated');
  });

  it('query() respects limit and offset', () => {
    store.append(mockResult(), {});
    store.append(mockResult(), {});
    store.append(mockResult(), {});
    const results = store.query({ limit: 2, offset: 1 });
    expect(results).toHaveLength(2);
  });

  it('getByTraceId() returns correct record', () => {
    const r1 = store.append(mockResult({ traceId: 't1' }), {});
    const result = store.getByTraceId('t1');
    expect(result?.id).toBe(r1.id);
  });

  it('getByTraceId() returns null for unknown id', () => {
    const result = store.getByTraceId('unknown');
    expect(result).toBeNull();
  });

  it('verifyChainIntegrity() returns valid for untampered chain', () => {
    store.append(mockResult(), {});
    store.append(mockResult(), {});
    const result = store.verifyChainIntegrity();
    expect(result.valid).toBe(true);
    expect(result.totalRecords).toBe(2);
  });

  it('stats() returns correct counts', () => {
    store.append(mockResult({ routingOutcome: 'acted' }), {});
    store.append(mockResult({ routingOutcome: 'acted' }), {});
    store.append(mockResult({ routingOutcome: 'escalated' }), {});
    const stats = store.stats();
    expect(stats.totalDecisions).toBe(3);
    expect(stats.byRoutingOutcome['acted']).toBe(2);
    expect(stats.byRoutingOutcome['escalated']).toBe(1);
  });

  it('close() clears records', () => {
    store.append(mockResult(), {});
    store.close();
    const stats = store.stats();
    expect(stats.totalDecisions).toBe(0);
  });
});
