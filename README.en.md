# dsh-shell-switch

A shell switch panel for the **dsh Windows desktop**: pick whether the agent runs its commands
through **PowerShell** or **Git Bash**, from **Settings → Shell**. The switch applies immediately —
no restart.

> 中文说明：[README.md](./README.md)

---

## What the switch actually changes

On Windows, dsh hands the model exactly one shell tool: `pwsh` (`@deepseek-ai/dsh-tool-pwsh` over the
`pwsh-sandbox` executor). Git Bash has no entry point. This plugin adds that second position and keeps
**exactly one shell tool visible to the model at a time**:

| Active shell | Tool the model sees | Prompt line | The other tool |
|---|---|---|---|
| `pwsh` (default) | `pwsh` | "The active command shell is PowerShell…" | `bash` removed from the tool list; calls refused |
| `gitbash` | `bash` (Git Bash 5.x / MINGW64) | "The active command shell is Git Bash… Git Bash is `D:\...\Git\bin\bash.exe`" | `pwsh` removed from the tool list; calls refused |

Verified on a real machine — after switching to Git Bash, the model ran through the `bash` tool:

```
shell=5.2.37(1)-release
bash-path=/usr/bin/bash
MINGW64_NT-10.0-26200
cwd=/d/deepseek/deepseek-cli
env-style=/c/Users/lss
```

Background jobs work too — the `bash` tool inside its isolated realm still reaches the `jobs` registry:

```jsonc
// bash { run_in_background: true } → started background job bash-6
// job_output bash-6 →
"bg-start 10:55:47\ntick-1\ntick-2\ntick-3\nbg-done 10:55:50\nshell=5.2.37(1)-release"   // exit 0
```

---

## Install

The plugin is packaged as a dsh bundle (`package.json` → `dsh.bundle.patch` → `cordis.patch.yml`).

**Option A — local package (works offline)**

```powershell
cd <plugin dir>; npm install; npm run build; npm pack
dsh plugin --profile desktop add file:<plugin dir>\dsh-shell-switch-0.1.7.tgz
```

Inside a dsh session the built-in `plugin_manager` tool does the same: `install_bundle` with a
`file:...tgz` target.

**Option B — install from the git repository**

```powershell
dsh plugin --profile desktop add github:codel6i/dsh-shell-switch
```

The repository's `package.json` carries `prepare: npm run build`, so a git install builds `lib/`
itself (`lib/` is not committed).

**Option C — manual mount**

1. Copy the plugin directory (with `lib/`) to `<DSH_HOME>\profiles\<profile>\node_modules\dsh-shell-switch\`;
2. add `"dsh-shell-switch"` to `dsh.profile.bundles` in the profile's `package.json`;
3. restart dsh (or trigger a config reload).

No dsh source change is required.

---

## Use

The panel has two entry points with identical content:

- **Settings → Shell**: open Settings from the account entry at the sidebar foot, then pick **Shell**;
- **Plugins → dsh-shell-switch → open the `dsh-shell-switch` row**: that row's own configuration page
  is the same panel (dsh's `plugins.row.config` slot, keyed `dsh-shell-switch#shell-switch`).

The panel asks for:

1. the active shell: **PowerShell** or **Git Bash**;
2. optional: the **Git Bash executable** — empty auto-detects, or pin an absolute `bash.exe`;
3. optional: **Hide the inactive shell tool** (default on); off keeps both tools listed, and the
   inactive one still refuses calls.

The lower half of the panel **follows the selection**: pick a shell and the card becomes that shell's —
its executor (with the resolved path and how it was found), path style, environment variables, the tool
the model holds, and what happens to the other tool (withheld, or listed and refused). Below that come
the Git Bash path setting and the hide switch, and the last line is the host's live view.

The line under the controls is the **host's live status** (read from `GET /shell-switch/status` through
dsh's connection trust): for example
`Git Bash found: D:\Application\DevTool\Git\bin\bash.exe (from git --exec-path) · shell tool the model gets: pwsh`.
It answers "did it actually find it?" with the path, how it was found, and the shell tool the model is
holding right now; when the route cannot be read it says so instead of guessing.

> The **`cordis:group` row** (id `shell-switch-bash`) is a container with no plugin implementation of
> its own, so toggling it reports "plugin not found" — that is expected and harmless. What actually
> runs are its two children: `@deepseek-ai/dsh-bash-sandbox` (the executor) and
> `@deepseek-ai/dsh-tool-bash` (the `bash` tool). The container is what scopes a second `shell`
> service beside dsh's own `pwsh-sandbox`, so it cannot be flattened away.

The write lands in the profile's `cordis.patch.yml`:

```yaml
- id: shell-switch
  name: dsh-shell-switch
  config:
    activeShell: gitbash      # pwsh | gitbash
    gitBashPath: ''           # empty = auto-detect
    hideInactiveTool: true
```

To confirm it took effect, have the model run a command: the `pwsh` position runs PowerShell, the
`gitbash` position runs Git Bash (`uname -s` answers `MINGW64_NT-...`).

---

## How it works

`cordis.patch.yml` inserts three rows:

