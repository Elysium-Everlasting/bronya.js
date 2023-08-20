import type { MriOptions, MriResult } from './mri.js'
import Option from './option.js'

const ANGLE_BRACKET_REGEX_GLOBAL = /<([^>]+)>/g

const SQUARE_BRACKET_REGEX_GLOBAL = /\[([^\]]+)\]/g

/**
 * A bracketed key in a command usage string.
 *
 * @example cli-command <required> [optional] [...variadic]
 */
export interface BracketedKey {
  /**
   * Whether the key is required, i.e. surrounded with angle brackets `<` `>`.
   */
  required: boolean

  /**
   * Whether the key is variadic, i.e. starts with `...`.
   */
  variadic: boolean

  /**
   * The key name.
   */
  key: string
}

/**
 * Parses the string for all bracketed keys.
 *
 * Keys surrounded with angle brackets `<` `>` are required.
 * Keys surrounded with square brackets `[` `]` are optional.
 * Keys that start with `...` are variadic (i.e. they accept multiple values).
 */
export function parseBracketedKeys(str: string): BracketedKey[] {
  const bracketedKeys: BracketedKey[] = []

  let angleBracketMatches: string[] | null

  while ((angleBracketMatches = ANGLE_BRACKET_REGEX_GLOBAL.exec(str))) {
    bracketedKeys.push(parseMatches(angleBracketMatches))
  }

  let squareBracketMatches: string[] | null

  while ((squareBracketMatches = SQUARE_BRACKET_REGEX_GLOBAL.exec(str))) {
    bracketedKeys.push(parseMatches(squareBracketMatches))
  }

  return bracketedKeys
}

function parseMatches(match: string[]): BracketedKey {
  const variadic = Boolean(match[1]?.startsWith('...'))
  const value = (variadic ? match[1]?.slice(3) : match[1]) ?? ''

  return {
    required: Boolean(match[0]?.startsWith('<')),
    key: value,
    variadic,
  }
}

export function removeBrackets(v: string): string {
  return v.replace(/[<[].+/, '').trim()
}

export function getMriOptions(options: Option[]): MriOptions {
  const mriOptions = {
    alias: {} as Record<string, string[]>,
    boolean: [] as string[],
  } satisfies MriOptions

  for (const [index, option] of options.entries()) {
    // We do not set default values in mri options
    // Since its type (typeof) will be used to cast parsed arguments.
    // Which mean `--foo foo` will be parsed as `{foo: true}` if we have `{default:{foo: true}}`
    const name = option.names[0]

    if (name == null) {
      continue
    }

    // Set alias
    if (option.names.length > 1) {
      mriOptions.alias[name] = option.names.slice(1)
    }

    if (!option.isBoolean) {
      continue
    }

    // Set boolean
    if (option.negated) {
      // For negated option, only set it to `boolean` type when there's no string-type option with the same name.
      const hasStringTypeOption = options.some(
        (o, i) =>
          i !== index &&
          o.names.some((name) => option.names.includes(name)) &&
          typeof o.required === 'boolean',
      )

      if (!hasStringTypeOption) {
        mriOptions.boolean.push(name)
      }
    } else {
      mriOptions.boolean.push(name)
    }
  }

  return mriOptions
}

export function findLongestString(array: string[]): string {
  const arrayByDecreasingLength = array.sort((a, b) => (a.length > b.length ? -1 : 1))
  return arrayByDecreasingLength[0] ?? ''
}

export function padRightIfLongerThan(str: string, length: number): string {
  return str.length >= length ? str : `${str}${' '.repeat(length - str.length)}`
}

export function camelcase(input: string): string {
  return input.replace(/([a-z])-([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase())
}

export function setDotProp(obj: MriResult, keys: string[], val: unknown): void {
  let current = obj

  for (let i = 0; i < keys.length; ++i) {
    const key = keys[i]

    if (key == null) {
      continue
    }

    current[key] =
      i === keys.length - 1
        ? val
        : current[key] != null
        ? current[key]
        : !!~key.indexOf('.') || !(Number(keys[i + 1]) > -1)
        ? {}
        : []

    current = current[key]
  }
}

export interface Transformation {
  shouldTransform?: boolean
  transformFunction?: (value: unknown) => unknown
}

export function setByType(obj: MriResult, transforms: Record<string, Transformation>) {
  Object.keys(transforms).forEach((key) => {
    const transform = transforms[key]

    if (transform?.shouldTransform) {
      obj[key] = Array.prototype.concat.call([], obj[key])

      if (typeof transform.transformFunction === 'function') {
        obj[key] = obj[key].map(transform.transformFunction)
      }
    }
  })
}

export function getFileName(input: string) {
  const m = /([^\\/]+)$/.exec(input)
  return m ? m[1] : ''
}

/**
 * Camelcase the option name.
 * Don't camelcase anything after the dot `.`
 */
export function camelcaseOptionName(name: string) {
  return name
    .split('.')
    .map((v, i) => (i === 0 ? camelcase(v) : v))
    .join('.')
}

export class CACError extends Error {
  constructor(message: string) {
    super(message)

    this.name = this.constructor.name

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor)
    } else {
      this.stack = new Error(message).stack
    }
  }
}
