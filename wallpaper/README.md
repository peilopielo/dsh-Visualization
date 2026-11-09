**[中文](README.md)** | [English](README.en.md)

# wallpaper — 桌面壁纸

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
