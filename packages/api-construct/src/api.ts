import fs from 'node:fs'
import path from 'node:path'

import { findConfigFile, loadAppFromConfig, BronyaConstruct, Construct } from '@bronya.js/core'
import * as aws_apigateway from 'aws-cdk-lib/aws-apigateway'
import * as aws_events from 'aws-cdk-lib/aws-events'
import * as aws_events_targets from 'aws-cdk-lib/aws-events-targets'
import * as aws_lambda from 'aws-cdk-lib/aws-lambda'
import * as aws_core from 'aws-cdk-lib/core'
import type { BuildOptions } from 'esbuild'

import { startExpressApiDevelopmentServer, type ServerOptions } from './cli/commands/dev.js'
import { createApiPlugin } from './cli/index.js'
import { warmerRequestBody } from './constants.js'
import {
  findAllProjects,
  getClosestProjectDirectory,
  getNamedExports,
  type DeepPartial,
} from './utils/index.js'

/**
 * The root API construct can configure the follow settings as defaults for all routes.
 */
export interface ApiProps {
  /**
   * The root of where to define API routes relative to.
   */
  root?: string

  /**
   * Directory to look for API routes, i.e. sub-projects. Relative from {@link root}.
   */
  directory: string

  /**
   * The file exporting API handlers. Relative from {@link directory}.
   *
   * @example src/index.ts
   */
  entryPoint: string

  /**
   * The directory to build the files to. Relative from {@link directory}.
   */
  outDirectory: string

  /**
   * The built output file, relative from {@link outDirectory}, **excluding the extension**.
   *
   * @default path.basename of {@link entryPoint} without the 'js' extension.
   */
  exitPoint: string

  /**
   * Controls how/what AWS constructs are created.
   */
  constructs?: ApiConstructProps | null | void

  /**
   * ESBuild options.
   */
  esbuild?: BuildOptions

  /**
   * Settings for the Express.js development server.
   */
  development?: ServerOptions

  /**
   * Environment variables to pass to the Lambda Function.
   */
  environment?: Record<string, string>

  /**
   * Explicitly routed endpoints.
   */
  routes?: Record<string, string>
}

/**
 * Options during synth process.
 */
export interface SynthProps {
  /**
   * Control how/what AWS constructs are created.
   */
  constructs?: ApiConstructProps
}

/**
 * Control how/what AWS constructs are created.
 */
export interface ApiConstructProps {
  /**
   * The API Gateway Rest API props. Can only be set at the API root.
   * FIXME: Idk the best way to enforce this. :shrug
   */
  restApiProps?: (scope: Api, id: string) => aws_apigateway.RestApiProps

  functionProps?: (scope: Api, id: string) => aws_lambda.FunctionProps

  lambdaIntegrationOptions?: (
    scope: Api,
    id: string,
    methodAndRoute: string,
  ) => aws_apigateway.LambdaIntegrationOptions

  methodOptions?: (scope: Api, id: string, methodAndRoute: string) => aws_apigateway.MethodOptions

  /**
   * Doesn't override props; just indicates whether to also create a warming rule.
   */
  includeWarmers?: boolean

  /**
   * TODO: warming rule props?
   * warmingRuleProps?: (scope: Api, id: string, methodAndRoute: string) => aws_events.RuleProps
   */
}

/**
 * Every route contains metadata about the route and the resources provisioned for it.
 */
export interface RouteInfo extends ApiProps {
  /**
   * The API route.
   *
   * @example v1/rest/calendar
   *
   * @remarks Does __not__ include the leading slash.
   */
  endpoint: string

  /**
   * HTTP Methods that the API route supports.
   *
   * @example ["GET", "POST"]
   *
   * @remarks "HEAD" and "GET" must both be included together per the HTTP spec. But we'll handle that for you.
   */
  methods: string[]
}

/**
 * The resources provisioned for a single HTTP method handler.
 * Generally only known only after {@link Api.synth} has been invoked to actually create the resources.
 */
export interface FunctionResources {
  functionProps: aws_lambda.FunctionProps

  function: aws_lambda.Function

  lambdaIntegrationOptions?: aws_apigateway.LambdaIntegrationOptions

  lambdaIntegration?: aws_apigateway.LambdaIntegration

  methodOptions?: aws_apigateway.MethodOptions

  warmingTarget?: aws_events_targets.LambdaFunction

  warmingRule?: aws_events.Rule
}

/**
 */
export class Api extends BronyaConstruct {
  public static readonly type = 'API' as const

