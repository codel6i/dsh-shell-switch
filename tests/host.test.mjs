/**
 * Host-half behavior over a fake Cordis context: what the switch hides, what
 * it refuses, what it tells the model, and what it does to PATH.
 */

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  BASH_EXECUTABLE, ENTRY_ID, STATUS_PATH, apply, guidanceText, hiddenShellTool, isOwnNamespace, readSwitchedConfig,
  shellToolDenial, statusOf,
} from '../lib/index.js'

/** A throwaway directory holding a fake `bash.exe`. */
function fakeInstall() {
  const binDir = mkdtempSync(join(tmpdir(), 'shell-switch-host-'))
  const executable = join(binDir, BASH_EXECUTABLE)
  writeFileSync(executable, '')
  return { binDir, executable }
}

/** The slice of a Cordis context this plugin touches. */
function fakeContext(settings, extraServices = {}, withWebServer = true) {
  const effects = []
  const guards = []
  const sections = []
  const listeners = new Map()
  const routes = []
  const services = { settings, ...extraServices }
  const ctx = {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    effect(factory, label) {
      const dispose = factory()
      effects.push({ dispose: typeof dispose === 'function' ? dispose : () => {}, label })
      return dispose
    },
    on(event, listener) {
      const list = listeners.get(event) ?? []
      list.push(listener)
      listeners.set(event, list)
      return () => { list.splice(list.indexOf(listener), 1) }
    },
    inject(names, callback) {
      if (names.some(name => services[name] === undefined)) return () => {}
      callback(ctx)
      return () => {}
    },
    get(name) { return services[name] },
    tools: { guard(fn) { guards.push(fn); return () => { guards.splice(guards.indexOf(fn), 1) } } },
    systemPrompt: { section(entry) { sections.push(entry); return () => {} }, getSectionOrder() { return 1010 } },
  }
  if (withWebServer) {
    services.webServer = {
      register(route) { routes.push(route); return () => { routes.splice(routes.indexOf(route), 1) } },
    }
  }
  // Cordis exposes a service as a Context property, so the fake must too:
  // `ctx.webServer` inside an inject callback is the property, not `ctx.get`.
  for (const name of Object.keys(services)) {
    if (name === 'settings') continue
    Object.defineProperty(ctx, name, { get: () => services[name], configurable: true })
  }
  return {
    ctx,
    guards,
    sections,
    listeners,
    routes,
    services,
    disposeAll() { while (effects.length > 0) effects.pop().dispose() },
  }
}

/** A request as the connection's trust check sees it. */
function fakeRequest(method = 'GET', authorized = true) {
  return { method, authorized }
}

/** A response recorder for the status route. */
function fakeResponse() {
  const state = { statusCode: 0, headers: {}, body: '' }
  return {
    state,
    res: {
      get statusCode() { return state.statusCode },
      set statusCode(value) { state.statusCode = value },
      setHeader(name, value) { state.headers[name] = value },
      end(body) { state.body = body ?? '' },
    },
  }
}

/** One tool catalog as the assemble waterfall would hand it over. */
function assembly(...names) {
  return { sections: [], contexts: [], tools: names.map(name => ({ name, description: name, parameters: {} })), variables: {} }
}

/** Run the registered assemble listener over one assembly. */
async function assemble(harness, catalog) {
  const listener = harness.listeners.get('system-prompt/assemble')[0]
  assert.ok(listener, 'the plugin registers an assemble listener')
  return await listener(catalog, {}, () => Promise.resolve(catalog))
}

test('the switch is inert off Windows', { skip: process.platform === 'win32' }, () => {
  const harness = fakeContext(undefined)
  apply(harness.ctx, {})
  assert.equal(harness.guards.length, 0)
  assert.equal(harness.sections.length, 0)
})

