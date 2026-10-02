/**
 * The shell switch page's controller: one projection of this plugin's settings
 * namespace onto the plain data its component renders, plus the three writes
 * the panel performs.
 *
 * The page is this bundle's own UI, so it is registered unconditionally; the
 * host entry it edits is discovered from the served settings mirror — by entry
 * id shape, and by the entry's own `activeShell` field when a deployment
 * serves the row under an id this bundle did not predict. An entry that is not
 * served leaves the page in its unbound state instead of hiding it, so the one
 * failure a reader can act on is the one the page states.
 *
 * @module dsh-shell-switch/client/controller
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  ConfigForm, ConfigFormSnapshot, ConfigForms, SettingsDescribeFace,
} from '@deepseek-ai/dsh-client-ui-settings/client'
import { ENTRY_ID, isOwnNamespace } from '../ids.ts'
import type { ShellSwitchStatus } from '../status.ts'

/** Profile entry id of this plugin's host row; the settings namespace the page edits. */
export const SHELL_SWITCH_ENTRY = ENTRY_ID

/** The shell selection values the host accepts. */
export type ShellSwitchKind = 'pwsh' | 'gitbash'

/** The host entry's config fields this page edits (a subset of its schema by design). */
export interface ShellSwitchSettings {
  /** Active command shell. */
  activeShell?: string
  /** Git Bash executable path; empty means auto-detect. */
  gitBashPath?: string
  /** Whether the inactive shell tool is hidden from the model. */
  hideInactiveTool?: boolean
}

/** What the page renders. */
export interface ShellSwitchState {
  /** Load state of the host namespace. */
  status: ConfigFormSnapshot<ShellSwitchSettings>['status']
  /** Whether the host accepts writes. */
  writable: boolean
  /** Selected shell. */
  active: ShellSwitchKind
  /** Configured Git Bash executable path; empty means auto-detect. */
  gitBashPath: string
  /** Whether the inactive shell tool is hidden. */
  hideInactiveTool: boolean
  /** Whether a write is in flight. */
  busy: boolean
  /** Whether the last write was refused. */
  failed: boolean
  /** Settings namespace this page is bound to; undefined while the host serves none. */
  namespace: string | undefined
  /** Whether the host's live status has been read yet. */
  hostState: 'loading' | 'ready' | 'failed'
  /** The host's live status: which shell runs, and where Git Bash was found. */
  host: ShellSwitchStatus | undefined
}

/** The registration-side face the page's slot entry injects. */
export interface ShellSwitchFace {
  hooks: {
    /** Page snapshot bound by the renderer as useShellSwitch. */
    shellSwitch: SnapshotStore<ShellSwitchState>
  }
  /** Switch the active shell. */
  select: (next: ShellSwitchKind) => void
  /** Set the Git Bash executable path (`''` restores auto-detection). */
  setGitBashPath: (next: string) => void
  /** Choose whether the inactive shell tool is hidden. */
  setHideInactiveTool: (next: boolean) => void
}

/** A JSON object, as opposed to an array or a scalar. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether a served section carries this plugin's own config field.
 *
 * @param value - one served namespace's config value.
 * @returns whether the value states an `activeShell` this plugin owns.
 */
export function carriesActiveShell(value: unknown): boolean {
  if (!isRecord(value)) return false
  return value.activeShell === 'pwsh' || value.activeShell === 'gitbash'
}

/** Bridges this plugin's host entry onto the page's snapshot. */
export class ShellSwitchController {
  private readonly store: SnapshotStore<ShellSwitchState>
  private readonly stopMirror: () => void
  private form: ConfigForm<ShellSwitchSettings> | undefined
  private stopForm: (() => void) | undefined
  private namespace: string | undefined
  private pending: ReturnType<typeof setTimeout> | undefined
  private disposed = false

