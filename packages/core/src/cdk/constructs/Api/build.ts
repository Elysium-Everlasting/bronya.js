import path from 'node:path'

import { build } from 'esbuild'

import { Api } from './Api.js'

/**
 * Build an API route.
 */
export async function buildApiRoute(app: Api, route: string = process.cwd()) {
  const apiRouteConfig = app.routes[route]

  if (apiRouteConfig == null) {
    return
  }

  const esbuildOptions = {
    ...apiRouteConfig.esbuild,
    outdir: apiRouteConfig.esbuild.outdir ?? apiRouteConfig.outDirectory,
  }

  const output = apiRouteConfig.exitPoint ?? path.parse(apiRouteConfig.entryPoint).name

  /**
   * @example /path/to/project/src/index.ts
   */
  const entryPoint = apiRouteConfig.entryPoint

  /**
   * @example /path/to/project/dist/handler
   */
  const exitPoint = path.join(esbuildOptions.outdir, output)

  esbuildOptions.entryPoints ??= {
    [exitPoint]: entryPoint,
  }

  const buildOutput = await build(esbuildOptions)

  if (apiRouteConfig.esbuild?.logLevel === 'info') {
    console.log(buildOutput)
  }
}
