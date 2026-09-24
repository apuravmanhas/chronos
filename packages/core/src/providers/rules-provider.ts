import type { QuestionDefinition } from '../types/policy.js';
import type { DecisionProvider, RawDecisionResult } from '../types/providers.js';
import type { NoulDecision, ChoiceDecision, ScoreDecision, Decision } from '../types/decisions.js';
import { randomUUID } from 'node:crypto';

/** A condition that matches against state fields */
export interface RuleCondition {
  /** Simple field equality matching on state */
  match: Record<string, unknown>;
  /** The value to return if matched */
  value: string | number | boolean;
  /** Fixed confidence for this rule (0.0 - 1.0) */
  confidence: number;
}

/** A set of rules for a specific question */
export interface RuleSet {
  /** The question name this rule set applies to */
  questionName: string;
  /** Conditions to check in order */
  conditions: RuleCondition[];
  /** Default value if no conditions match */
  default: string | number | boolean;
}

/** Configuration for the deterministic rules provider */
export interface RulesProviderConfig {
  rules: RuleSet[];
}

function stateMatches(state: unknown, match: Record<string, unknown>): boolean {
  if (!state || typeof state !== 'object') return false;
  const s = state as Record<string, unknown>;
  for (const [key, val] of Object.entries(match)) {
    if (s[key] !== val) return false;
  }
  return true;
}

/**
 * A deterministic rules-based decision provider.
 *
 * Performs simple pattern matching on the state and returns fixed decisions.
 * Used as a fallback when the primary provider (Jev) is unavailable.
 */
export class RulesProvider implements DecisionProvider {
  readonly name = 'rules';
  private config: RulesProviderConfig;

  constructor(config: RulesProviderConfig) {
    this.config = config;
  }

  async decide(state: unknown, questions: Record<string, QuestionDefinition>): Promise<RawDecisionResult> {
    const startTime = performance.now();
    const timestamp = new Date().toISOString();
    const traceId = `rules_${randomUUID()}`;

    const result: RawDecisionResult = {
      provider: this.name,
      questions: {},
      latencyMs: 0,
      timestamp,
    };

    for (const [key, q] of Object.entries(questions)) {
      const ruleSet = this.config.rules.find(r => r.questionName === key);
      if (!ruleSet) continue;

      let matchedValue: string | number | boolean = ruleSet.default;
      let matchedConfidence = 1.0;

      for (const condition of ruleSet.conditions) {
        if (stateMatches(state, condition.match)) {
          matchedValue = condition.value;
          matchedConfidence = condition.confidence;
          break;
        }
      }

      const base = {
        provider: this.name,
        latencyMs: 0,
        traceId,
        timestamp,
        entropy: 0,
      };

      if (q.type === 'noul') {
        const prob = matchedValue === true ? 1.0 : matchedValue === false ? 0.0 : Number(matchedValue);
        result.questions[key] = {
          ...base,
          type: 'noul' as const,
          value: prob >= 0.5,
          probability: prob,
          confidence: Math.max(prob, 1 - prob),
        } satisfies NoulDecision;
      } else if (q.type === 'choice') {
        const val = String(matchedValue);
        result.questions[key] = {
          ...base,
          type: 'choice' as const,
          value: val,
          confidence: matchedConfidence,
          probabilities: { [val]: 1.0 } as Record<string, number>,
        } satisfies ChoiceDecision;
      } else if (q.type === 'score') {
        const val = Number(matchedValue);
        const scoreQ = q as { min: number; max: number };
        const min = scoreQ.min ?? 0;
        const max = scoreQ.max ?? 100;
        result.questions[key] = {
          ...base,
          type: 'score' as const,
          value: val,
          min,
          max,
          normalized: max > min ? (val - min) / (max - min) : 0,
          confidence: matchedConfidence,
          probabilities: { [String(val)]: 1.0 },
        } satisfies ScoreDecision;
      }
    }

    result.latencyMs = performance.now() - startTime;
    return result;
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  estimateCost(): number {
    return 0;
  }

  estimateLatencyMs(): number {
    return 1;
  }
}