  /**
   * @param forms - the shared configuration forms, keyed by host entry id.
   * @param mirror - the served-namespace view this entry is discovered in.
   * @param readStatus - reads the host's live status document; undefined when unreachable.
   */
  constructor(
    private readonly forms: ConfigForms,
    private readonly mirror: SettingsDescribeFace,
    private readonly readStatus: () => Promise<ShellSwitchStatus | undefined>,
  ) {
    this.store = createSnapshotStore<ShellSwitchState>({
      status: 'loading',
      writable: false,
      active: 'pwsh',
      gitBashPath: '',
      hideInactiveTool: true,
      busy: false,
      failed: false,
      namespace: undefined,
      hostState: 'loading',
      host: undefined,
    })
    this.stopMirror = mirror.subscribe(() => { this.bind() })
    void mirror.ensure()
    this.bind()
    void this.refreshHost(0)
  }

  /**
   * Build the face the page's slot registration injects.
   * @returns the page's snapshot and its write actions.
   */
  inject(): ShellSwitchFace {
    return {
      hooks: { shellSwitch: this.store },
      select: (next) => { void this.write('activeShell', next) },
      setGitBashPath: (next) => { void this.write('gitBashPath', next) },
      setHideInactiveTool: (next) => { void this.write('hideInactiveTool', next) },
    }
  }

  /** Release the mirror and form subscriptions. */
  dispose(): void {
    this.disposed = true
    if (this.pending !== undefined) clearTimeout(this.pending)
    this.pending = undefined
    this.stopMirror()
    this.stopForm?.()
    this.stopForm = undefined
    this.form = undefined
  }

  /**
   * Read the host's live status.
   *
   * @param attempt - 0 for the first read, 1 for the one bounded re-read.
   */
  private async refreshHost(attempt: number): Promise<void> {
    const next = await this.readStatus()
    if (this.disposed) return
    this.store.update((draft) => {
      draft.host = next
      draft.hostState = next === undefined ? 'failed' : 'ready'
    })
    // The host applies a write asynchronously, so one bounded re-read shows the
    // new switch instead of the one it replaced.
    const expected = this.store.getSnapshot().active
    if (attempt === 0 && next !== undefined && next.activeShell !== expected) {
      this.pending = setTimeout(() => { void this.refreshHost(1) }, 700)
    }
  }

  /** Point the page at whichever served namespace is this plugin's host entry. */
  private bind(): void {
    if (this.disposed) return
    const served = this.mirror.getSnapshot().view?.namespaces ?? []
    const match = served.find(row => isOwnNamespace(row.ns) || carriesActiveShell(row.value))
    if (match === undefined) {
      this.stopForm?.()
      this.stopForm = undefined
      this.form = undefined
      this.namespace = undefined
      this.store.update((draft) => {
        draft.namespace = undefined
        draft.status = 'unavailable'
        draft.writable = false
      })
      return
    }
    if (this.form === undefined || this.namespace !== match.ns) {
      this.stopForm?.()
      this.namespace = match.ns
      this.form = this.forms.get<ShellSwitchSettings>(match.ns)
      this.stopForm = this.form.subscribe(() => { this.derive() })
    }
    this.derive()
  }

  private derive(): void {
    if (this.disposed || this.form === undefined) return
    const snapshot = this.form.getSnapshot()
    const value = snapshot.value
    this.store.update((draft) => {
      draft.status = snapshot.status
      draft.writable = snapshot.writable
      draft.namespace = this.namespace
      draft.active = value?.activeShell === 'gitbash' ? 'gitbash' : 'pwsh'
      draft.gitBashPath = typeof value?.gitBashPath === 'string' ? value.gitBashPath : ''
      draft.hideInactiveTool = value?.hideInactiveTool !== false
    })
  }

  private async write(field: keyof ShellSwitchSettings, value: unknown): Promise<void> {
    if (this.disposed || this.form === undefined) return
    this.store.update((draft) => { draft.busy = true; draft.failed = false })
    const accepted = await this.form.set(field, value)
    if (this.disposed) return
    this.store.update((draft) => { draft.busy = false; draft.failed = !accepted })
    this.derive()
    // A path edit changes what the host can resolve, and a shell edit changes
    // what it runs: either way the shown status is stale from here on.
    if (accepted) void this.refreshHost(0)
  }
}
