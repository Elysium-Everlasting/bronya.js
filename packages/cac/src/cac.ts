import { EventEmitter } from 'node:events'

import {
  Command,
  GlobalCommand,
  type CommandConfig,
  type HelpCallback,
  type CommandExample,
} from './command.js'
import mri from './mri.js'
import { processArgs } from './node.js'
import type { OptionConfig } from './option.js'
import { getMriOptions, setDotProp, setByType, getFileName, camelcaseOptionName } from './utils.js'

interface ParsedArgv {
  args: readonly string[]
  options: Record<string, unknown>
}

export class CAC extends EventEmitter {
  /**
   * The program name to display in help and version message
   */
  name: string

  /**
   * Every time the {@link Cac.command} method is called, a new {@link Command} instance is created and added.
   */
  commands: Command[] = []

  /**
   * A global command is passed to all created commands in order to share context.
   */
  context: GlobalCommand

  /**
   * The command that matches with the provided CLI arguments.
   */
  matchedCommand?: Command

  /**
   * Because a command can have aliases, this represents the one used by the CLI.
   */
  matchedCommandName?: string

  /**
   * Raw CLI arguments
   */
  rawArgs: string[] = []

  /**
   * Parsed CLI arguments
   */
  args: ParsedArgv['args'] = []

  /**
   * Parsed CLI options, camelCased
   */
  options: ParsedArgv['options'] = {}

  showHelpOnExit?: boolean

  showVersionOnExit?: boolean

  /**
   * @param name The program name to display in help and version message.
   */
  constructor(name = '') {
    super()
    this.name = name
    this.context = new GlobalCommand()
    this.context.usage('<command> [options]')
  }

  /**
   * Add a global usage text.
   *
   * This is not used by sub-commands.
   */
  usage(text: string) {
    this.context.usage(text)
    return this
  }

  /**
   * Add a sub-command
   */
  command<T extends string>(rawName: T, description: string = '', config?: CommandConfig) {
    const command = new Command(rawName, description, config, this.context)

    command.globalCommand = this.context

    this.commands.push(command as Command)

    return command
  }

  /**
   * Add a global CLI option.
   *
   * Which is also applied to sub-commands.
   */
  option(rawName: string, description: string, config?: OptionConfig) {
    this.context.option(rawName, description, config)
    return this
  }

  /**
   * Show help message when `-h, --help` flags appear.
   */
  help(callback?: HelpCallback) {
    this.context.option('-h, --help', 'Display this message')
    this.context.helpCallback = callback
    this.showHelpOnExit = true
    return this
  }

  /**
   * Show version number when `-v, --version` flags appear.
   */
  version(version: string, customFlags = '-v, --version') {
    this.context.version(version, customFlags)
    this.showVersionOnExit = true
    return this
  }

  /**
   * Add a global example.
   *
   * This example added here will not be used by sub-commands.
   */
  example(example: CommandExample) {
    this.context.example(example)
    return this
  }

  /**
   * Output the corresponding help message
   * When a sub-command is matched, output the help message for the command
   * Otherwise output the global one.
   */
  outputHelp() {
    if (this.matchedCommand) {
      this.matchedCommand.outputHelp(this.name, this.commands)
    } else {
      this.context.outputHelp(this.name, this.commands)
    }
  }

  /**
   * Output the version number.
   *
   */
  outputVersion() {
    this.context.outputVersion()
  }

  private setParsedInfo(argv: ParsedArgv, matchedCommand?: Command, matchedCommandName?: string) {
    this.args = argv.args
    this.options = argv.options

    if (matchedCommand) {
      this.matchedCommand = matchedCommand
    }

    if (matchedCommandName) {
      this.matchedCommandName = matchedCommandName
    }

    return this
  }

  unsetMatchedCommand() {
    this.matchedCommand = undefined
    this.matchedCommandName = undefined
  }

