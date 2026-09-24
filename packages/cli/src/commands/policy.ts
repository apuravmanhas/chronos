import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'node:fs';
import * as path from 'node:path';

const policyListCommand = new Command('list')
  .description('List all available policies')
  .option('--dir <path>', 'Policies directory', './policies')
  .action(async (options: { dir: string }) => {
    const dir = options.dir;
    console.log(chalk.blue('Scanning policies in: ' + dir));
    console.log();

    try {
      const files = findPolicyFiles(dir);
      if (files.length === 0) {
        console.log(chalk.yellow('No policy files found.'));
        return;
      }
      for (const file of files) {
        const rel = path.relative(dir, file);
        console.log(chalk.green('  * ') + chalk.white(rel));
      }
      console.log();
      console.log(chalk.gray('Found ' + files.length + ' policy file(s).'));
    } catch {
      console.error(chalk.red('Failed to scan directory: ' + dir));
    }
  });

const policyValidateCommand = new Command('validate')
  .description('Validate a policy file')
  .argument('<path>', 'Path to policy YAML file')
  .action(async (filePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { PolicyParser } = await import('@chronos-rt/core');
      const parser = new PolicyParser();
      const policy = parser.parse(content);
      console.log(chalk.green('Valid policy: ' + policy.metadata.name + '@' + policy.metadata.version));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(chalk.red('Validation failed: ' + msg));
      process.exit(1);
    }
  });

export const policyCommand = new Command('policy')
  .description('Manage policy definitions')
  .addCommand(policyListCommand)
  .addCommand(policyValidateCommand);

function findPolicyFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findPolicyFiles(full));
    } else if (entry.name.endsWith('.policy.yaml') || entry.name.endsWith('.policy.yml')) {
      results.push(full);
    }
  }
  return results;
}
