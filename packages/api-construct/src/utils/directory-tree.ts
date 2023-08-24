import path from 'node:path'

export interface DirectoryTreeDetails {
  /**
   * The project root. i.e. A directory containing package.json file
   */
  root: string

  /**
   * The directory to find directory-based endpoints in.
   * It's provided as a relative path from {@link root}.
   *
   * @default "src"
   */
  directory: string

  /**
   * The directory to build code and other assets into.
   * It will mirror the {@link routes} directory structure.
   *
   * @default ".bronya"
   */
  outDirectory: string

  /**
   * The name of the file to indicate an endpoint handler.
   *
   * @default "+endpoint.ts"
   */
  entryPoint: string

  /**
   * The name of the handler file that's uploaded to Lambda.
   *
   * @default "handler.js"
   */
  exitPoint: string

  /**
   * The directory to upload assets from to Lambda.
   * Provided as a relative path that will be resolved starting from the handler's
   * location in the {@link outDirectory}.
   *
   * @default "dist"
   */
  uploadDirectory: string
}

type DirectoryResolver = (directory: string) => string

export interface ResolvedDirectoryTree extends DirectoryTreeDetails {
  directoryToEndpoint: DirectoryResolver
  directoryToOutDirectory: DirectoryResolver
  directoryToHandler: DirectoryResolver
  directoryToUploadDirectory: DirectoryResolver
}

/**
 * @example
 *  project-root
 * ├──  .bronya
 * │   ├──  handler.js
 * │   └──  websoc
 * │       └──  handler.js
 * ├──  .env
 * ├──  bronya.config.ts
 * ├──  node_modules
 * ├──  package.json
 * ├──  prisma
 * │   └──  schema.prisma
 * └──  src
 *     ├──  +endpoint.ts
 *     └──  websoc
 *         └──  +endpoint.ts
 *
 * Resolve the full paths to all files and directories in the project,
 * given settings for their names and relative paths.
 */
export function resolveDirectoryTree(details: DirectoryTreeDetails): ResolvedDirectoryTree {
  const root = path.resolve(details.root)
  const outDirectory = path.resolve(root, details.outDirectory)
  const routesDirectory = path.resolve(root, details.directory)

  /**
   * Converts a path to an endpoint's directory to the endpoint's URL.
   *
   * @remarks Has a starting slash.
   */
  const directoryToEndpoint = (directory: string) => {
    return path.join('/', path.relative(routesDirectory, directory))
  }

  /**
   * Converts a path to an endpoint's directory to the directory to build the code.
   */
  const directoryToOutDirectory = (directory: string) => {
    return path.resolve(outDirectory, path.relative(routesDirectory, directory))
  }

  /**
   */
  const directoryToHandler = (directory: string) => {
    return path.join(directoryToOutDirectory(directory), details.exitPoint)
  }

  const directoryToUploadDirectory = (directory: string) => {
    return path.join(directoryToOutDirectory(directory), details.uploadDirectory)
  }

  return {
    ...details,
    root,
    outDirectory,
    directory: routesDirectory,
    directoryToEndpoint,
    directoryToOutDirectory,
    directoryToHandler,
    directoryToUploadDirectory,
  }
}
