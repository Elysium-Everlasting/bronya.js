import { createCLI, CLI } from '@bronya.js/cli'
import { App } from '@bronya.js/core'

import { startExpressApiDevelopmentServer } from './commands/dev'

/**
 * Build a CLI program.
 *
 * This can augment an existing CLI, i.e. the one created by @bronya.js/core.
 */
export function buildCli(app: App, cli: CLI = createCLI()) {
  cli
    .command('dev-api <name> [project]')
    .option('--port-number-super-epic <port>, -i', 'port to use')
    .option('-h, --host-name <host>', 'host to use')
    .option('-d, --debug', 'debug mode')
    .action(async (args, options) => {
      console.log(app)
      console.log(args)
      console.log(options)
      console.log(startExpressApiDevelopmentServer)
    })
}