  /**
   * Parse argv
   */
  parse(argv = processArgs, { run = true } = {}): ParsedArgv {
    this.rawArgs = argv

    if (!this.name) {
      this.name = (argv[1] ? getFileName(argv[1]) : 'cli') ?? ''
    }

    let shouldContinueParsing = true

    // Search sub-commands
    for (const command of this.commands) {
      const parsed = this.mri(argv.slice(2), command)

      const commandName = parsed.args[0]

      if (commandName == null) {
        continue
      }

      if (command.isMatched(commandName)) {
        shouldContinueParsing = false

        const parsedInfo = {
          ...parsed,
          args: parsed.args.slice(1),
        }

        this.setParsedInfo(parsedInfo, command, commandName)
        this.emit(`command:${commandName}`, command)
      }
    }

    if (shouldContinueParsing) {
      // Search the default command
      for (const command of this.commands) {
        if (command.name === '') {
          shouldContinueParsing = false

          const parsed = this.mri(argv.slice(2), command)

          this.setParsedInfo(parsed, command)
          this.emit(`command:!`, command)
        }
      }
    }

    if (shouldContinueParsing) {
      const parsed = this.mri(argv.slice(2))
      this.setParsedInfo(parsed)
    }

    if (this.options['help'] && this.showHelpOnExit) {
      this.outputHelp()
      run = false
      this.unsetMatchedCommand()
    }

    if (this.options['version'] && this.showVersionOnExit && this.matchedCommandName == null) {
      this.outputVersion()
      run = false
      this.unsetMatchedCommand()
    }

    const parsedArgv = { args: this.args, options: this.options }

    if (run) {
      this.runMatchedCommand()
    }

    if (!this.matchedCommand && this.args[0]) {
      this.emit('command:*')
    }

    return parsedArgv
  }

  private mri(argv: string[], command?: Command): ParsedArgv {
    // All added options
    const cliOptions = [...this.context.options, ...(command ? command.options : [])]

    const mriOptions = getMriOptions(cliOptions)

    // Extract everything after `--` since mri doesn't support it
    let argsAfterDoubleDashes: string[] = []

    const doubleDashesIndex = argv.indexOf('--')

    if (doubleDashesIndex > -1) {
      argsAfterDoubleDashes = argv.slice(doubleDashesIndex + 1)
      argv = argv.slice(0, doubleDashesIndex)
    }

    const parsed = Object.entries(mri(argv, mriOptions)).reduce(
      (mriResult, [name, value]) => {
        mriResult[camelcaseOptionName(name)] = value
        return mriResult
      },
      { _: [] } as Record<string, unknown> & { _: string[] },
    )

    const args = parsed['_']

    const options: Record<string, unknown> = { '--': argsAfterDoubleDashes }

    // Set option default value
    const ignoreDefault =
      command && command.config.ignoreOptionDefaultValue
        ? command.config.ignoreOptionDefaultValue
        : this.context.config.ignoreOptionDefaultValue

    const transforms = Object.create(null)

    for (const cliOption of cliOptions) {
      if (!ignoreDefault && cliOption.config.default != null) {
        for (const name of cliOption.names) {
          options[name] = cliOption.config.default
        }
      }

      // If options type is defined
      if (Array.isArray(cliOption.config.type)) {
        if (transforms[cliOption.name] === undefined) {
          transforms[cliOption.name] = Object.create(null)

          transforms[cliOption.name]['shouldTransform'] = true
          transforms[cliOption.name]['transformFunction'] = cliOption.config.type[0]
        }
      }
    }

    // Set option values (support dot-nested property name)
    for (const key of Object.keys(parsed)) {
      if (key !== '_') {
        const keys = key.split('.')
        setDotProp(options, keys, parsed[key])
        setByType(options, transforms)
      }
    }

    return { args, options }
  }

  runMatchedCommand() {
    const { args, options, matchedCommand: command } = this

    if (!command || !command.commandAction) {
      return
    }

    command.checkUnknownOptions(this.options)

    command.checkOptionValue(this.options)

    command.checkRequiredArgs(this.args)

    const actionArgs: Record<string, unknown> = {}

    command.args.forEach((arg, index) => {
      if (arg.variadic) {
        actionArgs[arg.key] = args.slice(index)
        // actionArgs.push(args.slice(index))
      } else {
        actionArgs[arg.key] = args[index]
        // actionArgs.push(args[index])
      }
    })

    // actionArgs.push(options)

    return command.commandAction.apply(this, [actionArgs, options])
  }
}
