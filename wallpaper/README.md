**[中文](README.md)** | [English](README.en.md)

# wallpaper — Lively 桌面壁纸

把仪表盘放到桌面上，**只需要 Lively Wallpaper**（免费开源）。它用 WebView2 满帧渲染，
鼠标事件也会转发进来 —— 桌面上的环、表格都能点。

## 安装

1. 装 [Lively Wallpaper](https://github.com/rocksdanister/lively)
2. 把 `lively-package.zip` 拖进 Lively，或 **添加壁纸 → 打开文件** → `lively/index.html`

页面会依次探测 `127.0.0.1:8799` … `8795`，谁应答就加载谁；DSH 没开时显示提示并每 5 秒重试。

## 端口

插件开一个固定本地端口，壁纸不需要知道 DSH 每次随机分配的 Web 端口：

```
8799 → 8798 → 8797 → 8796 → 8795
```

用插件的 `wallpaperPort` 配置改起始端口；写 `0` 关闭这个入口。

## 不装 Lively 也能看

浏览器直接打开 `http://127.0.0.1:8799/` 就是同一个页面；
`msedge --app=http://127.0.0.1:8799/` 可以得到无边框窗口。

> 之前还支持过 Wallpaper Engine 的截图方案，已移除：它自己的渲染器跑不动这个页面，
> 只能靠截图近似，帧率约 5fps 且不可交互，维护成本不值得。
