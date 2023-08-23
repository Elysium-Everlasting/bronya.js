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
    [apiRouteBuildOptions.exitPoint.replace(/.js$/, '')]: apiRouteBuildOptions.entryPoint,
  }

  const buildOutput = await build(esbuildOptions)

  if (apiRouteBuildOptions.esbuild?.logLevel === 'info') {
    console.log(buildOutput)
  }
}
