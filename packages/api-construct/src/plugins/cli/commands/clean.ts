import fs from 'node:fs'

import type { CliPlugin } from '@bronya.js/core'

import type { Api } from '../../../api.js'
import { findSubdirectoriesWithFile } from '../../../utils/directories.js'

/**
 * TODO
 */
export interface CleanCommandOptions {}

export function cleanCommandCliPlugin(api: Api, _rootOptions: CleanCommandOptions = {}): CliPlugin {
  return {
    name: 'api-cli-clean-command-plugin',

    type: 'cli',

    extend(cli) {
      cli.command('clean-api [directory]').action(async (args, _options) => {
        cleanNestedDirectories(args.directory ?? api.config.outDirectory)
      })
    },
  }
}

/**
 * Given a file path, clean all nested directories with the file path.
 */
function cleanNestedDirectories(directoryName: string) {
  findSubdirectoriesWithFile(directoryName).forEach((directory) => {
    fs.rmSync(directory, { recursive: true, force: true })
  })
}
