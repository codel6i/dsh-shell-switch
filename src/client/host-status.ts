/**
 * Reading the host's live switch status.
 *
 * The document crosses a wire boundary (the status route), so it is validated
 * before the panel renders it; an unreachable or malformed answer is reported
 * as "unknown" rather than guessed at.
 *
 * @module dsh-shell-switch/client/host-status
 */

import type { ShellSwitchStatus } from '../status.ts'

/** Path of the host route, relative to the page's own base. */
const STATUS_REFERENCE = 'shell-switch/status'

/** A JSON object, as opposed to an array or a scalar. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether a decoded answer carries the fields the panel renders.
 *
 * @param value - the decoded JSON value.
 * @returns whether it is a status document this client understands.
 */
export function isShellSwitchStatus(value: unknown): value is ShellSwitchStatus {
  if (!isRecord(value)) return false
  if (typeof value.activeShell !== 'string' || typeof value.visibleTool !== 'string') return false
  const gitBash = value.gitBash
  return isRecord(gitBash) && typeof gitBash.available === 'boolean'
}

/**
 * Read the host's status document.
 *
 * @param baseUri - the page's base URI the route is resolved against.
 * @param doFetch - the fetch implementation (injectable for tests).
 * @returns the status document, or undefined when the host did not answer with one.
 */
export async function readHostStatus(baseUri: string, doFetch: typeof fetch = fetch): Promise<ShellSwitchStatus | undefined> {
  try {
    const response = await doFetch(new URL(STATUS_REFERENCE, baseUri), { headers: { accept: 'application/json' } })
    if (!response.ok) return undefined
    const value: unknown = await response.json()
    return isShellSwitchStatus(value) ? value : undefined
  } catch (error: unknown) {
    // An unreachable or unparsable route is "status unknown", not a page failure.
    void error
    return undefined
  }
}
