export interface JevProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

import type { QuestionDefinition, NoulQuestionDef, ChoiceQuestionDef, ScoreQuestionDef } from '../types/policy.js';
import type { DecisionProvider, RawDecisionResult } from '../types/providers.js';
import type { NoulDecision, ChoiceDecision, ScoreDecision } from '../types/decisions.js';
import { ProviderError, ProviderTimeoutError } from '../types/errors.js';

function calculateEntropy(probabilities: Record<string, number>): number {
  let entropy = 0;
  for (const p of Object.values(probabilities)) {
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

export class JevProvider implements DecisionProvider {
  readonly name = 'jev';
  private config: JevProviderConfig;

  constructor(config: JevProviderConfig) {
    this.config = {
      baseUrl: 'https://api.typesafe.ai',
      model: 'jev-latest',
      timeoutMs: 10000,
      maxRetries: 2,
      ...config,
    };
  }

  async decide(state: unknown, questions: Record<string, QuestionDefinition>): Promise<RawDecisionResult> {
    const startTime = performance.now();
    const apiQuestions: Record<string, unknown> = {};

    for (const [key, q] of Object.entries(questions)) {
      if (q.type === 'noul') {
        apiQuestions[key] = { type: 'noul', instructions: q.description };
      } else if (q.type === 'choice') {
        // Jev Choice API expects criteria as Record<key, description>
        const criteria: Record<string, string> = {};
        for (const opt of (q as ChoiceQuestionDef).options) {
          criteria[opt] = opt;
        }
        apiQuestions[key] = { type: 'choice', instructions: q.description, criteria };
      } else if (q.type === 'score') {
        const scoreQ = q as ScoreQuestionDef;
        // Jev Score API expects criteria as ordered string[] describing each level
        let criteria: string[];
        if (scoreQ.rubric) {
          criteria = Object.values(scoreQ.rubric);
        } else {
          // Auto-generate 5-level rubric from min/max
          const min = scoreQ.min ?? 0;
          const max = scoreQ.max ?? 100;
          const step = (max - min) / 4;
          criteria = [
            `${min} - Very low (${min.toFixed(0)})`,
            `Low (${(min + step).toFixed(0)})`,
            `Moderate (${(min + step * 2).toFixed(0)})`,
            `High (${(min + step * 3).toFixed(0)})`,
            `${max} - Very high (${max.toFixed(0)})`,
          ];
        }
        apiQuestions[key] = { type: 'score', instructions: q.description, criteria };
      }
    }

    // Jev accepts string or JSON state — stringify objects for consistency
    const stateForApi = typeof state === 'string' ? state : JSON.stringify(state);

    const payload = {
      model: this.config.model || 'jev-latest',
      state: stateForApi,
      questions: apiQuestions,
    };

    let attempt = 0;
    while (attempt <= (this.config.maxRetries ?? 2)) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await fetch(`${this.config.baseUrl}/v1/systemone`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 429 || response.status === 529) {
             if (attempt <= (this.config.maxRetries ?? 2)) {
                 const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
                 await new Promise(resolve => setTimeout(resolve, backoff));
                 continue;
             }
          }
          const errorBody = await response.text();
          throw new ProviderError(`Jev API error: ${response.status} ${response.statusText} - ${errorBody}`, this.name, response.status);
        }

        const data = await response.json() as Record<string, unknown>;
        const latencyMs = performance.now() - startTime;
        const timestamp = new Date().toISOString();
        const traceId = `jev_${crypto.randomUUID()}`;
        const answers = data.answers as Record<string, Record<string, unknown>>;

        const result: RawDecisionResult = {
          provider: this.name,
          questions: {},
          latencyMs,
          timestamp,
        };

        for (const [key, ans] of Object.entries(answers)) {
          if (ans.type === 'noul') {
            const probability = ans.noul as number;
            result.questions[key] = {
              type: 'noul',
              value: probability >= 0.5,
              probability,
              confidence: Math.max(probability, 1 - probability),
              provider: this.name,
              latencyMs,
              traceId,
              timestamp,
              entropy: calculateEntropy({ yes: probability, no: 1 - probability }),
            } satisfies NoulDecision;
          } else if (ans.type === 'choice') {
            const probs = ans.probabilities as Record<string, number>;
            result.questions[key] = {
              type: 'choice',
              value: ans.choice as string,
              confidence: ans.confidence as number,
              probabilities: probs,
              provider: this.name,
              latencyMs,
              traceId,
              timestamp,
              entropy: calculateEntropy(probs),
            } satisfies ChoiceDecision;
          } else if (ans.type === 'score') {
            const probs = ans.probabilities as Record<string, number>;
            const score = ans.score as number;
            const legend = ans.legend as Record<string, string> | undefined;
            const numLevels = legend ? Object.keys(legend).length : 5;
            const min = 0;
            const max = numLevels - 1;
            result.questions[key] = {
              type: 'score',
              value: score,
              min,
              max,
              normalized: max > min ? score / max : 0,
              confidence: ans.confidence as number,
              probabilities: probs,
              provider: this.name,
              latencyMs,
              traceId,
              timestamp,
              entropy: calculateEntropy(probs),
            } satisfies ScoreDecision;
          }
        }

        return result;
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new ProviderTimeoutError(`Jev API request timed out after ${this.config.timeoutMs}ms`, this.name);
        }
        if (attempt > (this.config.maxRetries ?? 2)) {
            throw new ProviderError(`Jev API request failed: ${err.message}`, this.name);
        }
      }
    }
    
    throw new ProviderError('Max retries exceeded', this.name);
  }

  async healthCheck(): Promise<boolean> {
      // Simulate health check or use an actual endpoint if available
      return true;
  }
  
  estimateCost(stateTokens: number): number {
      return (stateTokens / 1_000_000) * 0.042;
  }
  
  estimateLatencyMs(): number {
      return 200;
  }
}
