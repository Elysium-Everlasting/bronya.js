import type { CliPlugin } from '@bronya.js/core'

import type { Api } from '../../../api.js'
import {
  startExpressApiDevelopmentServer,
  type ServerOptions,
} from '../../../integrations/express/index.js'

/**
 * TODO
 */
export interface DevCommandOptions extends ServerOptions {}

export function devCommandCliPlugin(api: Api, rootOptions?: DevCommandOptions): CliPlugin {
  return {
    name: 'api-cli-dev-command-plugin',

    type: 'cli',

    extend(cli) {
      cli
        .command('dev-api [directory]')
        .option('-h <host>, --host <host>', 'Host for the express development server.')
        .option('-p <port>, --port <port>', 'Port number for the express development server.')
        .option(
          '-P <protocol>, --protocol <protocol>',
          'Protocol for the express development server.',
        )
        .action(async (_args, options) => {
          await startExpressApiDevelopmentServer(api, {
            port: options.port ? parseInt(options.port, 10) : rootOptions?.port,
            host: options.host ?? rootOptions?.host,
            protocol: options.protocol ?? rootOptions?.protocol,
          })
        })
    },
  }
}
