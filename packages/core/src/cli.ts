import { createCLI } from '@bronya.js/cli'

import { getAppPlugins } from './construct.js'

import { loadAppFromConfig } from '.'

async function main() {
  const cli = createCLI()

  const app = await loadAppFromConfig()

  const plugins = getAppPlugins(app)

  plugins.forEach((plugin) => {
    switch (plugin.type) {
      case 'cli': {
        plugin.extend?.(app, cli)
        break
      }

      case 'placeholder': {
        break
      }

      default:
        break
    }
  })
}

main()
