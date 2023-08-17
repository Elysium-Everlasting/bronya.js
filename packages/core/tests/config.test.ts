import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { executeJit } from '../src/utils/execute-jit.js'

describe('config', () => {
  test('read config', async () => {
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
})
