import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

export const GET = async (_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'ROUTE C',
    }),
  }
}
