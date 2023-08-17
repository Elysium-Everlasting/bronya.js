import path from 'node:path'

import createJITI from 'jiti'

export async function main() {
  const jiti = createJITI(path.resolve(process.cwd()))
  const res = jiti('./tests/files/complex.config.ts')
  console.log(res)
}

main()
