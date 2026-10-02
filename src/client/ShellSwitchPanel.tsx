/**
 * The shell switch panel.
 *
 * The panel answers one question — which shell runs my commands — so it is laid
 * out as: the choice, then *that choice's* facts (executor, how it was
 * resolved, path style, variables, the tool the model holds, and what happens
 * to the other tool), then the settings that only matter to the choice, then
 * the host's live view. The facts block is what makes the two selections
 * different content rather than one paragraph that swaps a sentence.
 *
 * @module dsh-shell-switch/client/ShellSwitchPanel
 */

import { type CSSProperties, useState } from 'react'
import { Input, SegmentedControl, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { BASH_TOOL, PWSH_TOOL } from '../ids.ts'
import type { ShellSwitchStatus } from '../status.ts'
import type { ShellSwitchKind, ShellSwitchState } from './controller.ts'
import type { ShellSwitchLocaleKey } from './locales.ts'

/** Reads this plugin's dictionary. */
type Reader = (key: ShellSwitchLocaleKey) => string

/** Props the panel renders from. */
export interface ShellSwitchPanelProps {
  /** Locale reader of this plugin's dictionary. */
  t: Reader
  /** The page snapshot. */
  state: ShellSwitchState
  /** Switch the active shell. */
  select: (next: ShellSwitchKind) => void
  /** Set the Git Bash executable path (`''` restores auto-detection). */
  setGitBashPath: (next: string) => void
  /** Choose whether the inactive shell tool is hidden. */
  setHideInactiveTool: (next: boolean) => void
}

/** One labelled fact in the selected shell's card. */
interface Fact {
  /** Row label. */
  label: string
  /** Row value; the tool names are shown verbatim in code font. */
  value: string
}

const section: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 660 }
const title: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }
const body: CSSProperties = { margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary)' }
const hint: CSSProperties = { ...body, fontSize: 12 }
const failure: CSSProperties = { ...body, color: 'var(--dsw-alias-state-error-primary)' }
const warning: CSSProperties = { ...body, color: 'var(--dsw-alias-state-warning-primary)' }
const notice: CSSProperties = { ...body, color: 'var(--dsw-alias-label-primary)' }
const fieldLabel: CSSProperties = { ...body, color: 'var(--dsw-alias-label-primary)' }
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 }
const card: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '12px 14px',
  border: '1px solid var(--dsw-alias-border-secondary)',
  borderRadius: 10,
  background: 'var(--dsw-alias-bg-secondary)',
}
const cardTitle: CSSProperties = { margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }
const factRow: CSSProperties = { display: 'flex', gap: 12, alignItems: 'baseline', fontSize: 12.5, lineHeight: 1.5 }
const factLabel: CSSProperties = { flex: '0 0 96px', color: 'var(--dsw-alias-label-tertiary)' }
const factValue: CSSProperties = { flex: 1, color: 'var(--dsw-alias-label-primary)', wordBreak: 'break-all' }
const separator: CSSProperties = { height: 1, background: 'var(--dsw-alias-border-secondary)', border: 0, margin: 0 }

/** Localized name of the candidate that produced the resolved executable. */
function sourceLabel(source: ShellSwitchStatus['gitBash']['source'], t: Reader): string {
  switch (source) {
    case 'configured': return t('sourceConfigured')
    case 'git-exec-path': return t('sourceGitExecPath')
    case 'environment': return t('sourceEnvironment')
    case 'known-location': return t('sourceKnownLocation')
    default: return t('sourceUnknown')
  }
}

/** Why Git Bash is unavailable, in the reader's language. */
function reasonLabel(reason: ShellSwitchStatus['gitBash']['reason'], t: Reader): string {
  return reason === 'configured-missing' ? t('reasonConfiguredMissing') : t('reasonNotFound')
}

/**
 * The card for one selection: what that shell is, and what it changes.
 *
 * @param kind - the selected shell.
 * @param t - locale reader.
 * @param state - the page snapshot, for the host's detection result.
 * @returns the card title, its fact rows, and a warning when the selection cannot run.
 */