test('PowerShell: the bash tool is hidden, refused, and never the stated shell', { skip: process.platform !== 'win32' }, async () => {
  const install = fakeInstall()
  const before = process.env.PATH
  const harness = fakeContext(undefined)
  apply(harness.ctx, { activeShell: 'pwsh', gitBashPath: install.executable })

  assert.equal(process.env.PATH.startsWith(install.binDir), true, 'the Git Bash directory leads PATH')
  assert.equal(harness.guards.length, 1)
  assert.match(harness.guards[0]({ name: 'bash' }), /pwsh/)
  assert.equal(harness.guards[0]({ name: 'pwsh' }), undefined)

  const filtered = await assemble(harness, assembly('pwsh', 'bash', 'read'))
  assert.deepEqual(filtered.tools.map(tool => tool.name), ['pwsh', 'read'])

  assert.match(harness.sections[0].text(), /active command shell is PowerShell/)
  harness.disposeAll()
  assert.equal(process.env.PATH, before, 'disposal restores PATH')
})

test('Git Bash: the pwsh tool is hidden, refused, and stated with its executable', { skip: process.platform !== 'win32' }, async () => {
  const install = fakeInstall()
  const before = process.env.PATH
  const harness = fakeContext(undefined)
  apply(harness.ctx, { activeShell: 'gitbash', gitBashPath: install.executable })

  assert.match(harness.guards[0]({ name: 'pwsh' }), /bash/)
  assert.equal(harness.guards[0]({ name: 'bash' }), undefined)

  const filtered = await assemble(harness, assembly('pwsh', 'bash', 'read'))
  assert.deepEqual(filtered.tools.map(tool => tool.name), ['bash', 'read'])

  const text = harness.sections[0].text()
  assert.match(text, /active command shell is Git Bash/)
  assert.ok(text.includes(install.executable))
  harness.disposeAll()
  process.env.PATH = before
})

test('Git Bash without an executable degrades to PowerShell instead of hiding it', { skip: process.platform !== 'win32' }, async () => {
  const harness = fakeContext(undefined)
  apply(harness.ctx, { activeShell: 'gitbash', gitBashPath: join(tmpdir(), 'shell-switch-absent', BASH_EXECUTABLE) })

  const filtered = await assemble(harness, assembly('pwsh', 'bash', 'read'))
  assert.deepEqual(filtered.tools.map(tool => tool.name), ['pwsh', 'bash', 'read'], 'no tool is withheld')
  assert.equal(harness.guards[0]({ name: 'pwsh' }), undefined, 'PowerShell stays usable')
  assert.match(harness.sections[0].text(), /active command shell is PowerShell/)
})

test('keeping both tools visible is a configuration choice', { skip: process.platform !== 'win32' }, async () => {
  const install = fakeInstall()
  const before = process.env.PATH
  const harness = fakeContext(undefined)
  apply(harness.ctx, { activeShell: 'pwsh', gitBashPath: install.executable, hideInactiveTool: false })
  const filtered = await assemble(harness, assembly('pwsh', 'bash'))
  assert.deepEqual(filtered.tools.map(tool => tool.name), ['pwsh', 'bash'])
  assert.match(harness.guards[0]({ name: 'bash' }), /pwsh/, 'the inactive tool still refuses calls')
  harness.disposeAll()
  process.env.PATH = before
})

test('a live settings change re-reads the switch without a remount', { skip: process.platform !== 'win32' }, async () => {
  const install = fakeInstall()
  const before = process.env.PATH
  const state = { activeShell: 'pwsh', gitBashPath: install.executable, hideInactiveTool: true }
  const settings = { describe: () => [{ ns: `include:${ENTRY_ID}`, value: state }] }
  const harness = fakeContext(settings)
  apply(harness.ctx, { activeShell: 'pwsh', gitBashPath: install.executable })

  assert.equal(harness.guards[0]({ name: 'bash' }).length > 0, true)
  state.activeShell = 'gitbash'
  for (const listener of harness.listeners.get('settings/document-updated')) listener(`include:${ENTRY_ID}`, 2)

  assert.equal(harness.guards[0]({ name: 'bash' }), undefined)
  assert.match(harness.guards[0]({ name: 'pwsh' }), /bash/)
  const filtered = await assemble(harness, assembly('pwsh', 'bash'))
  assert.deepEqual(filtered.tools.map(tool => tool.name), ['bash'])
  harness.disposeAll()
  process.env.PATH = before
})

