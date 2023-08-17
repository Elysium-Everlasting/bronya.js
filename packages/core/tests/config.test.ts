import { Module } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'

import esbuild from 'esbuild'
import { describe, expect, test } from 'vitest'

describe('config', () => {
  test('read config', async () => {
    const configFilePath = path.resolve(__dirname, 'files', 'simple.config.ts')

    const buildResult = await esbuild.build({
      entryPoints: [configFilePath],
      format: 'cjs',
      write: false,
    })

    const code = buildResult.outputFiles[0]?.text ?? ''

    const script = new vm.Script(code)

    /**
     * This module handles any requires, exports, etc.
     * i.e. {@link compiledModule.exports} will contain the script's exports.
     */
    const compiledModule = new Module(configFilePath)

    const context = vm.createContext({
      module: compiledModule,
      exports: compiledModule.exports,
      require: compiledModule.require,
      __filename: configFilePath,
      __dirname: path.dirname(configFilePath),

      // Special variable to indicate that the script should execute the main function.
      shouldExecuteMain: true,
    })

    /**
     * Import the actual config file.
     * The raw TS file doesn't define `shouldExecuteMain`, so {@link main} shouldn't run unless invoked.
     */
    const configModule = await import('./files/simple.config.js')

    /**
     * The VM, defines `shouldExecuteMain`, which causes __compiled__ scripts to execute {@link main}.
     */
    const result = await script.runInContext(context)

    const expectedResult = await configModule.main()

    expect(result).toBe(expectedResult)

    // TODO: compare the exports of the compiled module and imported module.
  })
})
