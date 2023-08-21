import { type CLI } from '@bronya.js/cli'

import { type App } from '.'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord<T = any> = Record<string, T>

/**
 * A CLI plugin adds commands/options to the initialized CLI instance.
 */
export type CliPlugin = AnyRecord & {
  name: string
  type: 'cli'
  extend?: (app: App, cli: CLI) => unknown
}

/**
 * TODO: add more plugins :^)
 */
export type PlaceholderPlugin = AnyRecord & {
  name: string
  type: 'placeholder'
  extend?: (app: App) => unknown
}

export type Plugin = CliPlugin | PlaceholderPlugin

export function isPlugin(plugin: unknown): plugin is Plugin {
  return typeof plugin === 'object' && plugin !== null && 'name' in plugin && 'type' in plugin
}
