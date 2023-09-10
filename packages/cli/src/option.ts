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
 * Removes leading dashes from a string.
 */
type TrimDashes<T extends string> = T extends `-${infer Key}` ? TrimDashes<Key> : T

/**
 * Trims whitespace on either side of a string.
 */
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
type RemovePrefix<Prefix extends string, T extends string> = T extends `${Prefix}${infer Str}`
  ? Str
  : T

type CamelCase<T extends string> = T extends `${infer Head}-${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : T

/**
 * Normalize the key name by applying transformations.
 *
 * - Remove the dashes i.e. --optional or -optional -> optional
 * - Convert to camelCase i.e. optional-key -> optionalKey
 * - Split the key on commas and represent them as a union for aliases i.e. optional-key, ok -> [optionalKey, ok]
 */
type NormalizeKey<
  T extends string,
  Keys extends string[] = Split<T, ','>,
  Processed extends string[] = [],
> = Keys extends []
  ? Processed
  : Keys extends [infer Head, ...infer Tail]
  ? Head extends string
    ? Tail extends string[]
      ? NormalizeKey<T, Tail, [...Processed, CamelCase<TrimDashes<Head>>]>
      : never
    : never
  : []

/**
 * Normalize the key name and remove any negation, i.e. 'no-' prefix.
 *
 * @example --no-optional, --no-opt -> optional | opt
 */
type NormalizeKeyNegation<
  T extends string,
  Keys extends string[] = Split<T, ','>,
  Processed extends string[] = [],
> = Keys extends []
  ? Processed
  : Keys extends [infer Head, ...infer Tail]
  ? Head extends string
    ? Tail extends string[]
      ? NormalizeKeyNegation<
          T,
          Tail,
          [...Processed, CamelCase<RemovePrefix<'no-', TrimDashes<Head>>>]
        >
      : never
    : never
  : []

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
> = NormalizeKey<Key> extends NormalizeKeyNegation<Key>
  ? Record<NormalizeKey<Key>[number], DefaultType>
  : Record<NormalizeKeyNegation<Key>[number], boolean>

/**
 * Parses a single option.
 *
 * @example --optional [option] -> { optional: string | undefined }
 */
export type ParseSingleOption<T extends string> = T extends VariadicKey<infer Key>
  ? EvaluateOptionObject<Key, string[]>
  : T extends OptionalKey<infer Key>
  ? EvaluateOptionObject<Key, string | undefined>
  : T extends RequiredKey<infer Key>
  ? EvaluateOptionObject<Key, string>
  : EvaluateOptionObject<T>

/**
 * Given an option string, split it, and process each alias individually.
 *
 * @example
 * '--no-optional, --no-opt' -> ['--no-optional', '--no-opt'].map(ParseSingleOption)
 *
 * The aliases are 'optional' and 'opt' respectively, and each result of the map function produces a record.
 * Merge these records into a single object.
 */
export type OptionAccumulator<
  T extends string,
  Keys extends string[] = Split<T, ','>,
  Processed extends unknown[] = [],
> = Keys extends []
  ? Processed
  : Keys extends [infer Head, ...infer Tail]
  ? Head extends string
    ? Tail extends string[]
      ? OptionAccumulator<T, Tail, [...Processed, ParseSingleOption<Head>]>
      : never
    : never
  : []

/**
 * After parsing each option (i.e. alias) individually
 */
type AccumulateRecords<T extends unknown[], Accumulated = unknown> = T extends []
  ? Accumulated
  : T extends [infer Head, ...infer Tail]
  ? AccumulateRecords<Tail, Accumulated & Head>
  : Accumulated

type Prettify<T> = { [K in keyof T]: T[K] }

export type OptionParser<T extends string> = Prettify<AccumulateRecords<OptionAccumulator<T>>>

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
 * const optionalOption = new Option('--optional [optionalValue]', 'description')
 *        ^? Option<{ optional: string | undefined }>
 *
 * const requiredOption = new Option('--required <requiredValue>', 'description')
 *        ^? Option<{ required: string  }>
 *
 * const variadicOption = new Option('--variadic [...variadicValue]', 'description')
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
    public description?: string,
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
