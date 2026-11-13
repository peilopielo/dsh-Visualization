**[中文](AGENTS.md)** | [English](AGENTS.en.md)

# AGENTS — 修改 dsh-visualization

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

**自动跟随的优先级**（`fold.cjs` 的 `pickSession`）：

```
① CURRENT（?session= 或下拉框手动选）
② VIEWED  你选中的 / 最后发消息的会话（6 小时有效）
③ AUTO    粘性跟随：多会话并发时咬住不放（LIVE 12s / IDLE 45s）
④ list[0] 最新的会话
```

VIEWED 有三个写入入口：`agent/created`（建 Agent 时，每个会话只发生一次）、`api-session/activity`（你发消息）、
客户端拦 `uiWorkspace.openSession` / `sessions.retain`（**每次点侧栏都触发，最可靠**）。
`noteViewed()` 会过滤子智能体——目录名不带 `session-` 前缀的就是子会话。


## 5. 加东西的落点

**新环** —— `RINGVIS`/`RING_NAME`/`RING_COL`、`draw()` 里的绘制块、`hitReg(...)` 登记、`showDetail()` 分支。

**新语言** —— `EN` 词典 + `EN_RULES` 正则 + `EN_FN` 逻辑；`LANG` 现在写死两门，要加就把字典按语言代码分键。

**新配色** —— `toolColor(name)`。

## 6. 调试手段

| 手段 | 作用 |
|---|---|
| `GET/POST /prefs` | 显示选项的宿主侧存储（`~/.dsh/dsh-visualization-prefs.json`），面板与壁纸共用 |
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
10. **别在设置里把 `ui-settings` 自己关掉**——关掉后设置界面永久空白，因为设置页就是这个插件渲染的。恢复：编辑 `~/.dsh/profiles/desktop/cordis.patch.yml`，把
    ```yaml
    - id: ui-settings
      name: "@deepseek-ai/dsh-client-ui-settings"
      config:
        enabled: false
    ```
    改成 `enabled: true`（或整条删掉）。这个文件改动会被实时重载，不用重启。
11. **`cordis.patch.yml` 被清空成 `[]` → 插件"包在、条目没了"**：插件管理器把"已安装插件"记在 patch 的 `insert` 条目里，清空 patch 就只剩 `package.json` 里的依赖和 `node_modules` 的 junction，加载器没有条目可读。
    症状：`plugin_manager list_plugins` 里**搜不到自己的 entryId**、固定端口（8799）不监听、插件页显示未安装。
    恢复：`remove_bundle` → `install_bundle`（本地 link 装一次，几秒，不走网络），条目就重建了。判断依据：`package.json` 依赖还在 + `node_modules/<name>` junction 还在 + 列表里没有条目，三件事同时成立就是这个坑。

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
