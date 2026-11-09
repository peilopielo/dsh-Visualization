# dsh-visualization

A **session instrument** for DeepSeek Harness: a sidebar icon that opens a live panel showing the
current session as seven rings, a turn timeline, per-step ladders, background jobs, approvals and
file changes — read straight from the session log, updated while the conversation runs.

![The instrument](https://raw.githubusercontent.com/peilopielo/dsh-Visualization/main/assets/shot-overview.png)

**English** · **[中文](#中文)** below.

## Install

```powershell
# from the plugin market / Plugins page: search "dsh-visualization"
# or from npm:
npm i dsh-visualization
```

A ring icon appears in the left rail — click it to open the panel.

## Learn more

| Document | For |
|---|---|
| **[GUIDE.md](GUIDE.md)** | Using it: reading the rings, every control, wallpapers, troubleshooting |
| **[AGENTS.md](AGENTS.md)** | Changing it: file map, build rules, data flow, release flow, known traps |
| **[FAQ.md](FAQ.md)** | Why the license is non-OSI, privacy, limits |

**Requirements**: Node ≥ 22.15 in the host (the session log is zstd-compressed).

**License**: [PolyForm Noncommercial 1.0.0](LICENSE) — free for personal use, study, research and
teaching; commercial use is not granted. The visual language derives from
[HALOFLUX](https://github.com/Ryder191/haloflux), and that attribution stays.

---

## 中文

DeepSeek Harness 的**会话仪表盘**：侧栏一个环图标，打开后把当前会话画成七层环 + 轮次时间线 +
逐步阶梯连线，工具调用、后台任务、审批、文件变更都在上面，数据直接读会话日志，对话进行中实时更新。

![界面](https://raw.githubusercontent.com/peilopielo/dsh-Visualization/main/assets/shot-overview.png)

## 安装

```powershell
# 插件市场 / 插件页搜索 "dsh-visualization"
# 或者从 npm 装：
npm i dsh-visualization
```

装好后左侧栏出现环图标，点开就是面板。

## 更多文档

| 文档 | 给谁看 |
|---|---|
| **[GUIDE.md](GUIDE.md)** | 怎么用：怎么读环、每个控件、桌面壁纸、排错 |
| **[AGENTS.md](AGENTS.md)** | 怎么改：文件地图、构建规则、数据流、发布流程、踩过的坑 |
| **[FAQ.md](FAQ.md)** | 为什么不用 OSI 许可、隐私、限制 |

**环境要求**：宿主 Node ≥ 22.15（会话日志是 zstd 压缩的）。

**许可**：[PolyForm Noncommercial 1.0.0](LICENSE) —— 个人使用、学习、研究、教学免费，不授予商业用途。
视觉语言来自 [HALOFLUX](https://github.com/Ryder191/haloflux)，该署名保留。
