// Injected by node:vm's context.
declare var shouldExecuteMain: boolean

export const defaultConfigOptions = {
  a: 'a',
  b: 1,
  c: true,
}

export interface ConfigOptions {
  a: string
  b: number
  c: boolean
}

export async function main(options: ConfigOptions = defaultConfigOptions) {
  return `Your options were: ${JSON.stringify(options)}`
}

if (typeof shouldExecuteMain != 'undefined' && shouldExecuteMain) {
  main()
}
