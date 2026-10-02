/**
 * The shell switch panel itself: presentation only, every value and callback
 * arriving as a plain prop, so the Settings section and the bundle row's page
 * render the same control over the same controller.
 *
 * @module dsh-shell-switch/client/ShellSwitchPanel
 */

import { useState, type CSSProperties } from 'react'
import { Input, SegmentedControl, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ShellSwitchStatus } from '../status.ts'
import type { ShellSwitchKind, ShellSwitchState } from './controller.ts'
import type { ShellSwitchLocaleKey } from './locales.ts'

/** Props the panel renders from. */
export interface ShellSwitchPanelProps {
  /** Locale reader of this plugin's dictionary. */
  t: (key: ShellSwitchLocaleKey) => string
  /** The page snapshot. */
  state: ShellSwitchState
  /** Switch the active shell. */
  select: (next: ShellSwitchKind) => void
  /** Set the Git Bash executable path (`''` restores auto-detection). */
  setGitBashPath: (next: string) => void
  /** Choose whether the inactive shell tool is hidden. */
  setHideInactiveTool: (next: boolean) => void
}

const section: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }
const title: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }
const body: CSSProperties = { margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary)' }
const failure: CSSProperties = { ...body, color: 'var(--dsw-alias-state-error-primary)' }
const detail: CSSProperties = { ...body, color: 'var(--dsw-alias-label-primary)' }
const fieldLabel: CSSProperties = { ...body, color: 'var(--dsw-alias-label-primary)' }
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 }

/** Localized name of the candidate that produced the resolved executable. */
function sourceLabel(source: ShellSwitchStatus['gitBash']['source'], t: (key: ShellSwitchLocaleKey) => string): string {
  switch (source) {
    case 'configured': return t('sourceConfigured')
    case 'git-exec-path': return t('sourceGitExecPath')
    case 'environment': return t('sourceEnvironment')
    case 'known-location': return t('sourceKnownLocation')
    default: return t('sourceUnknown')
  }
}

/**
 * What the host actually resolved, in one line: the live status when it could
 * be read, the reason it could not otherwise.
 */
function statusLine(state: ShellSwitchState, t: (key: ShellSwitchLocaleKey) => string): string {
  const host = state.host
  if (host === undefined) return state.hostState === 'failed' ? t('statusUnknown') : t('statusLoading')
  const gitBash = host.gitBash
  if (!gitBash.available) {
    const reason = gitBash.reason === 'configured-missing' ? t('reasonConfiguredMissing') : t('reasonNotFound')
    const configured = gitBash.configured === undefined ? '' : `（${gitBash.configured}）`
    return `${t('notDetectedLabel')}${reason}${configured} · ${t('toolLabel')}${host.visibleTool}`
  }
  return `${t('detectedLabel')}${gitBash.executable ?? ''}（${sourceLabel(gitBash.source, t)}） · ${t('toolLabel')}${host.visibleTool}`
}

/**
 * Render the shell switch.
 * @param props - locale copy, the page snapshot, and its write actions.
 * @returns the panel content.
 */
export function ShellSwitchPanel(props: ShellSwitchPanelProps) {
  const { t, state } = props
  // The path is edited locally and committed on blur or Enter, so a settings
  // write is one decision rather than one per keystroke.
  const [draftPath, setDraftPath] = useState<string | undefined>(undefined)
  const unbound = state.namespace === undefined
  const disabled = unbound || !state.writable || state.busy
  const shownPath = draftPath ?? state.gitBashPath
  const commitPath = (): void => {
    if (draftPath === undefined) return
    setDraftPath(undefined)
    if (draftPath.trim() !== state.gitBashPath) props.setGitBashPath(draftPath.trim())
  }

  return (
    <div style={section}>
      <h3 style={title}>{t('title')}</h3>
      <p style={body}>{t('description')}</p>

      <div>
        <p style={fieldLabel}>{t('activeShell')}</p>
        <SegmentedControl<ShellSwitchKind>
          id="shell-switch-active"
          value={state.active}
          label={t('activeShell')}
          disabled={disabled}
          options={[
            { value: 'pwsh', label: t('pwsh'), title: t('pwshDetail') },
            { value: 'gitbash', label: t('gitbash'), title: t('gitbashDetail') },
          ]}
          onChange={(next) => { props.select(next) }}
        />
      </div>
      <p style={body}>{state.active === 'gitbash' ? t('gitbashDetail') : t('pwshDetail')}</p>
      <p style={detail}>{statusLine(state, t)}</p>

      <div>
        <p style={fieldLabel}>{t('pathLabel')}</p>
        <Input
          value={shownPath}
          aria-label={t('pathLabel')}
          placeholder={t('pathPlaceholder')}
          disabled={disabled}
          onChange={(event) => { setDraftPath(event.target.value) }}
          onBlur={commitPath}
          onKeyDown={(event) => { if (event.key === 'Enter') commitPath() }}
        />
        <p style={body}>{t('pathHint')}</p>
      </div>

      <div style={row}>
        <Switch
          checked={state.hideInactiveTool}
          label={t('hideInactive')}
          disabled={disabled}
          onChange={(next) => { props.setHideInactiveTool(next) }}
        />
        <span style={fieldLabel}>{t('hideInactive')}</span>
      </div>
      <p style={body}>{t('hideInactiveHint')}</p>

      {unbound && <p style={body}>{t('unbound')}</p>}
      {!unbound && state.status === 'unavailable' && <p style={body}>{t('unavailable')}</p>}
      {!unbound && state.status !== 'unavailable' && !state.writable && <p style={body}>{t('readOnly')}</p>}
      {state.busy && <p style={body}>{t('busy')}</p>}
      {state.failed && <p style={failure}>{t('writeFailed')}</p>}
    </div>
  )
}
