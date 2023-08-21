import { createCLI } from '@bronya.js/cli'

import { getAppPlugins } from './construct.js'

import { loadAppFromConfig } from '.'

async function main() {
  const cli = createCLI()

  const app = await loadAppFromConfig()

  const pluginsWithOrigin = getAppPlugins(app)

  pluginsWithOrigin.forEach(({ plugins, origin }) => {
    plugins.forEach((plugin) => {
      switch (plugin.type) {
        case 'cli': {
          plugin.extend?.(origin, cli, app)
          break
        }

        default:
          break
      }
    })
  })

  const parsed = cli.parse()

  console.log(JSON.stringify(parsed, null, 2))
}

main()
