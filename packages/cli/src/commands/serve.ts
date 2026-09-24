import { Command } from 'commander';
import chalk from 'chalk';

export const serveCommand = new Command('serve')
  .description('Start the Chronos HTTP server')
  .option('-p, --port <number>', 'Port to listen on', '3000')
  .action((options) => {
    console.log(chalk.blue('HTTP server coming in v2.0'));
  });
