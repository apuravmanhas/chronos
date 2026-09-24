import type { GuardDefinition } from '../types/policy.js';
import type { Decision } from '../types/decisions.js';
import { GuardFailedError } from '../types/errors.js';

export interface GuardContext {
  state: unknown;
  [key: string]: unknown;
}

export interface PostGuardContext extends GuardContext {
  /** All question decision results, accessible by question name */
  [questionName: string]: Decision | unknown;
  routing: string;
}

export interface GuardResult {
  name: string;
  passed: boolean;
  rule: string;
  error?: string;
}

export class GuardEvaluator {
  /**
   * Evaluate pre-decision guards against the input state.
   * Returns results for all guards. Throws GuardFailedError if any fail.
   * 
   * @param guards - Array of guard definitions to evaluate.
   * @param context - Context containing state and other variables.
   * @returns Array of guard results.
   * @throws {GuardFailedError} If any guard fails.
   */
  evaluatePreGuards(guards: GuardDefinition[], context: GuardContext): GuardResult[] {
    const results: GuardResult[] = [];
    let failed = false;
    let failedGuardName = '';

    for (const guard of guards) {
      try {
        const passed = this.evaluateExpression(guard.rule, context);
        results.push({ name: guard.name, passed, rule: guard.rule });
        if (!passed) {
          failed = true;
          failedGuardName = guard.name;
        }
      } catch (error) {
        results.push({ 
          name: guard.name, 
          passed: false, 
          rule: guard.rule,
          error: error instanceof Error ? error.message : String(error)
        });
        failed = true;
        failedGuardName = guard.name;
      }
    }

    if (failed) {
      throw new GuardFailedError(`Pre-decision guard failed: ${failedGuardName}`, failedGuardName, 'pre');
    }

    return results;
  }
  
  /**
   * Evaluate post-decision guards against decisions and state.
   * Returns results for all guards. Throws GuardFailedError if any critical guards fail.
   * 
   * @param guards - Array of guard definitions to evaluate.
   * @param context - Context containing state, decisions, and routing.
   * @returns Array of guard results.
   * @throws {GuardFailedError} If any guard fails.
   */
  evaluatePostGuards(guards: GuardDefinition[], context: PostGuardContext): GuardResult[] {
    const results: GuardResult[] = [];
    let failed = false;
    let failedGuardName = '';

    for (const guard of guards) {
      try {
        const passed = this.evaluateExpression(guard.rule, context);
        results.push({ name: guard.name, passed, rule: guard.rule });
        if (!passed) {
          failed = true;
          failedGuardName = guard.name;
        }
      } catch (error) {
        results.push({ 
          name: guard.name, 
          passed: false, 
          rule: guard.rule,
          error: error instanceof Error ? error.message : String(error)
        });
        failed = true;
        failedGuardName = guard.name;
      }
    }

    if (failed) {
      throw new GuardFailedError(`Post-decision guard failed: ${failedGuardName}`, failedGuardName, 'post');
    }

    return results;
  }
  
  /**
   * Evaluate a single guard expression. Returns true if guard passes.
   * 
   * @param rule - The JavaScript expression to evaluate.
   * @param context - The context containing variables for the expression.
   * @returns True if the expression evaluates to truthy, false otherwise.
   */
  private evaluateExpression(rule: string, context: Record<string, unknown>): boolean {
    const keys = Object.keys(context);
    const values = Object.values(context);
    
    // Create a function with arguments named after context keys
    // Return the evaluation of the rule
    const fn = new Function(...keys, `return (${rule});`);
    return Boolean(fn(...values));
  }
}
