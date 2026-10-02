/** Locale bundles for the shell switch panel. */

/** Locale keys the panel renders. */
export type ShellSwitchLocaleKey =
  | 'nav' | 'title' | 'description'
  | 'activeShell' | 'pwsh' | 'pwshDetail' | 'gitbash' | 'gitbashDetail'
  | 'pathLabel' | 'pathHint' | 'pathPlaceholder' | 'pathScope'
  | 'hideInactive' | 'hideInactiveHint'
  | 'unavailable' | 'readOnly' | 'writeFailed' | 'busy' | 'unbound' | 'summary'
  | 'statusLoading' | 'statusUnknown' | 'statusFooter' | 'detectedLabel' | 'notDetectedLabel'
  | 'reasonConfiguredMissing' | 'reasonNotFound'
  | 'sourceConfigured' | 'sourceGitExecPath' | 'sourceEnvironment' | 'sourceKnownLocation' | 'sourceUnknown'
  | 'cardPwsh' | 'cardGitBash'
  | 'factExecutor' | 'factSource' | 'factPaths' | 'factVars' | 'factTool' | 'factOtherTool'
  | 'pwshExecutor' | 'unresolved'
  | 'pwshPaths' | 'gitbashPaths' | 'pwshVars' | 'gitbashVars'
  | 'toolHiddenSuffix' | 'toolKeptSuffix'
  | 'unavailableHint' | 'pendingNotice'

/** English copy. */
export const en: Record<ShellSwitchLocaleKey, string> = {
  nav: 'Shell',
  title: 'Shell',
  description: 'Choose which shell the agent runs commands in. The switch applies to the next model step; the tool that belongs to the other shell is withheld.',
  activeShell: 'Active shell',
  pwsh: 'PowerShell',
  pwshDetail: 'Commands run through `pwsh`. Paths use native Windows form (`C:\\...`), environment variables use `$env:NAME`.',
  gitbash: 'Git Bash',
  gitbashDetail: 'Commands run through Git Bash. Paths use POSIX form (`/d/...`), environment variables use `$NAME`.',
  pathLabel: 'Git Bash executable',
  pathHint: 'Leave empty to detect Git for Windows automatically (from `git --exec-path`, PATH, and the usual install locations).',
  pathPlaceholder: 'Auto-detect',
  pathScope: 'Used only while Git Bash is the active shell.',
  hideInactive: 'Hide the inactive shell tool',
  hideInactiveHint: 'Off keeps both shell tools in the model’s tool list; the inactive one still refuses calls.',
  unavailable: 'The shell switch plugin is not loaded in this deployment.',
  readOnly: 'This deployment stores settings read-only.',
  writeFailed: 'The deployment did not accept the change; the switch was left as it was.',
  busy: 'Applying…',
  unbound: 'No host configuration entry (`shell-switch`) is being served, so there is nothing to switch. The host half of this plugin is not loaded (or not active) in this deployment.',
  summary: 'Choose the shell the agent runs commands in — PowerShell or Git Bash — and where Git Bash lives.',
  statusLoading: 'Reading host status…',
  statusUnknown: 'Host status unavailable (the panel interface did not answer).',
  statusFooter: 'Host, live: ',
  detectedLabel: 'Git Bash found: ',
  notDetectedLabel: 'Git Bash not found: ',
  reasonConfiguredMissing: 'the configured path does not exist',
  reasonNotFound: 'no Git for Windows installation was found',
  sourceConfigured: 'from the configured path',
  sourceGitExecPath: 'from git --exec-path',
  sourceEnvironment: 'from PATH',
  sourceKnownLocation: 'from a usual install location',
  sourceUnknown: 'source unknown',
  cardPwsh: 'PowerShell — the shell Windows ships, run by the executor dsh already has',
  cardGitBash: 'Git Bash — the POSIX shell Git for Windows ships',
  factExecutor: 'Executor',
  factSource: 'Resolved by',
  factPaths: 'Path style',
  factVars: 'Environment variables',
  factTool: 'Tool for the model',
  factOtherTool: 'The other tool',
  pwshExecutor: 'dsh’s own PowerShell executor (nothing to detect)',
  unresolved: 'no executable resolved yet',
  pwshPaths: 'native Windows (`C:\\Users\\…`)',
  gitbashPaths: 'POSIX (`/d/deepseek/…`, `/c/Users/lss`)',
  pwshVars: '`$env:NAME`',
  gitbashVars: '`$NAME`, `$HOME`, `$?`',
  toolHiddenSuffix: ' — withheld from the model’s tool list',
  toolKeptSuffix: ' — still listed, and calls to it are refused',
  unavailableHint: 'Install Git for Windows, or pin the absolute `bash.exe` below. Until then the switch keeps using PowerShell.',
  pendingNotice: 'The host is still running {from}; {to} takes effect from the next model step.',
}