  public readonly type = Api.type

  public static isApi(x: unknown): x is Api {
    return Construct.isConstruct(x) && 'type' in x && x['type'] === Api.type
  }

  public root: string

  routes: Record<string, RouteInfo> = {}

  constructor(
    readonly scope: Construct,
    readonly id: string,
    readonly config: ApiProps,
  ) {
    super(scope, id)

    this.root = config.root ?? getClosestProjectDirectory()

    this.plugins.push(createApiPlugin())
  }

  /**
   * Initialize the route configs.
   */
  async init() {
    const apiRoutesDirectory = path.resolve(this.root, this.config.directory)

    const projects = findAllProjects(apiRoutesDirectory)

    await Promise.all(
      projects.map(async (directory) => {
        const configFile = findConfigFile(directory)

        if (!configFile) {
          const entryPoint = path.resolve(directory, this.config.entryPoint ?? 'src/index.ts')

          const exitPoint = this.config.exitPoint ?? path.basename(entryPoint)

          const methods = getNamedExports(fs.readFileSync(entryPoint, 'utf-8'))

          const outDirectory = path.resolve(directory, this.config.outDirectory ?? 'dist')

          const endpoint = path.join(
            '/',
            path.relative(path.resolve(this.root, apiRoutesDirectory), directory),
          )

          const routeInfo = {
            directory,
            endpoint,
            entryPoint,
            exitPoint,
            methods,
            outDirectory,
            esbuild: this.config.esbuild,
            environment: this.config.environment,
            constructs: this.config.constructs,
          } satisfies RouteInfo

          this.routes[directory] = routeInfo

          if (this.config.routes != null) {
            Object.entries(this.config.routes)
              .filter(([, value]) => value === endpoint)
              .forEach(([key, value]) => {
                this.routes[key] = {
                  ...routeInfo,
                  endpoint: value,
                }
              })
          }

          return
        }

        /**
         * Load the app from the current project.
         */
        const app = await loadAppFromConfig(directory)

        const apiOverride = await getApiOverride(app)

        const mergedProps = {
          ...apiOverride?.config,
          ...this.config,
          esbuild: {
            ...apiOverride?.config?.esbuild,
            ...this.config.esbuild,
          },
          development: {
            ...apiOverride?.config?.development,
            ...this.config.development,
          },
          constructs: {
            ...apiOverride?.config?.constructs,
            ...this.config.constructs,
          },
          environment: {
            ...apiOverride?.config?.environment,
            ...this.config.environment,
          },
        }

        const entryPoint = path.resolve(directory, mergedProps.entryPoint ?? 'src/index.ts')

        const exitPoint = mergedProps.exitPoint ?? path.basename(entryPoint)

        const methods = getNamedExports(fs.readFileSync(entryPoint, 'utf-8'))

        const outDirectory = path.resolve(directory, mergedProps.outDirectory ?? 'dist')

        const endpoint = path.join(
          '/',
          path.relative(path.resolve(this.root, apiRoutesDirectory), directory),
        )

        const routeInfo = {
          directory,
          endpoint,
          entryPoint,
          exitPoint,
          methods,
          outDirectory,
          esbuild: mergedProps.esbuild,
          environment: mergedProps.environment,
          constructs: mergedProps.constructs,
        } satisfies RouteInfo

        this.routes[directory] = routeInfo

        if (this.config.routes != null) {
          Object.entries(this.config.routes)
            .filter(([, value]) => value === endpoint)
            .forEach(([key, value]) => {
              this.routes[key] = {
                ...routeInfo,
                endpoint: value,
              }
            })
        }
      }),
    )
  }

