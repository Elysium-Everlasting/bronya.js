import { EventEmitter } from 'node:events'
import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { Argument, humanReadableArgName, type ArgParser } from './argument.js'
import { CommanderError } from './error.js'
import { Help } from './help.js'
import { Option, splitOptionFlags, DualOptions } from './option.js'
import { suggestSimilar } from './suggestions.js'

interface CommandOptions {
  isDefault?: boolean
  noHelp?: boolean
  hidden?: boolean
  executableFile?: string | null
}

interface OutputConfiguration {
  writeOut: (str: string) => void
  writeErr: (str: string) => void
  getOutHelpWidth: () => void
  getErrHelpWidth: () => void
  outputError: (str: string, write: (str: string) => void) => void
}

type LifecycleHook = 'preAction' | 'postAction' | 'preSubcommand'

type ActionCallback = (thisCommand: string, actionCommand: string) => unknown

type CommandCallback = (thisCommand: string, subCommand: string) => unknown

type HookCallback<T extends LifecycleHook> = T extends 'preSubcommand'
  ? CommandCallback
  : ActionCallback

type ExitCallback = (err: CommanderError) => unknown

/**
 * @example
 *
 * ```ts
 *
 * command('name', 'description')
 * command('name', { ...options })
 * command('name', 'description', { ...options })
 * ```
 */
type CommandArgs = [string?, CommandOptions?] | [CommandOptions?]

export class Command extends EventEmitter {
  commands: Command[] = []

  options: Option[] = []

  parent?: Command | null = null

  _allowUnknownOption = false

  _allowExcessArguments = true

  _args: Argument[] = []

  args: string[] = []

  rawArgs: string[] = []

  processedArgs: string[] = []

  _scriptPath: string | null = null

  _name: string

  _optionValues: Record<string, unknown> = {}

  _optionValueSources: Record<string, string> = {}

  _storeOptionsAsProperties = false

  _actionHandler: ((...args: unknown[]) => unknown) | null = null

  _executableHandler = false

  _executableFile: string | null = null

  _executableDir: string | null = null

  _defaultCommandName: string | null = null

  _exitCallback?: ExitCallback

  _aliases: string[] = []

  _combineFlagAndOptionalValue = true

  _description = ''

  _summary = ''

  _argsDescription: string | undefined = undefined

  _enablePositionalOptions = false

  _passThroughOptions = false

  _lifeCycleHooks: Record<string, (ActionCallback | CommandCallback)[]> = {}

  _showHelpAfterError: boolean | string = false

  _showSuggestionAfterError = true

  _outputConfiguration: OutputConfiguration = {
    writeOut: (str) => process.stdout.write(str),
    writeErr: (str) => process.stderr.write(str),
    getOutHelpWidth: () => (process.stdout.isTTY ? process.stdout.columns : undefined),
    getErrHelpWidth: () => (process.stderr.isTTY ? process.stderr.columns : undefined),
    outputError: (str, write) => write(str),
  }

  _hidden = false

  _hasHelpOption = true

  _helpFlags = '-h, --help'

  _helpDescription = 'display help for command'

  _helpShortFlag = '-h'

  _helpLongFlag = '--help'

  _addImplicitHelpCommand: boolean | undefined = undefined

  _helpCommandName: string | undefined = 'help'

  _helpCommandnameAndArgs = 'help [command]'

  _helpCommandDescription = 'display help for command'

  _helpConfiguration: Partial<Help> = {}

  /**
   * Initialize a new `Command`.
   */
  constructor(name?: string) {
    super()
    this._name = name || ''
  }

  /**
   * Copy settings that are useful to have in common across root command and subcommands.
   *
   * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
   */
  copyInheritedSettings(sourceCommand: Command): this {
    this._outputConfiguration = sourceCommand._outputConfiguration
    this._hasHelpOption = sourceCommand._hasHelpOption
    this._helpFlags = sourceCommand._helpFlags
    this._helpDescription = sourceCommand._helpDescription
    this._helpShortFlag = sourceCommand._helpShortFlag
    this._helpLongFlag = sourceCommand._helpLongFlag
    this._helpCommandName = sourceCommand._helpCommandName
    this._helpCommandnameAndArgs = sourceCommand._helpCommandnameAndArgs
    this._helpCommandDescription = sourceCommand._helpCommandDescription
    this._helpConfiguration = sourceCommand._helpConfiguration
    this._exitCallback = sourceCommand._exitCallback
    this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties
    this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue
    this._allowExcessArguments = sourceCommand._allowExcessArguments
    this._enablePositionalOptions = sourceCommand._enablePositionalOptions
    this._showHelpAfterError = sourceCommand._showHelpAfterError
    this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError

    return this
  }

  /**
   * Define a command.
   *
   * There are two styles of command: pay attention to where to put the description.
   *
   * @example
   *
   * ```ts
   * // Command implemented using action handler (description is supplied separately to `.command`)
   * program
   *   .command('clone <source> [destination]')
   *   .description('clone a repository into a newly created directory')
   *   .action((source, destination) => {
   *     console.log('clone command called');
   *   });
   *
   * // Command implemented using separate executable file (description is second parameter to `.command`)
   * program
   *   .command('start <service>', 'start named service')
   *   .command('stop [service]', 'stop named service, or all if no name supplied');
   *
   * ```
   *
   * @param nameAndArgs Command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
   * @param actionOptsOrExecDesc Configuration options (for action), or description (for executable)
   * @param execOpts Configuration options (for executable).
   *
   * @returns New command for action handler, or `this` for executable command.
   */
  command(nameAndArgs: string, ...restArgs: CommandArgs): Command {
    const description = typeof restArgs[0] === 'string' ? restArgs[0] : undefined

    const options = restArgs[0] && typeof restArgs[0] === 'object' ? restArgs[0] : restArgs[1] || {}

    const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/) ?? []

    const command = this.createCommand(name)

    if (description) {
      command.description(description)
      command._executableHandler = true
    }

    if (options.isDefault) {
      this._defaultCommandName = command._name
    }

    // noHelp is deprecated old name for hidden
    command._hidden = Boolean(options.noHelp || options.hidden)

    // Custom name for executable file, set missing to null to match constructor
    command._executableFile = options.executableFile || null

    if (args) {
      command.arguments(args)
    }

    this.commands.push(command)

    command.parent = this

    command.copyInheritedSettings(this)

    if (description) {
      return this
    }

