# FAQ / 常见问题

## Why is the license not OSI-approved? / 为什么不用 OSI 许可？

**EN** — By design, not by accident. The visual language — the rings, the palette, the layered
layout — derives from [HALOFLUX](https://github.com/Ryder191/haloflux), which is licensed under
PolyForm Noncommercial 1.0.0. Those terms require any derivative to stay noncommercial and to keep
the attribution. An MIT/Apache/BSD badge here would be a promise this project cannot keep, so the
plugin adopts the same license: free for personal use, study, research, teaching and hobby
projects; commercial use is not granted.

The *code* (host folding, zstd frame parsing, SSE, the page) is original, written for this plugin.
Nothing was copied from HALOFLUX's source; what it borrows is the design language, and that is
credited in both the LICENSE and the page footer.

**中文** — 这是刻意的，不是疏漏。视觉语言（环、配色、分层布局）来自
[HALOFLUX](https://github.com/Ryder191/haloflux)，它使用 PolyForm Noncommercial 1.0.0。
该许可要求衍生作品同为非商业并保留署名。这里挂 MIT/Apache 就等于是本项目兑现不了的承诺，
所以插件沿用同一许可：个人使用、学习、研究、教学、兴趣项目免费；不授予商业用途。

代码本身（宿主折叠、zstd 帧解析、SSE、页面）是为本插件新写的，没有复制 HALOFLUX 的源码；
借用的是设计语言，LICENSE 与页面右下角都写明了出处。

> Marketplace listings do not require an OSI-approved license — other listed plugins in this catalog
> also ship non-OSI terms.
> 插件市场并不要求 OSI 许可——本目录里已有其他非 OSI 许可的插件。

## Does it send my data anywhere? / 会把数据发出去吗？

**EN** — No. The host half reads `~/.dsh/sessions/**` read-only, folds it in memory, and serves it on
`/dsh-visualization/*` to the local page. No outbound network request is made by either half, and no
file is written except the OS-level cache the browser keeps for the page itself.

**中文** — 不会。宿主侧只读 `~/.dsh/sessions/**`，在内存里折叠，通过 `/dsh-visualization/*`
提供给本地页面。前后两端都不发起任何对外网络请求，也不写任何文件（浏览器自身的页面缓存除外）。

## Why can it only be reached from localhost? / 为什么只能本机访问？

**EN** — Session logs contain every command you ran and every prompt you typed. The routes answer
loopback addresses only, so exposing the Web UI on a LAN does not expose the instrument. If you
really need remote access, set `allowRemote: true` in the plugin config and understand that anyone
who can reach the port can read those logs.

**中文** — 会话日志里有你执行过的每条命令和输入的每句话。路由只响应回环地址，所以把 Web 界面暴露到
局域网并不会顺带暴露仪表盘。确实需要远程访问时，在插件配置里写 `allowRemote: true`——
但要清楚：任何能访问该端口的人都能读到这些日志。

## The panel is blank / says "no session log" / 面板空白、提示没有会话

| 提示 | 原因 |
|---|---|
| `这个运行环境不支持 zstd 解压（需要 Node ≥ 22.15）` | 宿主 Node 太老 |
| `会话目录是空的 —— 先在这个 profile 里跑一轮对话` | 这个 profile 还没聊过 |
| `还没找到 DSH 会话目录（…），确认 DSH_HOME 是否正确` | DSH 数据不在默认位置；设 `DSH_HOME` 或 `DSHVIZ_SESSIONS_ROOT` |
| 面板空白 + 网络面板 403 | 不是本机访问；见上一节 |

## Does it slow the session down? / 会拖慢会话吗？

**EN** — The fold is incremental: only newly appended zstd frames are decoded, and only new events
are pushed into the accumulator. At ~8.7k events the first fold costs 240–260 ms; afterwards each
change costs 7–12 ms. When nothing changes, the SSE connection sends zero bytes (except a 15 s
heartbeat).

**中文** — 折叠是增量的：只解新追加的 zstd 帧，只把新事件 push 进累加器。约 8.7k 事件时首次
240~260ms，之后每次变化 7~12ms。没有变化时 SSE 一个字节都不发（只有 15 秒一次的心跳）。

## How do I uninstall it? / 怎么卸载？

```powershell
# DSH 插件页里关掉，或：
dsh plugin remove dsh-visualization
# npm 装的：
npm uninstall -g dsh-visualization
```

仪表盘不写任何持久状态；删除后 `~/.dsh/sessions` 里的日志原样不动。

## Can I use it at work? / 能在公司用吗？

**EN** — No. PolyForm Noncommercial excludes use by a for-profit company, including internal use
and use on behalf of a company. Personal study and noncommercial organisations (charities,
educational and public research institutions) are permitted by the license text.

**中文** — 不行。PolyForm Noncommercial 排除了在营利性公司内部或代表公司的使用。个人学习、
以及慈善、教育、公共研究机构等非商业组织，按许可条文是允许的。
