type Dict<T> = Record<string, T>
type Arrayable<T> = T | T[]

type NormalizedAliases = Record<string, string[]>

export interface MriOptions {
  boolean?: Arrayable<string>
  string?: Arrayable<string>
  alias?: Dict<Arrayable<string>>
  default?: Dict<any>
  unknown?(flag: string): void
}

export default function mri(args: string[] = [], options: MriOptions = {}) {
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

  const out: Record<string, any> = { _: [] }

  const keys = options.unknown ? Object.keys(settings.alias ?? {}) : []

  args.every((arg, i) => {
    if (arg === '--') {
      out['_'] = out['_'].concat(args.slice(i + 1))
      return false
    }

    let dashIndex = 0

    for (; dashIndex < arg.length; dashIndex++) {
      if (arg.charCodeAt(dashIndex) !== 45) break
    }

    if (dashIndex === 0) {
      out['_'].push(arg)
      return true
    }

    if (arg.substring(dashIndex, dashIndex + 3) === 'no-') {
      const name = arg.substring(dashIndex + 3)

      if (options.unknown && !~keys.indexOf(name)) {
        return options.unknown(arg)
      }

      out[name] = false

      return true
    }

    let equalIndex = arg.slice(dashIndex + 1).indexOf('=')

    const name = arg.substring(dashIndex, equalIndex)

    const val =
      arg.substring(equalIndex + 1) ||
      i + 1 === args.length ||
      String(args[i + 1]).charCodeAt(0) === 45 ||
      args[++i]

    const nameArray = dashIndex === 2 ? [name] : name

    let idx = 0

    for (const name of nameArray) {
      if (options.unknown && !~keys.indexOf(name)) {
        return options.unknown('-'.repeat(dashIndex) + name)
      }

      toVal(out, name, idx + 1 < nameArray.length || val, options)

      idx++
    }

    return true
  })

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

function toVal(out: Record<string, any>, key: string, val: unknown, opts: MriOptions) {
  let x = out[key]

  let old = out[key]

  let nxt = !!~(opts.string?.indexOf(key) ?? -1)
    ? val == null || val === true
      ? ''
      : String(val)
    : typeof val === 'boolean'
      ? val
      : !!~(opts.boolean?.indexOf(key) ?? -1)
        ? val === 'false'
          ? false
          : val === 'true' || (out['_'].push(((x = Number(val)), x * 0 === 0) ? x : val), !!val)
        : ((x = Number(val)), x * 0 === 0)
          ? x
          : val

  out[key] = old == null ? nxt : Array.isArray(old) ? old.concat(nxt) : [old, nxt]
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
