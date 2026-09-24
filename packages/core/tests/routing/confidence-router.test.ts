import { describe, it, expect } from 'vitest';
import { ConfidenceRouter } from '../../src/routing/confidence-router.js';
import type { NoulDecision, ChoiceDecision, ScoreDecision, Decision } from '../../src/types/decisions.js';
import type { ConfidenceConfig } from '../../src/types/policy.js';

function mockNoul(probability: number): NoulDecision {
  return { type: 'noul', value: probability >= 0.5, probability, confidence: Math.max(probability, 1 - probability), provider: 'test', latencyMs: 10, traceId: 'test', timestamp: new Date().toISOString(), entropy: 0 };
}
function mockChoice(value: string, confidence: number): ChoiceDecision {
  return { type: 'choice', value, confidence, probabilities: { [value]: confidence } as Record<string, number>, provider: 'test', latencyMs: 10, traceId: 'test', timestamp: new Date().toISOString(), entropy: 0 };
}
function mockScore(value: number, confidence: number): ScoreDecision {
  return { type: 'score', value, min: 0, max: 100, normalized: value / 100, confidence, probabilities: {}, provider: 'test', latencyMs: 10, traceId: 'test', timestamp: new Date().toISOString(), entropy: 0 };
}

describe('ConfidenceRouter', () => {
  const config: ConfidenceConfig = { act_threshold: 0.90, fallback_threshold: 0.70, escalation_threshold: 0.50 };
  const router = new ConfidenceRouter();

  it('route() returns acted when composite confidence >= act_threshold', () => {
    const decisions: Record<string, Decision> = { q1: mockNoul(0.95), q2: mockChoice('val', 0.92) };
    expect(router.route(decisions, config)).toBe('acted');
  });

  it('route() returns fell_back when composite confidence >= fallback_threshold but < act_threshold', () => {
    const decisions: Record<string, Decision> = { q1: mockNoul(0.85), q2: mockChoice('val', 0.75) };
    expect(router.route(decisions, config)).toBe('fell_back');
  });

  it('route() returns escalated when composite confidence < fallback_threshold', () => {
    const decisions: Record<string, Decision> = { q1: mockNoul(0.60), q2: mockChoice('val', 0.40) };
    expect(router.route(decisions, config)).toBe('escalated');
  });

  it('compositeConfidence() returns minimum across all decisions', () => {
    const decisions: Record<string, Decision> = { q1: mockNoul(0.95), q2: mockChoice('val', 0.8), q3: mockScore(50, 0.9) };
    expect(router.compositeConfidence(decisions)).toBe(0.8);
  });

  it('compositeConfidence() returns 0 for empty decisions', () => {
    expect(router.compositeConfidence({})).toBe(0);
  });

  it('effectiveConfidence() for Noul: max(p, 1-p)', () => {
    expect(router.effectiveConfidence(mockNoul(0.95))).toBe(0.95);
    expect(router.effectiveConfidence(mockNoul(0.05))).toBeCloseTo(0.95);
    expect(router.effectiveConfidence(mockNoul(0.5))).toBe(0.5);
  });

  it('Multi-question routing: one high + one low = acted', () => {
    const decisions: Record<string, Decision> = { q1: mockNoul(0.95), q2: mockChoice('val', 0.40) };
    expect(router.route(decisions, config)).toBe('acted');
  });

  it('Edge case: exactly on threshold boundary', () => {
    expect(router.route({ q1: mockChoice('v', 0.90) }, config)).toBe('acted');
    expect(router.route({ q1: mockChoice('v', 0.70) }, config)).toBe('fell_back');
    expect(router.route({ q1: mockChoice('v', 0.50) }, config)).toBe('escalated');
  });
});
