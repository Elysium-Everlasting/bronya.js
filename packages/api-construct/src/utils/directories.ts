import fs from 'node:fs'
import path from 'node:path'

export function findDirectoriesWithFile(file = 'package.json', root = process.cwd()): string[] {
  const allDirectoriesWithFile = findSubdirectoriesWithFile(file, root)
  const dedupedDirectories = [...new Set(allDirectoriesWithFile)]
  return dedupedDirectories
}

/**
 * Recursively find all paths to directories with a certain file, starting from a given root directory.
 */
export function findSubdirectoriesWithFile(
  file: string,
  root = process.cwd(),
  directory = '',
  paths: string[] = [],
): string[] {
  const currentDirectory = path.join(root, directory)

  if (!fs.existsSync(currentDirectory)) {
    return paths
  }

  if (fs.existsSync(path.join(currentDirectory, file))) {
    paths.push(currentDirectory)
  }

  const subRoutes = fs
    .readdirSync(currentDirectory, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)

  paths.push(
    ...subRoutes.flatMap((subRoute) =>
      findSubdirectoriesWithFile(file, root, path.join(directory, subRoute), paths),
    ),
  )

  return paths
}
