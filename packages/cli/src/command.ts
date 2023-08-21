import { platformInfo } from './node.js'
import Option, { type OptionConfig, type OptionParser } from './option.js'
import {
  removeBrackets,
  parseBracketedKeys,
  findLongestString,
  padRightIfLongerThan,
  CACError,
} from './utils.js'

export interface HelpSection {
  title?: string
  body: string
}

export interface CommandConfig {
  allowUnknownOptions?: boolean
  ignoreOptionDefaultValue?: boolean
}

type Prettify<T> = {
  [K in keyof T]: T[K]
}

/**
 * Optional keys are captured as {@type string | undefined}
 */
type OptionalKey<Key extends string> = `[${Key}]`

/**
 * Required keys are captured as {@type string}
 */
type RequiredKey<Key extends string> = `<${Key}>`

/**
 * Variadic keys are captured as {@type string[]}
 */
type VariadicKey<Key extends string> = `[...${Key}]`

type CommandParser<T extends string> = T extends `${infer L}${VariadicKey<infer Key>}${infer R}`
  ? Record<Key, string> & CommandParser<L> & CommandParser<R>
  : T extends `${infer L}${OptionalKey<infer Key>}${infer R}`
  ? Record<Key, string> & CommandParser<L> & CommandParser<R>
  : T extends `${infer L}${RequiredKey<infer Key>}${infer R}`
  ? Record<Key, string> & CommandParser<L> & CommandParser<R>
  : unknown

export type HelpCallback = (sections: HelpSection[]) => void | HelpSection[]

export type CommandExample = ((bin: string) => string) | string

/**
 * Circular dependency on the CLI class has been removed.
 */
export class Command<RawArgs extends string = '', T = unknown> {
  options: Option[] = []

  aliasNames: string[] = []

  /*
   * Parsed command name
   */
  name: string

  args: ReturnType<typeof parseBracketedKeys>

  commandAction?: (args: Prettify<CommandParser<RawArgs>>, options: T) => unknown

  usageText?: string

  versionNumber?: string

  examples: CommandExample[] = []

  helpCallback?: HelpCallback

  /**
   * @param rawName The raw command string. e.g. 'build [...files]'
   * @param description A description for the command to display in help message.
   * @param config Configuration for the command.
   * @param globalCommand The global command object.
   */
  constructor(
    public rawName: RawArgs,
    public description: string,
    public config: CommandConfig = {},
    public globalCommand: GlobalCommand,
  ) {
    this.name = removeBrackets(rawName)
    this.args = parseBracketedKeys(rawName)
  }

  usage(text: string) {
    this.usageText = text
    return this
  }

  allowUnknownOptions() {
    this.config.allowUnknownOptions = true
    return this
  }

  ignoreOptionDefaultValue() {
    this.config.ignoreOptionDefaultValue = true
    return this
  }

  version(version: string, customFlags = '-v, --version') {
    this.versionNumber = version
    this.option(customFlags, 'Display version number')
    return this
  }

  example(example: CommandExample) {
    this.examples.push(example)
    return this
  }

  /**
   * Add a option for this command.
   *
   * @param rawName Raw option name(s).
   * @param description Option description.
   * @param config Option config.
   */
  option<RawName extends string>(
    rawName: RawName,
    description: string,
    config?: OptionConfig,
  ): Command<RawArgs, T & OptionParser<RawName>> {
    this.options.push(new Option(rawName, description, config))
    return this as Command<RawArgs, T & OptionParser<RawName>>
  }

  alias(name: string) {
    this.aliasNames.push(name)
    return this
  }

  action(callback: (args: Prettify<CommandParser<RawArgs>>, options: Prettify<T>) => unknown) {
    this.commandAction = callback
    return this
  }

  /**
   * Check if a command name is matched by this command
   * @param name Command name
   */
  isMatched(name: string) {
    return this.name === name || this.aliasNames.includes(name)
  }

  get isDefaultCommand() {
    return this.name === '' || this.aliasNames.includes('!')
  }

  get isGlobalCommand(): boolean {
    return this instanceof GlobalCommand
  }

