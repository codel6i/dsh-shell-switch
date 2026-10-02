/**
 * dsh-shell-switch — the agent's command shell, switchable between Windows
 * PowerShell and Git Bash from Settings → Shell.
 *
 * The switch is one configuration field (`activeShell`). Everything else is
 * derived from it, live, at the point of use:
 *
 * - **Tool visibility**: a `system-prompt/assemble` listener removes the
 *   inactive shell tool's schema, so the model is offered exactly one shell
 *   tool — `pwsh` for PowerShell, `bash` for Git Bash.
 * - **Enforcement**: a tool guard refuses a call to the inactive shell, which
 *   covers a tool list cached from the previous step.
 * - **Guidance**: an ordered prompt section states the active shell and its
 *   dialect on every assembly.
 * - **Executable**: the resolved Git installation's `bin` directory is placed
 *   first on PATH while the plugin is mounted, because the bash executor
 *   spawns a bare `bash`.
 *
 * The Git Bash side of the switch is the official `bash` tool over
 * `@deepseek-ai/dsh-bash-sandbox`; `cordis.patch.yml` mounts both inside an
 * isolated realm so the deployment keeps its own `shell` executor.
 *
 * Running the same plugin without Windows is inert: the platform already
 * composes one shell.
 *
 * @module dsh-shell-switch
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { Config, isLiveField, resolveConfig, type ResolvedConfig, type ShellKind } from './config.ts'
import { detectGitBash, type DetectionResult, type GitBashDetection } from './detect.ts'
import { BASH_TOOL, ENTRY_ID, PWSH_TOOL, isOwnNamespace } from './ids.ts'
import { prependPathDirectory } from './path.ts'
import { SHELL_SWITCH_SECTION, guidanceText } from './prompt.ts'
import { STATUS_PATH, statusOf, type GitBashUnavailableReason } from './status.ts'

/** Plugin name (loader row id). */
export const name = ENTRY_ID

/** Hard services: the tool registry the switch filters, and the prompt it states itself in. */
export const inject = ['tools', 'systemPrompt']

export { Config } from './config.ts'
export { detectGitBash, isExecutableFile, BASH_EXECUTABLE } from './detect.ts'
export type { DetectionResult, DetectionSource, GitBashDetection } from './detect.ts'
export { BASH_TOOL, ENTRY_ID, PWSH_TOOL, isOwnNamespace } from './ids.ts'
export { pathContainsDirectory, prependPathDirectory } from './path.ts'
export { guidanceText, GIT_BASH_GUIDANCE, PWSH_GUIDANCE, SHELL_SWITCH_SECTION } from './prompt.ts'
export { STATUS_PATH, statusOf } from './status.ts'
export type { ShellSwitchGitBashStatus, ShellSwitchStatus, GitBashUnavailableReason } from './status.ts'
export type { Config as ShellSwitchConfig, ResolvedConfig, ShellKind } from './config.ts'

/** Live switch state: the configured values plus the resolved Git Bash installation. */
export interface ShellSwitchState {
  /** Configured active shell. */
  activeShell: ShellKind
  /** Configured `bash.exe` path; empty means auto-detect. */
  gitBashPath: string
  /** Whether the inactive tool is hidden from the model's tool list. */
  hideInactiveTool: boolean
  /** Resolved Git Bash installation, absent when none was found. */
  detection: GitBashDetection | undefined
  /** Why nothing was resolved, absent while {@link detection} is present. */
  detectionReason: GitBashUnavailableReason | undefined
  /** The configured path behind a `configured-missing` outcome. */
  configured: string | undefined
}

/** The read-only slice the pure decision helpers need. */
export type ShellSwitchView = Readonly<Pick<ShellSwitchState, 'activeShell' | 'hideInactiveTool' | 'detection'>>

/** A JSON object, as opposed to an array or a scalar. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The settings namespace surface this plugin reads; a structural slice of the host service. */
export interface SettingsView {
  /** Read every active entry's schema and live values. */
  describe(): readonly { ns: unknown; value: unknown }[]
}

/**
 * Read this plugin's live values from the settings service.
 *
 * @param settings - the host settings service.
 * @returns the fields the entry currently resolves to; absent fields are unknown.
 */
