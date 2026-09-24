import chalk from 'chalk';
import type { Decision, PolicyDecisionResult } from '@chronos-rt/core';

/**
 * Format a single decision value with color-coded confidence.
 */
export function formatDecision(name: string, decision: Decision): string {
  const conf = decision.confidence;
  const confStr = (conf * 100).toFixed(1) + '%';
  const coloredConf = conf >= 0.9
    ? chalk.green(confStr)
    : conf >= 0.7
      ? chalk.yellow(confStr)
      : chalk.red(confStr);

  const typeStr = chalk.gray('[' + decision.type + ']');
  const valueStr = chalk.white(String(decision.value));
  const entropyStr = chalk.gray('H=' + decision.entropy.toFixed(3));

  return '  ' + chalk.cyan(name.padEnd(20)) + ' ' + typeStr + ' ' + valueStr.padEnd(15) + ' conf=' + coloredConf + '  ' + entropyStr;
}

/**
 * Format a full policy decision result for terminal output.
 */
export function formatPolicyResult(result: PolicyDecisionResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold('Decision Result'));
  lines.push(chalk.gray('-'.repeat(60)));
  lines.push(chalk.white('  Policy:    ') + chalk.cyan(result.policyName + '@' + result.policyVersion));
  lines.push(chalk.white('  Provider:  ') + chalk.cyan(result.providerUsed));
  lines.push(chalk.white('  Trace ID:  ') + chalk.gray(result.traceId));
  lines.push(chalk.white('  Latency:   ') + chalk.yellow(result.totalLatencyMs.toFixed(1) + 'ms'));

  const routeColor = result.routingOutcome === 'acted'
    ? chalk.green
    : result.routingOutcome === 'fell_back'
      ? chalk.yellow
      : chalk.red;
  lines.push(chalk.white('  Routing:   ') + routeColor(result.routingOutcome));
  lines.push('');

  lines.push(chalk.bold('  Questions:'));
  for (const [name, decision] of Object.entries(result.questions)) {
    lines.push(formatDecision(name, decision));
  }

  if (result.guardsFailed.length > 0) {
    lines.push('');
    lines.push(chalk.red('  Guards failed: ' + result.guardsFailed.join(', ')));
  }

  lines.push(chalk.gray('-'.repeat(60)));
  return lines.join('\n');
}
