import type { Plugin } from '@bronya.js/core'

/**
 * FIXME:
 * This plugin needs {@link Api} in order to define the origin construct for {@link Plugin}
 * But the API wants to use this plugin.
 */
import type { Api } from '../api.js'

import { startExpressApiDevelopmentServer } from './commands/dev.js'

/**
 * TODO
 */
interface CreateApiPluginOptions {}

/**
 * CLI plugin to add commands to the CLI instance created by the core library.
 */
export function createApiPlugin(options: CreateApiPluginOptions = {}): Plugin<Api> {
  const apiPlugin: Plugin<Api> = {
    name: 'api-cli',

    type: 'cli',

    options,

    async extend(api, cli) {
      cli
        .command('dev-api <name> [project]')
        .option('--port-number-super-epic <port>, -i', 'port to use')
        .option('-h, --host-name <host>', 'host to use')
        .option('-d, --debug', 'debug mode')
        .action(async (args, options) => {
          console.log(args, options)
          console.log(startExpressApiDevelopmentServer(api))
        })
    },
  }

  return apiPlugin
}
