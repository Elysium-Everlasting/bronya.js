import zlib from 'node:zlib'

/**
 * Attempt to decode and decompress a given Base64-encoded string.
 *
 * @throws {Error} If the Base64-encoded string provided has the same magic numbers as a
 * `gzip` or `zlib`-compressed payload, but is otherwise malformed.
 */
export function decode(encodedString: string): string {
  const buffer = Buffer.from(encodedString, 'base64')

  /**
   * DEFLATing the empty string yields a {@link `Buffer`} eight bytes wide.
   * If the decoded buffer is smaller than that, chances are that it is plaintext.
   */
  if (buffer.length < 8) {
    return buffer.toString()
  }

  /**
   * Check for the gzip magic number, `1F 8B`.
   */
  if (buffer[0] == 0x1f && buffer[1] == 0x8b) {
    return zlib.gunzipSync(buffer).toString()
  }

  /**
   * Check for the zlib magic number, `78`.
   */
  if (buffer[0] == 0x78) {
    return zlib.inflateSync(buffer).toString()
  }

  /**
   * Otherwise, return the buffer as plaintext.
   */
  return buffer.toString()
}
