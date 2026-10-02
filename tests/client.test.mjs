/**
 * The browser half, driven the way the page drives it: evaluate the built
 * `lib/client.js` registration with a stubbed module table, then run `apply`
 * against a fake client context and assert what it registers, which settings
 * namespace it binds, and what the panel's actions do.
 *
 * The settings store and React are the real packages, so the controller's
 * snapshot contract and the component's render path are exercised rather than
 * assumed; only the shared primitives are stubs, because their CSS Modules
 * cannot load outside a bundler.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import * as clientStore from '@deepseek-ai/dsh-client-store'
import * as react from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

/** The status route's canned answer, as the page's own fetch would receive it. */
const DEFAULT_HOST_STATUS = {
  platform: 'win32',
  activeShell: 'pwsh',
  hideInactiveTool: true,
  gitBash: {
    available: true,
    executable: 'D:\\Application\\DevTool\\Git\\bin\\bash.exe',
    binDir: 'D:\\Application\\DevTool\\Git\\bin',
    source: 'git-exec-path',
  },
  visibleTool: 'pwsh',
  hiddenTool: 'bash',
}
let hostStatus = DEFAULT_HOST_STATUS
let hostStatusFails = false
const statusRequests = []

// The built client half reads these browser globals; a Node run supplies them.
globalThis.document = { baseURI: 'http://127.0.0.1:19387/' }
globalThis.fetch = async (url) => {
  statusRequests.push(String(url))
  if (hostStatusFails) throw new Error('offline')
  return { ok: true, json: async () => hostStatus }
}

/** Let the controller's asynchronous status read settle. */
async function settle() {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve()
}

/** Evaluate the built bundle and return the factory it registers. */
function loadClientBundle() {
  const source = readFileSync(resolve(import.meta.dirname, '../lib/client.js'), 'utf8')
  let registration
  new Function('window', source)({ __ModuleLoader__: { load: (value) => { registration = value } } })
  assert.ok(registration, 'the bundle registered a factory')
  return registration
}

/** Primitive stubs that render their own contract, so a render can be asserted. */
const PRIMITIVE_STUBS = {
  SegmentedControl: (props) => react.createElement(
    'div',
    { 'data-primitive': 'segmented', 'data-value': props.value, 'data-label': props.label, 'data-disabled': String(props.disabled === true) },
    props.options.map(option => react.createElement('button', { key: option.value, type: 'button', title: option.title }, option.label)),
  ),
  Input: (props) => react.createElement('input', { ...props, 'data-primitive': 'input' }),
  Switch: (props) => react.createElement('button', { 'data-primitive': 'switch', 'aria-checked': String(props.checked), 'aria-label': props.label }),
}

/** The module table the bundle's externals resolve through. */
const MODULE_TABLE = {
  react,
  'react/jsx-runtime': jsxRuntime,
  '@deepseek-ai/dsh-client-ui-primitives': PRIMITIVE_STUBS,
  '@deepseek-ai/dsh-client-store': clientStore,
}

/** Load the client module exports the page would receive. */
function loadClientModule() {
  const registration = loadClientBundle()
  return { registration, exports: registration.factory((specifier) => {
    const entry = MODULE_TABLE[specifier]
    assert.ok(entry !== undefined, `unexpected require(${specifier})`)
    return entry
  }) }
}

/** A settings form with the shape `ctx.configForms.get(ns)` hands back. */
function fakeForm(initial) {
  const listeners = new Set()
  const writes = []
  let value = initial
  const snapshot = { status: 'ready', value, base: value, user: value, revision: 1, writable: true, mode: 'host' }
  return {
    writes,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    async set(field, next) {
      writes.push([field, next])
      value = { ...value, [field]: next }
      snapshot.value = value
      for (const listener of listeners) listener()
      return true
    },
  }
}

