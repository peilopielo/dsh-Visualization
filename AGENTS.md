# AGENTS — changing dsh-visualization

For DSH agents and developers. English first, **[中文](#中文)** at the bottom.
For using the plugin see [GUIDE.md](GUIDE.md).

---

# English

## 1. Three commands

```powershell
node build.cjs                  # standalone/instrument.html → web/index.html
node make-wallpaper.cjs         # web/index.html → wallpaper/_experiments/index.html (adds <base>, drops -webkit-line-clamp)
node make-wallpaper-full.cjs    # full page with minimal CSS (WE experiment, see §9)
```

Changing anything under `fold.cjs` / `index.js` (the host half) **requires a DSH restart** — the
plugin toggle only remounts routes, it does not re-evaluate loaded ESM.

## 2. File map

| Path | Role |
|---|---|
| `standalone/instrument.html` | **the single source of the page.** Edit this, then build. |
| `web/index.html` | **generated** — never edit by hand |
| `standalone/bridge.cjs` | standalone dev server (port 8787), not shipped |
| `fold.cjs` | host: session discovery, zstd frames, incremental fold, HTTP/SSE, fixed-port helper |
| `index.js` | host entry: registers the route, injects origin/policy, starts the helper |
| `client.js` | client half: sidebar icon + main-panel iframe |
| `build.cjs` | regenerates `web/index.html` from the source page |
| `wallpaper/` | wallpaper pages + Lively package + `_experiments/` (dead ends, see its README) |
| `wallpaper-live.cjs` | persistent-capture pipeline (Edge + CDP, JPEG, ~4.9 fps) |
| `wallpaper-capture.cjs` | crop pipeline: full shot → three strips (top/right/bottom) |
| `we-deploy.ps1` | deploy a page into Wallpaper Engine's project (handles the file lock) |
| `we-cdp.cjs` | turns on WE's CEF devtools port |
| `we-css-keep.cjs` | CSS bisect helper (`we-css-split.cjs` is the older variant) |
| `screenshots.json` | storefront screenshots declared in-repo |

## 3. Rules that bite

1. **One source.** Change `standalone/instrument.html`, run `node build.cjs`. Hand-editing
   `web/index.html` gets overwritten.
2. **Host changes need a restart.** `fold.cjs` / `index.js` are ESM; a plugin toggle is not enough.
3. **Never overwrite the page with a one-liner.** It has been destroyed that way once — use edits or a
   small `.cjs` patch script. Recovery is documented at the end of this file.
4. **Wait for the wallpaper file lock.** WE keeps `projects/.../index.html` open; copy silently fails
   while it runs. Kill WE, delete the file, then copy (`we-deploy.ps1` does exactly this).

## 4. Data flow

```
~/.dsh/sessions/<ws>/<session>/session.v<N>.jsonl.zstd
  └─ zstdFrames()   parse RFC 8878 headers+blocks → exact frame boundaries
  └─ unzstdAll()    decode only frames appended since the last read
  └─ makeFolder()   reducer: push(newEvents) → result(); never re-scans history
  └─ /dsh-visualization/state   (one-shot, gzip, `?session=` to pin)
      /dsh-visualization/events (SSE, pushes only on change, 250 ms check)
  └─ page: applyState() → render() (DOM) + draw() (canvas)
```

Measured at ~8.7 k events: first fold 240–260 ms, then 7–12 ms per change. Idle SSE = zero bytes.

## 5. Adding things

**A ring** — three places in `standalone/instrument.html`: `RINGVIS` / `RING_NAME` / `RING_COL`, the
`if (RINGVIS[n])` block in `draw()`, and `hitReg({...})` so hover/click works. Add a branch in
`showDetail()` if the card needs fields.

**A language** — `EN` (whole-string matches), `EN_RULES` (templated phrases), `EN_FN` (logic). `LANG`
is `'zh' | 'en'`; to add a third, turn it into a list and key the dictionaries by code.

**A colour** — `toolColor(name)`.

## 6. Debugging

| Flag / tool | What it gives |
|---|---|
| `?debug=1` (or `#debug`, `localStorage.dshviz.debug=1`) | `window.__M` / `__HIT` / `__CHAIN` |
| `http://127.0.0.1:8799/state` | the fixed-port helper the wallpapers use |
| `node standalone/shot.cjs <url> out.png W H` | screenshot any page (CDP over pipes) |
| `SHOT_EVAL=...` | evaluate JS in the page and print the result |
| `node we-cdp.cjs` | opens WE's CEF devtools port (8080) |
| `node we-cdp-probe.cjs` | reads runtime state / console from the WE wallpaper page |

## 7. Release flow

```powershell
# 1. bump
node -e "const p=require('./package.json');p.version='0.1.5';require('fs').writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
# 2. build the page first (web/index.html is what ships)
node build.cjs
# 3. publish (2FA-bypass token is configured on this machine)
npm publish --access public
# 4. push
git add -A; git commit -m "..."; git push
# 5. the marketplace entry needs no change unless fields changed:
#    data/plugins/peilopielo__dsh-Visualization.yml in awesome-dsh-plugin
```

## 8. Known traps

1. **WE's renderer crashes on the full page.** Reproduced on Chrome 146; independent of protocol
   (`file://` and `http://` both crash) and of the CSS file (a minimal stylesheet still crashes). The
   crash correlates with compositing the `.rings` subtree. Do not spend more time on it — use Lively.
2. **`-webkit-line-clamp` is an independent crash trigger** in WE. `make-wallpaper.cjs` strips it.
3. **Multi-frame zstd.** The log is append-only multi-frame; older Node decodes only frame 1. Split on
   the magic `28 B5 2F FD`… **only as a fallback**: the correct path is `zstdFrames()`, which parses
   headers and blocks. Magic-scanning is wrong (the real log contains 4838 magic occurrences).
4. **File lock, WE running** — see rule 4.
5. **`pointer-events` on overlay layers.** A full-screen overlay without `pointer-events:none` kills
   all canvas hover/click. `elementFromPoint` returning the overlay instead of `#net` is the symptom.
6. **Init order.** `M.sSteps/sJobs/sTools/sLog/sStats` must be `[]` before the first `draw()`, or the
   canvas freezes. `DEBUG` must be module-scope, not inside `render()`.
7. **`CN.turns = 0` means "all"** — guard with `turnLimit = CN.turns || 999`, else no lines are drawn.
8. **`tool/result` id lives at `message.source.callId`**, not `data.toolCallId`.
9. **Zoom-dependent layout** — the rings measure `.rings.getBoundingClientRect()`; if that element is
   hidden or zero-sized, `G.base` is 0 and `draw()` returns early (blank panel with no error).

## 9. Wallpaper routes (and why)

| Route | Frame rate | Notes |
|---|---|---|
| Lively + `wallpaper/lively/index.html` | full | WebView2 (Edge) — renders fine, mouse input forwarded |
| WE + `wallpaper/live.html` + `wallpaper-live.cjs` | ~4.9 fps | JPEG 200 KB/frame, persistent Edge via CDP |
| WE + three strips (`wallpaper/hybrid.html`) | native rings, 8 s text | hybrid: canvas rings + screenshot panels |
| WE + full page (`make-wallpaper-full.cjs`) | — | dead end: crashes (trap 1) |

## 10. Recovering the page

If `standalone/instrument.html` is ever clobbered:

1. Check `instrument.bak.html` and the working tree (`git status`, `git diff`)
2. If the browser still has the page open, run in its console:
   `fetch('/savehtml',{method:'POST',body:document.documentElement.outerHTML})`
   → the host writes `instrument.recovered.html`
3. Re-apply the last edits, then `node build.cjs`

---

# 中文

## 1. 三个命令

```powershell
node build.cjs                  # standalone/instrument.html → web/index.html
node make-wallpaper.cjs         # 生成实验页（→ wallpaper/_experiments/）
node make-wallpaper-full.cjs    # 原版页面 + 极简 CSS（WE 实验用，见 §9）
```

改 `fold.cjs` / `index.js`（宿主侧）**必须重启 DSH**——插件开关只重挂路由，不会重新求值已加载的 ESM。

## 2. 文件地图

| 路径 | 作用 |
|---|---|
| `standalone/instrument.html` | **页面唯一源文件**，改它再 build |
| `web/index.html` | **生成物**，不要手改 |
| `fold.cjs` | 宿主：会话发现、zstd 帧解析、增量折叠、HTTP/SSE、固定端口服务 |
| `index.js` | 宿主入口：注册路由、注入 origin/策略、启动固定端口 |
| `client.js` | 客户端：侧栏图标 + 主面板 iframe |
| `build.cjs` | 从源页面重新生成 `web/index.html` |
| `wallpaper/` | 壁纸页 + Lively 包 + `_experiments/`（死路，见该目录 README） |
| `wallpaper-live.cjs` | 常驻截图流水线（Edge + CDP，JPEG，约 4.9 fps） |
| `wallpaper-capture.cjs` | 裁切流水线：整页截图 → 三块（顶/右/底） |
| `we-deploy.ps1` | 部署页面到 WE 工程（处理文件锁） |
| `we-cdp.cjs` | 打开 WE 的 CEF 调试端口 |

## 3. 会咬人的规矩

1. **单一源**：只改 `standalone/instrument.html`，然后 `node build.cjs`。手改 `web/index.html` 会被覆盖。
2. **改宿主必须重启 DSH**。
3. **绝不用单行命令整篇覆盖页面**——它被这样毁过一次。
4. **等文件锁**：WE 运行时锁着 `projects/.../index.html`，直接复制会静默失败。先关 WE → 删文件 → 再复制。

## 4. 数据流

```
日志 → zstdFrames()（按 RFC 8878 精确切帧）→ 只解新帧 → makeFolder().push(新事件)
     → /state（一次性、gzip）或 /events（SSE，变化才推）→ applyState() → render() + draw()
```

实测（约 8.7k 事件）：首次折叠 240~260 ms，之后每次变化 7~12 ms；空闲 SSE 零字节。

## 5. 加东西的落点

**新环** —— `RINGVIS`/`RING_NAME`/`RING_COL`、`draw()` 里的绘制块、`hitReg(...)` 登记、`showDetail()` 分支。

**新语言** —— `EN` 词典 + `EN_RULES` 正则 + `EN_FN` 逻辑；`LANG` 现在写死两门，要加就把字典按语言代码分键。

**新配色** —— `toolColor(name)`。

## 6. 调试手段

| 手段 | 作用 |
|---|---|
| `?debug=1` | 挂出 `window.__M` / `__HIT` / `__CHAIN` |
| `http://127.0.0.1:8799/state` | 壁纸用的固定端口 |
| `node standalone/shot.cjs <url> out.png W H` | 截图任意页面（CDP over pipes） |
| `SHOT_EVAL=...` | 在页面里求值并打印 |
| `node we-cdp.cjs` / `we-cdp-probe.cjs` | 打开/读取 WE 的 CEF 调试端口 |

## 7. 发布流程

```powershell
node build.cjs                      # 先构建，web/index.html 才是要发的
# 改 package.json 的 version
npm publish --access public
git add -A; git commit -m "..."; git push
# 市场条目一般不用动（字段没变的话）
```

## 8. 坑表

1. **WE 渲染器跑不动完整页**：Chrome 146 复现，与协议无关（file:// 和 http:// 都崩）、与 CSS 文件无关（换极简 CSS 也崩）；崩溃与合成 `.rings` 子树相关。别再花时间，用 Lively。
2. **`-webkit-line-clamp` 是独立崩溃点**，`make-wallpaper.cjs` 会去掉它。
3. **多帧 zstd**：日志是追加写的多帧；别扫魔数（真实日志里有 4838 处魔数），用 `zstdFrames()` 解析帧头块头。
4. **文件锁**：见规矩 4。
5. **覆盖层的 `pointer-events`**：全屏遮罩若没有 `pointer-events:none`，canvas 的悬停/点击全部失效。
6. **初始化顺序**：`M.sSteps/sJobs/sTools/sLog/sStats` 必须在首帧前是 `[]`，否则画布卡死；`DEBUG` 要在模块作用域。
7. **`CN.turns = 0` 表示「全部」**：用 `turnLimit = CN.turns || 999` 兜底，否则一条线都不画。
8. **`tool/result` 的 id 在 `message.source.callId`**，不在 `data.toolCallId`。
9. **`.rings` 尺寸为 0 会让 `draw()` 直接 return**：面板空白但无报错，先查这个元素的包围盒。

## 9. 壁纸方案与取舍

| 方案 | 帧率 | 说明 |
|---|---|---|
| Lively + `wallpaper/lively/index.html` | 满帧 | WebView2（Edge），渲染正常，鼠标可交互 |
| WE + `wallpaper/live.html` + `wallpaper-live.cjs` | 约 4.9 fps | JPEG 200 KB/帧，常驻 Edge |
| WE + 三块截图（`wallpaper/hybrid.html`） | 环原生 + 文字 8 秒 | 混合方案 |
| WE + 完整页 | — | 死路：崩（坑 1） |

## 10. 页面被覆盖后怎么救

1. 先看 `instrument.bak.html` 和 `git status` / `git diff`
2. 浏览器里还开着页面时，在控制台执行：
   `fetch('/savehtml',{method:'POST',body:document.documentElement.outerHTML})`
   → 宿主写出 `instrument.recovered.html`
3. 重新补最后的改动，然后 `node build.cjs`
