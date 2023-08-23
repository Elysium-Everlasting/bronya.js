import type { Plugin } from '@bronya.js/core'

import { addBuildCommand, type BuildCommandOptions } from './commands/build.js'
import { addCleanCommand, type CleanCommandOptions } from './commands/clean.js'
import { addDevCommand, type DevCommandOptions } from './commands/dev.js'

interface CreateApiPluginOptions {
  dev?: DevCommandOptions
  clean?: CleanCommandOptions
  build?: BuildCommandOptions
}

/**
 * CLI plugin to add commands to the CLI instance created by the core library.
 */
export function createCliPlugin(options: CreateApiPluginOptions = {}): Plugin {
  const apiPlugin: Plugin = {
    name: 'api-cli-plugin',

    type: 'cli',

    options,

    async extend(api, cli) {
      addDevCommand(options.dev)(api, cli)
      addCleanCommand(options.clean)(api, cli)
      addBuildCommand(options.build)(api, cli)

      // TODO: addCreateRouteCommand

      // TODO: addDeployCommand

      // TODO: addDestroyCommand
    },
  }

  return apiPlugin
}