export function readSwitchedConfig(settings: SettingsView): Partial<ResolvedConfig> {
  const descriptor = settings.describe().find(candidate => isOwnNamespace(String(candidate.ns)))
  if (descriptor === undefined) return {}
  const value = descriptor.value
  if (!isRecord(value)) return {}
  const activeShell = value.activeShell
  const gitBashPath = value.gitBashPath
  const hideInactiveTool = value.hideInactiveTool
  return {
    ...activeShell === 'pwsh' || activeShell === 'gitbash' ? { activeShell } : {},
    ...typeof gitBashPath === 'string' ? { gitBashPath } : {},
    ...typeof hideInactiveTool === 'boolean' ? { hideInactiveTool } : {},
  }
}

/**
 * The shell tool the model must not see for the current switch.
 *
 * @param state - the live switch state.
 * @returns the tool name to hide, or `undefined` to keep the catalog as composed.
 */
export function hiddenShellTool(state: ShellSwitchView): string | undefined {
  if (!state.hideInactiveTool) return undefined
  if (state.activeShell !== 'gitbash') return BASH_TOOL
  // Git Bash without a resolved executable degrades to PowerShell: hiding the
  // only working shell would leave the model with no way to run a command.
  return state.detection === undefined ? undefined : PWSH_TOOL
}

/**
 * The refusal for a call to the inactive shell tool.
 *
 * @param toolName - the wire Tool name being dispatched.
 * @param state - the live switch state.
 * @returns the denial reason, or `undefined` to allow the call.
 */
export function shellToolDenial(toolName: string, state: ShellSwitchView): string | undefined {
  if (toolName === BASH_TOOL && state.activeShell !== 'gitbash') {
    return `The active command shell is PowerShell: call the "${PWSH_TOOL}" tool instead, or switch to Git Bash in Settings → Shell.`
  }
  if (toolName === PWSH_TOOL && state.activeShell === 'gitbash' && state.detection !== undefined) {
    return `The active command shell is Git Bash: call the "${BASH_TOOL}" tool instead, or switch back to PowerShell in Settings → Shell.`
  }
  return undefined
}

