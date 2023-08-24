import type { APIGatewayProxyCallback, APIGatewayProxyEvent, Context } from 'aws-lambda'
import type { Request, Response, NextFunction } from 'express'

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
function normalizeRecord(headers: unknown): Record<string, string> {
  const headerEntries = Object.entries(headers ?? {})
    .filter(entryValueNotNull)
    .map(([k, v]) => [k, Array.isArray(v) ? (v.length === 1 ? v[0] : v) : v])

  return Object.fromEntries(headerEntries)
}

export interface ApiGatewayParams {
  event: APIGatewayProxyEvent
  context: Context
  callback: APIGatewayProxyCallback
}

export function expressRequestToApiGatewayParams(
  req: Request,
  res: Response,
  next: NextFunction,
): ApiGatewayParams {
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

  return { event, context, callback }
}
