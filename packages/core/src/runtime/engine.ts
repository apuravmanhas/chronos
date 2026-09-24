import { PolicyManager } from '../policy/manager.js';
import { ConfidenceRouter } from '../routing/confidence-router.js';
import { GuardEvaluator, type GuardResult } from '../guards/evaluator.js';
import { createStore } from '../store/index.js';
import type { ChronosConfig } from '../types/config.js';
import type { DecisionProvider, RawDecisionResult } from '../types/providers.js';
import type { PolicyDecisionResult, Decision } from '../types/decisions.js';
import type { DecisionStore } from '../types/store.js';
import type { PolicyDefinition, ConfidenceConfig } from '../types/policy.js';
import { randomUUID } from 'node:crypto';

/**
 * The main Chronos decision runtime.
 *
 * Ties together policy management, provider execution, confidence routing,
 * guard evaluation, and decision storage into a single coherent engine.
 *
 * @example
 * ```typescript
 * const chronos = new Chronos({
 *   providers: { jev: { apiKey: 'sk-...' } },
 *   policies: { path: './policies', watchForChanges: false },
 *   store: { type: 'memory' },
 *   tracing: { enabled: false, type: 'console' },
 * });
 *
 * await chronos.initialize();
 * const result = await chronos.decide('request-safety', { state: { ... } });
 * ```
 */
export class Chronos {
  private providers: Map<string, DecisionProvider> = new Map();
  private policyManager: PolicyManager;
  private confidenceRouter: ConfidenceRouter;
  private guardEvaluator: GuardEvaluator;
  private store: DecisionStore;
  private config: ChronosConfig;

  constructor(config: ChronosConfig) {
    this.config = config;
    this.policyManager = new PolicyManager(config.policies?.path || './policies');
    this.confidenceRouter = new ConfidenceRouter();
    this.guardEvaluator = new GuardEvaluator();
    this.store = createStore(config.store);
  }

  /**
   * Register a decision provider.
   */
  registerProvider(provider: DecisionProvider): void {
    this.providers.set(provider.name, provider);
  }

