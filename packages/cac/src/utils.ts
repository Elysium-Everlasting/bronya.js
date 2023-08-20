import type { MriOptions } from './mri.js'
import Option from './option.js'

const ANGLED_BRACKET_REGEX_GLOBAL = /<([^>]+)>/g

const SQUARE_BRACKET_REGEX_GLOBAL = /\[([^\]]+)\]/g

export function parseBrackets(str: string): ParseResult[] {
  const parseResults: ParseResult[] = []

  let angledMatch: string[] | null

  while ((angledMatch = ANGLED_BRACKET_REGEX_GLOBAL.exec(str))) {
    parseResults.push(parse(angledMatch))
  }

  let squareMatch: string[] | null

  while ((squareMatch = SQUARE_BRACKET_REGEX_GLOBAL.exec(str))) {
    parseResults.push(parse(squareMatch))
  }

  return parseResults
}

interface ParseResult {
  required: boolean
  value?: string
  variadic?: boolean
}

function parse(match: string[]): ParseResult {
  const variadic = match[1]?.startsWith('...')
  const value = variadic ? match[1]?.slice(3) : match[1]

  return {
    required: Boolean(match[0]?.startsWith('<')),
    value,
    variadic,
  }
}

export function removeBrackets(v: string): string {
  return v.replace(/[<[].+/, '').trim()
}

export const getMriOptions = (options: Option[]) => {
  const alias: Record<string, string[]> = {}

  const boolean: string[] = []

  const result = { alias, boolean } satisfies MriOptions

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
      result.alias[name] = option.names.slice(1)
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
        result.boolean.push(name)
      }
    } else {
      result.boolean.push(name)
    }
  }

  return result
}

export const findLongest = (arr: string[]) => {
  return arr.sort((a, b) => {
    return a.length > b.length ? -1 : 1
  })[0]
}

export function padRightIfLongerThan(str: string, length: number) {
  return str.length >= length ? str : `${str}${' '.repeat(length - str.length)}`
}

export function camelcase(input: string) {
  return input.replace(/([a-z])-([a-z])/g, (_, p1, p2) => {
    return p1 + p2.toUpperCase()
  })
}

export function setDotProp(obj: { [k: string]: any }, keys: string[], val: any) {
  let i = 0
  let length = keys.length
  let t = obj
  let x
  let index: string | undefined

  for (; i < length; ++i) {
    index = keys[i]

    if (index == null) {
      continue
    }

    x = t[index]

    t = t[index] =
      i === length - 1
        ? val
        : x != null
        ? x
        : !!~index.indexOf('.') || !(Number(keys[i + 1]) > -1)
        ? {}
        : []
  }
}

export function setByType(obj: { [k: string]: any }, transforms: { [k: string]: any }) {
  for (const key of Object.keys(transforms)) {
    const transform = transforms[key]

    if (transform.shouldTransform) {
      obj[key] = Array.prototype.concat.call([], obj[key])

      if (typeof transform.transformFunction === 'function') {
        obj[key] = obj[key].map(transform.transformFunction)
      }
    }
  }
}

export function getFileName(input: string) {
  const m = /([^\\\/]+)$/.exec(input)
  return m ? m[1] : ''
}

export function camelcaseOptionName(name: string) {
  // Camelcase the option name
  // Don't camelcase anything after the dot `.`
  return name
    .split('.')
    .map((v, i) => {
      return i === 0 ? camelcase(v) : v
    })
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
