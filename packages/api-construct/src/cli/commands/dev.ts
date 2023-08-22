import path from 'node:path'

import { getClosestProjectDirectory } from '@bronya.js/core/utils'
import type {
  APIGatewayProxyHandler,
  APIGatewayProxyCallback,
  APIGatewayProxyEvent,
  Context,
} from 'aws-lambda'
import bodyParser from 'body-parser'
import chokidar from 'chokidar'
import { consola } from 'consola'
import cors from 'cors'
import express, { Router, type Handler } from 'express'

import type { Api, RouteInfo } from '../../api.js'
import { buildApiRoute } from '../../scripts/build.js'

/**
 * Translates the HTTP verbs for API Gateway into ExpressJS methods.
 */
const HttpMethodsToExpress = {
  DELETE: 'delete',
  GET: 'get',
  HEAD: 'head',
  PATCH: 'patch',
  POST: 'post',
  PUT: 'put',
  OPTIONS: 'options',
  ANY: 'use',
} as const

type Method = keyof typeof HttpMethodsToExpress

function isMethod(method: string): method is keyof typeof HttpMethodsToExpress {
  return method in HttpMethodsToExpress
}

function noop() {
  /* noop */
}

/**
 * Type guard that asserts the value of an object entry is not null.
 */
function entryValueNotNull<T>(v: [string, T]): v is [string, NonNullable<T>] {
  return v != null
}

/**
 * Given some dumb looking object, return a nicer looking one.
 */
export function normalizeRecord(headers: unknown): Record<string, string> {
  const headerEntries = Object.entries(headers ?? {})
    .filter(entryValueNotNull)
    .map(([k, v]) => [k, Array.isArray(v) ? (v.length === 1 ? v[0] : v) : v])

  return Object.fromEntries(headerEntries)
}

function wrapExpressHandler(handler: APIGatewayProxyHandler): Handler {
  return async (req, res, next) => {
    const callback: APIGatewayProxyCallback = (error, response) => {
      if (error) {
        next(error)
        return
      }

      if (response == null) {
        next(new Error('No response from handler'))
        return
      }

      res.status(response.statusCode ?? 200).json(response.body)
    }

    let headers: Record<string, string | string>
    let query: Record<string, string | string>

    const event: APIGatewayProxyEvent = {
      body: req.body,
      get headers() {
        headers ??= normalizeRecord(req.headers)
        return headers
      },
      get multiValueHeaders() {
        return {}
      },
      httpMethod: req.method,
      get isBase64Encoded() {
        return false
      },
      path: req.path,
      pathParameters: req.params,
      get queryStringParameters() {
        query ??= normalizeRecord(req.query)
        return query
      },
      get multiValueQueryStringParameters() {
        return {}
      },
      stageVariables: null,
      requestContext: {
        accountId: '',
        apiId: '',
        authorizer: {},
        protocol: '',
        httpMethod: req.method,
        identity: {
          accessKey: null,
          accountId: null,
          apiKey: null,
          apiKeyId: null,
          caller: null,
          clientCert: null,
          cognitoAuthenticationProvider: null,
          cognitoAuthenticationType: null,
          cognitoIdentityId: null,
          cognitoIdentityPoolId: null,
          principalOrgId: null,
          sourceIp: '',
          user: null,
          userAgent: null,
          userArn: null,
        },
        path: req.path,
        stage: '',
        requestId: '',
        requestTimeEpoch: 0,
        resourceId: '',
        resourcePath: '',
      },
      resource: '',
    }

    const context: Context = {
      callbackWaitsForEmptyEventLoop: true,
      functionName: '',
      functionVersion: '',
      invokedFunctionArn: '',
      memoryLimitInMB: '',
      awsRequestId: '',
      logGroupName: '',
      logStreamName: '',
      identity: undefined,

      getRemainingTimeInMillis() {
        return 69
      },

      done: noop,
      fail: noop,
      succeed: noop,
    }

    const result = await handler(event, context, callback)

    if (!result) {
      return
    }

    res.status(result.statusCode)
    res.set(result.headers)

    try {
      res.send(JSON.parse(result.body))
    } catch {
      res.send(result.body)
    }
  }
}

/**
 * Options for the Express.js development server.
 */
export interface ServerOptions {
  /**
   * Protocol to use for the development server.
   *
   * @default 'http'
   */
  protocol?: 'http' | 'https'

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
}

/**
 * Start an Express.js development server for the API construct.
 *
 * @param overrides Override the development server options from the API construct's config.
 */
export async function startExpressApiDevelopmentServer(api: Api, overrides: ServerOptions = {}) {
  /**
   * Merge.
   */
  const developmentOptions = {
    protocol: overrides.protocol ?? api.config.development?.protocol ?? 'http',
    host: overrides.host ?? api.config.development?.host ?? 'localhost',
    port: overrides.port ?? api.config.development?.port ?? 8080,
  }

  const currentProject = getClosestProjectDirectory()

  if (api.root === currentProject) {
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

    const file = path.resolve(
      apiRouteInfo.directory,
      apiRouteInfo.outDirectory,
      apiRouteInfo.exitPoint,
    )

    const internalHandlers = await import(`${file}?update=${Date.now()}`)

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
        apiRouteRouter[expressMethod](endpoint, wrapExpressHandler(handler))
      })
  }

  /**
   * Prepare the development server by loading all the endpoints and refreshing the routes.
   */
  await Promise.all(apiRoutes.map(loadEndpoint)).then(refreshRouter)

  app.listen(developmentOptions.port, () => {
    consola.info(
      `🎉 Express server listening at ${developmentOptions.protocol}://${developmentOptions.host}:${developmentOptions.port}`,
    )
  })

  const outputDirectories = apiRoutes.map((apiRoute) =>
    path.resolve(currentProject, apiRoute.directory, apiRoute.outDirectory),
  )

  //---------------------------------------------------------------------------------
  // Watch file changes.
  //---------------------------------------------------------------------------------

  const watcher = chokidar.watch(apiRoutePaths, {
    ignored: [
      /(^|[/\\])\../, // dotfiles
      /node_modules/, // node_modules
      ...outputDirectories,
    ],
  })

  watcher.on('change', async (path) => {
    const endpoint = getClosestProjectDirectory(path)

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

/**
 * Convert path parameters from an API Gateway path to an Express.js path.
 *
 * @example '/v1/rest/{id}/{name}' -> '/v1/rest/:id/:name'
 */
function apiGatewayPathToExpressPath(apiGatewayPath: string): string {
  return apiGatewayPath.replace(/{([^}]+)}/g, ':$1')
}
