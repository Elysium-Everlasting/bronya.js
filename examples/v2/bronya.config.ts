import path from 'node:path'
import fs from 'node:fs'
import { App, Stack } from 'aws-cdk-lib/core'
import { isCdk } from '@bronya.js/core'
import { Api } from '@bronya.js/api-construct'

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

const prismaSchema = path.resolve(projectRoot, 'prisma', 'schema.prisma')

class MyStack extends Stack {
  api = new Api(this, 'super-awesome-api-v2', {
    esbuild: {
      format: 'esm',
      platform: 'node',
      bundle: true,
      banner: { js },
      plugins: [
        {
          name: 'copy',
          setup(build) {
            build.onStart(async () => {
              const cwd = build.initialOptions.outdir ?? projectRoot

              const outDirectory = path.resolve(cwd, '.bronya')

              fs.rmSync(outDirectory, { recursive: true, force: true })

              fs.mkdirSync(outDirectory, { recursive: true })

              const queryEngines = fs
                .readdirSync(prismaClientDirectory)
                .filter((file) => file.endsWith('.so.node'))

              queryEngines.forEach((queryEngineFile) =>
                fs.copyFileSync(
                  path.join(prismaClientDirectory, queryEngineFile),
                  path.join(outDirectory, queryEngineFile),
                ),
              )

              fs.copyFileSync(prismaSchema, path.join(outDirectory, 'schema.prisma'))

              queryEngines.forEach((queryEngineFile) =>
                fs.chmodSync(path.join(outDirectory, queryEngineFile), 0o755),
              )
            })
          },
        },
      ],
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