    return command
  }

  /**
   * Factory routine to create a new unattached command.
   *
   * See .command() for creating an attached subcommand, which uses this routine to
   * create the command. You can override createCommand to customise subcommands.
   */
  createCommand(name?: string): Command {
    return new Command(name)
  }

  /**
   * You can customise the help with a subclass of Help by overriding createHelp,
   * or by overriding Help properties using configureHelp().
   */
  createHelp(): Help {
    return Object.assign(new Help(), this.configureHelp())
  }

  /**
   * You can customise the help by overriding Help properties using configureHelp(),
   * or with a subclass of Help by overriding createHelp().
   *
   * @param configuration Configuration options.
   * @returns `this` command for chaining, or stored configuration.
   */
  configureHelp(configuration?: Partial<Help>): Command | Object {
    if (configuration == null) {
      return this._helpConfiguration
    }

    this._helpConfiguration = configuration

    return this
  }

  /**
   * The default output goes to stdout and stderr. You can customise this for special applications.
   * You can also customize the display of errors by overriding outputError.
   *
   * The configuration properties are all functions:
   *
   * ```ts
   *  // functions to change where being written, stdout and stderr
   *  writeOut(str)
   *  writeErr(str)
   *
   *  // matching functions to specify width for wrapping help
   *  getOutHelpWidth()
   *  getErrHelpWidth()
   *
   *  // functions based on what is being written out
   *  outputError(str, write) // used for displaying errors, and not used for displaying help
   * ```
   *
   * @param configuration Configuration options.
   * @returns `this` command for chaining, or stored configuration.
   */
  configureOutput(configuration?: Partial<OutputConfiguration>): Command | Object {
    if (configuration == null) {
      return this._outputConfiguration
    }

    Object.assign(this._outputConfiguration, configuration)

    return this
  }

  /**
   * Display the help or a custom message after an error occurs.
   */
  showHelpAfterError(displayHelp: boolean | string = true): Command {
    this._showHelpAfterError = typeof displayHelp !== 'string' ? Boolean(displayHelp) : displayHelp
    return this
  }

  /**
   * Display suggestion of similar commands for unknown commands, or options for unknown options.
   */
  showSuggestionAfterError(displaySuggestion = true): Command {
    this._showSuggestionAfterError = Boolean(displaySuggestion)
    return this
  }

  /**
   * Add a prepared subcommand.
   *
   * See .command() for creating an attached subcommand which inherits settings from its parent.
   */
  addCommand(cmd: Command, opts: CommandOptions = {}): Command {
    if (cmd._name == null) {
      throw new Error(
        'Command passed to .addCommand() must have a name\n' +
        '- specify the name in Command constructor or using .name()',
      )
    }

    if (opts.isDefault) {
      this._defaultCommandName = cmd._name
    }

    if (opts.noHelp || opts.hidden) {
      // modifying passed command due to existing implementation
      cmd._hidden = true
    }

    this.commands.push(cmd)

    cmd.parent = this

    return this
  }

  /**
   * Factory routine to create a new unattached argument.
   *
   * See .argument() for creating an attached argument, which uses this routine to
   * create the argument. You can override createArgument to return a custom argument.
   */
  createArgument(name: string, description?: string): Argument {
    return new Argument(name, description)
  }

  /**
   * Define argument syntax for command.
   *
   * The default is that the argument is required, and you can explicitly
   * indicate this with <> around the name. Put [] around the name for an optional argument.
   *
   * @example
   * program.argument('<input-file>');
   * program.argument('[output-file]');
   *
   * @param {string} name
   * @param {string} [description]
   * @param {Function|*} [fn] - custom argument processing function
   * @param {*} [defaultValue]
   * @return {Command} `this` command for chaining
   */
  argument(
    name: string,
    description?: string,
    fn?: ArgParser,
    defaultValue?: ReturnType<ArgParser>,
  ): Command {
    const argument = this.createArgument(name, description)

    if (typeof fn === 'function') {
      argument.default(defaultValue).argParser(fn)
    } else {
      argument.default(fn)
    }

    this.addArgument(argument)

    return this
  }

  /**
   * Define argument syntax for command, adding multiple at once (without descriptions).
   *
   * See also .argument().
   *
   * @example
   * program.arguments('<cmd> [env]');
   *
   * @param {string} names
   * @return {Command} `this` command for chaining
   */
  arguments(names: string): Command {
    names
      .trim()
      .split(/ +/)
      .forEach((detail) => {
        this.argument(detail)
      })
    return this
  }

  /**
   * Define argument syntax for command, adding a prepared argument.
   *
   * @param {Argument} argument
   * @return {Command} `this` command for chaining
   */
  addArgument(argument: Argument): Command {
    const previousArgument = this._args.slice(-1)[0]

    if (previousArgument && previousArgument.variadic) {
      throw new Error(`only the last argument can be variadic '${previousArgument.name()}'`)
    }

    if (
      argument.required &&
      argument.defaultValue !== undefined &&
      argument.parseArg === undefined
    ) {
      throw new Error(`a default value for a required argument is never used: '${argument.name()}'`)
    }

    this._args.push(argument)

    return this
  }

  /**
   * Override default decision whether to add implicit help command.
   *
   * ```ts
   *  addHelpCommand() // force on
   *  addHelpCommand(false); // force off
   *  addHelpCommand('help [cmd]', 'display help for [cmd]'); // force on with custom details
   * ```
   */
  addHelpCommand(enableOrNameAndArgs: boolean | string, description?: string): Command {
    if (enableOrNameAndArgs === false) {
      this._addImplicitHelpCommand = false
      return this
    }

    this._addImplicitHelpCommand = true

    if (typeof enableOrNameAndArgs === 'string') {
      this._helpCommandName = enableOrNameAndArgs.split(' ')[0]
      this._helpCommandnameAndArgs = enableOrNameAndArgs
    }

    this._helpCommandDescription = description || this._helpCommandDescription

    return this
  }

  /**
   * @internal
   */
  _hasImplicitHelpCommand(): boolean {
    return this._addImplicitHelpCommand
      ? this._addImplicitHelpCommand
      : Boolean(this.commands.length) && !this._actionHandler && !this._findCommand('help')
  }

  /**
   * Add hook for life cycle event.
   *
   * @param {string} event
   * @param {Function} listener
   * @return {Command} `this` command for chaining
   */
  hook<T extends LifecycleHook>(event: T, listener: HookCallback<T>): Command {
    const allowedValues = ['preSubcommand', 'preAction', 'postAction']

    if (!allowedValues.includes(event)) {
      throw new Error(
        `Unexpected value for event passed to hook : '${event}'.\n` +
        `Expecting one of '${allowedValues.join("', '")}'`,
      )
    }

    this._lifeCycleHooks[event] ??= []
    this._lifeCycleHooks[event]?.push(listener)

    return this
  }

  /**
   * Register callback to use as replacement for calling process.exit.
   *
   * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
   * @return {Command} `this` command for chaining
   */
  exitOverride(fn?: ExitCallback): Command {
    if (fn) {
      this._exitCallback = fn
      return this
    }

    this._exitCallback = (err) => {
      if (err.code !== 'commander.executeSubCommandAsync') {
        throw err
      } else {
        // Async callback from spawn events, not useful to throw.
      }
    }

    return this
  }

  /**
   * Call process.exit, and _exitCallback if defined.
   *
   * @param {number} exitCode exit code for using with process.exit
   * @param {string} code an id string representing the error
   * @param {string} message human-readable description of the error
   * @return never
   * @internal
   */
  _exit(exitCode: number, code: string, message: string): never {
    this._exitCallback?.(new CommanderError(exitCode, code, message))
    process.exit(exitCode)
  }

  /**
   * Register callback `fn` for the command.
   *
   * @example
   *
   * ```ts
   * program
   *   .command('serve')
   *   .description('start service')
   *   .action(function() {
   *      // do work here
   *   });
   * ```
   *
   * @param {Function} fn
   * @return {Command} `this` command for chaining
   */
  action(fn: Function): Command {
    const listener = (args) => {
      // The .action callback takes an extra parameter which is the command or options.
      const expectedArgsCount = this._args.length

      const actionArgs = args.slice(0, expectedArgsCount)

      if (this._storeOptionsAsProperties) {
        actionArgs[expectedArgsCount] = this // backwards compatible "options"
      } else {
        actionArgs[expectedArgsCount] = this.opts()
      }

      actionArgs.push(this)

      return fn.apply(this, actionArgs)
    }

    this._actionHandler = listener

    return this
  }

  /**
   * Factory routine to create a new unattached option.
   *
   * See .option() for creating an attached option, which uses this routine to
   * create the option. You can override createOption to return a custom option.
   *
   * @param {string} flags
   * @param {string} description
   * @return {Option} new option
   */
  createOption(flags: string, description?: string): Option {
    return new Option(flags, description)
  }

  /**
   * Add an option.
   *
   * @param {Option} option
   * @return {Command} `this` command for chaining
   */
  addOption(option: Option): Command {
    const oname = option.name()

    const name = option.attributeName()

    // store default value
    if (option.negate) {
      // --no-foo is special and defaults foo to true, unless a --foo option is already defined
      const positiveLongFlag = option.long.replace(/^--no-/, '--')

      if (!this._findOption(positiveLongFlag)) {
        this.setOptionValueWithSource(
          name,
          option.defaultValue === undefined ? true : option.defaultValue,
          'default',
        )
      }
    } else if (option.defaultValue !== undefined) {
      this.setOptionValueWithSource(name, option.defaultValue, 'default')
    }

    // register the option
    this.options.push(option)

    // handler for cli and env supplied values
    const handleOptionValue = (val, invalidValueMessage, valueSource) => {
      // val is null for optional option used without an optional-argument.
      // val is undefined for boolean and negated option.
      if (val == null && option.presetArg !== undefined) {
        val = option.presetArg
      }

      // custom processing
      const oldValue = this.getOptionValue(name)

      if (val !== null && option.parseArg) {
        try {
          val = option.parseArg(val, oldValue)
        } catch (err) {
          if (err.code === 'commander.invalidArgument') {
            const message = `${invalidValueMessage} ${err.message}`
            this.error(message, { exitCode: err.exitCode, code: err.code })
          }
          throw err
        }
      } else if (val !== null && option.variadic) {
        val = option._concatValue(val, oldValue)
      }

      // Fill-in appropriate missing values. Long winded but easy to follow.
      if (val == null) {
        if (option.negate) {
          val = false
        } else if (option.isBoolean() || option.optional) {
          val = true
        } else {
          val = '' // not normal, parseArg might have failed or be a mock function for testing
        }
      }

      this.setOptionValueWithSource(name, val, valueSource)
    }

    this.on('option:' + oname, (val) => {
      const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`
      handleOptionValue(val, invalidValueMessage, 'cli')
    })

    if (option.envVar) {
      this.on('optionEnv:' + oname, (val) => {
        const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`
        handleOptionValue(val, invalidValueMessage, 'env')
      })
    }

    return this
  }

  /**
   * Internal implementation shared by .option() and .requiredOption()
   *
   * @internal
   */
  _optionEx(config, flags, description, fn, defaultValue) {
    if (typeof flags === 'object' && flags instanceof Option) {
      throw new Error(
        'To add an Option object use addOption() instead of option() or requiredOption()',
      )
    }
    const option = this.createOption(flags, description)
    option.makeOptionMandatory(!!config.mandatory)

    if (typeof fn === 'function') {
      option.default(defaultValue).argParser(fn)
    } else if (fn instanceof RegExp) {
      // deprecated
      const regex = fn
      fn = (val, def) => {
        const m = regex.exec(val)
        return m ? m[0] : def
      }
      option.default(defaultValue).argParser(fn)
    } else {
      option.default(fn)
    }

    return this.addOption(option)
  }

  /**
   * Define option with `flags`, `description` and optional
   * coercion `fn`.
   *
   * The `flags` string contains the short and/or long flags,
   * separated by comma, a pipe or space. The following are all valid
   * all will output this way when `--help` is used.
   *
   *     "-p, --pepper"
   *     "-p|--pepper"
   *     "-p --pepper"
   *
   * @example
   * // simple boolean defaulting to undefined
   * program.option('-p, --pepper', 'add pepper');
   *
   * program.pepper
   * // => undefined
   *
   * --pepper
   * program.pepper
   * // => true
   *
   * // simple boolean defaulting to true (unless non-negated option is also defined)
   * program.option('-C, --no-cheese', 'remove cheese');
   *
   * program.cheese
   * // => true
   *
   * --no-cheese
   * program.cheese
   * // => false
   *
   * // required argument
   * program.option('-C, --chdir <path>', 'change the working directory');
   *
   * --chdir /tmp
   * program.chdir
   * // => "/tmp"
   *
   * // optional argument
   * program.option('-c, --cheese [type]', 'add cheese [marble]');
   *
   * @param {string} flags
   * @param {string} [description]
   * @param {Function|*} [fn] - custom option processing function or default value
   * @param {*} [defaultValue]
   * @return {Command} `this` command for chaining
   */
  option(flags: string, description?: string, fn?: Function, defaultValue?: any): Command {
    return this._optionEx({}, flags, description, fn, defaultValue)
  }

  /**
   * Add a required option which must have a value after parsing. This usually means
   * the option must be specified on the command line. (Otherwise the same as .option().)
   *
   * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
   *
   * @param {string} flags
   * @param {string} [description]
   * @param {Function|*} [fn] - custom option processing function or default value
   * @param {*} [defaultValue]
   * @return {Command} `this` command for chaining
   */
  requiredOption(flags: string, description?: string, fn?: Function, defaultValue?: any): Command {
    return this._optionEx({ mandatory: true }, flags, description, fn, defaultValue)
  }

  /**
   * Alter parsing of short flags with optional values.
   *
   * @example
   * // for `.option('-f,--flag [value]'):
   * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
   * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
   *
   * @param combine If `true` or omitted, an optional value can be specified directly after the flag.
   */
  combineFlagAndOptionalValue(combine = true): Command {
    this._combineFlagAndOptionalValue = Boolean(combine)
    return this
  }

  /**
   * Allow unknown options on the command line.
   *
   * @param allowUnknown=true If `true` or omitted, no error will be thrown for unknown options.
   */
  allowUnknownOption(allowUnknown = true) {
    this._allowUnknownOption = Boolean(allowUnknown)
    return this
  }

  /**
   * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
   *
   * @param allowExcess If `true` or omitted, no error will be thrown for excess arguments.
   */
  allowExcessArguments(allowExcess = true) {
    this._allowExcessArguments = Boolean(allowExcess)
    return this
  }

  /**
   * Enable positional options. Positional means global options are specified before subcommands which lets
   * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
   * The default behaviour is non-positional and global options may appear anywhere on the command line.
   */
  enablePositionalOptions(positional = true) {
    this._enablePositionalOptions = Boolean(positional)
    return this
  }

  /**
   * Pass through options that come after command-arguments rather than treat them as command-options,
   * so actual command-options come before command-arguments. Turning this on for a subcommand requires
   * positional options to have been enabled on the program (parent commands).
   * The default behaviour is non-positional and options may appear before or after command-arguments.
   */
  passThroughOptions(passThrough = true) {
    this._passThroughOptions = Boolean(passThrough)

    if (!!this.parent && passThrough && !this.parent._enablePositionalOptions) {
      throw new Error(
        'passThroughOptions can not be used without turning on enablePositionalOptions for parent command(s)',
      )
    }

    return this
  }

  /**
   * Whether to store option values as properties on command object,
   * or store separately (specify false). In both cases the option values can be accessed using .opts().
   */
  storeOptionsAsProperties(storeAsProperties = true): Command {
    this._storeOptionsAsProperties = Boolean(storeAsProperties)

    if (this.options.length) {
      throw new Error('call .storeOptionsAsProperties() before adding options')
    }

    return this
  }

  /**
   * Retrieve option value.
   */
  getOptionValue(key: string): Object {
    return this._storeOptionsAsProperties ? this[key] : this._optionValues[key]
  }

  /**
   * Store option value.
   */
  setOptionValue(key: string, value: Object): Command {
    return this.setOptionValueWithSource(key, value, undefined)
  }

  /**
   * Store option value and where the value came from.
   *
   * @param {string} key
   * @param {Object} value
   * @param {string} source - expected values are default/config/env/cli/implied
   * @return {Command} `this` command for chaining
   */
  setOptionValueWithSource(key: string, value: Object, source?: string): Command {
    if (this._storeOptionsAsProperties) {
      this[key] = value
    } else {
      this._optionValues[key] = value
    }

    this._optionValueSources[key] = source

    return this
  }

  /**
   * Get source of option value.
   * Expected values are default | config | env | cli | implied
   */
  getOptionValueSource(key: string): string {
    return this._optionValueSources[key]
  }

  /**
   * Get source of option value. See also .optsWithGlobals().
   * Expected values are default | config | env | cli | implied
   */
  getOptionValueSourceWithGlobals(key: string): string {
    // global overwrites local, like optsWithGlobals
    const command = getCommandAndParents(this).findLast(
      (cmd) => cmd.getOptionValueSource(key) !== undefined,
    )

    return command?.getOptionValueSource(key)
  }

  /**
   * Get user arguments from implied or explicit arguments.
   * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
   *
   * @internal
   */
  _prepareUserArgs(argv, parseOptions: Object = {}) {
    if (argv !== undefined && !Array.isArray(argv)) {
      throw new Error('first parameter to parse must be array or undefined')
    }

    // Default to using process.argv
    if (argv === undefined) {
      argv = process.argv

      if (process.versions && process.versions['electron']) {
        parseOptions.from = 'electron'
      }
    }

    this.rawArgs = argv.slice()

    // make it a little easier for callers by supporting various argv conventions
    let userArgs

    switch (parseOptions.from) {
      case undefined:

      case 'node':
        this._scriptPath = argv[1]
        userArgs = argv.slice(2)
        break

      case 'electron':
        // @ts-ignore: unknown property
        if (process.defaultApp) {
          this._scriptPath = argv[1]
          userArgs = argv.slice(2)
        } else {
          userArgs = argv.slice(1)
        }
        break

      case 'user':
        userArgs = argv.slice(0)
        break

      default:
        throw new Error(`unexpected parse option { from: '${parseOptions.from}' }`)
    }

    // Find default name for program from arguments.
    if (!this._name && this._scriptPath) {
      this.nameFromFilename(this._scriptPath)
    }

    this._name ||= 'program'

    return userArgs
  }

  /**
   * Parse `argv`, setting options and invoking commands when defined.
   *
   * The default expectation is that the arguments are from node and have the application as argv[0]
   * and the script being run in argv[1], with user parameters after that.
   *
   * @example
   * program.parse(process.argv);
   * program.parse(); // implicitly use process.argv and auto-detect node vs electron conventions
   * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
   *
   * @param {string[]} [argv] - optional, defaults to process.argv
   * @param {Object} [parseOptions] - optionally specify style of options with from: node/user/electron
   * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
   * @return {Command} `this` command for chaining
   */
  parse(argv: string[], parseOptions: Object): Command {
    const userArgs = this._prepareUserArgs(argv, parseOptions)
    this._parseCommand([], userArgs)
    return this
  }

  /**
   * Parse `argv`, setting options and invoking commands when defined.
   *
   * Use parseAsync instead of parse if any of your action handlers are async. Returns a Promise.
   *
   * The default expectation is that the arguments are from node and have the application as argv[0]
   * and the script being run in argv[1], with user parameters after that.
   *
   * @example
   * await program.parseAsync(process.argv);
   * await program.parseAsync(); // implicitly use process.argv and auto-detect node vs electron conventions
   * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
   *
   * @param {string[]} [argv]
   * @param {Object} [parseOptions]
   * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
   * @return {Promise}
   */
  async parseAsync(argv: string[], parseOptions: Object): Promise<any> {
    const userArgs = this._prepareUserArgs(argv, parseOptions)

    await this._parseCommand([], userArgs)

    return this
  }

  /**
   * Execute a sub-command executable.
   *
   * @internal
   */
  _executeSubCommand(subcommand, args) {
    args = args.slice()

    let launchWithNode = false // Use node for source targets so do not need to get permissions correct, and on Windows.

    const sourceExt = ['.js', '.ts', '.tsx', '.mjs', '.cjs']

    function findFile(baseDir, baseName) {
      // Look for specified file
      const localBin = path.resolve(baseDir, baseName)

      if (fs.existsSync(localBin)) {
        return localBin
      }

      // Stop looking if candidate already has an expected extension.
      if (sourceExt.includes(path.extname(baseName))) return undefined

      // Try all the extensions.
      const foundExt = sourceExt.find((ext) => fs.existsSync(`${localBin}${ext}`))

      if (foundExt) {
        return `${localBin}${foundExt}`
      }

      return undefined
    }

    // Not checking for help first. Unlikely to have mandatory and executable, and can't robustly test for help flags in external command.
    this._checkForMissingMandatoryOptions()

    this._checkForConflictingOptions()

    // executableFile and executableDir might be full path, or just a name
    let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`

    let executableDir = this._executableDir || ''

    if (this._scriptPath) {
      let resolvedScriptPath // resolve possible symlink for installed npm binary

      try {
        resolvedScriptPath = fs.realpathSync(this._scriptPath)
      } catch (err) {
        resolvedScriptPath = this._scriptPath
      }

      executableDir = path.resolve(path.dirname(resolvedScriptPath), executableDir)
    }

    // Look for a local file in preference to a command in PATH.
    if (executableDir) {
      let localFile = findFile(executableDir, executableFile)

      // Legacy search using prefix of script name instead of command name
      if (!localFile && !subcommand._executableFile && this._scriptPath) {
        const legacyName = path.basename(this._scriptPath, path.extname(this._scriptPath))

        if (legacyName !== this._name) {
          localFile = findFile(executableDir, `${legacyName}-${subcommand._name}`)
        }
      }
      executableFile = localFile || executableFile
    }

    launchWithNode = sourceExt.includes(path.extname(executableFile))

    let proc

    if (process.platform !== 'win32') {
      if (launchWithNode) {
        args.unshift(executableFile)
        // add executable arguments to spawn
        args = incrementNodeInspectorPort(process.execArgv).concat(args)

        proc = childProcess.spawn(process.argv[0], args, { stdio: 'inherit' })
      } else {
        proc = childProcess.spawn(executableFile, args, { stdio: 'inherit' })
      }
    } else {
      args.unshift(executableFile)

      // add executable arguments to spawn
      args = incrementNodeInspectorPort(process.execArgv).concat(args)

      proc = childProcess.spawn(process.execPath, args, { stdio: 'inherit' })
    }

    if (!proc.killed) {
      // testing mainly to avoid leak warnings during unit tests with mocked spawn
      const signals = ['SIGUSR1', 'SIGUSR2', 'SIGTERM', 'SIGINT', 'SIGHUP']

      signals.forEach((signal) => {
        process.on(signal, () => {
          if (proc.killed === false && proc.exitCode === null) {
            proc.kill(signal)
          }
        })
      })
    }

    // By default terminate process when spawned process terminates.
    // Suppressing the exit if exitCallback defined is a bit messy and of limited use, but does allow process to stay running!
    const exitCallback = this._exitCallback

    if (!exitCallback) {
      proc.on('close', process.exit.bind(process))
    } else {
      proc.on('close', () => {
        exitCallback(
          new CommanderError(process.exitCode || 0, 'commander.executeSubCommandAsync', '(close)'),
        )
      })
    }

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        const executableDirMessage = executableDir
          ? `searched for local subcommand relative to directory '${executableDir}'`
          : 'no directory for search for local subcommand, use .executableDir() to supply a custom directory'

        const executableMissing =
          `'${executableFile}' does not exist\n` +
          `- if '${subcommand._name}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead\n` +
          `- if the default executable name is not suitable, use the executableFile option to supply a custom name or path\n` +
          `- ${executableDirMessage}`

        throw new Error(executableMissing)
      } else if (err.code === 'EACCES') {
        throw new Error(`'${executableFile}' not executable`)
      }

      if (!exitCallback) {
        process.exit(1)
      } else {
        const wrappedError = new CommanderError(1, 'commander.executeSubCommandAsync', '(error)')

        wrappedError.nestedError = err

        exitCallback(wrappedError)
      }
    })

    // Store the reference to the child process
    this.runningCommand = proc
  }

  /**
   * @internal
   */
  _dispatchSubcommand(commandName, operands, unknown) {
    const subCommand = this._findCommand(commandName)

    if (!subCommand) {
      this.help({ error: true })
    }

    let hookResult

    hookResult = this._chainOrCallSubCommandHook(hookResult, subCommand, 'preSubcommand')

    hookResult = this._chainOrCall(hookResult, () => {
      if (subCommand._executableHandler) {
        this._executeSubCommand(subCommand, operands.concat(unknown))
      } else {
        return subCommand._parseCommand(operands, unknown)
      }
    })

    return hookResult
  }

  /**
   * Invoke help directly if possible, or dispatch if necessary.
   * e.g. help foo
   *
   * @internal
   */
  _dispatchHelpCommand(subcommandName) {
    if (!subcommandName) {
      this.help()
    }

    const subCommand = this._findCommand(subcommandName)

    if (subCommand && !subCommand._executableHandler) {
      subCommand.help()
    }

    // Fallback to parsing the help flag to invoke the help.
    return this._dispatchSubcommand(subcommandName, [], [this._helpLongFlag])
  }

  /**
   * Check this.args against expected this._args.
   *
   * @internal
   */
  _checkNumberOfArguments() {
    // too few
    this._args.forEach((arg, i) => {
      if (arg.required && this.args[i] == null) {
        this.missingArgument(arg.name())
      }
    })

    // too many
    if (this._args.length > 0 && this._args[this._args.length - 1].variadic) {
      return
    }

    if (this.args.length > this._args.length) {
      this._excessArguments(this.args)
    }
  }

  /**
   * Process this.args using this._args and save as this.processedArgs!
   *
   * @internal
   */
  _processArguments() {
    const myParseArg = (argument, value, previous) => {
      // Extra processing for nice error message on parsing failure.
      let parsedValue = value

      if (value !== null && argument.parseArg) {
        try {
          parsedValue = argument.parseArg(value, previous)
        } catch (err) {
          if (err.code === 'commander.invalidArgument') {
            const message = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'. ${err.message
              }`
            this.error(message, { exitCode: err.exitCode, code: err.code })
          }
          throw err
        }
      }

      return parsedValue
    }

    this._checkNumberOfArguments()

    const processedArgs = []

    this._args.forEach((declaredArg, index) => {
      let value = declaredArg.defaultValue

      if (declaredArg.variadic) {
        // Collect together remaining arguments for passing together as an array.
        if (index < this.args.length) {
          value = this.args.slice(index)
          if (declaredArg.parseArg) {
            value = value.reduce((processed, v) => {
              return myParseArg(declaredArg, v, processed)
            }, declaredArg.defaultValue)
          }
        } else if (value === undefined) {
          value = []
        }
      } else if (index < this.args.length) {
        value = this.args[index]

        if (declaredArg.parseArg) {
          value = myParseArg(declaredArg, value, declaredArg.defaultValue)
        }
      }
      processedArgs[index] = value
    })

    this.processedArgs = processedArgs
  }

  /**
   * Once we have a promise we chain, but call synchronously until then.
   *
   * @param {Promise|undefined} promise
   * @param {Function} fn
   * @return {Promise|undefined}
   *
   * @internal
   */
  _chainOrCall(promise: Promise<any> | undefined, fn: Function): Promise<any> | undefined {
    return promise instanceof Promise && typeof promise.then === 'function'
      ? promise.then(() => fn())
      : fn()
  }

  /**
   *
   * @param {Promise|undefined} promise
   * @param {string} event
   * @return {Promise|undefined}
   * @api private
   */
  _chainOrCallHooks(promise: Promise<any> | undefined, event: string): Promise<any> | undefined {
    let result = promise

    const hooks = []

    getCommandAndParents(this)
      .reverse()
      .filter((cmd) => cmd._lifeCycleHooks[event] !== undefined)
      .forEach((hookedCommand) => {
        hookedCommand._lifeCycleHooks[event].forEach((callback) => {
          hooks.push({ hookedCommand, callback })
        })
      })

    if (event === 'postAction') {
      hooks.reverse()
    }

    hooks.forEach((hookDetail) => {
      result = this._chainOrCall(result, () => {
        return hookDetail.callback(hookDetail.hookedCommand, this)
      })
    })

    return result
  }

  /**
   * @param {Promise|undefined} promise
   * @param {Command} subCommand
   * @param {string} event
   * @return {Promise|undefined}
   *
   * @internal
   */
  _chainOrCallSubCommandHook(
    promise: Promise<any> | undefined,
    subCommand: Command,
    event: string,
  ): Promise<any> | undefined {
    let result = promise

    this._lifeCycleHooks[event]?.forEach((hook) => {
      result = this._chainOrCall(result, () => {
        return hook(this, subCommand)
      })
    })

    return result
  }

  /**
   * Process arguments in context of this command.
   * Returns action result, in case it is a promise.
   *
   * @internal
   */
  _parseCommand(operands, unknown) {
    const parsed = this.parseOptions(unknown)

    this._parseOptionsEnv() // after cli, so parseArg not called on both cli and env

    this._parseOptionsImplied()

    operands = operands.concat(parsed.operands)

    unknown = parsed.unknown

    this.args = operands.concat(unknown)

    if (operands && this._findCommand(operands[0])) {
      return this._dispatchSubcommand(operands[0], operands.slice(1), unknown)
    }

    if (this._hasImplicitHelpCommand() && operands[0] === this._helpCommandName) {
      return this._dispatchHelpCommand(operands[1])
    }

    if (this._defaultCommandName) {
      outputHelpIfRequested(this, unknown) // Run the help for default command from parent rather than passing to default command
      return this._dispatchSubcommand(this._defaultCommandName, operands, unknown)
    }

    if (
      this.commands.length &&
      this.args.length === 0 &&
      !this._actionHandler &&
      !this._defaultCommandName
    ) {
      // probably missing subcommand and no handler, user needs help (and exit)
      this.help({ error: true })
    }

    outputHelpIfRequested(this, parsed.unknown)

    this._checkForMissingMandatoryOptions()

    this._checkForConflictingOptions()

    // We do not always call this check to avoid masking a "better" error, like unknown command.
    const checkForUnknownOptions = () => {
      if (parsed.unknown.length > 0) {
        this.unknownOption(parsed.unknown[0])
      }
    }

    const commandEvent = `command:${this.name()}`

    if (this._actionHandler) {
      checkForUnknownOptions()

      this._processArguments()

      let actionResult

      actionResult = this._chainOrCallHooks(actionResult, 'preAction')

      actionResult = this._chainOrCall(actionResult, () => this._actionHandler(this.processedArgs))

      if (this.parent) {
        actionResult = this._chainOrCall(actionResult, () => {
          this.parent.emit(commandEvent, operands, unknown) // legacy
        })
      }
      actionResult = this._chainOrCallHooks(actionResult, 'postAction')
      return actionResult
    }

    if (this.parent && this.parent.listenerCount(commandEvent)) {
      checkForUnknownOptions()

      this._processArguments()

      this.parent.emit(commandEvent, operands, unknown) // legacy
    } else if (operands.length) {
      if (this._findCommand('*')) {
        // legacy default command
        return this._dispatchSubcommand('*', operands, unknown)
      }

      if (this.listenerCount('command:*')) {
        // skip option check, emit event for possible misspelling suggestion
        this.emit('command:*', operands, unknown)
      } else if (this.commands.length) {
        this.unknownCommand()
      } else {
        checkForUnknownOptions()
        this._processArguments()
      }
    } else if (this.commands.length) {
      checkForUnknownOptions()

      // This command has subcommands and nothing hooked up at this level, so display help (and exit).
      this.help({ error: true })
    } else {
      checkForUnknownOptions()

      this._processArguments()
      // fall through for caller to handle after calling .parse()
    }
  }

  /**
   * Find matching command.
   *
   * @internal
   */
  _findCommand(name?: string) {
    return name
      ? this.commands.find((cmd) => cmd._name === name || cmd._aliases.includes(name))
      : undefined
  }

  /**
   * Return an option matching `arg` if any.
   *
   * @param {string} arg
   * @return {Option}
   * @internal
   */
  _findOption(arg: string): Option {
    return this.options.find((option) => option.is(arg))
  }

  /**
   * Display an error message if a mandatory option does not have a value.
   * Called after checking for help flags in leaf subcommand.
   *
   * @internal
   */
  _checkForMissingMandatoryOptions() {
    // Walk up hierarchy so can call in subcommand after checking for displaying help.
    for (let cmd = this; cmd; cmd = cmd.parent) {
      cmd.options.forEach((anOption) => {
        if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === undefined) {
          cmd.missingMandatoryOptionValue(anOption)
        }
      })
    }
  }

  /**
   * Display an error message if conflicting options are used together in this.
   *
   * @internal
   */
  _checkForConflictingLocalOptions() {
    const definedNonDefaultOptions = this.options.filter((option) => {
      const optionKey = option.attributeName()

      if (this.getOptionValue(optionKey) === undefined) {
        return false
      }

      return this.getOptionValueSource(optionKey) !== 'default'
    })

    const optionsWithConflicting = definedNonDefaultOptions.filter(
      (option) => option.conflictsWith.length > 0,
    )

    optionsWithConflicting.forEach((option) => {
      const conflictingAndDefined = definedNonDefaultOptions.find((defined) =>
        option.conflictsWith.includes(defined.attributeName()),
      )

      if (conflictingAndDefined) {
        this._conflictingOption(option, conflictingAndDefined)
      }
    })
  }

  /**
   * Display an error message if conflicting options are used together.
   * Called after checking for help flags in leaf subcommand.
   *
   * @internal
   */
  _checkForConflictingOptions() {
    // Walk up hierarchy so can call in subcommand after checking for displaying help.
    for (let cmd = this; cmd; cmd = cmd.parent) {
      cmd._checkForConflictingLocalOptions()
    }
  }

  /**
   * Parse options from `argv` removing known options,
   * and return argv split into operands and unknown arguments.
   *
   * Examples:
   *
   *     argv => operands, unknown
   *     --known kkk op => [op], []
   *     op --known kkk => [op], []
   *     sub --unknown uuu op => [sub], [--unknown uuu op]
   *     sub -- --unknown uuu op => [sub --unknown uuu op], []
   *
   * @param {String[]} argv
   * @return {{operands: String[], unknown: String[]}}
   */
  parseOptions(argv: string[]): any {
    const operands = [] // operands, not options or values

    const unknown = [] // first unknown option and remaining unknown args

    let dest = operands

    const args = argv.slice()

    function maybeOption(arg) {
      return arg.length > 1 && arg[0] === '-'
    }

    // parse options
    let activeVariadicOption = null

    while (args.length) {
      const arg = args.shift()

      // literal
      if (arg === '--') {
        if (dest === unknown) dest.push(arg)
        dest.push(...args)
        break
      }

      if (activeVariadicOption && !maybeOption(arg)) {
        this.emit(`option:${activeVariadicOption.name()}`, arg)
        continue
      }

      activeVariadicOption = null

      if (maybeOption(arg)) {
        const option = this._findOption(arg)

        // recognised option, call listener to assign value with possible custom processing
        if (option) {
          if (option.required) {
            const value = args.shift()
            if (value === undefined) this.optionMissingArgument(option)
            this.emit(`option:${option.name()}`, value)
          } else if (option.optional) {
            let value = null
            // historical behaviour is optional value is following arg unless an option
            if (args.length > 0 && !maybeOption(args[0])) {
              value = args.shift()
            }
            this.emit(`option:${option.name()}`, value)
          } else {
            // boolean flag
            this.emit(`option:${option.name()}`)
          }

          activeVariadicOption = option.variadic ? option : null

          continue
        }
      }

      // Look for combo options following single dash, eat first one if known.
      if (arg.length > 2 && arg[0] === '-' && arg[1] !== '-') {
        const option = this._findOption(`-${arg[1]}`)

        if (option) {
          if (option.required || (option.optional && this._combineFlagAndOptionalValue)) {
            // option with value following in same argument
            this.emit(`option:${option.name()}`, arg.slice(2))
          } else {
            // boolean option, emit and put back remainder of arg for further processing
            this.emit(`option:${option.name()}`)
            args.unshift(`-${arg.slice(2)}`)
          }
          continue
        }
      }

      // Look for known long flag with value, like --foo=bar
      if (/^--[^=]+=/.test(arg)) {
        const index = arg.indexOf('=')

        const option = this._findOption(arg.slice(0, index))

        if (option && (option.required || option.optional)) {
          this.emit(`option:${option.name()}`, arg.slice(index + 1))
          continue
        }
      }

      // Not a recognised option by this command.
      // Might be a command-argument, or subcommand option, or unknown option, or help command or option.

      // An unknown option means further arguments also classified as unknown so can be reprocessed by subcommands.
      if (maybeOption(arg)) {
        dest = unknown
      }

      // If using positionalOptions, stop processing our options at subcommand.
      if (
        (this._enablePositionalOptions || this._passThroughOptions) &&
        operands.length === 0 &&
        unknown.length === 0
      ) {
        if (this._findCommand(arg)) {
          operands.push(arg)
          if (args.length > 0) unknown.push(...args)
          break
        } else if (arg === this._helpCommandName && this._hasImplicitHelpCommand()) {
          operands.push(arg)
          if (args.length > 0) operands.push(...args)
          break
        } else if (this._defaultCommandName) {
          unknown.push(arg)
          if (args.length > 0) unknown.push(...args)
          break
        }
      }

      // If using passThroughOptions, stop processing options at first command-argument.
      if (this._passThroughOptions) {
        dest.push(arg)
        if (args.length > 0) dest.push(...args)
        break
      }

      // add arg
      dest.push(arg)
    }

    return { operands, unknown }
  }

  /**
   * Return an object containing local option values as key-value pairs.
   *
   * @return {Object}
   */
  opts(): Object {
    if (this._storeOptionsAsProperties) {
      // Preserve original behaviour so backwards compatible when still using properties
      const result = {}

      const len = this.options.length

      for (let i = 0; i < len; i++) {
        const key = this.options[i].attributeName()
        result[key] = key === this._versionOptionName ? this._version : this[key]
      }
      return result
    }

    return this._optionValues
  }

  /**
   * Return an object containing merged local and global option values as key-value pairs.
   *
   * @return {Object}
   */
  optsWithGlobals(): Object {
    // globals overwrite locals
    return getCommandAndParents(this).reduce(
      (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
      {},
    )
  }

  /**
   * Display error message and exit (or call exitOverride).
   *
   * @param {string} message
   * @param {Object} [errorOptions]
   * @param {string} [errorOptions.code] - an id string representing the error
   * @param {number} [errorOptions.exitCode] - used with process.exit
   */
  error(message: string, errorOptions?: any): any {
    // output handling
    this._outputConfiguration.outputError(`${message}\n`, this._outputConfiguration.writeErr)

    if (typeof this._showHelpAfterError === 'string') {
      this._outputConfiguration.writeErr(`${this._showHelpAfterError}\n`)
    } else if (this._showHelpAfterError) {
      this._outputConfiguration.writeErr('\n')
      this.outputHelp({ error: true })
    }

    // exit handling
    const config = errorOptions || {}

    const exitCode = config.exitCode || 1

    const code = config.code || 'commander.error'

    this._exit(exitCode, code, message)
  }

  /**
   * Apply any option related environment variables, if option does
   * not have a value from cli or client code.
   *
   * @internal
   */
  _parseOptionsEnv() {
    this.options.forEach((option) => {
      if (option.envVar && option.envVar in process.env) {
        const optionKey = option.attributeName()
        // Priority check. Do not overwrite cli or options from unknown source (client-code).
        if (
          this.getOptionValue(optionKey) === undefined ||
          ['default', 'config', 'env'].includes(this.getOptionValueSource(optionKey))
        ) {
          if (option.required || option.optional) {
            // option can take a value
            // keep very simple, optional always takes value
            this.emit(`optionEnv:${option.name()}`, process.env[option.envVar])
          } else {
            // boolean
            // keep very simple, only care that envVar defined and not the value
            this.emit(`optionEnv:${option.name()}`)
          }
        }
      }
    })
  }

  /**
   * Apply any implied option values, if option is undefined or default value.
   *
   * @internal
   */
  _parseOptionsImplied() {
    const dualHelper = new DualOptions(this.options)

    const hasCustomOptionValue = (optionKey) => {
      return (
        this.getOptionValue(optionKey) !== undefined &&
        !['default', 'implied'].includes(this.getOptionValueSource(optionKey))
      )
    }

    this.options
      .filter(
        (option) =>
          option.implied !== undefined &&
          hasCustomOptionValue(option.attributeName()) &&
          dualHelper.valueFromOption(this.getOptionValue(option.attributeName()), option),
      )
      .forEach((option) => {
        Object.keys(option.implied)
          .filter((impliedKey) => !hasCustomOptionValue(impliedKey))
          .forEach((impliedKey) => {
            this.setOptionValueWithSource(impliedKey, option.implied[impliedKey], 'implied')
          })
      })
  }

  /**
   * Argument `name` is missing.
   *
   * @param {string} name
   * @internal
   */
  missingArgument(name: string) {
    const message = `error: missing required argument '${name}'`
    this.error(message, { code: 'commander.missingArgument' })
  }

  /**
   * `Option` is missing an argument.
   *
   * @param {Option} option
   * @internal
   */
  optionMissingArgument(option: Option) {
    const message = `error: option '${option.flags}' argument missing`
    this.error(message, { code: 'commander.optionMissingArgument' })
  }

  /**
   * `Option` does not have a value, and is a mandatory option.
   *
   * @param {Option} option
   * @internal
   */
  missingMandatoryOptionValue(option: Option) {
    const message = `error: required option '${option.flags}' not specified`

    this.error(message, { code: 'commander.missingMandatoryOptionValue' })
  }

  /**
   * `Option` conflicts with another option.
   *
   * @param {Option} option
   * @param {Option} conflictingOption
   * @api private
   */
  _conflictingOption(option: Option, conflictingOption: Option) {
    // The calling code does not know whether a negated option is the source of the
    // value, so do some work to take an educated guess.
    const findBestOptionFromValue = (option) => {
      const optionKey = option.attributeName()

      const optionValue = this.getOptionValue(optionKey)

      const negativeOption = this.options.find(
        (target) => target.negate && optionKey === target.attributeName(),
      )

      const positiveOption = this.options.find(
        (target) => !target.negate && optionKey === target.attributeName(),
      )

      if (
        negativeOption &&
        ((negativeOption.presetArg === undefined && optionValue === false) ||
          (negativeOption.presetArg !== undefined && optionValue === negativeOption.presetArg))
      ) {
        return negativeOption
      }

      return positiveOption || option
    }

    const getErrorMessage = (option) => {
      const bestOption = findBestOptionFromValue(option)

      const optionKey = bestOption.attributeName()

      const source = this.getOptionValueSource(optionKey)

      if (source === 'env') {
        return `environment variable '${bestOption.envVar}'`
      }

      return `option '${bestOption.flags}'`
    }

    const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(
      conflictingOption,
    )}`

    this.error(message, { code: 'commander.conflictingOption' })
  }

  /**
   * Unknown option `flag`.
   *
   * @param {string} flag
   * @internal
   */
  unknownOption(flag: string) {
    if (this._allowUnknownOption) {
      return
    }

    let suggestion = ''

    if (flag.startsWith('--') && this._showSuggestionAfterError) {
      // Looping to pick up the global options too
      let candidateFlags = []

      let command = this

      do {
        const moreFlags = command
          .createHelp()
          .visibleOptions(command)
          .filter((option) => option.long)
          .map((option) => option.long)

        candidateFlags = candidateFlags.concat(moreFlags)

        command = command.parent
      } while (command && !command._enablePositionalOptions)

      suggestion = suggestSimilar(flag, candidateFlags)
    }

    const message = `error: unknown option '${flag}'${suggestion}`

    this.error(message, { code: 'commander.unknownOption' })
  }

  /**
   * Excess arguments, more than expected.
   *
   * @param {string[]} receivedArgs
   * @internal
   */
  _excessArguments(receivedArgs: string[]) {
    if (this._allowExcessArguments) {
      return
    }

    const expected = this._args.length

    const s = expected === 1 ? '' : 's'

    const forSubcommand = this.parent ? ` for '${this.name()}'` : ''

    const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`

    this.error(message, { code: 'commander.excessArguments' })
  }

  /**
   * Unknown command.
   *
   * @internal
   */
  unknownCommand() {
    const unknownName = this.args[0]

    let suggestion = ''

    if (this._showSuggestionAfterError) {
      const candidateNames = []

      this.createHelp()
        .visibleCommands(this)
        .forEach((command) => {
          candidateNames.push(command.name())
          // just visible alias
          if (command.alias()) candidateNames.push(command.alias())
        })

      suggestion = suggestSimilar(unknownName, candidateNames)
    }

    const message = `error: unknown command '${unknownName}'${suggestion}`

    this.error(message, { code: 'commander.unknownCommand' })
  }

  /**
   * Set the program version to `str`.
   *
   * This method auto-registers the "-V, --version" flag
   * which will print the version number when passed.
   *
   * You can optionally supply the  flags and description to override the defaults.
   * @param str
   * @param [flags]
   * @param [description]
   * @return `this` command for chaining, or version string if no arguments
   */
  version(
    str?: string,
    flags = '-V, --version',
    description = 'output the version number',
  ): this | string {
    if (str == null) {
      return this._version
    }

    this._version = str

    const versionOption = this.createOption(flags, description)

    this._versionOptionName = versionOption.attributeName()

    this.options.push(versionOption)

    this.on('option:' + versionOption.name(), () => {
      this._outputConfiguration.writeOut(`${str}\n`)
      this._exit(0, 'commander.version', str)
    })

    return this
  }

  /**
   * Set the description.
   */
  description(str?: string, argsDescription?: string): string | Command {
    if (str == null && argsDescription == null) {
      return this._description
    }

    if (str != null) {
      this._description = str
    }

    if (argsDescription) {
      this._argsDescription = argsDescription
    }

    return this
  }

  /**
   * Set the summary. Used when listed as subcommand of parent.
   */
  summary(str?: string): string | Command {
    if (str == null) {
      return this._summary
    }

    this._summary = str

    return this
  }

  /**
   * Set an alias for the command.
   *
   * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
   */
  alias(alias?: string): string | Command {
    if (alias === undefined) {
      return this._aliases[0] // just return first, for backwards compatibility
    }

    let command = this

    if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
      // assume adding alias for last added executable subcommand, rather than this
      command = this.commands[this.commands.length - 1]
    }

    if (alias === command._name) {
      throw new Error("Command alias can't be the same as its name")
    }

    command._aliases.push(alias)

    return this
  }

  /**
   * Set aliases for the command.
   *
   * Only the first alias is shown in the auto-generated help.
   */
  aliases(aliases?: string[]): string[] | Command {
    // Getter for the array of aliases is the main reason for having aliases() in addition to alias().
    if (aliases === undefined) {
      return this._aliases
    }

    aliases.forEach((alias) => this.alias(alias))

    return this
  }

  /**
   * Set / get the command usage `str`.
   */
  usage(str?: string): string | Command {
    if (str != null) {
      this.usage = str
      return this
    }

    if (this._usage) {
      return this._usage
    }

    const args = this._args.map((arg) => {
      return humanReadableArgName(arg)
    })

    return []
      .concat(
        this.options.length || this._hasHelpOption ? '[options]' : [],
        this.commands.length ? '[command]' : [],
        this._args.length ? args : [],
      )
      .join(' ')
  }

  /**
   * Get or set the name of the command.
   */
  name(str?: string): string | Command {
    if (str === undefined) {
      return this._name
    }

    this._name = str

    return this
  }

  /**
   * Set the name of the command from script filename, such as process.argv[1],
   * or require.main.filename, or __filename.
   *
   * (Used internally and public although not documented in README.)
   *
   * @example
   * program.nameFromFilename(require.main.filename);
   */
  nameFromFilename(filename: string): Command {
    this._name = path.basename(filename, path.extname(filename))
    return this
  }

  /**
   * Get or set the directory for searching for executable subcommands of this command.
   *
   * @example
   * program.executableDir(__dirname);
   * // or
   * program.executableDir('subcommands');
   *
   * @param {string} [path]
   * @return {string|Command}
   */
  executableDir(path?: string): string | Command {
    if (path === undefined) {
      return this._executableDir
    }

    this._executableDir = path

    return this
  }

  /**
   * Return program help documentation.
   *
   * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
   * @return {string}
   */
  helpInformation(contextOptions?: { error: boolean }): string {
    const helper = this.createHelp()

    if (helper.helpWidth === undefined) {
      helper.helpWidth =
        contextOptions && contextOptions.error
          ? this._outputConfiguration.getErrHelpWidth()
          : this._outputConfiguration.getOutHelpWidth()
    }

    return helper.formatHelp(this, helper)
  }

  /**
   * @internal
   */
  _getHelpContext(contextOptions) {
    contextOptions = contextOptions || {}

    const context = { error: !!contextOptions.error }

    let write

    if (context.error) {
      write = (arg) => this._outputConfiguration.writeErr(arg)
    } else {
      write = (arg) => this._outputConfiguration.writeOut(arg)
    }

    context.write = contextOptions.write || write

    context.command = this

    return context
  }

  /**
   * Output help information for this command.
   *
   * Outputs built-in help, and custom text added using `.addHelpText()`.
   *
   * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
   */
  outputHelp(contextOptions?: { error: boolean } | Function) {
    let deprecatedCallback

    if (typeof contextOptions === 'function') {
      deprecatedCallback = contextOptions
      contextOptions = undefined
    }

    const context = this._getHelpContext(contextOptions)

    getCommandAndParents(this)
      .reverse()
      .forEach((command) => command.emit('beforeAllHelp', context))

    this.emit('beforeHelp', context)

    let helpInformation = this.helpInformation(context)

    if (deprecatedCallback) {
      helpInformation = deprecatedCallback(helpInformation)

      if (typeof helpInformation !== 'string' && !Buffer.isBuffer(helpInformation)) {
        throw new Error('outputHelp callback must return a string or a Buffer')
      }
    }

    context.write(helpInformation)

    this.emit(this._helpLongFlag) // deprecated

    this.emit('afterHelp', context)

    getCommandAndParents(this).forEach((command) => command.emit('afterAllHelp', context))
  }

  /**
   * You can pass in flags and a description to override the help
   * flags and help description for your command. Pass in false to
   * disable the built-in help option.
   */
  helpOption(flags: string | boolean, description?: string): Command {
    if (typeof flags === 'boolean') {
      this._hasHelpOption = flags
      return this
    }

    this._helpFlags = flags || this._helpFlags

    this._helpDescription = description || this._helpDescription

    const helpFlags = splitOptionFlags(this._helpFlags)

    this._helpShortFlag = helpFlags.shortFlag

    this._helpLongFlag = helpFlags.longFlag

    return this
  }

  /**
   * Output help information and exit.
   *
   * Outputs built-in help, and custom text added using `.addHelpText()`.
   *
   * @param {{ error: boolean }} [contextOptions] Pass {error:true} to write to stderr instead of stdout.
   */
  help(contextOptions?: { error: boolean }): void {
    this.outputHelp(contextOptions)

    if (
      !process.exitCode &&
      contextOptions &&
      typeof contextOptions !== 'function' &&
      contextOptions.error
    ) {
      this._exit(1, 'commander.help', '(outputHelp)')
    } else {
      // message: do not have all displayed text available so only passing placeholder.
      this._exit(0, 'commander.help', '(outputHelp)')
    }
  }

  /**
   * Add additional text to be displayed with the built-in help.
   *
   * Position is 'before' or 'after' to affect just this command,
   * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
   *
   * @param {string} position Before or after built-in help.
   * @param {string | Function} text String to add, or a function returning a string.
   * @return {Command} `this` command for chaining
   */
  addHelpText(position: string, text: string | Function): Command {
    const allowedValues = ['beforeAll', 'before', 'after', 'afterAll']

    if (!allowedValues.includes(position)) {
      throw new Error(
        `Unexpected value for position to addHelpText.\n` +
        `Expecting one of '${allowedValues.join("', '")}'`,
      )
    }

    const helpEvent = `${position}Help`

    this.on(helpEvent, (context) => {
      const helpText =
        typeof text === 'function' ? text({ error: context.error, command: this }) : text

      // Ignore falsy value when nothing to output.
      if (helpText) {
        context.write(`${helpText}\n`)
      }
    })

    return this
  }
}

/**
 * Output help information if help flags specified
 *
 * @param {Command} cmd - command to output help for
 * @param {Array} args - array of options to search for help flags
 *
 * @internal
 */
function outputHelpIfRequested(cmd: Command, args: string[]) {
  if (
    !cmd._hasHelpOption ||
    !args.find((arg) => arg === cmd._helpLongFlag || arg === cmd._helpShortFlag)
  ) {
    return
  }

  cmd.outputHelp()

  // (Do not have all displayed text available so only passing placeholder.)
  cmd._exit(0, 'commander.helpDisplayed', '(outputHelp)')
}

/**
 * Scan arguments and increment port number for inspect calls (to avoid conflicts when spawning new command).
 *
 * @param {string[]} args - array of arguments from node.execArgv
 * @returns {string[]}
 *
 * @internal
 */
function incrementNodeInspectorPort(args: string[]): string[] {
  // Testing for these options:
  //  --inspect[=[host:]port]
  //  --inspect-brk[=[host:]port]
  //  --inspect-port=[host:]port
  return args.map((arg) => {
    if (!arg.startsWith('--inspect')) {
      return arg
    }

    let debugOption

    let debugHost = '127.0.0.1'

    let debugPort = '9229'

    let match

    if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
      // e.g. --inspect
      debugOption = match[1]
    } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
      debugOption = match[1]
      if (/^\d+$/.test(match[3])) {
        // e.g. --inspect=1234
        debugPort = match[3]
      } else {
        // e.g. --inspect=localhost
        debugHost = match[3]
      }
    } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
      // e.g. --inspect=localhost:1234
      debugOption = match[1]
      debugHost = match[3]
      debugPort = match[4]
    }

    if (debugOption && debugPort !== '0') {
      return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`
    }

    return arg
  })
}

/**
 * @param {Command} startCommand
 * @returns {Command[]}
 * @internal
 */
function getCommandAndParents(startCommand: Command): Command[] {
  const result = []

  for (let command = startCommand; command; command = command.parent) {
    result.push(command)
  }

  return result
}
