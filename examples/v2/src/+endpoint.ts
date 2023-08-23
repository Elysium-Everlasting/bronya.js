import { PrismaClient } from '@prisma/client'
import type { APIGatewayProxyHandler } from 'aws-lambda'

const prisma = new PrismaClient()
await prisma.$connect()

export const GET: APIGatewayProxyHandler = async () => {
  const users = await prisma.user.findMany()

  return {
    statusCode: 200,
    isBase64Encoded: false,
    body: JSON.stringify({
      message: 'Hello, World!',
      users,
    }),
  }
}
