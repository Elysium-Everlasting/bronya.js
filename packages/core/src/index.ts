import path from 'node:path'

import express from 'express'
import createJITI from 'jiti'

export async function jit() {
  const jiti = createJITI(path.resolve(process.cwd()))
  const res = jiti('./tests/files/complex.config.ts')
  console.log(res)
}

export async function main() {
  const app = express()

  app.get('/', (_req, res) => {
    res.json('Hello, API!')
  })

  const PROTOCOL = 'http'
  const HOST = 'localhost'
  const PORT = 8080

  const simple = express.Router()

  simple.get('/', (_req, res) => {
    res.send('Hello, World!')
  })

  app.use(simple)

  const complex = express.Router()

  complex.get('/a/:next?*', (req, res) => {
    console.log(req.params)
    res.send('wow, parameters!')
  })

  app.use(complex)

  app.listen(PORT, () => {
    console.log(`listening at ${PROTOCOL}://${HOST}:${PORT}`)
  })
}

main()
