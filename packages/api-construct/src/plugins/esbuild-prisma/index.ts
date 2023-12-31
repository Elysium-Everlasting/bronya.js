import fs from 'node:fs'
import path from 'node:path'

import type { Plugin } from 'esbuild'

import type { Api } from '../../api.js'
import { getClosestProjectDirectory } from '../../utils/project.js'

export function createEsbuildPrismaPlugin(api: Api): Plugin {
  return {
    name: 'esbuild-prisma',
    setup(build) {
      build.onStart(async () => {
        const projectRoot = getClosestProjectDirectory()

        const prismaClientDirectory = path.resolve(projectRoot, 'node_modules', 'prisma')

        const cwd = build.initialOptions.outdir ?? projectRoot

        const outDirectory = path.resolve(cwd, api.config.outDirectory)

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

        queryEngines.forEach((queryEngineFile) =>
          fs.chmodSync(path.join(outDirectory, queryEngineFile), 0o755),
        )
      })
    },
  }
}
