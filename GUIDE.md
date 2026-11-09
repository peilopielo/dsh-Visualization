# GUIDE — using dsh-visualization

The user guide. English first, **[中文](#中文)** at the bottom.
For changing the code see [AGENTS.md](AGENTS.md); for "why is it like this" see [FAQ.md](FAQ.md).

---

# English

## 1. What this is

A DeepSeek Harness plugin that turns the **current session** into an instrument panel: a sidebar icon,
and a full panel showing seven concentric layers — session, steps, skills, tools, jobs, approvals,
file changes — plus a turn timeline and an event log.

Everything comes from `~/.dsh/sessions/**` (read-only). Nothing is sent anywhere.

![Overview](https://raw.githubusercontent.com/peilopielo/dsh-Visualization/main/assets/shot-overview.png)

![The panel in motion](https://raw.githubusercontent.com/peilopielo/dsh-Visualization/main/assets/demo.gif)

## 2. Install

```powershell
# marketplace / Plugins page: search "dsh-visualization"
npm i dsh-visualization
```

After installing, a ring icon appears in the left rail. Click it; the panel takes the main area.
Nothing else to configure — it follows whichever session you have open.

**Requirement**: Node ≥ 22.15 in the host. Without it the panel says so explicitly instead of
rendering blank.

## 3. First look

The panel is split in three:

| Area | Content |
|---|---|
| Centre | the rings; the number in the middle is the current **turn** |
| Right column | session flow, context usage, background jobs, turn timeline |
| Bottom | event log, grouped by turn, newest on top |

![The rings](https://raw.githubusercontent.com/peilopielo/dsh-Visualization/main/assets/part-rings.png)

Direction matters: on the rings, **12 o'clock is the newest data**, older data runs clockwise.

## 4. Reading the rings

| Ring | What it shows |
|---|---|
| ① Session | context-window usage + the last 12 turn ticks |
| ② Steps | time buckets; thicker segment = more time spent in that slice |
| ③ Skills | 16 slots; one lights up per loaded skill, and a link runs to when it was last used |
| ④ Tools | composition by call count (or by time — see `share`) |
| ⑤ Jobs | one arc per background job, length ∝ runtime |
| ⑥ Approvals | one tick per approval, colour = outcome |
| ⑦ Changes | one tick per file change; deliverables are taller |

Each ring can be switched off independently (see the controls below); the remaining rings re-space
themselves to fill the gap.

![Controls](https://raw.githubusercontent.com/peilopielo/dsh-Visualization/main/assets/part-controls.png)

## 5. Controls (bottom left)

| Control | What it does |
|---|---|
| `①…⑦` | toggle each layer |
| `spin` | slow rotation of ②③④ |
| `lines` | `ladders` (per-step chains), `beams` (from the core), or `both` |
| `share` | size the tool ring by call `count` or by `time` |
| `line turns` | how many turns get connectors |
| `show turns` | how many turns the whole panel covers (or `all`) |
| `⧉ window` | open a separate window you can drag to another monitor |
| `中 / EN` | switch language |

`line turns` is always clamped to `show turns` — a connector can never point at a turn the panel is
not showing.

Bright vs dim segments on ②: a **dim** segment has no connector because it is outside `line turns`;
a **bright** segment with no line is a text-only step that called no tools.

## 6. Hover and click

Every node on every ring answers:

- **hover** — a tooltip with the name and a one-line summary
- **click** — a detail card; for tools it lists the last six actual commands with timings

![Detail card](https://raw.githubusercontent.com/peilopielo/dsh-Visualization/main/assets/shot-detail.png)

## 7. Language

The UI ships in Chinese and English. It starts from `navigator.language`, remembers your choice, and
can be forced per page with `?lang=en` / `?lang=zh`.

## 8. As a desktop wallpaper

Two routes. **Lively is recommended** — it renders the page natively at full frame rate.

### Lively Wallpaper (full frame rate, interactive)

1. Install [Lively Wallpaper](https://github.com/rocksdanister/lively) (free, open source)
2. Download [`wallpaper/lively-package.zip`](wallpaper/lively-package.zip)
3. Drag the zip into Lively — or **Add Wallpaper → open file** → the extracted `index.html`

The page finds the plugin on `127.0.0.1:8799` by itself. If DSH is not running it shows a hint and
retries every 5 seconds.

**The panel stays clickable on the desktop** — Lively forwards mouse input, so ring toggles, turn
pickers and detail cards work directly on the background. If that makes desktop icons hard to click,
turn off icon display in Lively's settings.

### Wallpaper Engine (screenshot mode, ~5 fps)

Wallpaper Engine's own renderer crashes on this page (reproduced on its Chrome 146, independent of
protocol). The workaround is a screenshot pipeline:

```powershell
node wallpaper-live.cjs 200 78     # ≈4.9 fps, 200 KB/frame
```

Then set `wallpaper/live.html` as a Wallpaper Engine web wallpaper. A low-CPU variant (`node
wallpaper-capture.cjs 8`) refreshes every 8 seconds instead.

![Event log](https://raw.githubusercontent.com/peilopielo/dsh-Visualization/main/assets/part-log.png)

## 9. Troubleshooting

| Symptom | Cause |
|---|---|
| Panel says "this runtime does not support zstd" | host Node < 22.15 |
| Panel says the session directory is empty | no conversation has run in this profile yet |
| Blank panel + 403 in the network tab | you are not on loopback; `allowRemote: true` if you really need remote access |
| A dim ring segment has no line | it is outside `line turns` |
| A bright segment has no line | that step called no tools |
| Wallpaper says "not connected" | DSH is not running, or the plugin is disabled |

## 10. Privacy and uninstall

- The host reads `~/.dsh/sessions/**` and folds it **in memory**. It writes no session files.
- No outbound network requests from either half; routes answer loopback only.
- Uninstall: disable the plugin on the Plugins page, or `dsh plugin remove dsh-visualization`.
  Your session logs are untouched.

---

# 中文

## 1. 这是什么

一个 DeepSeek Harness 插件，把**当前会话**画成一台仪表盘：侧栏一个环图标，点开是七层同心环
（会话、步骤、技能、工具、任务、审批、文件变更）+ 轮次时间线 + 事件表。

数据全部来自 `~/.dsh/sessions/**`（只读），不发往任何地方。

## 2. 安装

```powershell
# 插件市场 / 插件页搜索 "dsh-visualization"
npm i dsh-visualization
```

装好后左侧栏出现环图标，点开占满主面板。不用配置——它跟随你当前打开的那个会话。

**要求**：宿主 Node ≥ 22.15。不满足时面板会直接说明，不会给你一个空白页。

## 3. 第一眼看到的

面板分三块：

| 区域 | 内容 |
|---|---|
| 中间 | 环；正中的数字是当前**轮次** |
| 右栏 | 会话逻辑链、上下文占用、后台任务、轮次时间线 |
| 底部 | 事件表，按轮分组，最新的在最上面 |

![环](https://raw.githubusercontent.com/peilopielo/dsh-Visualization/main/assets/part-rings.png)

方向很重要：环上**12 点方向是最新的数据**，越旧越顺时针。

## 4. 怎么读环

| 环 | 表示什么 |
|---|---|
| ① 会话 | 上下文占用 + 最近 12 轮刻度 |
| ② 步骤 | 时间分格；格子越粗 = 那段时间花得越久 |
| ③ 技能 | 16 格；加载一个技能亮一格，并连一条线到"最近一次使用"的时刻 |
| ④ 工具 | 按调用次数（或耗时）分扇区 |
| ⑤ 任务 | 每个后台任务一段弧，弧长 ∝ 运行时长 |
| ⑥ 审批 | 每次审批一根刻度，颜色表示结果 |
| ⑦ 变更 | 每次文件改动一根刻度，交付物更高 |

每层都能单独关掉（见下面的控件），剩下的环会自动重新分布填满空间。

![控件](https://raw.githubusercontent.com/peilopielo/dsh-Visualization/main/assets/part-controls.png)

## 5. 控件（左下角）

| 控件 | 作用 |
|---|---|
| `①…⑦` | 开关每一层 |
| `环旋转` | ②③④ 缓慢自转 |
| `连线` | `阶梯`（逐步链）/ `光束`（从核心射出）/ `两者都有` |
| `占比` | 工具环按调用**次数**还是按**耗时** |
| `连线轮数` | 多少轮画连线 |
| `显示轮数` | 整个面板覆盖多少轮（可选「全部」） |
| `⧉ 新窗口` | 开一个独立窗口，可以拖到副屏 |
| `中 / EN` | 切换语言 |

`连线轮数` 永远被 `显示轮数` 钳制——不可能连到面板没显示的轮次上。

② 环上亮与暗的区别：**暗**的格子表示它不在 `连线轮数` 范围内；**亮**但没线，说明那一步没有调用任何工具（纯文字步）。

## 6. 悬停与点击

环上每个节点都有反应：

- **悬停** —— 提示卡，显示名称和一句摘要
- **点击** —— 详情卡；工具还会列出**最近 6 次真实执行的命令**和耗时

## 7. 语言

界面中英双语。默认跟随 `navigator.language`，选择会记住，也可以用 `?lang=en` / `?lang=zh` 强制指定。

## 8. 当桌面壁纸用

两条路，**推荐 Lively**——它用原生内核满帧渲染。

### Lively（满帧、可交互）

1. 装 [Lively Wallpaper](https://github.com/rocksdanister/lively)（免费开源）
2. 下载 [`wallpaper/lively-package.zip`](wallpaper/lively-package.zip)
3. 把 zip 拖进 Lively，或者 **添加壁纸 → 打开文件** → 选解压后的 `index.html`

页面会自己找到插件的 `127.0.0.1:8799`；DSH 没开时显示提示并每 5 秒重试。

**桌面上可以直接操作面板**——Lively 会转发鼠标事件，环开关、轮次选择、详情卡都能在桌面上点。
如果这样导致桌面图标不好点，在 Lively 设置里关掉图标显示。

### Wallpaper Engine（截图模式，约 5 fps）

WE 自己的渲染器跑不动这个页面（在它的 Chrome 146 上复现，与协议无关）。替代方案是截图流水线：

```powershell
node wallpaper-live.cjs 200 78     # ≈4.9 fps，每帧 200 KB
```

然后把 `wallpaper/live.html` 设为 WE 的网页壁纸。低 CPU 版用 `node wallpaper-capture.cjs 8`（8 秒一帧）。

![事件表](https://raw.githubusercontent.com/peilopielo/dsh-Visualization/main/assets/part-log.png)

## 9. 排错

| 现象 | 原因 |
|---|---|
| 面板说"不支持 zstd" | 宿主 Node < 22.15 |
| 面板说会话目录是空的 | 这个 profile 还没聊过 |
| 空白 + 网络面板 403 | 不是本机访问；确实要远程才开 `allowRemote: true` |
| 暗格子没有线 | 不在「连线轮数」范围内 |
| 亮格子没有线 | 那一步没有工具调用 |
| 壁纸显示"未连接" | DSH 没开，或插件被禁用 |

## 10. 隐私与卸载

- 宿主只读 `~/.dsh/sessions/**`，在**内存里**折叠，不写任何会话文件
- 前后两端都不发起对外网络请求；路由只响应本机回环
- 卸载：插件页禁用，或 `dsh plugin remove dsh-visualization`；你的会话日志原样不动
