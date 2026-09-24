import { Command } from 'commander';
import chalk from 'chalk';

export const evalCommand = new Command('eval')
  .description('Evaluate a policy against a dataset')
  .argument('<policy-name>', 'Name of the policy to evaluate')
  .requiredOption('--dataset <path-to-jsonl>', 'Path to the JSONL dataset')
  .action((policyName, options) => {
    console.log(chalk.blue('Evaluation engine coming in v1.1'));
  });
