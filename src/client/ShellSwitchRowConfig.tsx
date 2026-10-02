/**
 * The same panel on the Plugins page: the configuration page of this bundle's
 * `shell-switch` row, keyed `<package name>#<row id>`. The page asks for a
 * one-line summary for the row's description and for the full panel as its
 * body.
 *
 * @module dsh-shell-switch/client/ShellSwitchRowConfig
 */

// Type-only: the plugin manager page's SlotMap merge (the 'plugins.row.config' entry).
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { ShellSwitchPanel } from './ShellSwitchPanel.tsx'
import type { ShellSwitchFace } from './controller.ts'

/** Props the renderer binds for one bundle row's configuration page. */
export type ShellSwitchRowConfigProps =
  PropsRuntime<'plugins.row.config'>
  & PropsLocale<'settings.shellSwitch'>
  & InjectFace<ShellSwitchFace>

/**
 * Render the row's one-liner or the shell switch, as the Plugins page asks.
 * @param props - the view asked for, locale copy, the panel snapshot, and its actions.
 * @returns the one-line summary, or the panel.
 */
export function ShellSwitchRowConfig(props: ShellSwitchRowConfigProps) {
  const state = props.useShellSwitch(snapshot => snapshot)
  if (props.view === 'summary') return props.t('summary')
  return (
    <ShellSwitchPanel
      t={props.t}
      state={state}
      select={props.select}
      setGitBashPath={props.setGitBashPath}
      setHideInactiveTool={props.setHideInactiveTool}
    />
  )
}
