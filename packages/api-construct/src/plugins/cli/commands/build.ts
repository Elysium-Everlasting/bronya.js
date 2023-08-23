import type { CliPlugin } from '@bronya.js/core'

import type { Api } from '../../../api.js'
import { buildApiRoute } from '../../../scripts/build.js'

export interface BuildCommandOptions {
  /**
   * The route to build.
   */
  route?: string
}

export function buildCommandCliPlugin(api: Api, rootOptions: BuildCommandOptions = {}): CliPlugin {
  return {
    name: 'api-cli-build-command-plugin',

    type: 'cli',

    extend(cli) {
      cli.command('build-api [route]').action(async (args, _options) => {
        const route = args.route ?? rootOptions.route ?? process.cwd()

        const routeInfo = api.routes[route]

        if (!routeInfo) {
          throw new Error(`Route "${route}" not found.`)
        }

        await buildApiRoute(routeInfo)
      })
    },
  }
}
