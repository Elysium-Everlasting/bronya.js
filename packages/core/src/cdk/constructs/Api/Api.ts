import fs from 'node:fs'
import path from 'node:path'

import * as aws_apigateway from 'aws-cdk-lib/aws-apigateway'
import * as aws_events from 'aws-cdk-lib/aws-events'
import * as aws_events_targets from 'aws-cdk-lib/aws-events-targets'
import * as aws_lambda from 'aws-cdk-lib/aws-lambda'
import * as aws_core from 'aws-cdk-lib/core'
import { Construct } from 'constructs'
import { defu } from 'defu'
import type { BuildOptions } from 'esbuild'

import { findConfigFile, loadAppFromConfig } from '../../../config.js'
import type { DeepPartial } from '../../../utils/deep-partial.js'
import { findAllProjects, getWorkspaceRoot } from '../../../utils/project.js'
import { getNamedExports } from '../../../utils/static-analysis.js'

/**
 * The root API construct can configure the follow settings as defaults for all routes.
 */
export interface ApiProps {
  /**
   * The project root (where the `package.json` is located).
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
  esbuild: BuildOptions

  /**
   * Environment variables to pass to the Lambda Function.
   */
  environment: Record<string, string>
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

export class Api extends Construct {
  public static readonly type = 'API' as const

  public readonly type = Api.type

  public static isApi(x: unknown): x is Api {
    return Construct.isConstruct(x) && 'type' in x && x['type'] === Api.type
  }

  public readonly config: ApiProps

  routes: Record<string, RouteInfo> = {}

  constructor(scope: Construct, id: string, config: ApiProps) {
    super(scope, id)

    this.config = config
  }

  async init() {
    const workspaceRoot = getWorkspaceRoot()

    const apiRoutesDirectory = path.resolve(workspaceRoot, this.config.directory)

    const projects = findAllProjects(apiRoutesDirectory)

    await Promise.all(
      projects.map(async (directory) => {
        const configFile = findConfigFile(directory)

        if (!configFile) {
          const entryPoint = path.resolve(directory, this.config.entryPoint ?? 'src/index.ts')

          const exitPoint = this.config.exitPoint ?? path.parse(entryPoint).name

          const methods = getNamedExports(fs.readFileSync(entryPoint, 'utf-8'))

          const outDirectory = path.resolve(directory, this.config.outDirectory ?? 'dist')

          const endpoint = path.relative(path.resolve(workspaceRoot, apiRoutesDirectory), directory)

          this.routes[directory] = {
            directory,
            endpoint,
            entryPoint,
            exitPoint,
            methods,
            outDirectory,
            esbuild: this.config.esbuild,
            environment: this.config.environment,
            constructs: this.config.constructs,
          }

          return
        }

        /**
         * Load the app from the current project.
         */
        const app = await loadAppFromConfig(directory)

        const apiOverride = await getApiOverride(app)

        const mergedProps = defu(apiOverride?.config, this.config)

        const entryPoint = path.resolve(directory, mergedProps.entryPoint ?? 'src/index.ts')

        const exitPoint = mergedProps.exitPoint ?? path.parse(entryPoint).name

        const methods = getNamedExports(fs.readFileSync(entryPoint, 'utf-8'))

        const outDirectory = path.resolve(directory, mergedProps.outDirectory ?? 'dist')

        const endpoint = path.relative(path.resolve(workspaceRoot, apiRoutesDirectory), directory)

        this.routes[directory] = {
          directory,
          endpoint,
          entryPoint,
          exitPoint,
          methods,
          outDirectory,
          esbuild: mergedProps.esbuild,
          environment: mergedProps.environment,
          constructs: mergedProps.constructs,
        }
      }),
    )
  }
}

/**
 * A special construct that overrides the default settings set by {@link Api} for a specific API route.
 * Create a `klein.config.ts` file and create an {@link aws_core.App} as usual, but with this construct to override.
 */
export class ApiPropsOverride extends Construct {
  public static readonly type = 'api-props-override' as const

  public readonly type = ApiPropsOverride.type

  /**
   * Used on initialized constructs, i.e. part of a node's children, to determine if they are of this type.
   */
  public static isApiRouteConfigOverride(x: unknown): x is ApiPropsOverride {
    return Construct.isConstruct(x) && 'type' in x && x['type'] === ApiPropsOverride.type
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