/** A settings mirror with the shape `ctx.configForms.describe()` hands back. */
function fakeMirror(served) {
  const listeners = new Set()
  let view = { namespaces: served, writable: true }
  return {
    face: {
      getSnapshot: () => ({ status: 'ready', view }),
      subscribe(listener) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      async ensure() { return undefined },
      namespace: (ns) => view.namespaces.find(row => row.ns === ns),
    },
    /** Publish a new served set, as a settings read or write answer would. */
    set(next) {
      view = { namespaces: next, writable: true }
      for (const listener of listeners) listener()
    },
  }
}

/** The slice of the client context this plugin touches. */
function fakeClientContext(served = [], form) {
  const effects = []
  const registrations = []
  const dictionaries = []
  const requested = []
  const mirror = fakeMirror(served.map(row => (typeof row === 'string' ? { ns: row, value: undefined } : row)))
  const ctx = {
    effect(factory, label) {
      const dispose = factory()
      effects.push({ dispose: typeof dispose === 'function' ? dispose : () => {}, label })
      return dispose
    },
    locale: {
      bind: (ns) => (key) => `${ns}:${key}`,
      register: (ns, dictionary) => { dictionaries.push({ ns, dictionary }); return () => {} },
    },
    configForms: {
      get(namespace) { requested.push(namespace); return form },
      describe: () => mirror.face,
    },
    slots: {
      inject: (_name, register) => register(),
      register(entry, Component) {
        registrations.push({ entry, Component })
        return () => { registrations.splice(registrations.indexOf(registrations.at(-1)), 1) }
      },
    },
  }
  return { ctx, effects, registrations, dictionaries, requested, mirror }
}

/** The settled value of the page snapshot at one point. */
const stateOf = (face) => face.hooks.shellSwitch.getSnapshot()

/** The Settings → Shell registration. */
const sectionOf = (harness) => harness.registrations.find(row => row.entry.name === 'settings.section')

/** The bundle row's configuration registration. */
const rowConfigOf = (harness) => harness.registrations.find(row => row.entry.name === 'plugins.row.config')

test('the bundle is a function plugin exposing apply and inject', () => {
  const { registration, exports } = loadClientModule()
  assert.equal(registration.id, 'dsh-shell-switch')
  assert.equal(registration.chunk, undefined, 'the entry chunk carries no chunk name')
  assert.equal(typeof exports.apply, 'function')
  assert.deepEqual(exports.inject, ['slots', 'locale', 'configForms'])
  assert.equal(exports.NS, 'settings.shellSwitch')
})

test('the page registers into settings.section under its own id and order', () => {
  const form = fakeForm({ activeShell: 'pwsh', gitBashPath: '', hideInactiveTool: true })
  const harness = fakeClientContext(['shell-switch'], form)
  const { exports } = loadClientModule()
  exports.apply(harness.ctx)

  assert.deepEqual(harness.dictionaries.map(entry => entry.ns), ['settings.shellSwitch'])
  assert.ok(harness.dictionaries[0].dictionary.zh !== undefined)
  assert.ok(harness.dictionaries[0].dictionary.en !== undefined)

  assert.equal(harness.registrations.length, 2, 'both reachable surfaces register')
  const { entry, Component } = sectionOf(harness)
  assert.equal(entry.name, 'settings.section')
  assert.equal(entry.id, 'shell-switch')
  assert.equal(entry.order, 30)
  assert.equal(entry.locale, 'settings.shellSwitch')
  assert.equal(entry.label(), 'settings.shellSwitch:nav')
  assert.equal(typeof Component, 'function')

  const rowPage = rowConfigOf(harness)
  assert.equal(rowPage.entry.name, 'plugins.row.config')
  assert.equal(rowPage.entry.key, 'dsh-shell-switch#shell-switch')
  assert.equal(rowPage.entry.locale, 'settings.shellSwitch')
  assert.equal(typeof rowPage.Component, 'function')
})

test('the host entry is found by id, however the deployment qualifies it', () => {
  const form = fakeForm({ activeShell: 'pwsh' })
  const harness = fakeClientContext(['include:shell-switch'], form)
  const { exports } = loadClientModule()
  exports.apply(harness.ctx)
  assert.deepEqual(harness.requested, ['include:shell-switch'])
  assert.equal(harness.registrations.length, 2)
})

