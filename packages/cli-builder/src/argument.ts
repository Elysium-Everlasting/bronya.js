import { InvalidArgumentError } from './error.js'

type ArgParser = (arg: string, previous: string) => string | string[]

export class Argument {
  description: string

  variadic: boolean

  parseArg?: ArgParser

  defaultValue: unknown

  defaultValueDescription?: string

  argChoices?: string[]

  required: boolean

  _name: string

  /**
   * Initialize a new command argument with the given name and description.
   * The default is that the argument is required, and you can explicitly
   * indicate this with <> around the name. Put [] around the name for an optional argument.
   */
  constructor(name: string, description?: string) {
    this.description = description || ''
    this.variadic = false
    this.parseArg = undefined
    this.defaultValue = undefined
    this.defaultValueDescription = undefined
    this.argChoices = undefined

    switch (name[0]) {
      case '<': // e.g. <required>
        this.required = true
        this._name = name.slice(1, -1)
        break
      case '[': // e.g. [optional]
        this.required = false
        this._name = name.slice(1, -1)
        break
      default:
        this.required = true
        this._name = name
        break
    }

    if (this._name.length > 3 && this._name.slice(-3) === '...') {
      this.variadic = true
      this._name = this._name.slice(0, -3)
    }
  }

  /**
   * Return argument name.
   */

  name(): string {
    return this._name
  }

  /**
   * @internal
   */
  _concatValue(value: string, previous: string | string[]) {
    if (previous === this.defaultValue || !Array.isArray(previous)) {
      return [value]
    }

    return previous.concat(value)
  }

  /**
   * Set the default value, and optionally supply the description to be displayed in the help.
   */

  default(value: unknown, description: string): Argument {
    this.defaultValue = value
    this.defaultValueDescription = description
    return this
  }

  /**
   * Set the custom handler for processing CLI command arguments into argument values.
   */
  argParser(fn?: ArgParser): Argument {
    this.parseArg = fn
    return this
  }

  /**
   * Only allow argument value to be one of choices.
   */

  choices(values: string[]): Argument {
    this.argChoices = values.slice()

    this.parseArg = (arg: string, previous: string): string | string[] => {
      if (!this.argChoices?.includes(arg)) {
        throw new InvalidArgumentError(`Allowed choices are ${this.argChoices?.join(', ')}.`)
      }

      if (this.variadic) {
        return this._concatValue(arg, previous)
      }

      return arg
    }
    return this
  }

  /**
   * Make argument required.
   */
  argRequired() {
    this.required = true
    return this
  }

  /**
   * Make argument optional.
   */
  argOptional() {
    this.required = false
    return this
  }
}

/**
 * Takes an argument and returns its human readable equivalent for help usage.
 *
 * @internal
 */

export function humanReadableArgName(arg: Argument): string {
  const nameOutput = arg.name() + (arg.variadic === true ? '...' : '')

  return arg.required ? '<' + nameOutput + '>' : '[' + nameOutput + ']'
}