/**
 * Mount the switch.
 *
 * @param ctx - context carrying the tool registry and the prompt registry.
 * @param config - raw loader configuration; defaults applied through {@link resolveConfig}.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const resolved = resolveConfig(config)
  if (process.platform !== 'win32') {
    ctx.logger.info('shell-switch: the PowerShell/Git Bash switch is Windows-only; this deployment keeps its composed shell')
    return
  }

  const state: ShellSwitchState = {
    activeShell: resolved.activeShell,
    gitBashPath: resolved.gitBashPath,
    hideInactiveTool: resolved.hideInactiveTool,
    detection: undefined,
    detectionReason: undefined,
    configured: undefined,
  }

  let releasePath: (() => void) | undefined
  const applyDetection = (result: DetectionResult): void => {
    releasePath?.()
    releasePath = undefined
    state.detection = undefined
    state.detectionReason = undefined
    state.configured = undefined
    switch (result.kind) {
      case 'found': {
        state.detection = result.detection
        releasePath = prependPathDirectory(result.detection.binDir)
        ctx.logger.info(`shell-switch: Git Bash resolved from ${result.detection.source}: ${result.detection.executable}`)
        return
      }
      case 'configured-missing':
        state.detectionReason = 'configured-missing'
        state.configured = result.configured
        ctx.logger.warn(`shell-switch: config.gitBashPath ${JSON.stringify(result.configured)} is not an existing file; the switch stays on PowerShell`)
        return
      case 'not-found':
        state.detectionReason = 'not-found'
        ctx.logger.warn('shell-switch: no Git Bash installation found (install Git for Windows, or set config.gitBashPath); the switch stays on PowerShell')
        return
      default:
        // DetectionResult is closed; a new member must decide its own PATH handling.
        return
    }
  }
  applyDetection(detectGitBash(state.gitBashPath))
  ctx.effect(() => () => {
    releasePath?.()
    releasePath = undefined
  }, 'shell-switch: PATH entry')

  /**
   * Adopt the configured fields as the loader currently holds them.
   *
   * Volatile fields are live accessors the loader updates in place, so a
   * deployment that delivers them re-reads them at every use site. A loader
   * that hands over a plain snapshot leaves the live path to the settings
   * listener below, whose read is the only one that can see the new value.
   */
  const liveFields = isLiveField(config?.activeShell) || isLiveField(config?.gitBashPath) || isLiveField(config?.hideInactiveTool)
  const sync = (): void => {
    if (!liveFields) return
    let next: ResolvedConfig
    try {
      next = resolveConfig(config)
    } catch (error: unknown) {
      // The loader validated this schema, so a value that no longer resolves
      // means the deployment changed underneath the plugin: keep the last good
      // configuration and record why.
      ctx.logger.warn(`shell-switch: keeping the previous configuration; ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    if (next.gitBashPath !== state.gitBashPath) {
      state.gitBashPath = next.gitBashPath
      applyDetection(detectGitBash(state.gitBashPath))
    }
    state.activeShell = next.activeShell
    state.hideInactiveTool = next.hideInactiveTool
  }

  // The settings page writes the switch through the standard settings Remote;
  // this listener follows a live config change in a deployment whose loader
  // hands `apply` a plain snapshot rather than live accessors.
  const settings: SettingsView | undefined = ctx.get('settings')
  if (settings !== undefined) {
    ctx.on('settings/document-updated', (namespace) => {
      if (!isOwnNamespace(String(namespace))) return
      sync()
      const described = readSwitchedConfig(settings)
      if (described.gitBashPath !== undefined && described.gitBashPath !== state.gitBashPath) {
        state.gitBashPath = described.gitBashPath
        applyDetection(detectGitBash(state.gitBashPath))
      }
      if (described.activeShell !== undefined) state.activeShell = described.activeShell
      if (described.hideInactiveTool !== undefined) state.hideInactiveTool = described.hideInactiveTool
    })
  }

  ctx.effect(
    () => ctx.tools.guard((execution) => { sync(); return shellToolDenial(execution.name, state) }),
    'shell-switch: inactive-shell guard',
  )

  ctx.effect(() => ctx.systemPrompt.section({
    name: SHELL_SWITCH_SECTION,
    order: ctx.systemPrompt.getSectionOrder('TOOL_PWSH') + 5,
    text: () => { sync(); return guidanceText(state.activeShell, state.detection) },
  }), 'shell-switch: active-shell guidance')

  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const completed = await next()
    sync()
    const hidden = hiddenShellTool(state)
    if (hidden === undefined) return completed
    const tools = completed.tools.filter(tool => tool.name !== hidden)
    return tools.length === completed.tools.length ? completed : { ...completed, tools }
  })

  // The panel cannot see host facts on its own, so it reads them from here:
  // one JSON document naming the active shell and the resolved Git Bash. The
  // route exists only where a web server does, and answers only callers the
  // connection trusts — the page's own cookie, never an anonymous request.
  ctx.inject(['webServer'], (scope) => {
    const server = scope.webServer
    if (server === undefined) return
    scope.effect(() => server.register({
      kind: 'exact',
      path: STATUS_PATH,
      handler: (req, res) => {
        sync()
        const connection = ctx.get('connection')
        const rejection = connection?.requestRejection(req)
        if (rejection !== undefined) {
          res.statusCode = rejection
          res.end()
          return
        }
        if (connection === undefined) {
          // No trust channel means no safe way to answer: refuse rather than
          // serve deployment facts to an unauthenticated caller.
          res.statusCode = 503
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end('{"error":"no-connection"}')
          return
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.statusCode = 405
          res.setHeader('allow', 'GET')
          res.end()
          return
        }
        res.statusCode = 200
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.end(JSON.stringify(statusOf({
          activeShell: state.activeShell,
          hideInactiveTool: state.hideInactiveTool,
          detection: state.detection,
          detectionReason: state.detectionReason,
          configured: state.configured,
          hiddenTool: hiddenShellTool(state),
        })))
      },
    }), `shell-switch: GET ${STATUS_PATH}`)
  })

  ctx.logger.info(`shell-switch: active shell is ${state.activeShell}${state.detection === undefined ? ' (Git Bash unavailable)' : ` (Git Bash: ${state.detection.executable})`}`)
}
