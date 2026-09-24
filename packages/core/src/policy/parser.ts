import { parse as parseYaml } from 'yaml';
import { readFile } from 'node:fs/promises';
import type { PolicyDefinition } from '../types/policy.js';
import { PolicyValidationError, PolicyNotFoundError } from '../types/errors.js';

/**
 * Parses and validates YAML policy files into typed PolicyDefinition objects.
 *
 * Policy files use the `.policy.yaml` extension and follow the `chronos/v1` schema.
 */
export class PolicyParser {
  /**
   * Parse a YAML policy file from disk.
   */
  async parseFile(filePath: string): Promise<PolicyDefinition> {
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new PolicyNotFoundError(`Policy file not found: ${filePath}`);
      }
      throw error;
    }
    return this.parse(content);
  }

  /**
   * Parse a YAML string into a PolicyDefinition.
   */
  parse(yamlContent: string): PolicyDefinition {
    let parsed: unknown;
    try {
      parsed = parseYaml(yamlContent);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new PolicyValidationError(`Invalid YAML: ${msg}`);
    }

    return this.normalize(parsed);
  }

  /**
   * Validate and normalize a raw parsed YAML object into a PolicyDefinition.
   *
   * The YAML format uses camelCase keys (e.g., `actThreshold`) which are
   * normalized to the internal type format (e.g., `act_threshold`).
   */
  private normalize(raw: unknown): PolicyDefinition {
    if (!raw || typeof raw !== 'object') {
      throw new PolicyValidationError('Policy must be a YAML object');
    }

    const p = raw as Record<string, unknown>;

    // Validate apiVersion
    if (p.apiVersion !== 'chronos/v1') {
      throw new PolicyValidationError(`apiVersion must be 'chronos/v1', got '${p.apiVersion}'`);
    }

    // Validate kind
    if (p.kind !== 'DecisionPolicy') {
      throw new PolicyValidationError(`kind must be 'DecisionPolicy', got '${p.kind}'`);
    }

    // Validate metadata
    const meta = p.metadata as Record<string, unknown> | undefined;
    if (!meta || typeof meta !== 'object') {
      throw new PolicyValidationError('metadata is required');
    }
    if (typeof meta.name !== 'string' || meta.name.trim() === '') {
      throw new PolicyValidationError('metadata.name must be a non-empty string');
    }
    if (typeof meta.version !== 'string' || !/^\d+\.\d+\.\d+/.test(meta.version)) {
      throw new PolicyValidationError('metadata.version must be valid semver (e.g., "1.0.0")');
    }

    // Validate and normalize questions
    const rawQuestions = p.questions as Record<string, Record<string, unknown>> | undefined;
    if (!rawQuestions || typeof rawQuestions !== 'object' || Object.keys(rawQuestions).length === 0) {
      throw new PolicyValidationError('questions must be a non-empty object');
    }

    const questions: Record<string, unknown> = {};
    for (const [name, q] of Object.entries(rawQuestions)) {
      if (!q || typeof q !== 'object') {
        throw new PolicyValidationError(`questions.${name} must be an object`);
      }
      if (!['noul', 'choice', 'score'].includes(q.type as string)) {
        throw new PolicyValidationError(`questions.${name}.type must be 'noul', 'choice', or 'score'`);
      }

      if (q.type === 'choice') {
        const options = q.options as string[] | undefined;
        if (!Array.isArray(options) || options.length < 2) {
          throw new PolicyValidationError(`questions.${name}: choice questions need 'options' array with 2+ entries`);
        }
      }

      if (q.type === 'score') {
        if (typeof q.min !== 'number' || typeof q.max !== 'number') {
          throw new PolicyValidationError(`questions.${name}: score questions need 'min' and 'max' numbers`);
        }
      }

      questions[name] = {
        type: q.type,
        description: q.question || q.description || '',
        ...(q.type === 'choice' ? { options: q.options } : {}),
        ...(q.type === 'score' ? { min: q.min, max: q.max, rubric: q.criteria || q.rubric || undefined } : {}),
      };
    }

    // Normalize confidence thresholds (YAML camelCase → internal snake_case)
    const rawConf = p.confidence as Record<string, unknown> | undefined;
    const confidence = {
      act_threshold: Number(rawConf?.actThreshold ?? rawConf?.act_threshold ?? 0.90),
      fallback_threshold: Number(rawConf?.fallbackThreshold ?? rawConf?.fallback_threshold ?? 0.70),
      escalation_threshold: Number(rawConf?.escalationThreshold ?? rawConf?.escalation_threshold ?? 0.50),
    };

    // Validate threshold ordering
    if (confidence.act_threshold < confidence.fallback_threshold ||
        confidence.fallback_threshold < confidence.escalation_threshold) {
      throw new PolicyValidationError(
        'Confidence thresholds must satisfy: act >= fallback >= escalation',
      );
    }

    // Normalize routing
    const rawRouting = p.routing as Record<string, unknown> | undefined;
    const routing = {
      primaryProvider: String(rawRouting?.primary ?? rawRouting?.primaryProvider ?? 'jev'),
      fallbackChain: [] as Array<{ provider: string; condition: string }>,
    };
    if (Array.isArray(rawRouting?.fallback)) {
      for (const fb of rawRouting.fallback as Array<Record<string, unknown>>) {
        routing.fallbackChain.push({
          provider: String(fb.provider || 'rules'),
          condition: String(fb.condition || 'true'),
        });
      }
    }

    // Normalize guards
    const rawGuards = p.guards as Record<string, unknown> | undefined;
    const guards: { pre: Array<{ name: string; rule: string; description?: string }>; post: Array<{ name: string; rule: string; description?: string }> } = {
      pre: [],
      post: [],
    };
    if (rawGuards) {
      if (Array.isArray(rawGuards.pre)) {
        for (const g of rawGuards.pre) {
          if (g && typeof g === 'object' && 'name' in g && 'rule' in g) {
            guards.pre.push({
              name: String(g.name),
              rule: String(g.rule),
              description: 'description' in g ? String(g.description) : undefined,
            });
          }
        }
      }
      if (Array.isArray(rawGuards.post)) {
        for (const g of rawGuards.post) {
          if (g && typeof g === 'object' && 'name' in g && 'rule' in g) {
            guards.post.push({
              name: String(g.name),
              rule: String(g.rule),
              description: 'description' in g ? String(g.description) : undefined,
            });
          }
        }
      }
    }

    return {
      apiVersion: 'chronos/v1',
      kind: 'Policy',
      metadata: {
        name: meta.name as string,
        version: meta.version as string,
        description: (meta.description as string) || undefined,
      },
      stateSchema: (p.state as Record<string, unknown>) || {},
      questions: questions as PolicyDefinition['questions'],
      routing,
      confidence,
      guards: (guards.pre.length > 0 || guards.post.length > 0) ? guards : undefined,
    };
  }
}
