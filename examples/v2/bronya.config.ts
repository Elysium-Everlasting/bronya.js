import path from 'node:path'
import fs from 'node:fs'
import { App, Stack } from 'aws-cdk-lib/core'
import { isCdk } from '@bronya.js/core'
import { Api } from '@bronya.js/api-construct'
import { createApiCliPlugins } from '@bronya.js/api-construct/plugins/cli'

/**
 * @see https://github.com/evanw/esbuild/issues/1921#issuecomment-1491470829
 */
const js = `\
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire as topLevelCreateRequire } from 'module';
const require = topLevelCreateRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
`
const projectRoot = process.cwd()

// The relative path to the generated Prisma Client.
const prismaClientDirectory = path.resolve(projectRoot, 'node_modules', 'prisma')

class MyStack extends Stack {
  api = new Api(this, 'super-awesome-api-v2', {
    plugins: createApiCliPlugins(),
    esbuild: {
      format: 'esm',
      platform: 'node',
      bundle: true,
      banner: { js },
    },
    constructs: {
      lambdaUpload(directory) {
        console.log({ directory })
      },
    },
  })

  constructor(scope: App, id: string) {
    super(scope, id)
  }
}

export async function main() {
  const app = new App()

  const stack = new MyStack(app, 'testing-bronyajs-stack-v2')

  const api = stack.api

  await api.init()

  if (isCdk()) {
    await api.synth()
  }

  return app
}

if (isCdk()) {
  main()
}