| Row id | Role |
|---|---|
| `shell-switch` | This plugin (host + browser halves); `activeShell` **is** the switch |
| `shell-switch-bash` | A `cordis:group` with `isolate: { shell: true }`, keeping its `shell` service realm-local |
| ├ `shell-switch-bash-exec` | `@deepseek-ai/dsh-bash-sandbox`: the Git Bash executor (sandbox semantics preserved) |
| └ `shell-switch-bash-tool` | `@deepseek-ai/dsh-tool-bash`: the official `bash` tool, `run_in_background` included |

> Isolation is required: a Cordis context loads exactly one `shell` implementation, and the
> deployment's own executor (`pwsh-sandbox` on Windows) must keep serving every other consumer.

The host half (`src/index.ts`) does five things on top of the switch:

1. **Resolve Git Bash**: `gitBashPath` → `git --exec-path` → roots implied by `where git` → Git
   directories on PATH → well-known install locations, never mistaking the WSL stub in
   `C:\Windows\System32` for Git Bash.
2. **Make `bash` resolvable**: put the Git installation's `bin` directory first on the process PATH,
   and remove exactly that entry when the plugin unloads.
3. **Control the model's tool list**: a `system-prompt/assemble` waterfall removes the inactive shell
   tool from `assembly.tools`.
4. **Refuse the inactive shell and state the active one**: a `tools.guard` denial covers a tool list
   cached from the previous step, and a dynamic prompt section states the active shell, its dialect,
   and the resolved Git Bash path.
5. **Hand the panel the live facts**: `GET /shell-switch/status` reports the active shell, the resolved
   `bash.exe` and where it came from, and which shell tool is visible or withheld. The route exists
   only where a web server does, and answers only callers `connection.requestRejection` accepts
   (401 otherwise).

The browser half (`src/client/`) registers one panel in two places: `settings.section`
(Settings → Shell) and `plugins.row.config` (this bundle's own `shell-switch` row page, keyed
`dsh-shell-switch#shell-switch`). Reads and writes go through dsh's own `configForms` / settings
Remote — no custom Remote — and the status line comes from the host route above.

> **Why the config fields must be `volatile`**: dsh's settings service only serves a namespace for a
> Config that has at least one volatile field (`settings.describe()` drops the rest through
> `volatileForm`, and skips the row entirely when nothing is left). Without one, the row has **no
> settings namespace**: the panel cannot bind, its controls stay locked, and writes are refused.
> Volatile also means a config change applies in place instead of remounting the row. All three fields
> in `src/config.ts` are volatile, and the host half re-reads the current values in its guard, its
> prompt section, its tool filter, and its status route.

---

## Configuration

| Field | Type | Default | Meaning |
|---|---|---|---|
| `activeShell` | `pwsh` \| `gitbash` | `pwsh` | Active shell; what the panel writes |
| `gitBashPath` | string | `''` | Absolute `bash.exe`; empty means auto-detect |
| `hideInactiveTool` | boolean | `true` | Hide the inactive shell tool from the model's tool list |

---

## Boundaries and deliberate trade-offs

- **Windows only**: elsewhere dsh already composes one shell, so the plugin registers nothing.
- **Unresolved Git Bash degrades to PowerShell**: `pwsh` stays visible and usable and the prompt line
  reverts, rather than leaving the model without a working shell. The host log names the reason
  (not installed, or the configured path is missing).
- **Agent execution shell only**: the built-in terminal (`terminal_open`, right-hand terminal) keeps
  its own shell.
- **PATH side effect**: while Git Bash is active, `<Git>\bin` leads PATH (only that entry, not
  `usr\bin`), so `bash`/`git` resolve to Git for Windows inside the process; disposal removes it.
- **The tool list changes with the switch** (that is the point; `hideInactiveTool: false` opts out).
- **The Git Bash side under a restricted permission mode is not covered by the local verification**:
  this machine runs `danger-full-access`, where `bash-sandbox` passes straight through. Under
  `workspace-write` / `read-only`, dsh's own sandbox runner wraps `bash`. If a deployment reports a
  runner failure there, set `shell-switch-bash-exec`'s `name` to `@deepseek-ai/dsh-bash-local` in
  `cordis.patch.yml` (drops sandboxing for the bash side; everything else is unchanged).
- **The browser half hot-reloads; the host half needs a restart**: dsh's client HMR re-materializes the
  panel as soon as it is installed, but a host schema change (a new config field, a field becoming
  volatile, a new HTTP route) only applies to a **new dsh process**. To tell the two apart,
  `Config.listConfigs({ entry: 'include:shell-switch' })` shows `x-cordis.volatile: true` once the new
  module is the one running.

---

## Development

```powershell
npm install
npm run typecheck   # tsc --noEmit for both halves
npm test            # builds lib/ and runs every unit suite
npm run check       # both
```

```
src/ids.ts          entry id and tool names shared by both halves
src/config.ts       config schema and its explicit resolve step
src/detect.ts       Git Bash resolution (env, filesystem, and git probes injectable)
src/path.ts         PATH prepend with an exact, reversible removal
src/prompt.ts       the model-facing statement of the active shell
src/index.ts        host half: resolution, PATH, visibility, guard, prompt section
src/client/         browser half: settings page (controller, component, zh/en copy)
scripts/build.mjs   esbuild: host ESM bundle and the __ModuleLoader__ client bundle
tests/              unit suites: resolution and PATH, hide/refuse, live settings change, client registration and render, artifact shape
```

## License

MIT