test('an entry served under an unexpected id is still claimed by its own config field', () => {
  const form = fakeForm({ activeShell: 'gitbash', gitBashPath: 'D:\\Git\\bin\\bash.exe' })
  const harness = fakeClientContext([{ ns: 'some:other:row', value: { activeShell: 'gitbash' } }], form)
  const { exports } = loadClientModule()
  exports.apply(harness.ctx)
  assert.deepEqual(harness.requested, ['some:other:row'])
  const face = sectionOf(harness).entry.inject()
  assert.equal(stateOf(face).namespace, 'some:other:row')
  assert.equal(stateOf(face).active, 'gitbash')
})

test('an unrelated served entry is never claimed', () => {
  const form = fakeForm({ activeShell: 'pwsh' })
  const harness = fakeClientContext([{ ns: 'other-row', value: { timeoutMs: 1 } }], form)
  const { exports } = loadClientModule()
  exports.apply(harness.ctx)
  assert.deepEqual(harness.requested, [])
  assert.equal(stateOf(sectionOf(harness).entry.inject()).namespace, undefined)
})

test('the page binds when the host entry appears after it', () => {
  const form = fakeForm({ activeShell: 'gitbash' })
  const harness = fakeClientContext([], form)
  const { exports } = loadClientModule()
  exports.apply(harness.ctx)
  assert.deepEqual(harness.requested, [], 'nothing to bind yet')
  harness.mirror.set([{ ns: 'shell-switch', value: { activeShell: 'gitbash' } }])
  assert.deepEqual(harness.requested, ['shell-switch'], 'the mirror answers with the entry')
  assert.equal(stateOf(sectionOf(harness).entry.inject()).active, 'gitbash')
})

test('the page still registers with no served entry, and states that it is unbound', () => {
  const form = fakeForm({ activeShell: 'pwsh' })
  const harness = fakeClientContext([], form)
  const { exports } = loadClientModule()
  exports.apply(harness.ctx)
  assert.equal(harness.registrations.length, 2, 'the panel never silently disappears')
  assert.deepEqual(harness.requested, [])
  const state = stateOf(sectionOf(harness).entry.inject())
  assert.equal(state.namespace, undefined)
  assert.equal(state.writable, false)
  assert.equal(state.status, 'unavailable')
})

test('the injected face projects the form and writes the switch back', async () => {
  const form = fakeForm({ activeShell: 'pwsh', gitBashPath: '', hideInactiveTool: true })
  const harness = fakeClientContext(['shell-switch'], form)
  const { exports } = loadClientModule()
  exports.apply(harness.ctx)

  const face = sectionOf(harness).entry.inject()
  assert.deepEqual(
    { active: stateOf(face).active, path: stateOf(face).gitBashPath, hide: stateOf(face).hideInactiveTool, writable: stateOf(face).writable },
    { active: 'pwsh', path: '', hide: true, writable: true },
  )

  face.select('gitbash')
  await Promise.resolve()
  assert.deepEqual(form.writes[0], ['activeShell', 'gitbash'])
  assert.equal(stateOf(face).active, 'gitbash')

  face.setGitBashPath('D:\\Git\\bin\\bash.exe')
  await Promise.resolve()
  assert.deepEqual(form.writes[1], ['gitBashPath', 'D:\\Git\\bin\\bash.exe'])
  assert.equal(stateOf(face).gitBashPath, 'D:\\Git\\bin\\bash.exe')

  face.setHideInactiveTool(false)
  await Promise.resolve()
  assert.deepEqual(form.writes[2], ['hideInactiveTool', false])
  assert.equal(stateOf(face).hideInactiveTool, false)
  assert.equal(stateOf(face).failed, false)
})

test('a refused write is reported and leaves the switch where the host has it', async () => {
  const form = fakeForm({ activeShell: 'pwsh' })
  form.set = async () => false
  const harness = fakeClientContext(['shell-switch'], form)
  const { exports } = loadClientModule()
  exports.apply(harness.ctx)
  const face = sectionOf(harness).entry.inject()
  face.select('gitbash')
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(stateOf(face).failed, true)
  assert.equal(stateOf(face).busy, false)
  assert.equal(stateOf(face).active, 'pwsh', 'the shown selection stays the accepted one')
})

