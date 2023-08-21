import { type CLI } from '@bronya.js/cli'
import type { App } from 'aws-cdk-lib/core'
import type { Construct } from 'constructs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord<T = any> = Record<string, T>

/**
 * A CLI plugin adds commands/options to the initialized CLI instance.
 *
 * @param Origin is the construct where the plugin originated from.
 */
export type CliPlugin<T extends Construct = Construct> = AnyRecord & {
  name: string
  type: 'cli'
  extend?: (origin: T, cli: CLI, app: App) => unknown
}

/**
 * TODO: add more plugins :^)
 */
export type PlaceholderPlugin<T extends Construct = Construct> = AnyRecord & {
  name: string
  type: 'placeholder'
  extend?: (origin: T, app: App) => unknown
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Plugin<T extends Construct = any> = CliPlugin<T> | PlaceholderPlugin<T>

export function isPlugin(plugin: unknown): plugin is Plugin {
  return typeof plugin === 'object' && plugin !== null && 'name' in plugin && 'type' in plugin
}
