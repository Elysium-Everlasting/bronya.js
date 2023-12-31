import { createRequire } from 'node:module'
import path from 'node:path'

import { getClosestProjectDirectory } from '@bronya.js/core/utils'
import type { APIGatewayProxyHandler } from 'aws-lambda'
import bodyParser from 'body-parser'
import { watch } from 'chokidar'
import { consola } from 'consola'
import cors from 'cors'
import express, { Router } from 'express'

import type { Api, RouteInfo } from '../../api.js'
import { buildApiRoute } from '../../scripts/build.js'

import {
  HttpMethodsToExpress,
  apiGatewayPathToExpressPath,
  wrapExpressHandler,
  isMethod,
  type Method,
  type ServerHooks,
} from './api-gateway-interop.js'

/**
 * Options for the Express.js development server.
 */
export interface ServerOptions {
  /**
   * Protocol to use for the development server.
   *
   * @example 'http' | 'https'
   *
   * @default 'http'
   */
  protocol?: string

  /**
   * Host to use for the development server.
   *
   * @default 'localhost'
   */
  host?: string

  /**
   * Port to use for the development server.
   *
   * @default 8080
   */
  port?: number

  /**
   * Customize the behavior of the Express.js wrapper.
   */
  hooks?: ServerHooks
}

/**
 * Start an Express.js development server for the API construct.
 *
 * @param overrides Override the development server options from the API construct's config.
 */
export async function startExpressApiDevelopmentServer(api: Api, overrides: ServerOptions = {}) {
  /**
   * Don't import `require` until we need it.
   */
  let require: NodeRequire

  /**
   * Merge.
   */
  const options = {
    ...overrides,
    protocol: overrides.protocol ?? 'http',
    host: overrides.host ?? 'localhost',
    port: overrides.port ?? 8080,
  }

  const currentProject = getClosestProjectDirectory()

  if (api.config.root === currentProject) {
    consola.info(
      `🎏 Starting root dev server. All endpoints from ${api.config.directory} will be served.`,
    )
  } else {
    consola.info(
      `🎏 Starting local dev server. Only the current endpoint, ${currentProject} will be served at the "/" route.`,
    )
    api.config.directory = path.resolve(currentProject)
  }

  const apiRoutePaths = Object.keys(api.routes)

  const apiRoutes = Object.values(api.routes)

  /**
   * Build all endpoints.
   */
  await Promise.all(
    apiRoutes.map(async (apiRouteInfo) => {
      consola.info(`🔨 Building ${apiRouteInfo.directory} to ${apiRouteInfo.outDirectory}`)

      await buildApiRoute(apiRouteInfo)

      consola.info(`✅ Done building ${apiRouteInfo.directory} to ${apiRouteInfo.outDirectory}`)
    }),
  )

  const app = express()

  app.use(cors(), bodyParser.json())

  /**
   * Mutable global router can be hot-swapped when routes change.
   * To update the routes, re-assign the global router, and load all endpoint routes into the new router.
   */
  let router = Router()

  app.use((req, res, next) => router(req, res, next))

  /**
   * Routes mapped to ExpressJS routers, i.e. middleware.
   */
  const routers: Record<string, Router> = {}

  /**
   * Replace the global router with a fresh one and reload all endpoints.
   */
  const refreshRouter = () => {
    router = Router()

    apiRoutes.forEach((apiRouteInfo) => {
      consola.info(`🔄 Loading ${apiRouteInfo.endpoint} from ${apiRouteInfo.outDirectory}`)

      const apiRouteRouter = routers[apiRouteInfo.directory]

      if (apiRouteRouter) {
        router.use(apiRouteRouter)
      }
    })
  }

  /**
   * Load a specific endpoint's middleware.
   */
  const loadEndpoint = async (apiRouteInfo: RouteInfo) => {
    consola.info(`⚙  Setting up router for ${apiRouteInfo.endpoint}`)

    routers[apiRouteInfo.directory] = Router()

    const file = path.resolve(apiRouteInfo.outDirectory, apiRouteInfo.exitPoint)

    /**
     * Possible TODO/FIXME: this leaks memory.
     */
    const internalHandlers =
      apiRouteInfo.esbuild.format === 'cjs'
        ? (require ??= createRequire(__filename))(file)
        : await import(`${file}?update=${Date.now()}`)

    if (internalHandlers == null) {
      consola.error(`🚨 Failed to load ${apiRouteInfo.directory}. No exports found.`)
      return
    }

    const handlerFunctions = internalHandlers.default ?? internalHandlers

    Object.entries(handlerFunctions)
      .filter((entry): entry is [Method, APIGatewayProxyHandler] => isMethod(entry[0]))
      .forEach(([httpMethod, handler]) => {
        const expressMethod = HttpMethodsToExpress[httpMethod]

        const apiRouteRouter = routers[apiRouteInfo.directory]

        if (apiRouteRouter == null) {
          consola.error(`🚨 Failed to load ${apiRouteInfo.directory}. No router found.`)
          return
        }

        const endpoint = apiGatewayPathToExpressPath(apiRouteInfo.endpoint)

        console.log(`Route loaded: ${expressMethod}: ${endpoint}`)

        /**
         * @example `router.get('/v1/rest/endpoint', wrapExpressHandler(handler))`
         */
        apiRouteRouter[expressMethod](endpoint, wrapExpressHandler(handler, options.hooks))
      })
  }

  // Prepare the development server by loading all the endpoints and refreshing the routes.

  await Promise.all(apiRoutes.map(loadEndpoint)).then(refreshRouter)

  app.listen(options.port, () => {
    consola.info(
      `🎉 Express server listening at ${options.protocol}://${options.host}:${options.port}`,
    )
  })

  const outputDirectories = apiRoutes.map((apiRoute) =>
    path.resolve(currentProject, apiRoute.directory, apiRoute.outDirectory),
  )

  //--------------------------------------------------------------------------------------
  // Watch file changes.
  //--------------------------------------------------------------------------------------

  const watcher = watch(apiRoutePaths, {
    ignored: [
      /(^|[/\\])\../, // dotfiles
      /node_modules/, // node_modules
      ...outputDirectories,
    ],
  })

  watcher.on('change', async (fileChanged) => {
    const endpoint = path.dirname(fileChanged)

    consola.success('✨ endpoint changed: ', endpoint)

    const apiRouteInfo = api.routes[endpoint]

    if (apiRouteInfo == null) {
      consola.error(`🚨 Failed to load ${endpoint}. No router found.`)
      return
    }

    await buildApiRoute(apiRouteInfo)

    await loadEndpoint(apiRouteInfo)

    refreshRouter()
  })
}
