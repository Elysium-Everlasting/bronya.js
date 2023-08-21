import type { Plugin } from '@bronya.js/core'

import { startExpressApiDevelopmentServer } from './commands/dev.js'

/**
 * TODO
 */
interface CreateApiPluginOptions {}

/**
 * Build a CLI program.
 *
 * This can augment an existing CLI, i.e. the one created by @bronya.js/core.
 */
export function createApiPlugin(options: CreateApiPluginOptions = {}): Plugin {
  return {
    name: 'api-cli',

    type: 'cli',

    options,

    async extend(app, cli) {
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
    },
  }
}
