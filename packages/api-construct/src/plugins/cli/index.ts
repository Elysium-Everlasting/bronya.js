import type { ApiPlugin } from '../index.js'

import { buildCommandCliPlugin, type BuildCommandOptions } from './commands/build.js'
import { cleanCommandCliPlugin, type CleanCommandOptions } from './commands/clean.js'
import { devCommandCliPlugin, type DevCommandOptions } from './commands/dev.js'

interface CreateApiPluginOptions {
  dev?: DevCommandOptions
  clean?: CleanCommandOptions
  build?: BuildCommandOptions
}

/**
 * CLI plugin to add commands to the CLI instance created by the core library.
 *
 * Adds **ALL** the CLI commands. Each one can be loaded individually if desired.
 */
export function createApiCliPlugins(options: CreateApiPluginOptions = {}): ApiPlugin {
  return (api) => [
    buildCommandCliPlugin(api, options.build),
    cleanCommandCliPlugin(api, options.clean),
    devCommandCliPlugin(api, options.dev),
  ]
}
