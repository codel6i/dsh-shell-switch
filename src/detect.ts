/**
 * Git Bash discovery for Windows.
 *
 * The plugin never guesses at run time: it resolves one `bash.exe` up front,
 * from an explicit `gitBashPath` when the user pinned one, otherwise from the
 * Git installation this machine already uses. Every input (environment,
 * filesystem, `git --exec-path`) is injectable so the resolution is testable
 * without Git installed.
 *
 * @module dsh-shell-switch/detect
 */

import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** Name of the executable Git for Windows ships. */
export const BASH_EXECUTABLE = 'bash.exe'

/** Where a resolved `bash.exe` came from. */
export type DetectionSource =
  /** The `gitBashPath` configuration field. */
  | 'configured'
  /** Derived from `git --exec-path` (the running Git installation). */
  | 'git-exec-path'
  /** A `bash.exe` found on PATH inside a Git installation directory. */
  | 'environment'
  /** A well-known Git for Windows install location. */
  | 'known-location'

/** One resolved Git Bash installation. */
export interface GitBashDetection {
  /** Absolute path of the executable to run. */
  executable: string
  /** Directory holding it; prepended to PATH so a bare `bash` resolves to it. */
  binDir: string
  /** Which candidate produced the path. */
  source: DetectionSource
}

/** Outcome of one detection attempt. */
export type DetectionResult =
  /** A usable `bash.exe`. */
  | { kind: 'found'; detection: GitBashDetection }
  /** `gitBashPath` was set but names no existing file. */
  | { kind: 'configured-missing'; configured: string }
  /** No Git Bash installation was found. */
  | { kind: 'not-found' }

/** Injectable inputs for {@link detectGitBash}. */
export interface DetectOptions {
  /** Process environment (defaults to `process.env`). */
  env?: Readonly<Record<string, string | undefined>>
  /** File predicate (defaults to a real `statSync` regular-file check). */
  isFile?: (path: string) => boolean
  /** Reads the running Git installation's exec path (defaults to `git --exec-path`). */
  gitExecPath?: () => string | undefined
  /** Reads every `git` executable on PATH (defaults to `where.exe git`). */
  gitCommands?: () => readonly string[]
}

/** Whether a path names a real regular file. */
export function isExecutableFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch (error: unknown) {
    // A missing path is the expected answer here; anything else is still not a file.
    void error
    return false
  }
}

/** The running Git installation's exec path, or `undefined` when Git is absent. */
function defaultGitExecPath(): string | undefined {
  try {
    const output = execFileSync('git', ['--exec-path'], { encoding: 'utf8', timeout: 5_000, windowsHide: true })
    const value = output.trim()
    return value.length > 0 ? value : undefined
  } catch (error: unknown) {
    // Git is not installed or not on PATH: the caller falls through to the other candidates.
    void error
    return undefined
  }
}

/** Every `git` executable PATH resolves to, or none when Git is absent. */
function defaultGitCommands(): readonly string[] {
  try {
    const output = execFileSync('where.exe', ['git'], { encoding: 'utf8', timeout: 5_000, windowsHide: true })
    return output.split(/\r?\n/u).map(line => line.trim()).filter(line => line.length > 0)
  } catch (error: unknown) {
    // No `git` on PATH: other candidates still apply.
    void error
    return []
  }
}

/** Installation roots implied by one known Git command path. */
function rootsOfGitCommand(command: string): string[] {
  const dir = dirname(resolve(command))
  return [dir, resolve(dir, '..'), resolve(dir, '..', '..')]
}

/** Installation roots implied by `git --exec-path` (…/mingw64/libexec/git-core). */
function rootsOfExecPath(execPath: string): string[] {
  const dir = resolve(execPath)
  return [resolve(dir, '..', '..', '..'), resolve(dir, '..', '..')]
}

/** Every candidate `bash.exe` under one installation root. */
function candidatesUnderRoot(root: string): string[] {
  return [join(root, BASH_EXECUTABLE), join(root, 'bin', BASH_EXECUTABLE), join(root, 'usr', 'bin', BASH_EXECUTABLE)]
}

/** Whether a PATH entry looks like a Git installation rather than the WSL stub. */
function looksLikeGitDirectory(entry: string): boolean {
  return /git/iu.test(entry) && !/system32/iu.test(entry)
}

/**
 * Resolve the `bash.exe` this deployment should run.
 *
 * @param configured - the `gitBashPath` configuration field; empty means auto-detect.
 * @param options - injectable environment, file predicate, and Git probes.
 * @returns the resolved installation, or the reason none was usable.
 */
export function detectGitBash(configured: string | undefined, options: DetectOptions = {}): DetectionResult {
  const isFile = options.isFile ?? isExecutableFile
  const declared = (configured ?? '').trim()
  if (declared.length > 0) {
    const executable = resolve(declared)
    return isFile(executable)
      ? { kind: 'found', detection: { executable, binDir: dirname(executable), source: 'configured' } }
      : { kind: 'configured-missing', configured: declared }
  }

  const env = options.env ?? process.env
  const gitExecPath = (options.gitExecPath ?? defaultGitExecPath)()
  const gitCommands = (options.gitCommands ?? defaultGitCommands)()

  const roots = new Set<string>()
  if (gitExecPath !== undefined) for (const root of rootsOfExecPath(gitExecPath)) roots.add(root)
  for (const command of gitCommands) for (const root of rootsOfGitCommand(command)) roots.add(root)

  for (const root of roots) {
    for (const candidate of candidatesUnderRoot(root)) {
      if (isFile(candidate)) {
        const source: DetectionSource = gitExecPath !== undefined && rootsOfExecPath(gitExecPath).includes(root)
          ? 'git-exec-path'
          : 'environment'
        return { kind: 'found', detection: { executable: candidate, binDir: dirname(candidate), source } }
      }
    }
  }

  // PATH itself: a directory that names a Git install, holding the executable.
  const pathEntries = (env.PATH ?? '').split(';').map(entry => entry.trim()).filter(entry => entry.length > 0)
  for (const entry of pathEntries) {
    if (!looksLikeGitDirectory(entry)) continue
    const candidate = join(entry, BASH_EXECUTABLE)
    if (isFile(candidate)) {
      return { kind: 'found', detection: { executable: candidate, binDir: entry, source: 'environment' } }
    }
  }

  // Well-known Git for Windows locations, in the order a default install lands.
  const programFiles = [env.ProgramW6432, env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA === undefined ? undefined : join(env.LOCALAPPDATA, 'Programs')]
  for (const base of programFiles) {
    if (base === undefined || base.length === 0) continue
    for (const candidate of candidatesUnderRoot(join(base, 'Git'))) {
      if (isFile(candidate)) {
        return { kind: 'found', detection: { executable: candidate, binDir: dirname(candidate), source: 'known-location' } }
      }
    }
  }

  return { kind: 'not-found' }
}
