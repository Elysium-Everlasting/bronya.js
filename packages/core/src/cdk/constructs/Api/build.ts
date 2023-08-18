import { build } from 'esbuild'

import type { RouteInfo } from './Api.js'

/**
 * Build an API route.
 */
export async function buildApiRoute(apiRouteConfig: RouteInfo) {
  const esbuildOptions = {
    ...apiRouteConfig.esbuild,
    outdir: apiRouteConfig.esbuild.outdir ?? apiRouteConfig.outDirectory,
  }

  esbuildOptions.entryPoints ??= {
    [apiRouteConfig.exitPoint.replace(/.js$/, '')]: apiRouteConfig.entryPoint,
  }

  const buildOutput = await build(esbuildOptions)

  if (apiRouteConfig.esbuild?.logLevel === 'info') {
    console.log(buildOutput)
  }
}
