import mod from 'node:module'
import path from 'node:path'
import vm from 'node:vm'

import esbuild from 'esbuild'

import type { MaybePromise } from './maybe-promise'

export interface JitExecutionOptions {
  /**
   * Additional options to pass to esbuild.
   */
  esbuild?: esbuild.BuildOptions
}

/**
 * The result after JIT-executing a file.
 */
export interface JitExecutionResult<T> {
  /**
   * The returned value of the script, i.e. if it has side effects.
   */
  result: MaybePromise<T>

  /**
   * The exports of the script.
   *
   * FIXME: I don't get how TS works with these definitions ??
   */
  module: mod
}

/**
 * Executes a file with just-in-time compilation.
 * It's can be synchronous or asynchronous depending on the file that's executed.
 */
export function executeJit<T>(file: string, options: JitExecutionOptions): JitExecutionResult<T> {
  const buildResult = esbuild.buildSync({
    entryPoints: [file],
    format: 'cjs',
    write: false,
    ...options.esbuild,
  })

  const code = buildResult.outputFiles?.[0]?.text

  if (!code) {
    throw new Error(`Failed to compile ${file}`)
  }

  const script = new vm.Script(code)

  /**
   * This module handles any requires, exports, etc.
   * i.e. {@link module.exports} will contain the script's exports.
   */
  const module = new mod.Module(file)

  const context = vm.createContext({
    module: module,
    exports: module.exports,
    require: module.require,
    __filename: file,
    __dirname: path.dirname(file),
  })

  const result = script.runInContext(context)

  return { result, module }
}