test('disposal unregisters the page and stops following the form', () => {
  const form = fakeForm({ activeShell: 'pwsh' })
  const harness = fakeClientContext(['shell-switch'], form)
  const { exports } = loadClientModule()
  exports.apply(harness.ctx)
  assert.equal(harness.registrations.length, 2)
  for (const effect of harness.effects.reverse()) effect.dispose()
  assert.equal(harness.registrations.length, 0)
})

/**
 * Render the registered component the way the renderer binds it: `t` from the
 * page's dictionary, `useShellSwitch` from the injected hooks compartment, and
 * the face's actions as callbacks.
 */
async function renderPanel(settings, locale = 'zh', served = ['shell-switch'], status = DEFAULT_HOST_STATUS) {
  // Every render starts from a known host answer, so one test's status cannot
  // leak into the next one's expectations.
  hostStatus = status
  const form = fakeForm(settings)
  const harness = fakeClientContext(served, form)
  const { exports } = loadClientModule()
  exports.apply(harness.ctx)
  await settle()
  const { Component, entry } = sectionOf(harness)
  const dictionary = harness.dictionaries[0].dictionary[locale]
  const face = entry.inject()
  const markup = renderToStaticMarkup(react.createElement(Component, {
    ...face,
    t: (key) => dictionary[key],
    useShellSwitch: (selector) => selector(face.hooks.shellSwitch.getSnapshot()),
  }))
  return { markup, dictionary, form, face, harness }
}

test('an unreachable status route is reported as unknown, not guessed', async () => {
  hostStatusFails = true
  const { markup, dictionary } = await renderPanel({ activeShell: 'pwsh' })
  assert.ok(markup.includes(dictionary.statusUnknown), 'the panel says it could not read the host')
  assert.ok(!markup.includes(dictionary.detectedLabel), 'and claims nothing about Git Bash')
  hostStatusFails = false
})

test('the panel states the Git Bash the host resolved, and the tool the model gets', async () => {
  statusRequests.length = 0
  const { markup, dictionary } = await renderPanel({ activeShell: 'pwsh' })
  assert.ok(statusRequests.length > 0, 'the panel read the host status route')
  assert.ok(statusRequests[0].endsWith('/shell-switch/status'), `unexpected status url ${statusRequests[0]}`)
  assert.ok(markup.includes(dictionary.detectedLabel), 'the found label renders')
  assert.ok(markup.includes('D:\\Application\\DevTool\\Git\\bin\\bash.exe'), 'the resolved executable renders')
  assert.ok(markup.includes(dictionary.sourceGitExecPath), 'the source renders')
  assert.ok(markup.includes(dictionary.factTool), 'the tool row renders')
  assert.ok(markup.includes(`bash${dictionary.toolHiddenSuffix}`), 'bash is the withheld tool while PowerShell is active')
})

test('the panel states why Git Bash is missing when the host resolved none', async () => {
  const missing = {
    platform: 'win32',
    activeShell: 'pwsh',
    hideInactiveTool: true,
    gitBash: { available: false, reason: 'configured-missing', configured: 'D:\\nope\\bash.exe' },
    visibleTool: 'pwsh',
  }
  const { markup, dictionary } = await renderPanel({ activeShell: 'pwsh', gitBashPath: 'D:\\nope\\bash.exe' }, 'zh', ['shell-switch'], missing)
  assert.ok(markup.includes(dictionary.notDetectedLabel), 'the missing label renders')
  assert.ok(markup.includes(dictionary.reasonConfiguredMissing), 'the reason renders')
  assert.ok(markup.includes('D:\\nope\\bash.exe'), 'the unusable configured path renders')

  // Selecting the shell that cannot run must say so on its own card.
  const selected = await renderPanel({ activeShell: 'gitbash', gitBashPath: 'D:\\nope\\bash.exe' }, 'zh', ['shell-switch'], missing)
  assert.ok(selected.markup.includes(selected.dictionary.unresolved), 'the executor row says nothing was resolved')
  assert.ok(selected.markup.includes(selected.dictionary.unavailableHint), 'and the card warns before switching')
})