  /**
   * Allocate AWS resources with the AWS-CDK.
   */
  async synth(props: SynthProps = {}) {
    const api = new aws_apigateway.RestApi(
      this,
      `${this.id}-REST-API`,
      props.constructs?.restApiProps?.(this, this.id),
    )

    const functions: Record<string, FunctionResources> = {}

    await Promise.all(
      Object.entries(this.routes).map(async ([directory, route]) => {
        /**
         * In-case the endpoint starts with a slash, trim it.
         *
         * @example /v1/rest/calendar -> v1/rest/calendar
         */
        const resource = route.endpoint
          .replace(/^\//, '')
          .split('/')
          .reduce((resource, route) => {
            return resource.getResource(route) ?? resource.addResource(route)
          }, api.root)

        /**
         * Relative out directory used to set handler for AWS Lambda.
         */
        const outDirectory = path.relative(directory, route.outDirectory)

        route.methods
          // .filter(isHttpMethod)
          .forEach((httpMethod) => {
            const getFunctionProps =
              props.constructs?.functionProps ?? route.constructs?.functionProps

            const getLambdaIntegrationOptions =
              props.constructs?.lambdaIntegrationOptions ??
              route.constructs?.lambdaIntegrationOptions

            const getMethodOptions =
              props.constructs?.methodOptions ?? route.constructs?.methodOptions

            const functionName = `${this.id}-${route.endpoint}-${httpMethod}`.replace(/\//g, '-')

            const customFunctionProps = getFunctionProps?.(this, this.id)

            const defaultFunctionProps: aws_lambda.FunctionProps = {
              functionName,
              runtime: aws_lambda.Runtime.NODEJS_18_X,
              code: aws_lambda.Code.fromAsset(directory, { exclude: ['node_modules'] }),
              handler: path.join(outDirectory, route.exitPoint.replace(/.js$/, `.${httpMethod}`)),
              architecture: aws_lambda.Architecture.ARM_64,
              environment: { ...route.environment },
              timeout: aws_core.Duration.seconds(15),
              memorySize: 512,
            }

            const functionProps = { ...defaultFunctionProps, ...customFunctionProps }

            const handler = new aws_lambda.Function(
              this,
              `${this.id}-${functionProps.functionName}-handler`,
              functionProps,
            )

            const methodAndRoute = `${httpMethod} ${route.endpoint}`

            const lambdaIntegrationOptions = getLambdaIntegrationOptions?.(
              this,
              this.id,
              methodAndRoute,
            )

            const lambdaIntegration = new aws_apigateway.LambdaIntegration(
              handler,
              lambdaIntegrationOptions,
            )

            const methodOptions = getMethodOptions?.(this, this.id, methodAndRoute)

            resource.addMethod(httpMethod, lambdaIntegration, methodOptions)

            const functionResources: FunctionResources = {
              functionProps,
              function: handler,
              lambdaIntegration,
              lambdaIntegrationOptions,
              methodOptions,
            }
            if (props.constructs?.includeWarmers) {
              const warmingTarget = new aws_events_targets.LambdaFunction(handler, {
                event: aws_events.RuleTargetInput.fromObject({ body: warmerRequestBody }),
              })

              const warmingRule = new aws_events.Rule(
                this,
                `${this.id}-${functionProps.functionName}-warming-rule`,
                {
                  schedule: aws_events.Schedule.rate(aws_core.Duration.minutes(5)),
                },
              )

              warmingRule.addTarget(warmingTarget)

              functionResources.warmingTarget = warmingTarget
              functionResources.warmingRule = warmingRule
            }

            functions[httpMethod] = functionResources
          })
      }),
    )

    return {
      api,
      functions,
    }
  }

  /**
   * Start an Express.js development server.
   */
  async dev(options?: ServerOptions) {
    return startExpressApiDevelopmentServer(this, options)
  }
}

/**
 * A special construct that overrides the default settings set by {@link Api} for a specific API route.
 * Create a config file and create an {@link aws_core.App} as usual, but with this construct to override.
 */
export class ApiPropsOverride extends BronyaConstruct {
  public static readonly type = 'api-props-override' as const

  public readonly type = ApiPropsOverride.type

  /**
   * Used on initialized constructs, i.e. part of a node's children, to determine if they are of this type.
   */
  public static isApiRouteConfigOverride(x: unknown): x is ApiPropsOverride {
    return BronyaConstruct.isConstruct(x) && 'type' in x && x['type'] === ApiPropsOverride.type
  }

  public config: DeepPartial<ApiProps>

  constructor(scope: Construct, id: string, config: DeepPartial<ApiProps> = {}) {
    super(scope, id)

    this.config = config
  }
}

export async function getApiOverride(
  initializedApp?: aws_core.App,
): Promise<ApiPropsOverride | undefined> {
  const app = initializedApp ?? (await loadAppFromConfig())

  const stacks = app.node.children.filter(aws_core.Stack.isStack)

  if (!stacks) {
    throw new Error(`No stacks found.`)
  }

  const stackWithApiOverride = stacks.find((stack) =>
    stack.node.children.some(ApiPropsOverride.isApiRouteConfigOverride),
  )

  const apiOverride = stackWithApiOverride?.node.children.find(
    ApiPropsOverride.isApiRouteConfigOverride,
  )

  if (!apiOverride) {
    return undefined
  }

  return apiOverride
}
