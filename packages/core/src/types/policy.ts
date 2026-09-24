/**
 * Base configuration for a policy question
 */
export interface BaseQuestionDefinition {
  type: 'noul' | 'choice' | 'score';
  description: string;
}

/** Configuration for a noul question */
export interface NoulQuestionDef extends BaseQuestionDefinition {
  type: 'noul';
}

/** Configuration for a choice question */
export interface ChoiceQuestionDef extends BaseQuestionDefinition {
  type: 'choice';
  options: string[];
}

/** Configuration for a score question */
export interface ScoreQuestionDef extends BaseQuestionDefinition {
  type: 'score';
  min: number;
  max: number;
  /** Description per level */
  rubric: Record<string, string>;
}

/** Union of all question definitions */
export type QuestionDefinition = NoulQuestionDef | ChoiceQuestionDef | ScoreQuestionDef;

/** A fallback routing condition */
export interface RoutingCondition {
  provider: string;
  /** JS expression, e.g. "entropy > 0.5" */
  condition: string;
}

/** Routing configuration for a policy */
export interface RoutingConfig {
  primaryProvider: string;
  fallbackChain: RoutingCondition[];
}

/** Confidence thresholds for routing */
export interface ConfidenceConfig {
  act_threshold: number;
  fallback_threshold: number;
  escalation_threshold: number;
}

/** A guard rule to validate state or decisions */
export interface GuardDefinition {
  name: string;
  rule: string;
  description?: string;
}

/** Pre and post execution guards */
export interface GuardsConfig {
  pre: GuardDefinition[];
  post: GuardDefinition[];
}

/** Policy metadata */
export interface PolicyMetadata {
  name: string;
  version: string;
  description?: string;
}

/** Full policy definition */
export interface PolicyDefinition {
  apiVersion: string;
  kind: 'Policy';
  metadata: PolicyMetadata;
  /** JSON schema of the required state */
  stateSchema: Record<string, unknown>;
  questions: Record<string, QuestionDefinition>;
  routing: RoutingConfig;
  confidence: ConfidenceConfig;
  guards?: GuardsConfig;
}