test('the detail card is the selected shell’s, not one paragraph swapped', async () => {
  const bash = await renderPanel({ activeShell: 'gitbash' })
  const pwsh = await renderPanel({ activeShell: 'pwsh' })
  assert.notEqual(bash.markup, pwsh.markup, 'the two selections render different content')

  assert.ok(bash.markup.includes(bash.dictionary.cardGitBash), 'the Git Bash card titles itself')
  assert.ok(bash.markup.includes(bash.dictionary.gitbashPaths), 'its own path style')
  assert.ok(bash.markup.includes(bash.dictionary.gitbashVars), 'its own environment variables')
  assert.ok(bash.markup.includes(bash.dictionary.sourceGitExecPath), 'how the executable was resolved')
  assert.ok(!bash.markup.includes(bash.dictionary.pwshPaths), 'and none of the PowerShell rows')

  assert.ok(pwsh.markup.includes(pwsh.dictionary.cardPwsh), 'the PowerShell card titles itself')
  assert.ok(pwsh.markup.includes(pwsh.dictionary.pwshExecutor), 'its executor needs no detection')
  assert.ok(pwsh.markup.includes(pwsh.dictionary.pwshPaths), 'its own path style')
  assert.ok(pwsh.markup.includes(pwsh.dictionary.pwshVars), 'its own environment variables')
  assert.ok(!pwsh.markup.includes(pwsh.dictionary.factSource), 'PowerShell has nothing to resolve')
  assert.ok(!pwsh.markup.includes(pwsh.dictionary.gitbashPaths), 'and none of the Git Bash rows')
})

test('the panel says what happens to the tool that is not in force', async () => {
  const hidden = await renderPanel({ activeShell: 'gitbash', hideInactiveTool: true })
  assert.ok(hidden.markup.includes(`pwsh${hidden.dictionary.toolHiddenSuffix}`), 'the other tool is reported hidden')

  const kept = await renderPanel({ activeShell: 'gitbash', hideInactiveTool: false })
  assert.ok(kept.markup.includes(`pwsh${kept.dictionary.toolKeptSuffix}`), 'or reported as kept but refused')
})

test('a switch the host has not adopted yet is stated, not glossed over', async () => {
  // The canned host status says PowerShell; the stored setting says Git Bash.
  const { markup, dictionary } = await renderPanel({ activeShell: 'gitbash' })
  assert.ok(markup.includes(dictionary.pendingNotice.replace('{from}', 'pwsh').replace('{to}', 'Git Bash')), 'the pending switch is named')

  const settled = await renderPanel({ activeShell: 'pwsh' })
  assert.ok(!settled.markup.includes('{from}'), 'no unsubstituted template survives')
  assert.ok(!settled.markup.includes('宿主当前仍在用'), 'and nothing pending is claimed once the host agrees')
})

test('an unbound page states that the host entry is missing and locks its controls', async () => {
  const { markup, dictionary } = await renderPanel({ activeShell: 'pwsh' }, 'zh', [])
  assert.ok(markup.includes(dictionary.unbound), 'the unbound notice renders')
  assert.ok(!markup.includes(dictionary.readOnly), 'the read-only notice does not stand in for it')
  assert.match(markup, /data-disabled="true"/u, 'the shell control is locked')
  assert.match(markup, /<input[^>]*disabled/u, 'the path field is locked')
})

