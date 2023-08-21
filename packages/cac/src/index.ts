import CAC from './cac.js'
import Command from './command.js'

/**
 * @param name The program name to display in help and version message
 */
const cac = (name = '') => new CAC(name)

export default cac
export { cac, CAC, Command }

const cli = cac()

cli
  .command('build <entry> [...otherFiles]', 'Build your app')
  .option('--foo', 'Foo option')
  .action((args, options) => {
    args
    options
  })

cli.help()

cli.parse()
