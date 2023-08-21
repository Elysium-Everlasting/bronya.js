import { removeBrackets, camelcaseOptionName } from './utils.js'

/**
 * Optional keys are captured as {@type string | undefined}
 */
type OptionalKey<Key extends string> = `${Key} [${string}]`

/**
 * Required keys are captured as {@type string}
 */
type RequiredKey<Key extends string> = `${Key} <${string}>`

/**
 * Variadic keys are captured as {@type string[]}
 */
type VariadicKey<Key extends string> = `${Key} [...${string}]`

/**
 * Removes the (1 or 2) starting dashes from a string.
 */
type TrimDashes<T extends string> = T extends `--${infer KeyName}`
  ? KeyName
  : T extends `-${infer KeyName}`
  ? KeyName
  : T

type TrimWhitespace<T extends string> = T extends ` ${infer Str}`
  ? TrimWhitespace<Str>
  : T extends `${infer Str} `
  ? TrimWhitespace<Str>
  : T

/**
 * Split a string on a given character.
 *
 * @example
 * Split<'a, b, c', ','> // ['a', 'b', 'c']
 */
type Split<
  T extends string,
  On extends string,
  Splits extends string[] = [],
> = T extends `${infer Left}${On}${infer Right}`
  ? Split<TrimWhitespace<Right>, On, [...Splits, TrimWhitespace<Left>]>
  : [...Splits, T]

/**
 * Removes any prefix from a string.
 */
type RemovePrefix<Prefix extends string, T extends string> = T extends `${Prefix}${infer KeyName}`
  ? KeyName
  : T

type CamelCase<T extends string> = T extends `${infer KeyName}-${infer Rest}`
  ? `${KeyName}${Capitalize<CamelCase<Rest>>}`
  : T

/**
 * Normalize the key name by applying transformations.
 *
 * - Remove the dashes i.e. --optional or -optional -> optional
 * - Convert to camelCase i.e. optional-key -> optionalKey
 * - Split the key on commas and represent them as a union for aliases i.e. optional-key, ok -> [optionalKey, ok]
 */
type NormalizeKey<T extends string> = CamelCase<Split<TrimDashes<T>, ','>[number]>

/**
 * TODO: how to handle if it's a union of aliases?
 *
 * @example --no-optional, --no-opt -> optional | opt
 */
type NormalizeKeyWithoutNegation<T extends string> = CamelCase<
  RemovePrefix<'no-', Split<TrimDashes<T>, ','>[number]>
>

/**
 * All option types have a default type, i.e. required options are strings by default.
 * However, when they're prefixed with --no- they become booleans.
 *
 * Logic: Check if removing "no-" prefix from the key results in a different key.
 *
 * @param Key The original key name. e.g. --optional, --no-optional
 * @param DefaultType The default type for the option. e.g. --optional [option] -> string | undefined
 */
type EvaluateOptionObject<
  Key extends string,
  DefaultType = boolean,
> = NormalizeKey<Key> extends NormalizeKeyWithoutNegation<Key>
  ? Record<NormalizeKey<Key>, DefaultType>
  : Record<NormalizeKeyWithoutNegation<Key>, boolean>

export type OptionParser<T extends string> = T extends VariadicKey<infer Key>
  ? EvaluateOptionObject<Key, string[]>
  : T extends OptionalKey<infer Key>
  ? EvaluateOptionObject<Key, string | undefined>
  : T extends RequiredKey<infer Key>
  ? EvaluateOptionObject<Key, string>
  : EvaluateOptionObject<T>

/**
 * Configure the option.
 */
export interface OptionConfig {
  default?: unknown
  type?: unknown[]
}

/**
 * A CLI option.
 *
 * Initialized with a string and parsed into a type-safe object.
 *
 * @example
 *
 * ```ts
 * const optionalOption = new Option('--optional [optional]', 'description')
 *        ^? Option<{ optional: string | undefined }>
 *
 * const requiredOption = new Option('--required <required>', 'description')
 *        ^? Option<{ required: string  }>
 *
 * const variadicOption = new Option('--variadic [...variadic]', 'description')
 *        ^? Option<{ variadic: string[]  }>
 * ```
 */
export default class Option<T = unknown> {
  /**
   * Option name
   */
  name: string

  /**
   * Option name and aliases
   */
  names: string[]

  /**
   * `required` will be a boolean for options with brackets.
   */
  required?: boolean

  /**
   * Whether it's a boolean flag. i.e. negated options or not of the three variations.
   */
  isBoolean?: boolean

  /**
   * Whether the option begins with `--no-`.
   * @example --no-optional -> optional: false
   */
  negated: boolean

  /**
   * Configure the option behavior.
   */
  config: OptionConfig

  /**
   * @warning Don't access this property! This is only here to show the parsed type.
   */
  shape: T = {} as T

  constructor(
    public rawName: string,
    public description: string,
    config?: OptionConfig,
  ) {
    this.config = Object.assign({}, config)

    // You may use cli.option('--env.* [value]', 'desc') to denote a dot-nested option
    rawName = rawName.replace(/\.\*/g, '')

    this.negated = false

    this.names = removeBrackets(rawName)
      .split(',')
      .map((v: string) => {
        let name = v.trim().replace(/^-{1,2}/, '')

        if (name.startsWith('no-')) {
          this.negated = true
          name = name.replace(/^no-/, '')
        }

        return camelcaseOptionName(name)
      })
      .sort((a, b) => (a.length > b.length ? 1 : -1)) // Sort names

    // Use the longest name (last one) as actual option name
    this.name = this.names[this.names.length - 1] ?? ''

    if (this.negated && this.config.default == null) {
      this.config.default = true
    }

    if (rawName.includes('<')) {
      this.required = true
    } else if (rawName.includes('[')) {
      this.required = false
    } else {
      // No arg needed, it's boolean flag
      this.isBoolean = true
    }
  }
}
