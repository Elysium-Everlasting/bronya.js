import { type CLI } from '@bronya.js/cli'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord<T = any> = Record<string, T>

/**
 * A CLI plugin adds commands/options to the initialized CLI instance.
 *
 * @param Origin is the construct where the plugin originated from.
 */
export type CliPlugin = AnyRecord & {
  name: string
  type: 'cli'
  extend?: (cli: CLI) => unknown
}

/**
 * TODO: add more plugins :^)
 */
export type PlaceholderPlugin = AnyRecord & {
  name: string
  type: 'placeholder'
  extend?: () => unknown
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Plugin = CliPlugin | PlaceholderPlugin

export function isPlugin(plugin: unknown): plugin is Plugin {
  return typeof plugin === 'object' && plugin !== null && 'name' in plugin && 'type' in plugin
}