function cardOf(kind: ShellSwitchKind, t: Reader, state: ShellSwitchState): { title: string; facts: Fact[]; warning?: string } {
  const gitBash = state.host?.gitBash
  const ready = gitBash?.available === true
  // What the model ends up holding, and what happens to the other tool.
  const tool = kind === 'gitbash' && ready ? BASH_TOOL : PWSH_TOOL
  const other = tool === BASH_TOOL ? PWSH_TOOL : BASH_TOOL
  const otherValue = `${other}${state.hideInactiveTool ? t('toolHiddenSuffix') : t('toolKeptSuffix')}`

  if (kind === 'pwsh') {
    return {
      title: t('cardPwsh'),
      facts: [
        { label: t('factExecutor'), value: t('pwshExecutor') },
        { label: t('factPaths'), value: t('pwshPaths') },
        { label: t('factVars'), value: t('pwshVars') },
        { label: t('factTool'), value: tool },
        { label: t('factOtherTool'), value: otherValue },
      ],
    }
  }

  const facts: Fact[] = [
    { label: t('factExecutor'), value: ready ? gitBash.executable ?? t('unresolved') : t('unresolved') },
  ]
  if (ready && gitBash?.source !== undefined) {
    facts.push({ label: t('factSource'), value: sourceLabel(gitBash.source, t) })
  }
  facts.push(
    { label: t('factPaths'), value: t('gitbashPaths') },
    { label: t('factVars'), value: t('gitbashVars') },
    { label: t('factTool'), value: tool },
    { label: t('factOtherTool'), value: otherValue },
  )
  return gitBash?.available === false
    ? {
        title: t('cardGitBash'),
        facts,
        warning: `${t('notDetectedLabel')}${reasonLabel(gitBash.reason, t)}${gitBash.configured === undefined ? '' : `（${gitBash.configured}）`} · ${t('unavailableHint')}`,
      }
    : { title: t('cardGitBash'), facts }
}

/** What the host actually resolved, in one line: the live status when it could be read. */
function hostLine(state: ShellSwitchState, t: Reader): string {
  const host = state.host
  if (host === undefined) return state.hostState === 'failed' ? t('statusUnknown') : t('statusLoading')
  const gitBash = host.gitBash
  if (!gitBash.available) {
    const configured = gitBash.configured === undefined ? '' : `（${gitBash.configured}）`
    return `${t('statusFooter')}${host.activeShell} · ${t('notDetectedLabel')}${reasonLabel(gitBash.reason, t)}${configured}`
  }
  return `${t('statusFooter')}${host.activeShell} · ${t('detectedLabel')}${gitBash.executable ?? ''}（${sourceLabel(gitBash.source, t)}）`
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
  const selection = cardOf(state.active, t, state)
  const hostShell = state.host?.activeShell
  const pending = hostShell !== undefined && hostShell !== state.active

  return (
    <div style={section}>
      <div>
        <h3 style={title}>{t('title')}</h3>
        <p style={body}>{t('description')}</p>
      </div>

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

      <div style={card}>
        <p style={cardTitle}>{selection.title}</p>
        {selection.warning === undefined ? null : <p style={warning}>{selection.warning}</p>}
        {selection.facts.map(fact => (
          <div style={factRow} key={fact.label}>
            <span style={factLabel}>{fact.label}</span>
            <span style={factValue}>{fact.value}</span>
          </div>
        ))}
      </div>

      {!pending ? null : (
        <p style={notice}>
          {t('pendingNotice').replace('{from}', hostShell ?? '').replace('{to}', state.active === 'gitbash' ? t('gitbash') : t('pwsh'))}
        </p>
      )}

      <hr style={separator} />

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
        <p style={hint}>{t('pathHint')}</p>
        <p style={hint}>{t('pathScope')}</p>
      </div>

      <div>
        <div style={row}>
          <Switch
            checked={state.hideInactiveTool}
            label={t('hideInactive')}
            disabled={disabled}
            onChange={(next) => { props.setHideInactiveTool(next) }}
          />
          <span style={fieldLabel}>{t('hideInactive')}</span>
        </div>
        <p style={hint}>{t('hideInactiveHint')}</p>
      </div>

      {unbound && <p style={body}>{t('unbound')}</p>}
      {!unbound && state.status === 'unavailable' && <p style={body}>{t('unavailable')}</p>}
      {!unbound && state.status !== 'unavailable' && !state.writable && <p style={body}>{t('readOnly')}</p>}
      {state.busy && <p style={body}>{t('busy')}</p>}
      {state.failed && <p style={failure}>{t('writeFailed')}</p>}

      <hr style={separator} />
      <p style={hint}>{hostLine(state, t)}</p>
    </div>
  )
}
