/**
 * The live switch facts the settings panel reads over the status route.
 *
 * The panel cannot see host state on its own (the settings namespace carries
 * the configured values, not what the host resolved from them), so the host
 * answers one JSON document describing exactly what the switch is doing right
 * now: which shell is active, which tool the model therefore sees, and where
 * Git Bash was found or why it was not.
 *
 * @module dsh-shell-switch/status
 */

import type { ShellKind } from './config.ts'
import type { DetectionSource, GitBashDetection } from './detect.ts'
import { BASH_TOOL, PWSH_TOOL } from './ids.ts'

/** Path the panel reads this document from. */
export const STATUS_PATH = '/shell-switch/status'

/** Why Git Bash is unavailable. */
export type GitBashUnavailableReason = 'configured-missing' | 'not-found'

/** The Git Bash half of the status document. */
export interface ShellSwitchGitBashStatus {
  /** Whether a `bash.exe` was resolved. */
  available: boolean
  /** Resolved executable (present when available). */
  executable?: string
  /** Directory holding it; the PATH entry the switch relies on. */
  binDir?: string
  /** Which candidate produced the path. */
  source?: DetectionSource
  /** Why nothing was resolved (present when unavailable). */
  reason?: GitBashUnavailableReason
  /** The configured path that could not be used (with `configured-missing`). */
  configured?: string
}

/** One status document. */
export interface ShellSwitchStatus {
  /** Host platform; the switch is Windows-only. */
  platform: string
  /** Shell the switch is set to. */
  activeShell: ShellKind
  /** Whether the inactive shell tool is withheld from the model. */
  hideInactiveTool: boolean
  /** Git Bash resolution. */
  gitBash: ShellSwitchGitBashStatus
  /** Shell tool the model is offered. */
  visibleTool: string
  /** Shell tool withheld from the model, when one is. */
  hiddenTool?: string
}

/** The live facts {@link statusOf} reads. */
export interface ShellSwitchStatusInput {
  /** Configured active shell. */
  activeShell: ShellKind
  /** Whether the inactive tool is hidden. */
  hideInactiveTool: boolean
  /** Resolved Git Bash installation, absent when none was found. */
  detection: GitBashDetection | undefined
  /** Why nothing was resolved, absent when {@link detection} is present. */
  detectionReason: GitBashUnavailableReason | undefined
  /** The configured path behind a `configured-missing` outcome. */
  configured: string | undefined
  /** The shell tool withheld from the model, when one is. */
  hiddenTool: string | undefined
}

/**
 * Project the live switch state onto the status document.
 *
 * @param input - the current switch facts.
 * @returns the JSON document the panel renders.
 */
export function statusOf(input: ShellSwitchStatusInput): ShellSwitchStatus {
  const { detection } = input
  const usable = input.activeShell === 'gitbash' && detection !== undefined
  return {
    platform: process.platform,
    activeShell: input.activeShell,
    hideInactiveTool: input.hideInactiveTool,
    gitBash: detection === undefined
      ? {
          available: false,
          ...input.detectionReason !== undefined ? { reason: input.detectionReason } : {},
          ...input.configured !== undefined && input.configured.length > 0 ? { configured: input.configured } : {},
        }
      : {
          available: true,
          executable: detection.executable,
          binDir: detection.binDir,
          source: detection.source,
        },
    visibleTool: usable ? BASH_TOOL : PWSH_TOOL,
    ...input.hiddenTool !== undefined ? { hiddenTool: input.hiddenTool } : {},
  }
}
