/**
 * Plugin configuration and its explicit resolve step.
 *
 * Every field is `volatile` on purpose: dsh's settings service only serves a
 * settings namespace for a plugin whose Config has at least one live field
 * (`volatileForm` drops the rest), and a live field is also what makes the
 * switch apply in place instead of remounting the row. A volatile field reaches
 * `apply` as a live accessor, so {@link resolveConfig} reads it through
 * `get()` and still accepts a plain value when a caller (or a test) hands one
 * in.
 *
 * @module dsh-shell-switch/config
 */

import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

/** The two shells this plugin switches between. */
export const SHELL_KINDS = ['pwsh', 'gitbash'] as const

/** One selectable shell: Windows PowerShell, or the bash Git for Windows ships. */
export type ShellKind = (typeof SHELL_KINDS)[number]

/** Configuration for the shell switch. */
export interface Config {
  /** Active command shell for the agent (default `pwsh`). */
  activeShell?: Volatile<ShellKind>
  /**
   * Absolute path to the `bash.exe` Git Bash should run (default `""`).
   * Empty means auto-detect.
   */
  gitBashPath?: Volatile<string>
  /**
   * Hide the shell tool that is not active from the model's tool list
   * (default true). With it false both tools stay visible and the inactive one
   * still refuses calls.
   */
  hideInactiveTool?: Volatile<boolean>
}

/** Configuration with every default applied. */
export interface ResolvedConfig {
  /** Active command shell for the agent. */
  activeShell: ShellKind
  /** Configured `bash.exe` path, or the empty string for auto-detection. */
  gitBashPath: string
  /** Whether the inactive shell tool is hidden from the model's tool list. */
  hideInactiveTool: boolean
}

/** Schemastery schema for loader-validated configuration. */
export const Config = z.object({
  activeShell: z.union(['pwsh', 'gitbash'] as const).default('pwsh').volatile(),
  gitBashPath: z.string().default('').volatile(),
  hideInactiveTool: z.boolean().default(true).volatile(),
})

/**
 * Whether the loader delivered a field as a live accessor rather than a plain
 * value. A deployment whose loader hands over plain values keeps its live
 * updates on the settings service instead.
 *
 * @param field - one configured field as delivered.
 * @returns whether the field is a live accessor.
 */
export function isLiveField(field: unknown): boolean {
  return typeof field === 'object' && field !== null && typeof Reflect.get(field, 'get') === 'function'
}

/**
 * Read one configured field, whether the loader delivered a live accessor or a
 * plain value.
 *
 * @param field - the configured field as delivered.
 * @returns the current value, still unvalidated.
 */
function readField(field: unknown): unknown {
  if (!isLiveField(field)) return field
  const getter: unknown = Reflect.get(field as object, 'get')
  return typeof getter === 'function' ? Reflect.apply(getter, field, []) : field
}

/**
 * Resolve raw configuration into the runtime policy.
 *
 * @param config - the loader's configuration; `undefined` for a bare row.
 * @returns the frozen resolved configuration.
 * @throws Error naming the field that cannot be used.
 */
export function resolveConfig(config: Config | undefined): ResolvedConfig {
  const shell = readField(config?.activeShell) ?? 'pwsh'
  if (shell !== 'pwsh' && shell !== 'gitbash') {
    throw new Error(`dsh-shell-switch: config.activeShell must be "pwsh" or "gitbash", got ${JSON.stringify(shell)}`)
  }
  const path = readField(config?.gitBashPath) ?? ''
  if (typeof path !== 'string') {
    throw new TypeError('dsh-shell-switch: config.gitBashPath must be a string')
  }
  const hide = readField(config?.hideInactiveTool) ?? true
  if (typeof hide !== 'boolean') {
    throw new TypeError('dsh-shell-switch: config.hideInactiveTool must be a boolean')
  }
  return Object.freeze({ activeShell: shell, gitBashPath: path, hideInactiveTool: hide })
}