test('the bundle row page answers both views the Plugins screen asks for', () => {
  const form = fakeForm({ activeShell: 'gitbash', gitBashPath: '', hideInactiveTool: true })
  const harness = fakeClientContext(['shell-switch'], form)
  const { exports } = loadClientModule()
  exports.apply(harness.ctx)
  const { Component, entry } = rowConfigOf(harness)
  const dictionary = harness.dictionaries[0].dictionary.zh
  const face = entry.inject()
  const props = {
    ...face,
    t: (key) => dictionary[key],
    useShellSwitch: (selector) => selector(face.hooks.shellSwitch.getSnapshot()),
  }

  const summary = renderToStaticMarkup(react.createElement(Component, { ...props, view: 'summary' }))
  assert.equal(summary, dictionary.summary, 'the summary is the row description')

  const page = renderToStaticMarkup(react.createElement(Component, { ...props, view: 'page' }))
  assert.ok(page.includes(dictionary.title), 'the page view renders the panel')
  assert.match(page, /data-primitive="segmented"/u)
  assert.match(page, /data-value="gitbash"/u)
  assert.match(page, /data-primitive="switch"/u)
  assert.match(page, /data-primitive="input"/u)
})

test('the panel renders its copy, both shell choices, and the path field', async () => {
  const { markup, dictionary } = await renderPanel({ activeShell: 'pwsh', gitBashPath: '', hideInactiveTool: true })

  assert.ok(markup.includes(dictionary.title), 'the page title renders')
  assert.ok(markup.includes(dictionary.description), 'the description renders')
  assert.ok(markup.includes(dictionary.pathHint), 'the auto-detection hint renders')
  assert.match(markup, /data-primitive="segmented"/u)
  assert.match(markup, /data-value="pwsh"/u)
  assert.ok(markup.includes('PowerShell') && markup.includes('Git Bash'), 'both segments are labelled')
  assert.match(markup, /data-primitive="switch"/u)
  assert.match(markup, /data-primitive="input"/u)
  assert.ok(!markup.includes(dictionary.writeFailed), 'no failure copy on a healthy page')
})

test('the panel follows the active shell and shows the configured path', async () => {
  const bash = await renderPanel({ activeShell: 'gitbash', gitBashPath: 'D:\\Git\\bin\\bash.exe', hideInactiveTool: true })
  assert.match(bash.markup, /data-value="gitbash"/u)
  assert.ok(bash.markup.startsWith('<div'), 'the page renders an element tree')
  assert.ok(bash.markup.includes('D:\\Git\\bin\\bash.exe'), 'the configured executable is shown')
  assert.ok(bash.markup.includes(bash.dictionary.gitbashPaths), 'the Git Bash card explains its own dialect')

  const pwsh = await renderPanel({ activeShell: 'pwsh', gitBashPath: '', hideInactiveTool: false })
  assert.ok(pwsh.markup.includes(pwsh.dictionary.pwshPaths), 'the PowerShell card explains its own dialect')
  assert.ok(!pwsh.markup.includes('D:\\Git\\bin\\bash.exe'), 'nothing pins an executable while auto-detecting')
  assert.match(pwsh.markup, /aria-checked="false"/u, 'the hide switch reflects the stored false')
})

test('the panel speaks English when the page locale is English', async () => {
  const { markup, dictionary } = await renderPanel({ activeShell: 'pwsh' }, 'en')
  assert.ok(markup.includes('Choose which shell the agent runs commands in'))
  assert.equal(dictionary.title, 'Shell')
})

test('a read-only host renders the page without the failure copy', () => {
  const form = fakeForm({ activeShell: 'pwsh' })
  const snapshot = form.getSnapshot()
  snapshot.writable = false
  const harness = fakeClientContext(['shell-switch'], form)
  const { exports } = loadClientModule()
  exports.apply(harness.ctx)
  const { Component, entry } = sectionOf(harness)
  const dictionary = harness.dictionaries[0].dictionary.zh
  const face = entry.inject()
  const markup = renderToStaticMarkup(react.createElement(Component, {
    ...face,
    t: (key) => dictionary[key],
    useShellSwitch: (selector) => selector(face.hooks.shellSwitch.getSnapshot()),
  }))
  assert.ok(markup.includes(dictionary.readOnly), 'the read-only notice renders')
  assert.match(markup, /data-disabled="true"/u, 'the shell control is locked')
  assert.match(markup, /<input[^>]*disabled/u, 'the path field is locked')
  assert.ok(!markup.includes(dictionary.writeFailed))
})


