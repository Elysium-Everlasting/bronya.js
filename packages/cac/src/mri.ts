type Dict<T> = Record<string, T>
type Arrayable<T> = T | T[]

type NormalizedAliases = Record<string, string[]>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MriResult = Record<string, any> & { _: string[] }

export interface MriOptions {
  boolean?: Arrayable<string>
  string?: Arrayable<string>
  alias?: Dict<Arrayable<string>>
  default?: Dict<unknown>
  unknown?(flag: string): void
}

export default function mri(args: string[] = [], options: MriOptions = {}): MriResult {
  const normalizedAliases = options.alias ? transformAliases(options.alias) : undefined

  const settings = {
    alias: normalizedAliases,
    string: toArray(options.string),
    boolean: options.boolean ? transformBooleans(options.boolean, normalizedAliases) : undefined,
  }

  if (options.default) {
    Object.keys(options.default).forEach((key) => {
      const type = typeof options.default?.[key]

      if (type === 'string' || type === 'boolean') {
        settings[type]?.push(key)
        settings.alias?.[key]?.forEach((alias) => {
          settings[type]?.push(alias)
        })
      }
    })
  }

  const out: MriResult = { _: [] }

  const keys = options.unknown ? Object.keys(settings.alias ?? {}) : []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg == null) {
      continue
    }

    if (arg === '--') {
      out['_'] = out['_'].concat(args.slice(++i))
      break
    }

    /**
     * The last dash, i.e. options may be passed with a single or double dash.
     *
     * @example -a -> lastDashIndex = 1
     * @example --a=true -> lastDashIndex = 2
     * @example --a true -> lastDashIndex = 2
     */
    let lastDashIndex = 0

    for (; lastDashIndex < arg.length; lastDashIndex++) {
      if (arg.charCodeAt(lastDashIndex) !== 45) break // "-"
    }

    if (lastDashIndex === 0) {
      out['_'].push(arg)
      continue
    }

    if (arg.substring(lastDashIndex, lastDashIndex + 3) === 'no-') {
      const name = arg.substring(lastDashIndex + 3)

      if (options.unknown && !~keys.indexOf(name)) {
        options.unknown(arg)
        return { _: [] }
      }

      out[name] = false

      continue
    }

    /**
     * @example
     * --foo=bar -> args = ['--foo=bar']
     * The value is the substring from the last dash to the equal sign.
     * This is one value in the args array, and the key/value pair is found by splitting the string.
     *
     * @example
     * --foo bar -> args = ['--foo', 'bar']
     *  The value is the substring after the space.
     *  This is two values in the args array, so the value is found at the next index.
     */
    let equalsIndex = lastDashIndex + 1

    for (; equalsIndex < arg.length; equalsIndex++) {
      if (arg.charCodeAt(equalsIndex) === 61) break // "="
    }

    const key = arg.substring(lastDashIndex, equalsIndex)

    const val =
      arg.substring(++equalsIndex) ||
      i + 1 === args.length ||
      ('' + args[i + 1]).charCodeAt(0) === 45 ||
      args[++i]

    /**
     * If there were 2 dashes in a row, then treat it as a single key.
     *
     * @example --foo bar -> { foo: 'bar' }
     * @example --foo=bar -> { foo: true, bar: true }
     *
     * If there was only 1 dash, then all the characters after the dash are boolean flags indicating `true`.
     *
     * @example -abc  -> { a: true, b: true, c: true }
     */
    const keyOrBooleanFlags = lastDashIndex === 2 ? [key] : key

    for (equalsIndex = 0; equalsIndex < keyOrBooleanFlags.length; equalsIndex++) {
      const name = keyOrBooleanFlags[equalsIndex]

      if (name == null) {
        continue
      }

      if (options.unknown && !~keys.indexOf(name)) {
        options.unknown('-'.repeat(lastDashIndex) + name)
        return { _: [] }
      }

      toVal(out, name, equalsIndex + 1 < keyOrBooleanFlags.length || val, options)
    }
  }

  if (options.default) {
    Object.entries(options.default).forEach(([key, value]) => {
      if (out[key] == null) {
        out[key] = value
      }
    })
  }

  if (options.alias) {
    Object.entries(out).forEach(([key, value]) => {
      settings.alias?.[key]?.forEach((alias) => {
        out[alias] = value
      })
    })
  }

  return out
}

/**
 * Idk how this works. :shrug:
 */
function toVal(result: MriResult, key: string, val: unknown, opts: MriOptions) {
  let x = result[key]

  const next = ~(opts.string?.indexOf(key) ?? -1)
    ? val == null || val === true
      ? ''
      : String(val)
    : typeof val === 'boolean'
    ? val
    : ~(opts.boolean?.indexOf(key) ?? -1)
    ? val === 'false'
      ? false
      : val === 'true' || (result['_'].push(((x = Number(val)), x * 0 === 0) ? x : val), !!val)
    : ((x = Number(val)), x * 0 === 0)
    ? x
    : val

  const old = result[key]

  result[key] = old == null ? next : Array.isArray(old) ? old.concat(next) : [old, next]
}

function transformAliases(aliases: Dict<Arrayable<string>>): NormalizedAliases {
  return Object.entries(aliases).reduce(
    (current, [key, value]) => {
      const allAliases = toArray(value).concat(key)

      allAliases.forEach((alias) => {
        current[alias] = allAliases.filter((a) => a !== alias)
      })

      return current
    },
    {} as Record<string, string[]>,
  )
}

function transformBooleans(booleans: Arrayable<string>, aliases: NormalizedAliases = {}): string[] {
  const booleanArray = toArray(booleans)

  booleanArray.forEach((boolean) => {
    const moreBooleans = aliases[boolean]

    if (moreBooleans) {
      booleanArray.push(...moreBooleans)
    }
  })

  return booleanArray
}

function toArray<T>(value: T | T[]): NonNullable<T>[] {
  return value == null ? [] : Array.isArray(value) ? value.filter(notNull) : [value]
}

function notNull<T>(value: T): value is NonNullable<T> {
  return value != null
}