test('the entry answers to its bare id and to the include-qualified namespace', () => {
  assert.equal(isOwnNamespace('shell-switch'), true)
  assert.equal(isOwnNamespace('include:shell-switch'), true)
  assert.equal(isOwnNamespace('shell-switch-other'), false)
  assert.equal(isOwnNamespace('include:tool-bash'), false)
})

test('the settings read narrows what it is given', () => {
  const settings = { describe: () => [{ ns: 'include:shell-switch', value: { activeShell: 'nonsense', gitBashPath: 7, hideInactiveTool: true } }] }
  assert.deepEqual(readSwitchedConfig(settings), { hideInactiveTool: true })
  assert.deepEqual(readSwitchedConfig({ describe: () => [] }), {})
  assert.deepEqual(readSwitchedConfig({ describe: () => [{ ns: 'x', value: 'nope' }] }), {})
})

test('guidance names the shell that will actually run the command', () => {
  assert.match(guidanceText('pwsh', undefined), /PowerShell/)
  assert.match(guidanceText('gitbash', undefined), /PowerShell/, 'unresolved Git Bash cannot be advertised')
  assert.match(guidanceText('gitbash', { executable: 'C:\\Git\\bin\\bash.exe', binDir: 'C:\\Git\\bin', source: 'configured' }), /Git Bash/)
})

test('the hidden tool and the refusal agree with the switch', () => {
  const view = (activeShell, detection, hideInactiveTool = true) => ({ activeShell, detection, hideInactiveTool })
  const found = { executable: 'C:\\Git\\bin\\bash.exe', binDir: 'C:\\Git\\bin', source: 'configured' }
  assert.equal(hiddenShellTool(view('pwsh', found)), 'bash')
  assert.equal(hiddenShellTool(view('gitbash', found)), 'pwsh')
  assert.equal(hiddenShellTool(view('gitbash', undefined)), undefined)
  assert.equal(hiddenShellTool(view('pwsh', found, false)), undefined)
  assert.equal(shellToolDenial('bash', view('pwsh', found)).includes('pwsh'), true)
  assert.equal(shellToolDenial('pwsh', view('pwsh', found)), undefined)
  assert.equal(shellToolDenial('read', view('gitbash', found)), undefined)
})

test('live config accessors are re-read at every use', { skip: process.platform !== 'win32' }, async () => {
  const install = fakeInstall()
  const before = process.env.PATH
  let shell = 'pwsh'
  const live = {
    activeShell: { get: () => shell },
    gitBashPath: { get: () => install.executable },
    hideInactiveTool: { get: () => true },
  }
  const harness = fakeContext(undefined)
  apply(harness.ctx, live)

  assert.match(harness.guards[0]({ name: 'bash' }), /pwsh/, 'bash is refused while PowerShell is active')
  const beforeSwitch = await assemble(harness, assembly('pwsh', 'bash'))
  assert.deepEqual(beforeSwitch.tools.map(tool => tool.name), ['pwsh'])

  shell = 'gitbash'

  assert.equal(harness.guards[0]({ name: 'bash' }), undefined, 'the same guard allows bash after the switch')
  assert.match(harness.guards[0]({ name: 'pwsh' }), /bash/)
  const afterSwitch = await assemble(harness, assembly('pwsh', 'bash'))
  assert.deepEqual(afterSwitch.tools.map(tool => tool.name), ['bash'])
  assert.match(harness.sections[0].text(), /Git Bash/)

  harness.disposeAll()
  process.env.PATH = before
})

