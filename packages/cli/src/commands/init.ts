import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';

const DEFAULT_CONFIG = `apiVersion: chronos/v1
providers:
  jev:
    apiKey: \${JEV_API_KEY}
    model: jev-latest
  rules:
    enabled: true
policies:
  path: ./policies
store:
  type: json-file
  path: ./chronos-decisions.jsonl
confidence:
  actThreshold: 0.90
  fallbackThreshold: 0.70
  escalationThreshold: 0.50
`;

const EXAMPLE_POLICY = `apiVersion: chronos/v1
kind: DecisionPolicy
metadata:
  name: example-policy
  version: "1.0.0"
  description: "An example policy"
questions:
  is_valid:
    type: noul
    question: "Is this valid?"
routing:
  primary: jev
`;

const ENV_EXAMPLE = `JEV_API_KEY=your_api_key_here
`;

export const initCommand = new Command('init')
  .description('Initialize Chronos in the current directory')
  .action(() => {
    const cwd = process.cwd();
    const configPath = path.join(cwd, 'chronos.config.yaml');
    const envPath = path.join(cwd, '.env.example');
    const policiesDir = path.join(cwd, 'policies');
    const examplePolicyPath = path.join(policiesDir, 'example.policy.yaml');

    if (fs.existsSync(configPath)) {
      console.log(chalk.yellow('chronos.config.yaml already exists. Skipping initialization.'));
      return;
    }

    fs.writeFileSync(configPath, DEFAULT_CONFIG);
    fs.writeFileSync(envPath, ENV_EXAMPLE);

    if (!fs.existsSync(policiesDir)) {
      fs.mkdirSync(policiesDir);
    }
    fs.writeFileSync(examplePolicyPath, EXAMPLE_POLICY);

    console.log(chalk.green('Successfully initialized Chronos!'));
    console.log(chalk.blue('Generated files:'));
    console.log('  - chronos.config.yaml');
    console.log('  - .env.example');
    console.log('  - policies/example.policy.yaml');
    console.log('\nNext steps:');
    console.log('1. Copy .env.example to .env and set your JEV_API_KEY');
    console.log('2. Edit policies/example.policy.yaml to fit your needs');
    console.log('3. Run `chronos decide example-policy --state "{}"` to test it');
  });
