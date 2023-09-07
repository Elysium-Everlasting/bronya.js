import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda'
import type { Request, Response, NextFunction, Handler } from 'express'

import type { MaybePromise } from '../../utils/maybe-promise.js'
import { maybeTransform } from '../../utils/maybe-transform'
import type { Nullish } from '../../utils/nullish.js'

import { decode } from './decode'
import { expressParamsToApiGatewayParams, type ApiGatewayParams } from './request'

export interface ExpressParams {
  req: Request
  res: Response
  next: NextFunction
}

/**
 * Customize the behavior of the Express.js wrapper.
 */
export interface ServerHooks {
  /**
   * Transform or handle the incoming Express.js params before they are translated to an API Gateway request.
   */
  transformExpressParams?: (params: ExpressParams) => MaybePromise<ExpressParams | Nullish>

  /**
   * Transform or handle the API Gateway params before they are passed to the handler.
   */
  transformParams?: (params: ApiGatewayParams) => MaybePromise<ApiGatewayParams | Nullish>

  /**
   * Transform or handle the API Gateway result before it is translated to an Express.js response.
   */
  decode?: (result: APIGatewayProxyResult) => MaybePromise<APIGatewayProxyResult | Nullish>
}

/**
 * Translates the HTTP verbs for API Gateway into Express.js methods.
 */
export const HttpMethodsToExpress = {
  DELETE: 'delete',
  GET: 'get',
  HEAD: 'head',
  PATCH: 'patch',
  POST: 'post',
  PUT: 'put',
  OPTIONS: 'options',
  ANY: 'use',
} as const

export type Method = keyof typeof HttpMethodsToExpress

export function isMethod(method: string): method is Method {
  return method in HttpMethodsToExpress
}

/**
 * Convert path parameters from an API Gateway path to an Express.js path.
 *
 * @example '/v1/rest/{id}/{name}' -> '/v1/rest/:id/:name'
 */
export function apiGatewayPathToExpressPath(apiGatewayPath: string): string {
  return apiGatewayPath.replace(/{([^}]+)}/g, ':$1')
}

export function wrapExpressHandler(handler: APIGatewayProxyHandler, hooks?: ServerHooks): Handler {
  return async (req, res, next) => {
    const expressParams = { req, res, next }

    const resolvedExpressParams = await maybeTransform(expressParams, hooks?.transformExpressParams)

    const apiGatewayParams = expressParamsToApiGatewayParams(
      resolvedExpressParams.req,
      resolvedExpressParams.res,
      resolvedExpressParams.next,
    )

    const resolvedApiGatewayParams = await maybeTransform(apiGatewayParams, hooks?.transformParams)

    const result = await handler(
      resolvedApiGatewayParams.event,
      resolvedApiGatewayParams.context,
      resolvedApiGatewayParams.callback,
    )

    if (!result) {
      return
    }

    res.status(result.statusCode)
    res.set(result.headers)

    const body = result.isBase64Encoded ? decode(result.body) : result.body

    try {
      res.send(JSON.parse(body))
    } catch {
      res.send(result.body)
    }
  }
}
