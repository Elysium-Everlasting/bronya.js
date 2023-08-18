import * as aws_apigateway from 'aws-cdk-lib/aws-apigateway'
import * as aws_events from 'aws-cdk-lib/aws-events'
import * as aws_events_targets from 'aws-cdk-lib/aws-events-targets'
import * as aws_lambda from 'aws-cdk-lib/aws-lambda'
import { Construct } from 'constructs'
import type { BuildOptions } from 'esbuild'
// import { findConfigFile, loadAppFromConfig } from './config.js'
// import type { DeepPartial } from './utils/deep-partial.js'
// import { getNamedExports } from './utils/static-analysis.js'
// import { findAllProjects, getWorkspaceRoot } from './utils/project.js'
// import { warmerRequestBody } from '../../dev/lambda/constants'

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
   */
  entryPoint: string

  /**
   * The directory to build the files to. Relative from {@link directory}.
   */
  outDirectory: string

  /**
   * Controls how the output files are generated.
   */
  runtime: ApiRuntimeOptions

  /**
   * Controls how/what AWS constructs are created.
   */
  constructs?: ApiConstructProps | null | void
}

/**
 * Controls how the output files are generated.
 */
export interface ApiRuntimeOptions {
  /**
   * ESBuild options.
   */
  esbuild: BuildOptions

  /**
   * Name of the built entry file. It's temporary and used to create the specific runtime files.
   *
   * @default "index.js"
   */
  indexRuntimeFile: string

  /**
   * Name of dynamically generated script for AWS Lambda's NodeJS runtime.
   *
   * @default "lambda-node-runtime.js"
   *
   * @example
   *
   * ```js
   * import { handler } from "./lambda-node-runtime.js"
   * ```
   */
  nodeRuntimeFile: string

  /**
   * Name of dynamically generated script for AWS Lambda's Bun runtime.
   *
   * @default "lambda-bun-runtime.js"
   *
   * @example
   *
   * ```js
   * import { handler } from "./lambda-bun-runtime.js"
   * ```
   */
  bunRuntimeFile: string

  /**
   * What to name the imported handlers from the built entry file.
   *
   * @default InternalHandlers
   *
   * @example
   *
   * ```js
   * import * as InternalHandlers from "./dist/index.js"
   * ```
   */
  entryHandlersName: string

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

  routes: Record<string, RouteInfo> = {}

  constructor(
    scope: Construct,
    id: string,
    readonly config: ApiProps,
  ) {
    super(scope, id)
  }
}
