export class CommanderError extends Error {
  code: string

  exitCode: number

  nestedError: Error | undefined

  /**
   * Constructs the CommanderError class
   * @param exitCode The suggested exit code which could be used with process.exit .
   * @param code An id string representing the error.
   * @param message A human-readable description of the error.
   */
  constructor(exitCode: number, code: string, message: string) {
    super(message)

    // properly capture stack trace in Node.js
    Error.captureStackTrace(this, this.constructor)

    this.name = this.constructor.name

    this.code = code
    this.exitCode = exitCode
    this.nestedError = undefined
  }
}

/**
 */
export class InvalidArgumentError extends CommanderError {
  /**
   * Constructs the InvalidArgumentError class
   * @param message An explanation of why argument is invalid.
   * @constructor
   */
  constructor(message: string) {
    super(1, 'commander.invalidArgument', message)

    // properly capture stack trace in Node.js
    Error.captureStackTrace(this, this.constructor)

    this.name = this.constructor.name
  }
}
