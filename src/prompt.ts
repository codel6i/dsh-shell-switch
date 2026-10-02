/**
 * Model-facing statements of the active shell.
 *
 * The text is a function of the live switch, so flipping the switch changes
 * the next step's prompt without remounting the plugin.
 *
 * @module dsh-shell-switch/prompt
 */

import type { GitBashDetection } from './detect.ts'
import type { ShellKind } from './config.ts'

/** Prompt section name carrying the active-shell statement. */
export const SHELL_SWITCH_SECTION = 'shell-switch'

/** What the model is told when PowerShell is the active shell. */
export const PWSH_GUIDANCE = 'The active command shell is PowerShell. Run shell commands with the `pwsh` tool: '
  + 'native Windows paths (`C:\\...`) and `$env:NAME` environment variables. '
  + 'The `bash` tool is disabled while PowerShell is active.'

/** What the model is told when Git Bash is the active shell. */
export const GIT_BASH_GUIDANCE = 'The active command shell is Git Bash. Run shell commands with the `bash` tool: '
  + 'POSIX syntax, `/c/...` and `/d/...` paths for Windows drives, and `$NAME` environment variables. '
  + 'The `pwsh` tool is disabled while Git Bash is active.'

/**
 * State the active shell for the next model step.
 *
 * @param active - the configured shell.
 * @param detection - the resolved Git Bash installation, absent when none was found.
 * @returns the guidance paragraph; Git Bash guidance only when Git Bash can actually run.
 */
export function guidanceText(active: ShellKind, detection: GitBashDetection | undefined): string {
  if (active === 'gitbash' && detection !== undefined) {
    return `${GIT_BASH_GUIDANCE} Git Bash is ${detection.executable}. Switch shells in Settings → Shell.`
  }
  return `${PWSH_GUIDANCE} Switch shells in Settings → Shell.`
}
