import { describe, it, expect } from 'vitest';
import { GuardEvaluator } from '../../src/guards/evaluator.js';
import { GuardFailedError } from '../../src/types/errors.js';

describe('GuardEvaluator', () => {
  const evaluator = new GuardEvaluator();

  it('Pre-guard passes when expression evaluates to true', () => {
    const guards = [{ name: 'test', rule: 'state != null' }];
    const results = evaluator.evaluatePreGuards(guards, { state: {} });
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });

  it('Pre-guard fails and throws GuardFailedError when expression is false', () => {
    const guards = [{ name: 'test', rule: 'state.user_id != null' }];
    expect(() => evaluator.evaluatePreGuards(guards, { state: {} }))
      .toThrow(GuardFailedError);
  });

  it('Post-guard passes with decision context', () => {
    const guards = [{ name: 'test', rule: "!(action.value === 'block' && risk_level.value < 30)" }];
    const context = {
      state: {},
      routing: 'acted',
      action: { value: 'allow' },
      risk_level: { value: 10 },
    };
    const results = evaluator.evaluatePostGuards(guards, context as any);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });

  it('Post-guard fails correctly when invariant violated', () => {
    const guards = [{ name: 'test', rule: "!(action.value === 'block' && risk_level.value < 30)" }];
    const context = {
      state: {},
      routing: 'acted',
      action: { value: 'block' },
      risk_level: { value: 10 },
    };
    expect(() => evaluator.evaluatePostGuards(guards, context as any))
      .toThrow(GuardFailedError);
  });

  it('Guard that throws an error is treated as failed', () => {
    const guards = [{ name: 'test', rule: 'state.someMethodThatDoesNotExist()' }];
    expect(() => evaluator.evaluatePreGuards(guards, { state: {} }))
      .toThrow(GuardFailedError);
  });

  it('Multiple guards: all pass', () => {
    const guards = [
      { name: 'g1', rule: 'state.value > 5' },
      { name: 'g2', rule: 'state.value < 20' },
    ];
    const results = evaluator.evaluatePreGuards(guards, { state: { value: 10 } });
    expect(results).toHaveLength(2);
    expect(results.every(r => r.passed)).toBe(true);
  });

  it('Multiple guards: first fails throws', () => {
    const guards = [
      { name: 'g1', rule: 'state.value > 20' },
      { name: 'g2', rule: 'state.value < 20' },
    ];
    expect(() => evaluator.evaluatePreGuards(guards, { state: { value: 10 } }))
      .toThrow(GuardFailedError);
  });

  it('Multiple guards: last fails throws', () => {
    const guards = [
      { name: 'g1', rule: 'state.value > 5' },
      { name: 'g2', rule: 'state.value > 20' },
    ];
    expect(() => evaluator.evaluatePreGuards(guards, { state: { value: 10 } }))
      .toThrow(GuardFailedError);
  });

  it('Guard with complex expression', () => {
    const pass1 = [{ name: 't1', rule: 'state.amount < 10000 || state.verified === true' }];
    expect(() => evaluator.evaluatePreGuards(pass1, { state: { amount: 5000, verified: false } }))
      .not.toThrow();

    const pass2 = [{ name: 't2', rule: 'state.amount < 10000 || state.verified === true' }];
    expect(() => evaluator.evaluatePreGuards(pass2, { state: { amount: 15000, verified: true } }))
      .not.toThrow();

    const fail1 = [{ name: 't3', rule: 'state.amount < 10000 || state.verified === true' }];
    expect(() => evaluator.evaluatePreGuards(fail1, { state: { amount: 15000, verified: false } }))
      .toThrow(GuardFailedError);
  });
});
