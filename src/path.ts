/**
 * PATH editing for the Git Bash switch.
 *
 * The bash executor spawns a bare `bash`, so the switch works by making the
 * Git installation's directory the first PATH entry while the plugin is
 * mounted. The returned disposer removes exactly that entry, leaving every
 * other value — including later edits by other plugins — in place.
 *
 * @module dsh-shell-switch/path
 */

import { delimiter, resolve } from 'node:path'

/** Split a PATH value into non-empty entries. */
function pathEntries(value: string): string[] {
  return value.split(delimiter).filter(entry => entry.length > 0)
}

/** Whether two path entries name the same directory (case-insensitive on Windows). */
function sameDirectory(left: string, right: string): boolean {
  const a = resolve(left)
  const b = resolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

/**
 * Whether a PATH value already lists a directory.
 *
 * @param directory - the directory to look for.
 * @param value - the PATH value to search (defaults to the process PATH).
 * @returns whether an entry resolves to that directory.
 */
export function pathContainsDirectory(directory: string, value: string | undefined = process.env.PATH): boolean {
  return pathEntries(value ?? '').some(entry => sameDirectory(entry, directory))
}

/**
 * Put a directory at the front of the process PATH.
 *
 * @param directory - the absolute directory to prepend.
 * @returns a disposer removing that entry; a no-op when it was already listed.
 */
export function prependPathDirectory(directory: string): () => void {
  const before = process.env.PATH ?? ''
  if (pathContainsDirectory(directory, before)) return () => {}
  process.env.PATH = `${directory}${delimiter}${before}`
  return () => {
    const current = process.env.PATH ?? ''
    process.env.PATH = pathEntries(current).filter(entry => !sameDirectory(entry, directory)).join(delimiter)
  }
}
