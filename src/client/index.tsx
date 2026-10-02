/**
 * The shell switch panel, browser half: the Settings → Shell page and the
 * same panel as this bundle's `shell-switch` row configuration on the Plugins
 * screen.
 *
 * @module dsh-shell-switch/client
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.configForms merge and the 'settings.section' SlotMap entry.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the ctx.slots merge (the client renderer owns the slot registry).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the 'plugins.row.config' SlotMap entry (the bundle row's own page).
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { PACKAGE_NAME } from '../ids.ts'
import { readHostStatus } from './host-status.ts'
import { ShellSwitchRowConfig } from './ShellSwitchRowConfig.tsx'
import { ShellSwitchSection } from './ShellSwitchSection.tsx'
import { SHELL_SWITCH_ENTRY, ShellSwitchController } from './controller.ts'
import { en, zh, type ShellSwitchLocaleKey } from './locales.ts'

export type { ShellSwitchFace, ShellSwitchKind, ShellSwitchSettings, ShellSwitchState } from './controller.ts'
export type { ShellSwitchLocaleKey } from './locales.ts'
export type { ShellSwitchPanelProps } from './ShellSwitchPanel.tsx'
export type { ShellSwitchRowConfigProps } from './ShellSwitchRowConfig.tsx'
export type { ShellSwitchSectionProps } from './ShellSwitchSection.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Shell switch page copy. */
    'settings.shellSwitch': ShellSwitchLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.shellSwitch'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'configForms']

/**
 * Mount the shell switch panel in both places it is reachable from.
 *
 * Both registrations are unconditional: the host row ships in this same
 * package, so the bundle being loaded already implies the row, and a panel
 * that silently disappears is the one failure a reader cannot act on. The
 * controller reports an unbound host entry instead.
 *
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-shell-switch: dictionaries')
  const controller = new ShellSwitchController(
    ctx.configForms,
    ctx.configForms.describe(),
    // The page reads the host's live facts from its own status route, with the
    // cookie the index load already minted.
    () => readHostStatus(document.baseURI),
  )
  ctx.effect(() => () => { controller.dispose() }, 'dsh-shell-switch: entry binding')
  // Settings → Shell.
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: SHELL_SWITCH_ENTRY,
    // After Models (10) and Agent presets (20): a per-deployment execution choice.
    order: 30,
    label: () => t('nav'),
    locale: NS,
    inject: () => controller.inject(),
  }, ShellSwitchSection)), 'dsh-shell-switch: settings page')
  // The `shell-switch` row's own page on the Plugins screen, keyed the way that
  // page addresses a bundle's rows, so the switch is one click from the row
  // list a reader is already looking at.
  ctx.effect(() => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
    name: 'plugins.row.config',
    key: `${PACKAGE_NAME}#${SHELL_SWITCH_ENTRY}`,
    locale: NS,
    inject: () => controller.inject(),
  }, ShellSwitchRowConfig)), 'dsh-shell-switch: bundle row page')
}
