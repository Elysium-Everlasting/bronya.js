import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import { BronyaConstruct, Construct } from '@bronya.js/core'
import * as aws_apigateway from 'aws-cdk-lib/aws-apigateway'
import * as aws_lambda from 'aws-cdk-lib/aws-lambda'
import * as aws_core from 'aws-cdk-lib/core'
import type { BuildOptions } from 'esbuild'
import fs from 'fs-extra'
import createJITI from 'jiti'

import { isHttpMethod } from './integrations/lambda/index.js'
import type { ApiPlugin } from './plugins/index.js'
import { buildApiRoute } from './scripts/build.js'
import { toValidAwsName } from './utils/aws-naming.js'
import type { DeepPartial } from './utils/deep-partial.js'
import { findDirectoriesWithFile } from './utils/directories.js'
import {
  resolveDirectoryTree,
  type DirectoryTreeDetails,
  type ResolvedDirectoryTree,
} from './utils/directory-tree.js'
import type { MaybePromise } from './utils/maybe-promise.js'
import type { Nullish } from './utils/nullish.js'
import { getClosestProjectDirectory } from './utils/project.js'

/**
 * The root API construct can configure the follow settings as defaults for all routes.
 */
export interface ApiProps extends DirectoryTreeDetails {
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
 * A function plugin can modify the AWS constructs.
 * If it returns something non-nullish, it will override the original resources.
 */
export type FunctionPlugin = (
  functionResources: FunctionResources,
  scope: Api,
  id: string,
) => MaybePromise<FunctionResources | Nullish>

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

  functionProps?: (scope: Api, id: string, route: RouteInfo) => Partial<aws_lambda.FunctionProps>

  lambdaIntegrationOptions?: (
    scope: Api,
    id: string,
    methodAndRoute: string,
    route: RouteInfo,
  ) => aws_apigateway.LambdaIntegrationOptions

  methodOptions?: (
    scope: Api,
    id: string,
    methodAndRoute: string,
    route: RouteInfo,
  ) => aws_apigateway.MethodOptions

  /**
   * The directory that will be uploaded to the Lambda Function.
   *
   * User can modify the directory before uploading.
   */
  lambdaUpload?: (directory: string, route: RouteInfo) => unknown

  /**
   * Plugins that can modify the AWS constructs.
   */
  functionPlugin?: FunctionPlugin | FunctionPlugin[]
}

/**
 * Every route contains metadata about the route and the resources provisioned for it.
 */
export interface RouteInfo extends ApiProps {
  /**
   * The API route.
   *
   * @example /v1/rest/calendar
   *
   * @remarks **Does include** the leading slash.
   */
  endpoint: string
}

/**
 * The resources provisioned for a single HTTP method handler.
 * Generally only known only after {@link Api.synth} has been invoked to actually create the resources.
 */
export interface FunctionResources {
  functionProps: aws_lambda.FunctionProps

  handler: aws_lambda.Function

  lambdaIntegrationOptions?: aws_apigateway.LambdaIntegrationOptions

  lambdaIntegration?: aws_apigateway.LambdaIntegration

  methodOptions?: aws_apigateway.MethodOptions
}

/**
 * A handler can export a `overrides` object to override the default route configuration.
 */