test('the status document names the resolved Git Bash and the visible tool', () => {
  const found = { executable: 'D:\\Git\\bin\\bash.exe', binDir: 'D:\\Git\\bin', source: 'git-exec-path' }
  const available = statusOf({
    activeShell: 'gitbash', hideInactiveTool: true, detection: found,
    detectionReason: undefined, configured: undefined, hiddenTool: 'pwsh',
  })
  assert.equal(available.gitBash.available, true)
  assert.equal(available.gitBash.executable, 'D:\\Git\\bin\\bash.exe')
  assert.equal(available.gitBash.source, 'git-exec-path')
  assert.equal(available.visibleTool, 'bash')
  assert.equal(available.hiddenTool, 'pwsh')

  const missing = statusOf({
    activeShell: 'gitbash', hideInactiveTool: true, detection: undefined,
    detectionReason: 'configured-missing', configured: 'D:\\nope\\bash.exe', hiddenTool: undefined,
  })
  assert.equal(missing.gitBash.available, false)
  assert.equal(missing.gitBash.reason, 'configured-missing')
  assert.equal(missing.gitBash.configured, 'D:\\nope\\bash.exe')
  assert.equal(missing.visibleTool, 'pwsh', 'an unresolvable Git Bash cannot be advertised')
  assert.equal(missing.hiddenTool, undefined)

  const notFound = statusOf({
    activeShell: 'pwsh', hideInactiveTool: true, detection: undefined,
    detectionReason: 'not-found', configured: undefined, hiddenTool: 'bash',
  })
  assert.equal(notFound.gitBash.reason, 'not-found')
  assert.equal(notFound.gitBash.configured, undefined)
  assert.equal(notFound.visibleTool, 'pwsh')
})

test('the status route answers the page and refuses everything else', { skip: process.platform !== 'win32' }, async () => {
  const install = fakeInstall()
  const before = process.env.PATH
  const harness = fakeContext(undefined, {
    connection: { requestRejection: (req) => req.authorized === true ? undefined : 401 },
  })
  apply(harness.ctx, { activeShell: 'pwsh', gitBashPath: install.executable })

  assert.equal(harness.routes.length, 1)
  const route = harness.routes[0]
  assert.equal(route.kind, 'exact')
  assert.equal(route.path, STATUS_PATH)

  const ok = fakeResponse()
  await route.handler(fakeRequest('GET', true), ok.res)
  assert.equal(ok.state.statusCode, 200)
  assert.equal(ok.state.headers['cache-control'], 'no-store')
  const body = JSON.parse(ok.state.body)
  assert.equal(body.activeShell, 'pwsh')
  assert.equal(body.gitBash.available, true)
  assert.equal(body.gitBash.executable, install.executable)
  assert.equal(body.visibleTool, 'pwsh')
  assert.equal(body.hiddenTool, 'bash')

  const anonymous = fakeResponse()
  await route.handler(fakeRequest('GET', false), anonymous.res)
  assert.equal(anonymous.state.statusCode, 401)
  assert.equal(anonymous.state.body, '', 'an unauthenticated caller learns nothing')

  const posted = fakeResponse()
  await route.handler(fakeRequest('POST', true), posted.res)
  assert.equal(posted.state.statusCode, 405)

  harness.disposeAll()
  process.env.PATH = before
})

test('without a connection the route refuses instead of answering openly', { skip: process.platform !== 'win32' }, async () => {
  const install = fakeInstall()
  const before = process.env.PATH
  const harness = fakeContext(undefined, {})
  apply(harness.ctx, { activeShell: 'pwsh', gitBashPath: install.executable })
  const response = fakeResponse()
  await harness.routes[0].handler(fakeRequest('GET', true), response.res)
  assert.equal(response.state.statusCode, 503)
  harness.disposeAll()
  process.env.PATH = before
})

test('a host without a web server simply has no route', { skip: process.platform !== 'win32' }, () => {
  const install = fakeInstall()
  const before = process.env.PATH
  const harness = fakeContext(undefined, {}, false)
  apply(harness.ctx, { activeShell: 'pwsh', gitBashPath: install.executable })
  assert.deepEqual(harness.routes, [])
  assert.equal(harness.guards.length, 1, 'the switch itself still works without a web server')
  harness.disposeAll()
  process.env.PATH = before
})
