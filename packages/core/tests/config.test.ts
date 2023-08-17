import path from 'node:path'

import { App } from 'aws-cdk-lib'
import { describe, expect, test } from 'vitest'

import { executeJit } from '../src/utils/execute-jit.js'

describe('config', () => {
  test('simple config', async () => {
    const configFilePath = path.resolve(__dirname, 'files', 'simple.config.ts')

    const jitExecutionResult = executeJit(configFilePath, {
      esbuild: {
        define: {
          // Special variable to indicate that the script should execute the main function.
          shouldExecuteMain: JSON.stringify(true),
        },
      },
    })

    /**
     * Import the actual config file.
     * The raw TS file doesn't define `shouldExecuteMain`, so {@link main} shouldn't run unless invoked.
     */
    const configModule = await import('./files/simple.config.js')

    const expectedResult = await configModule.main()

    const result = await jitExecutionResult.result

    expect(result).toBe(expectedResult)

    // TODO: compare the exports of the compiled module and imported module.
  })

  test('complex config', async () => {
    const configFilePath = path.resolve(__dirname, 'files', 'complex.config.ts')

    const jitExecutionResult = executeJit(configFilePath, {
      esbuild: {
        define: {
          // Special variable to indicate that the script should execute the main function.
          shouldExecuteMain: JSON.stringify(true),
        },
      },
    })

    /**
     * Import the actual config file.
     * The raw TS file doesn't define `shouldExecuteMain`, so {@link main} shouldn't run unless invoked.
     */
    const configModule = await import('./files/complex.config.js')

    const expectedResult = await configModule.main()

    const result = await jitExecutionResult.result

    expect(App.isApp(result)).toBeTruthy()
    expect(App.isApp(expectedResult)).toBeTruthy()
    expect(App.isApp(result)).toBe(App.isApp(expectedResult))

    // TODO: compare the exports of the compiled module and imported module.
  })
})
