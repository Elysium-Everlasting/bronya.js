import { CLI } from './cli.js'
import { Command } from './command.js'

/**
 * @param name The program name to display in help and version message.
 */
export function createCLI(name = '') {
  return new CLI(name)
}

export { CLI, Command }

export default createCLI
