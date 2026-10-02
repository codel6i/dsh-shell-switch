/**
 * Identifiers both halves share: the package and loader entry this bundle
 * declares, and the two model-facing shell tool names the switch moves between.
 *
 * @module dsh-shell-switch/ids
 */

/** Package name; the Plugins page keys a bundle row's configuration page by it. */
export const PACKAGE_NAME = 'dsh-shell-switch'

/** Profile entry id this bundle declares; the settings page writes that namespace. */
export const ENTRY_ID = 'shell-switch'

/** Model-facing tool of the PowerShell side, mounted by `@deepseek-ai/dsh-tool-pwsh`. */
export const PWSH_TOOL = 'pwsh'

/** Model-facing tool of the Git Bash side, mounted by `@deepseek-ai/dsh-tool-bash`. */
export const BASH_TOOL = 'bash'

/**
 * Whether a settings namespace belongs to this plugin's profile entry. The
 * settings service serves the patch id; a composition that qualifies it with
 * its parent's id still resolves to the same row.
 *
 * @param namespace - a settings namespace as the host serves it.
 * @returns whether the namespace is this plugin's entry.
 */
export function isOwnNamespace(namespace: string): boolean {
  return namespace === ENTRY_ID || namespace.endsWith(`:${ENTRY_ID}`)
}
