# dsh-shell-switch

给 **dsh Windows 桌面端**加一个 shell 切换面板：在「设置 → Shell」里选择 Agent 执行命令时用 **PowerShell** 还是 **Git Bash**。切换即时生效，不需要重启。

> English: [README.en.md](./README.en.md)

---

## 它到底切换了什么

dsh 在 Windows 上默认只给模型一个 `pwsh` 工具（`@deepseek-ai/dsh-tool-pwsh` + `pwsh-sandbox` 执行器），
Git Bash 没有任何入口。本插件补上这一档，并且让**同一时刻只有一个 shell 工具对模型可见**：

| 当前 shell | 模型看到的工具 | 模型收到的提示词 | 另一个工具 |
|---|---|---|---|
| `pwsh`（默认） | `pwsh` | “The active command shell is PowerShell…” | `bash` 从工具列表中移除，调用被拒绝 |
| `gitbash` | `bash`（Git Bash 5.x / MINGW64） | “The active command shell is Git Bash… Git Bash is `D:\...\Git\bin\bash.exe`” | `pwsh` 从工具列表中移除，调用被拒绝 |

真机实测（把开关切到 Git Bash 后，模型用 `bash` 工具执行）：

```
shell=5.2.37(1)-release
bash-path=/usr/bin/bash
MINGW64_NT-10.0-26200
cwd=/d/deepseek/deepseek-cli
env-style=/c/Users/lss
```

后台任务同样可用（隔离 realm 里的 `bash` 工具照样能拿到 `jobs` 注册表）：

```jsonc
// bash { run_in_background: true } → started background job bash-6
// job_output bash-6 →
"bg-start 10:55:47\ntick-1\ntick-2\ntick-3\nbg-done 10:55:50\nshell=5.2.37(1)-release"   // exit 0
```

---

## 安装

插件已经按 dsh bundle 规范打包（`package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`）。

**方式 A：本地包（离线可用，推荐）**

```powershell
# 在插件目录构建出 lib/ 后打包
cd <插件目录>; npm install; npm run build; npm pack
# 安装进指定 profile
dsh plugin --profile desktop add file:<插件目录>\dsh-shell-switch-0.1.1.tgz
```

在本会话中也可以直接用内置的 `plugin_manager` 工具：`install_bundle` + `file:...tgz`。

**方式 B：手动挂载**

1. 把插件目录（含 `lib/`）复制到 `<DSH_HOME>\profiles\<profile>\node_modules\dsh-shell-switch\`；
2. 在 profile 的 `package.json` 里把 `"dsh-shell-switch"` 加进 `dsh.profile.bundles`；
3. 重启 dsh（或触发一次配置重载）。

插件本身是一个 bundle：`cordis.patch.yml` 里插入了 3 行（见下文），不需要改动 dsh 源码。

---

## 使用

面板有两个入口，内容相同：

- **设置 → Shell**：左下角账户/设置入口打开设置面板，左侧导航里的 **Shell**；
- **插件 → dsh-shell-switch → 点开 `dsh-shell-switch` 这一行**：该行的配置页就是同一个面板
  （即 dsh 的 `plugins.row.config` 槽，key 为 `dsh-shell-switch#shell-switch`）。

面板内容：

1. **当前 shell** 二选一：`PowerShell` / `Git Bash`；
2. （可选）**Git Bash 可执行文件**：留空即自动探测；探测失败时在这里填 `bash.exe` 绝对路径；
3. （可选）**隐藏未启用的 shell 工具**：默认开；关掉则两个工具都留在列表里，未启用的那个仍会拒绝调用。

> 插件页里那行 **`cordis:group`（id 是 `shell-switch-bash`）是容器行**，它自身没有插件实现，
> 所以点它的启用开关会报"找不到该插件"——这是正常的，不影响功能；
> 真正在运行的是它下面两行：`@deepseek-ai/dsh-bash-sandbox`（执行器）和 `@deepseek-ai/dsh-tool-bash`（`bash` 工具）。
> 需要隔离 realm 才能让第二个 `shell` 服务与 dsh 自带的 `pwsh-sandbox` 共存，所以这一层容器去不掉。

写入落在 profile 的 `cordis.patch.yml`：

```yaml
- id: shell-switch
  name: dsh-shell-switch
  config:
    activeShell: gitbash      # pwsh | gitbash
    gitBashPath: ''           # 留空 = 自动探测
    hideInactiveTool: true
```

### 怎么确认切换生效

- 让模型跑一条命令：`pwsh` 档会走 PowerShell，`gitbash` 档会走 Git Bash（`uname -s` 返回 `MINGW64_NT-...`）；
- 切换后模型手里的工具名会立刻换挡，系统提示词里也会写明当前 shell 与 Git Bash 的真实路径。

---

## 工作原理

`cordis.patch.yml` 插入 3 行：

