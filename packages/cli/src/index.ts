import { CLI } from './cli.js'
import { Command } from './command.js'

/**
 * @param name The program name to display in help and version message.
 */
const cli = (name = '') => new CLI(name)

export default cli

export { cli, CLI, Command }
