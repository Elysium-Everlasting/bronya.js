import { createCLI } from '@bronya.js/cli'

import { getAppPlugins } from './construct.js'

import { loadAppFromConfig } from '.'

async function main() {
  const cli = createCLI()

  const app = await loadAppFromConfig()

  const plugins = getAppPlugins(app)

  for (const plugin of plugins) {
    switch (plugin.type) {
      case 'cli': {
        await plugin.extend?.(cli)
        break
      }

      default:
        break
    }
  }

  cli.parse()
}

main()
