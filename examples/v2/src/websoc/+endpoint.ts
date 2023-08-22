import type { APIGatewayProxyHandler } from 'aws-lambda'

export const GET: APIGatewayProxyHandler = async () => {
  return {
    statusCode: 200,
    isBase64Encoded: false,
    body: JSON.stringify('Hello, Websoc!'),
  }
}
