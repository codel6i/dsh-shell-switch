/**
 * Git Bash detection and PATH resolution, exercised without Git installed by
 * injecting the filesystem, the environment, and both Git probes.
 */

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { BASH_EXECUTABLE, detectGitBash, pathContainsDirectory, prependPathDirectory } from '../lib/index.js'

/** A throwaway Git installation holding a fake `bash.exe`. */
function fakeInstall() {
  const root = join(mkdtempSync(join(tmpdir(), 'shell-switch-detect-')), 'Git')
  const binDir = join(root, 'bin')
  mkdirSync(binDir, { recursive: true })
  const executable = join(binDir, BASH_EXECUTABLE)
  writeFileSync(executable, '')
  return { root, binDir, executable }
}

test('a configured executable wins and reports its own directory', () => {
  const install = fakeInstall()
  const result = detectGitBash(install.executable)
  assert.equal(result.kind, 'found')
  assert.equal(result.detection.executable, install.executable)
  assert.equal(result.detection.binDir, install.binDir)
  assert.equal(result.detection.source, 'configured')
})

test('a configured executable that does not exist never falls back silently', () => {
  const missing = join(tmpdir(), 'shell-switch-absent', BASH_EXECUTABLE)
  const result = detectGitBash(missing)
  assert.deepEqual(result, { kind: 'configured-missing', configured: missing })
})

test('git --exec-path resolves the installation that is actually running', () => {
  const install = fakeInstall()
  const execPath = join(install.root, 'mingw64', 'libexec', 'git-core')
  const result = detectGitBash('', {
    env: {},
    isFile: path => path === install.executable,
    gitExecPath: () => execPath,
    gitCommands: () => [],
  })
  assert.equal(result.kind, 'found')
  assert.equal(result.detection.executable, install.executable)
  assert.equal(result.detection.source, 'git-exec-path')
})

test('a git executable on PATH implies its installation root', () => {
  const install = fakeInstall()
  const result = detectGitBash('', {
    env: {},
    isFile: path => path === install.executable,
    gitExecPath: () => undefined,
    gitCommands: () => [join(install.root, 'cmd', 'git.exe')],
  })
  assert.equal(result.kind, 'found')
  assert.equal(result.detection.executable, install.executable)
  assert.equal(result.detection.source, 'environment')
})

test('PATH entries inside a Git install resolve without git itself', () => {
  const install = fakeInstall()
  const result = detectGitBash('', {
    env: { PATH: `C:\\Windows\\System32;${install.binDir}` },
    isFile: path => path === install.executable,
    gitExecPath: () => undefined,
    gitCommands: () => [],
  })
  assert.equal(result.kind, 'found')
  assert.equal(result.detection.binDir, install.binDir)
})

test('the WSL stub in System32 is never mistaken for Git Bash', () => {
  const result = detectGitBash('', {
    env: { PATH: 'C:\\Windows\\System32' },
    isFile: path => path === join('C:\\Windows\\System32', BASH_EXECUTABLE),
    gitExecPath: () => undefined,
    gitCommands: () => [],
  })
  assert.deepEqual(result, { kind: 'not-found' })
})

test('the usual install location is the last resort', () => {
  const install = fakeInstall()
  const expected = join('C:\\Program Files', 'Git', 'bin', BASH_EXECUTABLE)
  const result = detectGitBash('', {
    env: { ProgramFiles: 'C:\\Program Files' },
    isFile: path => path === expected,
    gitExecPath: () => undefined,
    gitCommands: () => [],
  })
  assert.equal(result.kind, 'found')
  assert.equal(result.detection.executable, expected)
  assert.equal(result.detection.source, 'known-location')
  assert.notEqual(install.executable, expected)
})

test('PATH edits are exact and reversible', () => {
  const install = fakeInstall()
  const before = process.env.PATH
  assert.equal(pathContainsDirectory(install.binDir), false)
  const release = prependPathDirectory(install.binDir)
  assert.equal(pathContainsDirectory(install.binDir), true)
  assert.equal(process.env.PATH.startsWith(`${install.binDir};`) || process.env.PATH.startsWith(`${install.binDir}:`), true)
  release()
  assert.equal(pathContainsDirectory(install.binDir), false)
  process.env.PATH = before
})

test('prepending an already listed directory changes nothing', () => {
  const install = fakeInstall()
  const before = process.env.PATH
  const release = prependPathDirectory(install.binDir)
  const afterFirst = process.env.PATH
  const releaseAgain = prependPathDirectory(install.binDir)
  assert.equal(process.env.PATH, afterFirst)
  releaseAgain()
  assert.equal(process.env.PATH.includes(install.binDir), true)
  release()
  process.env.PATH = before
})
