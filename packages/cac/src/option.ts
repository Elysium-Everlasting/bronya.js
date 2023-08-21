import { removeBrackets, camelcaseOptionName } from './utils.js'

interface OptionConfig {
  default?: unknown
  type?: unknown[]
}

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
 * - Remove 'no-' prefix i.e. no-optional -> optional
 * - Convert to camelCase i.e. optional-key -> optionalKey
 * - Split the key on commas and represent them as a union for aliases i.e. optional-key, ok -> [optionalKey, ok]
 */
type NormalizeKey<Key extends string> = CamelCase<Split<TrimDashes<Key>, ','>[number]>

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
> = NormalizeKey<Key> extends RemovePrefix<'no-', NormalizeKey<Key>>
  ? Record<NormalizeKey<Key>, DefaultType>
  : Record<NormalizeKey<Key>, boolean>

export type OptionParser<T extends string> = T extends VariadicKey<infer Key>
  ? EvaluateOptionObject<Key, string[]>
  : T extends OptionalKey<infer Key>
  ? EvaluateOptionObject<Key, string | undefined>
  : T extends RequiredKey<infer Key>
  ? EvaluateOptionObject<Key, string>
  : EvaluateOptionObject<T>

export type Prettify<T> = {
  [K in keyof T]: T[K]
}

export type A = Prettify<OptionParser<'--optional [k]'>>

export type B = Prettify<OptionParser<'--no-optional [k]'>>

export type C = Prettify<OptionParser<'-optional [k]'>>

export type D = Prettify<OptionParser<'--variadic [...k]'>>

export type E = Prettify<OptionParser<'--required <k>'>>

export type F = Prettify<OptionParser<'--type <type>'>>

export type G = Prettify<OptionParser<'--clearScreen'>>

export type H = Prettify<OptionParser<'--clear-screen'>>

export type I = Prettify<OptionParser<'--clear-screen, cs'>>

export default class Option<T = unknown> {
  /**
   * Option name
   */
  name: string

  /**
   * Option name and aliases
   */
  names: string[]

  isBoolean?: boolean

  /**
   * `required` will be a boolean for options with brackets.
   */
  required?: boolean

  config: OptionConfig

  negated: boolean

  /**
   * @experimental What the object looks like.
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

export type { OptionConfig }
