import { describe, it, expect } from 'vitest';
import { PolicyParser } from '../../src/policy/parser.js';

describe('PolicyParser', () => {
  const parser = new PolicyParser();

  const validYaml = `
apiVersion: chronos/v1
kind: DecisionPolicy
metadata:
  name: test-policy
  version: "1.0.0"
  description: "A test policy"
questions:
  is_valid:
    type: noul
    question: "Is this valid?"
  category:
    type: choice
    question: "What category?"
    options:
      - safe
      - unsafe
      - unknown
routing:
  primary: jev
confidence:
  actThreshold: 0.90
  fallbackThreshold: 0.70
  escalationThreshold: 0.50
guards:
  pre:
    - name: has_data
      rule: "state != null"
  post:
    - name: no_block_safe
      rule: "!(category.value === 'unsafe' && is_valid.value === true)"
  `;

  it('Parses a valid policy YAML string', () => {
    const policy = parser.parse(validYaml);
    expect(policy.metadata.name).toBe('test-policy');
  });

  it('Normalizes camelCase confidence thresholds', () => {
    const policy = parser.parse(validYaml);
    expect(policy.confidence.act_threshold).toBe(0.90);
    expect(policy.confidence.fallback_threshold).toBe(0.70);
    expect(policy.confidence.escalation_threshold).toBe(0.50);
  });

  it('Normalizes routing format (primary -> primaryProvider)', () => {
    const policy = parser.parse(validYaml);
    expect(policy.routing.primaryProvider).toBe('jev');
  });

  it('Validates apiVersion must be chronos/v1', () => {
    const yaml = validYaml.replace('apiVersion: chronos/v1', 'apiVersion: unknown/v1');
    expect(() => parser.parse(yaml)).toThrow();
  });

  it('Validates kind must be DecisionPolicy', () => {
    const yaml = validYaml.replace('kind: DecisionPolicy', 'kind: OtherKind');
    expect(() => parser.parse(yaml)).toThrow();
  });

  it('Validates metadata.name is required', () => {
    const yaml = validYaml.replace('name: test-policy', '');
    expect(() => parser.parse(yaml)).toThrow();
  });

  it('Validates metadata.version must be semver', () => {
    const yaml = validYaml.replace('version: "1.0.0"', 'version: "v1"');
    expect(() => parser.parse(yaml)).toThrow();
  });

  it('Validates questions must be non-empty', () => {
    const yaml = validYaml.replace(/questions:[\s\S]*?routing:/, 'questions: {}\nrouting:');
    expect(() => parser.parse(yaml)).toThrow();
  });

  it('Validates choice questions need 2+ options', () => {
    const yaml = validYaml.replace(/options:\s+- safe\s+- unsafe\s+- unknown/, 'options:\n      - safe');
    expect(() => parser.parse(yaml)).toThrow();
  });

  it('Validates score questions need min and max', () => {
    const yaml = validYaml.replace('type: choice', 'type: score').replace(/options:[\s\S]*?(?=routing:)/, '');
    expect(() => parser.parse(yaml)).toThrow();
  });

  it('Validates threshold ordering: act >= fallback >= escalation', () => {
    const yaml = validYaml.replace('actThreshold: 0.90', 'actThreshold: 0.60');
    expect(() => parser.parse(yaml)).toThrow();
  });

  it('Parses guards (pre and post)', () => {
    const policy = parser.parse(validYaml);
    expect(policy.guards.pre).toHaveLength(1);
    expect(policy.guards.post).toHaveLength(1);
    expect(policy.guards.pre[0].name).toBe('has_data');
  });

  it('Missing optional fields use defaults', () => {
    const minYaml = `
apiVersion: chronos/v1
kind: DecisionPolicy
metadata:
  name: test-policy
  version: "1.0.0"
questions:
  is_valid:
    type: noul
    question: "Is this valid?"
`;
    const policy = parser.parse(minYaml);
    expect(policy.confidence.act_threshold).toBeDefined();
    expect(policy.routing.primaryProvider).toBeDefined();
  });
});
