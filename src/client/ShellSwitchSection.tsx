/**
 * The shell switch page in Settings: the panel behind the page's own snapshot
 * and write actions.
 *
 * @module dsh-shell-switch/client/ShellSwitchSection
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { ShellSwitchPanel } from './ShellSwitchPanel.tsx'
import type { ShellSwitchFace } from './controller.ts'

/** Props the renderer binds for the shell switch page. */
export type ShellSwitchSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.shellSwitch'>
  & InjectFace<ShellSwitchFace>

/**
 * Render the shell switch page.
 * @param props - locale copy, the page snapshot, and its write actions.
 * @returns the page content.
 */
export function ShellSwitchSection(props: ShellSwitchSectionProps) {
  const state = props.useShellSwitch(snapshot => snapshot)
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
