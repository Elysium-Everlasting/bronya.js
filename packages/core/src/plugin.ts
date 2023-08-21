import { type CLI } from '@bronya.js/cli'

import { type App } from '.'

export type CliPlugin = {
  name: string
  type: 'cli'
  extend?: (app: App, cli: CLI) => unknown
}

/**
 * TODO: add more plugins :^)
 */
export type PlaceholderPlugin = {
  name: string
  type: 'placeholder'
  extend?: (app: App) => unknown
}

export type Plugin = CliPlugin | PlaceholderPlugin

export function isPlugin(plugin: unknown): plugin is Plugin {
  return typeof plugin === 'object' && plugin !== null && 'name' in plugin && 'type' in plugin
}
