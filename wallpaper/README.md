# wallpaper —

Three ways to put the instrument on the desktop. Pick one, in order of quality.

| Route | Frame rate | Interactive | Needs | Files |
|---|---|---|---|---|
| **Lively** (recommended) | display rate | yes (mouse forwarded) | [Lively](https://github.com/rocksdanister/lively), free | `lively/`, `lively-package.zip` |
| **WE screenshot** | ~4.9 fps | no | Wallpaper Engine | `live.html` + `wallpaper-live.cjs` |
| **WE hybrid** | rings native, text 8 s | no | Wallpaper Engine | `hybrid.html` + `wallpaper-capture.cjs` |

## Lively (full frame rate)

1. Install [Lively Wallpaper](https://github.com/rocksdanister/lively)
2. Drag `lively-package.zip` into Lively — or **Add Wallpaper → open file** → `lively/index.html`

The page probes `127.0.0.1:8799` … `8795` and loads whichever answers; if DSH is off it shows a hint
and retries every 5 seconds. Lively forwards mouse input, so the panel is clickable on the desktop.

## Wallpaper Engine (screenshot mode)

Wallpaper Engine's own renderer **crashes** on the full page (Chrome 146, independent of protocol and
of the stylesheet). The workaround captures the page and displays the picture:

```powershell
node wallpaper-live.cjs 200 78    # ≈4.9 fps, 200 KB per frame
```

Then point the WE project at `live.html`. For lower CPU use `wallpaper-capture.cjs 8` (8 s) together
with the three-strip hybrid (`hybrid.html`).

## Ports

The plugin opens a fixed local port so wallpapers never need to know DSH's random Web port:

```
8799 → 8798 → 8797 → 8796 → 8795
```

Change the base with the plugin's `wallpaperPort` config; `0` disables the helper.

## `_experiments/`

Dead ends kept for the record — do not ship these:

| File | What it was |
|---|---|
| `index.html` | full page + `<base>`, `-webkit-line-clamp` stripped (still crashed WE) |
| `full.html` | full page + minimal CSS (still crashed) |
| `debug.html` | above + an on-screen diagnostics overlay |
| `lite.html` | standalone canvas renderer, no DOM (works in WE, but only rings) |
| `img-wallpaper.html` | single full-page screenshot wallpaper (predecessor of `live.html`) |

`howto.html` is the source of `assets/howto.png` (the import guide image).

---

# 中文

把仪表盘放到桌面上的三种方式，按质量排序。

| 方式 | 帧率 | 可交互 | 需要 | 文件 |
|---|---|---|---|---|
| **Lively**（推荐） | 显示器帧率 | ✅ 鼠标转发 | [Lively](https://github.com/rocksdanister/lively)，免费 | `lively/`、`lively-package.zip` |
| **WE 截图** | 约 4.9 fps | ❌ | Wallpaper Engine | `live.html` + `wallpaper-live.cjs` |
| **WE 混合** | 环原生，文字 8 秒 | ❌ | Wallpaper Engine | `hybrid.html` + `wallpaper-capture.cjs` |

## Lively（满帧）

1. 装 [Lively Wallpaper](https://github.com/rocksdanister/lively)
2. 把 `lively-package.zip` 拖进 Lively，或 **添加壁纸 → 打开文件** → `lively/index.html`

页面会依次探测 `127.0.0.1:8799` … `8795`，谁应答就加载谁；DSH 没开时显示提示并每 5 秒重试。
Lively 会转发鼠标事件，所以桌面上可以直接点面板。

## Wallpaper Engine（截图模式）

WE 自己的渲染器在完整页面上**会崩**（Chrome 146，与协议和样式表都无关）。替代方案是截图：

```powershell
node wallpaper-live.cjs 200 78    # ≈4.9 fps，每帧 200 KB
```

然后把 WE 工程指向 `live.html`。想更省 CPU 就用 `wallpaper-capture.cjs 8`（8 秒一帧）+ 三块混合版 `hybrid.html`。

## 端口

插件开一个固定本地端口，壁纸不需要知道 DSH 的随机 Web 端口：

```
8799 → 8798 → 8797 → 8796 → 8795
```

用插件的 `wallpaperPort` 配置改起始端口；写 `0` 关闭这个入口。

## `_experiments/`

死路，留作记录，**不要发布**：

| 文件 | 是什么 |
|---|---|
| `index.html` | 完整页 + `<base>`、去掉 `-webkit-line-clamp`（WE 仍崩） |
| `full.html` | 完整页 + 极简 CSS（仍崩） |
| `debug.html` | 上面再加屏显诊断层 |
| `lite.html` | 纯 canvas 精简渲染器（WE 能跑，但只有环） |
| `img-wallpaper.html` | 单张整页截图的壁纸（`live.html` 的前身） |

`howto.html` 是 `assets/howto.png`（导入教程图）的源文件。
