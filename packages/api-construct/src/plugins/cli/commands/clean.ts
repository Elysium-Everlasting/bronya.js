import fs from 'node:fs'
import path from 'node:path'

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
        const root = path.join(api.config.root, api.config.directory)
        cleanNestedDirectories(args.directory ?? api.config.outDirectory, root)
      })
    },
  }
}

/**
 * Given a file path, clean all nested directories with the file path.
 */
function cleanNestedDirectories(directoryName: string, root = process.cwd()) {
  findSubdirectoriesWithFile(directoryName, root).forEach((directory) => {
    fs.rmSync(path.join(directory, directoryName), { recursive: true, force: true })
  })
}