export type ApiPropsOverride = DeepPartial<ApiProps>

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
   * Route information is available after initializing.
   */
  public routes: Record<string, RouteInfo> = {}

  /**
   * The API configuration.
   */
  public config: ApiProps

  public tree: ResolvedDirectoryTree

  constructor(scope: Construct, id: string, config: Partial<ApiProps> = {}) {
    super(scope, id)

    this.id = id

    this.scope = scope

    this.config = {
      root: config.root ?? getClosestProjectDirectory(),
      directory: 'src',
      entryPoint: '+endpoint.ts',
      configFile: '+config.ts',
      outDirectory: '.bronya',
      exitPoint: 'handler.js',
      uploadDirectory: 'dist',
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

    this.tree = resolveDirectoryTree(this.config)
  }

  /**
   * Initialize the route configs.
   */
  async init() {
    const filesWithEntrypoints = findDirectoriesWithFile(this.tree.entryPoint, this.tree.directory)

    const processDirectory = async (
      directory: string,
      endpoint = this.tree.directoryToEndpoint(directory),
    ) => {
      const entryPoint = path.resolve(directory, this.config.entryPoint)

      const configFile = path.resolve(directory, this.config.configFile)

      const exitPoint = this.config.exitPoint ?? path.basename(entryPoint)

      /**
       * @example /home/user/project/src/.bronya/v1/rest/calendar
       */
      const outDirectory = this.tree.directoryToOutDirectory(directory)

      let overrides: ApiPropsOverride = {}

      if (fs.existsSync(configFile)) {
        const exports = await createJITI(configFile)(configFile)
        overrides = exports?.default?.overrides ?? exports?.overrides ?? {}
      }

      this.routes[directory] = {
        ...this.config,
        directory,
        endpoint,
        entryPoint,
        configFile,
        exitPoint,
        outDirectory,
        ...overrides,
      }
    }

    await Promise.all(filesWithEntrypoints.map(async (directory) => processDirectory(directory)))
  }

  /**
   * Allocate AWS resources with the AWS-CDK.
   */
  async synth(props: SynthProps = {}) {
    let require: NodeRequire

    const api = new aws_apigateway.RestApi(
      this,
      `${this.id}-REST-API`,
      props.constructs?.restApiProps?.(this, this.id),
    )

    const functions: Record<string, FunctionResources> = {}

    await Promise.all(
      Object.entries(this.routes).map(async ([_directory, route]) => {
        await buildApiRoute(route)

        const builtEntryPoint = path.resolve(route.outDirectory, route.exitPoint)

        const exports =
          route.esbuild.format === 'cjs'
            ? (require ??= createRequire(''))(builtEntryPoint)
            : await import(builtEntryPoint)

        const methods = Object.keys(exports).filter(isHttpMethod)

        /**
         * Trim leading slash because API Gateway doesn't need to process it.
         */
        const routeEndpoint = route.endpoint.replace(/^\//, '')

        const resource = routeEndpoint.split('/').reduce((resource, route) => {
          return route ? resource.getResource(route) ?? resource.addResource(route) : resource
        }, api.root)

        for (const httpMethod of methods) {
          const getFunctionProps =
            props.constructs?.functionProps ?? route.constructs?.functionProps

          const getLambdaIntegrationOptions =
            props.constructs?.lambdaIntegrationOptions ?? route.constructs?.lambdaIntegrationOptions

          const getMethodOptions =
            props.constructs?.methodOptions ?? route.constructs?.methodOptions

          const functionName = toValidAwsName(`${this.id}-${routeEndpoint}-${httpMethod}`)

          const customFunctionProps = getFunctionProps?.(this, this.id, route)

          /**
           * @example /home/user/project/src/.bronya/v1/rest/calendar
           */
          const outDirectory = this.tree.directoryToOutDirectory(route.directory)

          const temporaryDirectory = path.join(os.tmpdir(), crypto.randomUUID())

          /**
           * When copying all of a handler's files to the upload directory,
           * don't include nested directories that also have routes.
           */
          const otherOutDirectories = Object.values(this.routes)
            .map((route) => route.outDirectory)
            .filter((directory) => directory !== outDirectory)

          await fs.copy(outDirectory, temporaryDirectory, {
            overwrite: true,
            filter: (src) => {
              return !otherOutDirectories.some((directory) => src === directory)
            },
          })

          await route.constructs?.lambdaUpload?.(temporaryDirectory, route)

          const defaultFunctionProps: aws_lambda.FunctionProps = {
            functionName,
            runtime: aws_lambda.Runtime.NODEJS_18_X,
            code: aws_lambda.Code.fromAsset(temporaryDirectory),
            handler: path.join(route.exitPoint.replace(/\..?js$/, `.${httpMethod}`)),
            architecture: aws_lambda.Architecture.ARM_64,
            environment: { ...route.environment },
            timeout: aws_core.Duration.seconds(15),
            memorySize: 512,
          }

          const functionProps = { ...defaultFunctionProps, ...customFunctionProps }

          const handler = new aws_lambda.Function(
            this,
            `${functionProps.functionName}-handler`,
            functionProps,
          )

          const methodAndRoute = `${httpMethod} ${routeEndpoint}`

          const lambdaIntegrationOptions = getLambdaIntegrationOptions?.(
            this,
            this.id,
            methodAndRoute,
            route,
          )

          const lambdaIntegration = new aws_apigateway.LambdaIntegration(
            handler,
            lambdaIntegrationOptions,
          )

          const methodOptions = getMethodOptions?.(this, this.id, methodAndRoute, route)

          resource.addMethod(httpMethod, lambdaIntegration, methodOptions)

          /**
           * TODO: add a way to customize this, i.e. via a {@link FunctionPlugin}.
           */
          if (httpMethod === 'GET') {
            resource.addMethod('HEAD', lambdaIntegration, methodOptions)
          }

          let functionResources: FunctionResources = {
            functionProps,
            handler,
            lambdaIntegration,
            lambdaIntegrationOptions,
            methodOptions,
          }

          const functionPlugins = Array.isArray(route.constructs?.functionPlugin)
            ? route.constructs?.functionPlugin ?? []
            : [route.constructs?.functionPlugin]

          for (const functionPlugin of functionPlugins) {
            functionResources =
              (await functionPlugin?.(functionResources, this, this.id)) ?? functionResources
          }

          functions[httpMethod] = functionResources
        }
      }),
    )

    return { api, functions }
  }
}