  /**
   * Check if an option is registered in this command
   * @param name Option name
   */
  hasOption(name: string) {
    const optionName = name.split('.')[0] ?? ''
    return this.options.find((option) => option.names.includes(optionName))
  }

  outputHelp(name: string, commands: Command[]) {
    const { versionNumber, options: globalOptions, helpCallback } = this.globalCommand

    let sections: HelpSection[] = [
      {
        body: `${name}${versionNumber ? `/${versionNumber}` : ''}`,
      },
    ]

    sections.push({
      title: 'Usage',
      body: `  $ ${name} ${this.usageText || this.rawName}`,
    })

    const showCommands = (this.isGlobalCommand || this.isDefaultCommand) && commands.length > 0

    if (showCommands) {
      const longestCommandName = findLongestString(commands.map((command) => command.rawName))
      sections.push({
        title: 'Commands',
        body: commands
          .map((command) => {
            return `  ${padRightIfLongerThan(command.rawName, longestCommandName?.length ?? 0)}  ${
              command.description
            }`
          })
          .join('\n'),
      })
      sections.push({
        title: `For more info, run any command with the \`--help\` flag`,
        body: commands
          .map((command) => `  $ ${name}${command.name === '' ? '' : ` ${command.name}`} --help`)
          .join('\n'),
      })
    }

    let options = this.isGlobalCommand ? globalOptions : [...this.options, ...(globalOptions || [])]

    if (!this.isGlobalCommand && !this.isDefaultCommand) {
      options = options.filter((option) => option.name !== 'version')
    }

    if (options.length > 0) {
      const longestOptionName = findLongestString(options.map((option) => option.rawName))

      sections.push({
        title: 'Options',
        body: options
          .map((option) => {
            return `  ${padRightIfLongerThan(option.rawName, longestOptionName?.length ?? 0)}  ${
              option.description
            } ${option.config.default === undefined ? '' : `(default: ${option.config.default})`}`
          })
          .join('\n'),
      })
    }

    if (this.examples.length > 0) {
      sections.push({
        title: 'Examples',
        body: this.examples
          .map((example) => {
            if (typeof example === 'function') {
              return example(name)
            }
            return example
          })
          .join('\n'),
      })
    }

    if (helpCallback) {
      sections = helpCallback(sections) || sections
    }

    console.log(
      sections
        .map((section) => {
          return section.title ? `${section.title}:\n${section.body}` : section.body
        })
        .join('\n\n'),
    )
  }

  outputVersion(name = '') {
    if (this.globalCommand.versionNumber) {
      console.log(`${name}/${this.globalCommand.versionNumber} ${platformInfo}`)
    }
  }

  checkRequiredArgs(args: readonly string[] | string[]) {
    const minimalArgsCount = this.args.filter((arg) => arg.required).length

    if (args.length < minimalArgsCount) {
      throw new CACError(`missing required args for command \`${this.rawName}\``)
    }
  }

  /**
   * Check if the parsed options contain any unknown options
   *
   * Exit and output error when true
   */
  checkUnknownOptions(options: Record<string, unknown>) {
    if (!this.config.allowUnknownOptions) {
      for (const name of Object.keys(options)) {
        if (name !== '--' && !this.hasOption(name) && !this.globalCommand.hasOption(name)) {
          throw new CACError(`Unknown option \`${name.length > 1 ? `--${name}` : `-${name}`}\``)
        }
      }
    }
  }

  /**
   * Check if the required string-type options exist
   */
  checkOptionValue(parsedOptions: Record<string, unknown>) {
    const options = [...this.globalCommand.options, ...this.options]

    for (const option of options) {
      const value = parsedOptions[option.name.split('.')[0] ?? '']

      // Check required option value
      if (option.required) {
        const hasNegated = options.some((o) => o.negated && o.names.includes(option.name))

        if (value === true || (value === false && !hasNegated)) {
          throw new CACError(`option \`${option.rawName}\` value is missing`)
        }
      }
    }
  }
}

const GLOBAL_SYMBOL = '@@global@@'

export class GlobalCommand extends Command<typeof GLOBAL_SYMBOL> {
  constructor() {
    super(GLOBAL_SYMBOL, '', {}, Object.create(null))
  }
}
