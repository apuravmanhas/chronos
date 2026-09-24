import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'node:fs';

export const decideCommand = new Command('decide')
  .description('Execute a decision against a named policy')
  .argument('<policy-name>', 'Name of the policy to evaluate')
  .option('-s, --state <json>', 'Input state as JSON string')
  .option('-f, --file <path>', 'Path to JSON file containing state')
  .option('--policies <dir>', 'Path to policies directory', './policies')
  .action(async (policyName: string, options: { state?: string; file?: string; policies?: string }) => {
    let state: unknown;
    try {
      if (options.file) {
        state = JSON.parse(fs.readFileSync(options.file, 'utf-8'));
      } else if (options.state) {
        state = JSON.parse(options.state);
      } else {
        console.error(chalk.red('Provide state via --state or --file'));
        process.exit(1);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(chalk.red('Failed to parse state: ' + msg));
      process.exit(1);
    }

    console.log(chalk.blue('Executing policy "' + policyName + '"...'));
    console.log(chalk.yellow('Note: Full runtime requires JEV_API_KEY. Running in dry-run mode.'));
    console.log();
    console.log(chalk.white('Policy:  ') + chalk.cyan(policyName));
    console.log(chalk.white('State:   ') + chalk.gray(JSON.stringify(state).substring(0, 120)));
    console.log();
    console.log(chalk.gray('To execute decisions, use the @chronos-rt/core SDK programmatically.'));
    console.log(chalk.gray('See: https://github.com/chronos/chronos#quick-start'));
  });