/** Simplified Chinese copy. */
export const zh: Record<ShellSwitchLocaleKey, string> = {
  nav: 'Shell',
  title: 'Shell 切换',
  description: '选择 Agent 执行命令使用的 shell。切换会在下一个模型步骤生效；另一个 shell 对应的工具会被隐藏。',
  activeShell: '当前 shell',
  pwsh: 'PowerShell',
  pwshDetail: '命令通过 `pwsh` 执行：Windows 原生路径（`C:\\…`）、环境变量用 `$env:NAME`。',
  gitbash: 'Git Bash',
  gitbashDetail: '命令通过 Git Bash 执行：POSIX 路径（`/d/…`）、环境变量用 `$NAME`。',
  pathLabel: 'Git Bash 可执行文件',
  pathHint: '留空表示自动探测（依次尝试 `git --exec-path`、PATH、常见安装目录）。',
  pathPlaceholder: '自动探测',
  pathScope: '仅在使用 Git Bash 时生效。',
  hideInactive: '隐藏未启用的 shell 工具',
  hideInactiveHint: '关闭后两个 shell 工具都会出现在模型工具列表里，未启用的那个仍会拒绝调用。',
  unavailable: '本部署未加载 shell 切换插件。',
  readOnly: '本部署的设置为只读。',
  writeFailed: '本部署没有接受这次修改，切换保持原状。',
  busy: '正在应用…',
  unbound: '没有找到宿主配置行（`shell-switch`），当前没有可切换的对象：本插件在本部署里的宿主半没有加载或未激活。',
  summary: '选择 Agent 执行命令使用的 shell（PowerShell 或 Git Bash），以及 Git Bash 的位置。',
  statusLoading: '正在读取宿主状态…',
  statusUnknown: '读不到宿主状态（面板接口没有响应）。',
  statusFooter: '宿主实时：',
  detectedLabel: '已找到 Git Bash：',
  notDetectedLabel: '没找到 Git Bash：',
  reasonConfiguredMissing: '配置的路径不存在',
  reasonNotFound: '系统里没有找到 Git for Windows',
  sourceConfigured: '来自配置的路径',
  sourceGitExecPath: '来自 git --exec-path',
  sourceEnvironment: '来自 PATH',
  sourceKnownLocation: '来自常见安装目录',
  sourceUnknown: '来源未知',
  cardPwsh: 'PowerShell —— Windows 自带，直接用 dsh 已有的执行器',
  cardGitBash: 'Git Bash —— Git for Windows 附带的 POSIX shell',
  factExecutor: '执行器',
  factSource: '解析来源',
  factPaths: '路径风格',
  factVars: '环境变量',
  factTool: '模型工具',
  factOtherTool: '另一个工具',
  pwshExecutor: 'dsh 自带的 PowerShell 执行器（无需探测）',
  unresolved: '尚未解析到可执行文件',
  pwshPaths: 'Windows 原生（`C:\\Users\\…`）',
  gitbashPaths: 'POSIX（`/d/deepseek/…`、`/c/Users/lss`）',
  pwshVars: '`$env:NAME`',
  gitbashVars: '`$NAME`、`$HOME`、`$?`',
  toolHiddenSuffix: '：已从模型工具列表隐藏',
  toolKeptSuffix: '：仍会列出，但调用会被拒绝',
  unavailableHint: '请先安装 Git for Windows，或在下面填 `bash.exe` 的绝对路径；在那之前切换会继续用 PowerShell。',
  pendingNotice: '宿主当前仍在用 {from}；切到 {to} 会在下一个模型步骤生效。',
}
