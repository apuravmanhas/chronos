import type { Decision } from '../types/decisions.js';
import type { ConfidenceConfig } from '../types/policy.js';

export type RoutingOutcome = 'acted' | 'fell_back' | 'escalated';

export class ConfidenceRouter {
  /**
   * Determine routing outcome based on decision confidence and thresholds.
   * 
   * For multiple questions, use the MINIMUM confidence across all questions
   * (optimistic strategy) to determine the routing outcome.
   */
  route(
    decisions: Record<string, Decision>,
    config: ConfidenceConfig
  ): RoutingOutcome {
    let composite = 0;
    for (const key in decisions) {
      if (decisions[key].confidence > composite) {
        composite = decisions[key].confidence;
      }
    }
    
    if (composite >= config.act_threshold) {
      return 'acted';
    }
    if (composite >= config.fallback_threshold) {
      return 'fell_back';
    }
    return 'escalated';
  }
  
  /**
   * Calculate composite confidence from multiple decisions.
   */
  compositeConfidence(decisions: Record<string, Decision>): number {
    const decisionValues = Object.values(decisions);
    if (decisionValues.length === 0) return 0;
    
    let minConfidence = 1;
    for (const decision of decisionValues) {
      const conf = this.effectiveConfidence(decision);
      if (conf < minConfidence) {
        minConfidence = conf;
      }
    }
    return minConfidence;
  }
  
  /**
   * Get the effective confidence of a single decision.
   * For Noul decisions, confidence is derived from how far probability is from 0.5.
   */
  effectiveConfidence(decision: Decision): number {
    if (decision.type === 'noul') {
      // Noul confidence: how far the probability is from 0.5
      // If probability is 0.0, we are 100% confident it's false
      // If probability is 1.0, we are 100% confident it's true
      // So max(p, 1-p) gives us the confidence
      return Math.max(decision.probability, 1 - decision.probability);
    }
    
    return decision.confidence;
  }
}
