import fs from 'node:fs'

import { build } from 'esbuild'

import type { RouteInfo } from '../api.js'

type BuildOptions = Pick<RouteInfo, 'esbuild' | 'entryPoint' | 'exitPoint' | 'outDirectory'>

/**
 * Build an API route.
 */
export async function buildApiRoute(apiRouteBuildOptions: BuildOptions) {
  const esbuildOptions = {
    ...apiRouteBuildOptions.esbuild,
    outdir: apiRouteBuildOptions.esbuild?.outdir ?? apiRouteBuildOptions.outDirectory,
  }

  esbuildOptions.entryPoints ??= {
    [apiRouteBuildOptions.exitPoint.replace(/\.(c|m)?js$/, '')]: apiRouteBuildOptions.entryPoint,
  }

  fs.rmSync(esbuildOptions.outdir, { recursive: true, force: true })

  const buildOutput = await build(esbuildOptions)

  if (apiRouteBuildOptions.esbuild?.logLevel === 'info') {
    console.log(buildOutput)
  }
}
