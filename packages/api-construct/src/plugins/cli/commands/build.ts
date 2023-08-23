import type { CliPlugin } from '@bronya.js/core'

import type { Api } from '../../../api.js'
import { buildApiRoute } from '../../../scripts/build.js'

export interface BuildCommandOptions {
  /**
   * The route to build.
   */
  route?: string
}

export const addBuildCommand = (rootOptions: BuildCommandOptions = {}) =>
  ((api, cli) => {
    cli.command('build [route]').action(async (args, _options) => {
      const route = args.route ?? rootOptions.route ?? process.cwd()

      const routeInfo = api.routes[route]

      if (!routeInfo) {
        throw new Error(`Route "${route}" not found.`)
      }

      await buildApiRoute(routeInfo)
    })
  }) satisfies CliPlugin<Api>['extend']
