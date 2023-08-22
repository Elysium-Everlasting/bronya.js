import { createCLI } from '@bronya.js/cli'

import { getAppPlugins } from './construct.js'

import { loadAppFromConfig } from '.'

async function main() {
  const cli = createCLI()

  const app = await loadAppFromConfig()

  const pluginsWithOrigin = getAppPlugins(app)

  for (const { plugins, origin } of pluginsWithOrigin) {
    for (const plugin of plugins) {
      switch (plugin.type) {
        case 'cli': {
          await plugin.extend?.(origin, cli, app)
          break
        }

        default:
          break
      }
    }
  }

  cli.parse()
}

main()
