import type { Handler } from 'express'

export const handler: Handler = (_req, res) => {
  res.send('handler moment')
}
