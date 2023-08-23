import fs from 'node:fs'

import type { CliPlugin } from '@bronya.js/core'

import type { Api } from '../../../api.js'
import { findSubdirectoriesWithFile } from '../../../utils/directories.js'

/**
 * TODO
 */
export interface CleanCommandOptions {}

export const addCleanCommand = (_rootOptions: CleanCommandOptions = {}) =>
  ((api, cli) => {
    cli.command('clean [directory]').action(async (args, _options) => {
      cleanNestedDirectories(args.directory ?? api.config.outDirectory)
    })
  }) satisfies CliPlugin<Api>['extend']

/**
 * Given a file path, clean all nested directories with the file path.
 */
function cleanNestedDirectories(directoryName: string) {
  findSubdirectoriesWithFile(directoryName).forEach((directory) => {
    fs.rmSync(directory, { recursive: true, force: true })
  })
}