  /**
   * Execute a decision against a named policy.
   *
   * This is the main entry point. It:
   * 1. Looks up the policy by name
   * 2. Executes pre-decision guards
   * 3. Calls the primary provider
   * 4. Routes based on confidence (act/fallback/escalate)
   * 5. If falling back, tries fallback providers in order
   * 6. Executes post-decision guards
   * 7. Records the decision in the store
   * 8. Returns the typed result
   */
  async decide(policyName: string, options: {
    state: unknown;
    overrides?: {
      provider?: string;
      confidenceThresholds?: Partial<ConfidenceConfig>;
    };
    redactState?: boolean;
  }): Promise<PolicyDecisionResult> {
    const startTime = performance.now();
    const traceId = `crn_${randomUUID()}`;
    const timestamp = new Date().toISOString();

    // 1. Look up the policy
    const policy = await this.policyManager.getPolicy(policyName);
    if (!policy) {
      throw new Error(`Policy not found: ${policyName}`);
    }

    // 2. Execute pre-decision guards
    const preGuardsPassed: string[] = [];
    const preGuardsFailed: string[] = [];
    if (policy.guards?.pre) {
      const preResults = this.guardEvaluator.evaluatePreGuards(
        policy.guards.pre,
        { state: options.state },
      );
      for (const r of preResults) {
        if (r.passed) preGuardsPassed.push(r.name);
        else preGuardsFailed.push(r.name);
      }
    }

    // 3. Determine which provider to use
    const providerName = options.overrides?.provider || policy.routing.primaryProvider || 'jev';
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider not registered: ${providerName}. Registered: [${[...this.providers.keys()].join(', ')}]`);
    }

    // 4. Call the primary provider
    let rawResult: RawDecisionResult;
    let usedProvider = providerName;
    try {
      rawResult = await provider.decide(options.state, policy.questions);
    } catch (err) {
      // If primary fails, try fallback chain
      let fallbackSucceeded = false;
      rawResult = { questions: {}, provider: providerName, latencyMs: 0, timestamp };
      for (const fb of (policy.routing.fallbackChain || [])) {
        const fallbackProvider = this.providers.get(fb.provider);
        if (fallbackProvider) {
          try {
            rawResult = await fallbackProvider.decide(options.state, policy.questions);
            usedProvider = fb.provider;
            fallbackSucceeded = true;
            break;
          } catch {
            continue;
          }
        }
      }
      if (!fallbackSucceeded) {
        throw err;
      }
    }

    // 5. Route based on confidence
    const thresholds: ConfidenceConfig = {
      act_threshold: options.overrides?.confidenceThresholds?.act_threshold ?? policy.confidence.act_threshold,
      fallback_threshold: options.overrides?.confidenceThresholds?.fallback_threshold ?? policy.confidence.fallback_threshold,
      escalation_threshold: options.overrides?.confidenceThresholds?.escalation_threshold ?? policy.confidence.escalation_threshold,
    };

    const routingOutcome = this.confidenceRouter.route(rawResult.questions, thresholds);

    // If routing says fallback and we haven't already fallen back, try fallback chain
    if (routingOutcome === 'fell_back' && usedProvider === providerName) {
      for (const fb of (policy.routing.fallbackChain || [])) {
        const fallbackProvider = this.providers.get(fb.provider);
        if (fallbackProvider) {
          try {
            const fbResult = await fallbackProvider.decide(options.state, policy.questions);
            const fbRouting = this.confidenceRouter.route(fbResult.questions, thresholds);
            if (fbRouting === 'acted') {
              rawResult = fbResult;
              usedProvider = fb.provider;
              break;
            }
          } catch {
            continue;
          }
        }
      }
    }

    // Recalculate final routing after potential fallback
    const finalRouting = this.confidenceRouter.route(rawResult.questions, thresholds);

    // 6. Execute post-decision guards
    const postGuardsPassed: string[] = [];
    const postGuardsFailed: string[] = [];
    if (policy.guards?.post) {
      const postContext = {
        state: options.state,
        routing: finalRouting,
        ...rawResult.questions,
      };
      const postResults = this.guardEvaluator.evaluatePostGuards(
        policy.guards.post,
        postContext as Parameters<typeof this.guardEvaluator.evaluatePostGuards>[1],
      );
      for (const r of postResults) {
        if (r.passed) postGuardsPassed.push(r.name);
        else postGuardsFailed.push(r.name);
      }
    }

    const totalLatencyMs = performance.now() - startTime;

    // 7. Build result
    const result: PolicyDecisionResult = {
      policyName: policy.metadata.name,
      policyVersion: policy.metadata.version,
      questions: rawResult.questions,
      routingOutcome: finalRouting,
      providerUsed: usedProvider,
      guardsPassed: [...preGuardsPassed, ...postGuardsPassed],
      guardsFailed: [...preGuardsFailed, ...postGuardsFailed],
      totalLatencyMs,
      traceId,
      timestamp,
    };

    // 8. Record in store
    try {
      this.store.append(result, options.state, { redactState: options.redactState });
    } catch {
      // Store failure should not break the decision flow
    }

    return result;
  }

  /**
   * Initialize the runtime (load policies, check provider health).
   */
  async initialize(): Promise<void> {
    await this.policyManager.loadAll();
  }

  /**
   * Shutdown the runtime (close store, cleanup).
   */
  async shutdown(): Promise<void> {
    this.store.close();
  }

  /**
   * Get the decision store for querying/replay.
   */
  getStore(): DecisionStore {
    return this.store;
  }

  /**
   * Get the policy manager for listing/inspecting policies.
   */
  getPolicyManager(): PolicyManager {
    return this.policyManager;
  }
}
