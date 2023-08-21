import type { Plugin } from '@bronya.js/core'

import type { Api } from '../api.js'

/**
 * TODO.
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
        .command('dev-api [directory]')
        .option('-p <port>, --port <host>', 'Port number for the express development server.')
        .action(async (_args, options) => {
          api.dev({
            port: options.port ? parseInt(options.port, 10) : undefined,
          })
        })
    },
  }

  return apiPlugin
}
