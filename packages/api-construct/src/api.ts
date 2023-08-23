import { createRequire } from 'node:module'
import path from 'node:path'

import { BronyaConstruct, Construct } from '@bronya.js/core'
import * as aws_apigateway from 'aws-cdk-lib/aws-apigateway'
import * as aws_events from 'aws-cdk-lib/aws-events'
import * as aws_events_targets from 'aws-cdk-lib/aws-events-targets'
import * as aws_lambda from 'aws-cdk-lib/aws-lambda'
import * as aws_core from 'aws-cdk-lib/core'
import type { BuildOptions } from 'esbuild'

import { isHttpMethod, warmerRequestBody } from './integrations/lambda/index.js'
import type { ApiPlugin } from './plugins/index.js'
import { buildApiRoute } from './scripts/build.js'
import type { DeepPartial } from './utils/deep-partial.js'
import { findDirectoriesWithFile } from './utils/directories.js'
import { getClosestProjectDirectory } from './utils/project.js'

/**
 * The root API construct can configure the follow settings as defaults for all routes.
 */
export interface ApiProps {
  /**
   * The project root directory.
   *
   * @default process.cwd()
   *
   * @example
   *  root
   * ├──  package.json
   * └──  src
   *     ├──  sub-route
   *     │   └──  +endpoint.ts
   *     └──  +endpoint.ts
   */
  root: string

  /**
   * Directory to look for API routes, Relative from {@link root}.
   *
   * @default 'src'
   */
  directory: string

  /**
   * Filename indicating an endpoint.
   *
   * @default '+endpoint.ts'
   */
  entryPoint: string

  /**
   * The cache directory to build the endpoint handler files to.
   *
   * This is created in every directory with an endpoint.
   *
   * @default '.bronya'
   */
  outDirectory: string

  /**
   * The built output file, relative from {@link outDirectory}, **with the JS extension**.
   *
   * This is the file that the AWS Lambda Function will set as the handler.
   *
   * @default 'handler.js'
   */
  exitPoint: string

  /**
   * Controls how/what AWS constructs are created.
   */
  constructs: ApiConstructProps | null | void

  /**
   * ESBuild options.
   *
   * @remarks The format **MUST BE** either 'cjs' or 'esm', **NOT** 'iife'.
   */
  esbuild: BuildOptions

  /**
   * Environment variables to pass to the Lambda Function.
   */
  environment?: Record<string, string>

  /**
   * Plugins to pass to the core {@link BronyaConstruct}.
   */
  plugins?: ApiPlugin
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
   *
   * FIXME: Idk the best way to enforce this. :shrug:
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
   *
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

  /**
   * The parent construct.
   */
  public scope: Construct

  /**
   * The construct ID.
   */
  public id: string

  /**
   * The root directory of the API. i.e. project root.
   */
  public root: string

  /**
   * Route information is available after initializing.
   */
  public routes: Record<string, RouteInfo> = {}

  /**
   * The API configuration.
   */
  public config: ApiProps

  constructor(scope: Construct, id: string, config: Partial<ApiProps> = {}) {
    super(scope, id)

    this.id = id

    this.scope = scope

    this.root = config.root ?? getClosestProjectDirectory()

    this.config = {
      root: process.cwd(),
      directory: 'src',
      entryPoint: '+endpoint.ts',
      outDirectory: '.bronya',
      exitPoint: 'handler.js',
      esbuild: {},
      constructs: {},
      environment: {},
      ...config,
    }

    if (config.plugins) {
      const plugins = config.plugins(this)
      const pluginArray = Array.isArray(plugins) ? plugins : [plugins]
      this.plugins.push(...pluginArray)
    }
  }

  /**
   * Initialize the route configs.
   */
  async init() {
    /**
     * Lazily computed.
     */
    let require: NodeRequire

    const apiRoutesDirectory = path.resolve(this.root, this.config.directory)

    const entryFileName = this.config.entryPoint ?? '+endpoint.ts'

    const projects = findDirectoriesWithFile(entryFileName, apiRoutesDirectory)

    const apiRoutesRootDirectory = path.resolve(this.root, apiRoutesDirectory)

    const processDirectory = async (
      directory: string,
      endpoint = path.join('/', path.relative(apiRoutesRootDirectory, directory)),
    ) => {
      const entryPoint = path.resolve(directory, this.config.entryPoint)

      const exitPoint = this.config.exitPoint ?? path.basename(entryPoint)

      const outDirectory = path.resolve(directory, this.config.outDirectory)

      const esbuild = this.config.esbuild

      await buildApiRoute({ esbuild, entryPoint, exitPoint, outDirectory })

      const file = path.resolve(outDirectory, exitPoint)

      const exports =
        esbuild.format === 'cjs'
          ? (require ??= createRequire(__filename))(file)
          : await import(`${file}?update=${Date.now()}`)

      const overrides: DeepPartial<RouteInfo> =
        exports?.default?.overrides ?? exports?.overrides ?? {}

      this.routes[directory] = {
        ...this.config,
        directory,
        endpoint,
        entryPoint,
        exitPoint,
        methods: Object.keys(exports).filter(isHttpMethod),
        outDirectory,
        ...overrides,
      }
    }

    await Promise.all(projects.map(async (directory) => processDirectory(directory)))
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
        await buildApiRoute(route)

        /**
         * Normalize the endpoint to remove the leading slash.
         */
        const routeEndpoint = path.normalize(route.endpoint).replace(/^\//, '')

        /**
         * In-case the endpoint starts with a slash, trim it.
         *
         * @example /v1/rest/calendar -> v1/rest/calendar
         */
        const resource = routeEndpoint.split('/').reduce((resource, route) => {
          return route ? resource.getResource(route) ?? resource.addResource(route) : resource
        }, api.root)

        /**
         * Relative out directory used to set handler for AWS Lambda.
         */
        const outDirectory = path.relative(directory, route.outDirectory)

        route.methods.forEach((httpMethod) => {
          const getFunctionProps =
            props.constructs?.functionProps ?? route.constructs?.functionProps

          const getLambdaIntegrationOptions =
            props.constructs?.lambdaIntegrationOptions ?? route.constructs?.lambdaIntegrationOptions

          const getMethodOptions =
            props.constructs?.methodOptions ?? route.constructs?.methodOptions

          const functionName = `${this.id}-${routeEndpoint}-${httpMethod}`.replace(/\//g, '-')

          const customFunctionProps = getFunctionProps?.(this, this.id)

          const defaultFunctionProps: aws_lambda.FunctionProps = {
            functionName,
            runtime: aws_lambda.Runtime.NODEJS_18_X,
            code: aws_lambda.Code.fromAsset(directory, { exclude: ['node_modules'] }),
            handler: path.join(outDirectory, route.exitPoint.replace(/\..?js$/, `.${httpMethod}`)),
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

          const methodAndRoute = `${httpMethod} ${routeEndpoint}`

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

    return { api, functions }
  }
}
