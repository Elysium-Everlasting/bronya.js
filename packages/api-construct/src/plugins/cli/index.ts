import type { Plugin } from '@bronya.js/core'

import { addDevCommand, type DevOptions } from '../cli/commands/dev.js'

/**
 * TODO.
 */
interface CreateApiPluginOptions {
  dev?: DevOptions
}

/**
 * CLI plugin to add commands to the CLI instance created by the core library.
 */
export function createCliPlugin(options: CreateApiPluginOptions = {}): Plugin {
  const apiPlugin: Plugin = {
    name: 'api-cli',

    type: 'cli',

    options,

    async extend(api, cli) {
      addDevCommand(options.dev)(api, cli)

      // TODO: addCreateRouteCommand

      // TODO: addBuildCommand

      // TODO: addCleanCommand

      // TODO: addDeployCommand

      // TODO: addDestroyCommand
    },
  }

  return apiPlugin
}
