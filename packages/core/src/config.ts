import fs from 'node:fs'
import path from 'node:path'

import { App } from 'aws-cdk-lib/core'
import { CLI_VERSION_ENV } from 'aws-cdk-lib/cx-api'
import createJITI from 'jiti'

import { getClosestProjectDirectory } from './utils/project.js'

const jsExtensions = ['.js', '.mjs', '.cjs']
const tsExtensions = jsExtensions.map((extension) => extension.replace('js', 'ts'))
const extensions = [...jsExtensions, ...tsExtensions]

const configFileNames = ['bronya.config', 'usagi.config']

export const configFiles = extensions.flatMap((extension) =>
  configFileNames.map((name) => `${name}${extension}`),
)

/**
 * TODO: allow alternate config file names.
 */
export function findConfigFile(directory = process.cwd()) {
  const configFile = fs.readdirSync(directory).find((file) => configFiles.includes(file))

  /**
   * TODO: keep looking up the directory tree until we find a config file or the workspace root.
   */
  if (!configFile) {
    return undefined
  } else {
    return path.resolve(directory, configFile)
  }
}

/**
 * TODO: allow alternate config file names.
 */
export async function loadAppFromConfig(
  directory = getClosestProjectDirectory(process.cwd()),
): Promise<App> {
  const configFile = findConfigFile(directory)

  if (!configFile) {
    throw new Error(
      `Could not find ${configFileNames} file. Please create one of ${configFiles.join(', ')}`,
    )
  }

  const jiti = createJITI(configFile)

  const exports = await jiti(configFile)

  /**
   * TODO: more sophisticated/deterministic way of finding the exported entrypoint.
   */
  const maybeApp = await (exports.default?.() ?? exports?.main() ?? exports)

  if (!App.isApp(maybeApp)) {
    throw new Error('Config did not return an instance of a CDK App')
  }

  return maybeApp
}

/**
 * Whether or not the current process is being executed by the CDK CLI.
 * This matters because we don't need to fully synthesize everything when only getting the config
 * for our own operations. But CDK does needs to fully synthesize and validate everything.
 */
export function isCdk() {
  /**
   * When CDK spawns a new process to synthesize the stack,
   * it generates a new "env" object using constants from the cx-api library.
   * We'll just use the presence of a designated env variable to determine if CDK is executing this.
   *
   * @link https://github.com/aws/aws-cdk/blob/c575dded26834bd55618813b74046d2f380d1940/packages/aws-cdk/lib/api/cxapp/exec.ts#L66
   */
  return process.env[CLI_VERSION_ENV] != null
}

/**
 * Type is re-exported
 */
export type { App }
