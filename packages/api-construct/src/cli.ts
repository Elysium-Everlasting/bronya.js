import { CLI } from '@bronya.js/cli'

export function augmentCli(cli: CLI) {
  cli
    .command('dev-api <name> [project]')
    .option('--port-number-super-epic <port>, -i', 'port to use')
    .option('-h, --host-name <host>', 'host to use')
    .option('-d, --debug', 'debug mode')
    .action(async (args, options) => {
      console.log(args)
      console.log(options)
    })
}
