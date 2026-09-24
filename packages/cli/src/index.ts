import { Command } from 'commander';
import { decideCommand } from './commands/decide.js';
import { evalCommand } from './commands/eval.js';
import { serveCommand } from './commands/serve.js';
import { initCommand } from './commands/init.js';
import { policyCommand } from './commands/policy.js';

const program = new Command()
  .name('chronos')
  .description('Probabilistic decision runtime for production software')
  .version('0.1.0');

program.addCommand(decideCommand);
program.addCommand(evalCommand);
program.addCommand(serveCommand);
program.addCommand(initCommand);
program.addCommand(policyCommand);

program.parse();