| 行 id | 作用 |
|---|---|
| `shell-switch` | 本插件（宿主半 + 客户端半），`activeShell` 就是开关 |
| `shell-switch-bash` | 一个 `cordis:group`，用 `isolate: { shell: true }` 把 `shell` 服务**隔离在组内** |
| ├ `shell-switch-bash-exec` | `@deepseek-ai/dsh-bash-sandbox`：Git Bash 的执行器（保留沙箱语义） |
| └ `shell-switch-bash-tool` | `@deepseek-ai/dsh-tool-bash`：官方 `bash` 工具，`run_in_background` 等能力原样保留 |

> 为什么必须隔离：一个 Cordis 上下文只允许**一个** `shell` 服务实现。Windows 上部署自带的执行器是
> `pwsh-sandbox`，它必须继续服务其他消费者，所以 Git Bash 执行器只能活在自己的 realm 里。

宿主半（`src/index.ts`）在开关之上做四件事：

1. **探测 Git Bash**：`gitBashPath` → `git --exec-path` → `where git` 推导安装根 → PATH 中的 Git 目录 → 常见安装位置；
   顺手排除 `C:\Windows\System32\bash.exe`（那是 WSL 存根，不是 Git Bash）。
2. **让 `bash` 能被解析**：把 Git 安装的 `bin` 目录插到进程 PATH 最前面；插件卸载时精确移除该项（不动其他项）。
3. **控制模型可见的工具**：监听 `system-prompt/assemble` 瀑布，把当前不该出现的那一个 shell 工具从 `assembly.tools` 里剔除。
4. **兜底拒绝 + 说明当前 shell**：`tools.guard` 拒绝调用未启用的 shell（覆盖“工具列表还是上一步缓存”的窗口），
   并用一个动态提示词段告诉模型当前 shell、方言和 Git Bash 的真实路径。

客户端半（`src/client/`）注册「设置 → Shell」页：分段控件 + 路径输入框 + 隐藏开关，
读写走 dsh 官方的 `configForms` / settings Remote，不新增任何自定义 Remote。

---

## 配置项

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `activeShell` | `pwsh` \| `gitbash` | `pwsh` | 当前 shell，面板写入的就是它 |
| `gitBashPath` | string | `''` | `bash.exe` 绝对路径；留空自动探测 |
| `hideInactiveTool` | boolean | `true` | 是否把未启用的 shell 工具从模型工具列表中隐藏 |

---

## 边界与已知取舍

- **仅 Windows 生效**：其他平台上 dsh 本来就只有一个 shell，插件不注册任何东西（只写一行日志）。
- **探测不到 Git Bash 时自动降级**：不会隐藏 `pwsh`、不会拒绝它，提示词也改回 PowerShell——
  宁可维持“能跑命令”，也不让模型手里没有可用 shell。日志里会写明原因（未安装 / 配置路径不存在）。
- **只切换 Agent 的执行 shell**，不改 dsh 内置终端（`terminal_open` / 右侧终端）的 shell。
- **PATH 副作用**：启用 Git Bash 时会把 `<Git>\bin` 放在 PATH 首位（只加这一项，`usr\bin` 不加），
  于是进程内 `bash`/`git` 等解析到 Git for Windows；插件停用时移除。
- **工具列表会随开关变化**：这是刻意的（`hideInactiveTool: false` 可以关掉），
  代价是切换后请求头里的 tool 列表会变一次。
- **受限权限模式下的 Git Bash 侧未在本机实测**：本机是 `danger-full-access`，`bash-sandbox` 直接放行；
  `workspace-write` / `read-only` 下会走 dsh 自带的沙箱 runner 包裹 `bash`。若某个部署在这种模式下
  报 runner 失败，把 `cordis.patch.yml` 里 `shell-switch-bash-exec` 的 `name` 换成
  `@deepseek-ai/dsh-bash-local` 即可（放弃 bash 侧的沙箱约束，其余行为不变）。
- **面板需要刷新页面后才能看到**：客户端半是新装的动态浏览器 bundle，页面刷新（F5）后才会进入模块图。

---

## 开发

```powershell
npm install
npm run typecheck   # tsc --noEmit（宿主 + 客户端）
npm test            # 构建 lib/ 后跑全部单测
npm run check       # 上面两步
```

```
src/ids.ts          两侧共用的 entry id 与工具名
src/config.ts       配置 schema 与显式 resolve
src/detect.ts       Git Bash 探测（环境/文件系统/git 探针全部可注入，便于测试）
src/path.ts         PATH 前缀插入与精确回滚
src/prompt.ts       模型可见的当前 shell 说明
src/index.ts        宿主半：探测 + PATH + 工具可见性 + 守卫 + 提示词段
src/client/         客户端半：设置页（controller + 组件 + 中英词条）
scripts/build.mjs   esbuild：宿主 ESM + 客户端 __ModuleLoader__ bundle
tests/              单测：探测与 PATH、隐藏/拒绝、设置热更新、客户端注册与渲染、产物形状
```

构建产物：`lib/index.js`（宿主，`@deepseek-ai/*` 全部 external）与 `lib/client.js`
（`window.__ModuleLoader__.load({ id, factory })` 包装，外部依赖只有平台模块表里的
`react` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-store` / `@deepseek-ai/dsh-client-ui-primitives`）。

---

## License

MIT
