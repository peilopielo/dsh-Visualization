# FAQ

Short answers to the questions that are not "how do I use it" — for usage see [GUIDE.md](GUIDE.md),
for changing the code see [AGENTS.md](AGENTS.md).

## Why is the license not OSI-approved? / 为什么不用 OSI 许可？

**EN** — Because HALOFLUX is not. The visual language — rings, palette, layered layout — derives from
[HALOFLUX](https://github.com/Ryder191/haloflux), which is licensed under PolyForm Noncommercial 1.0.0.
Those terms require derivatives to stay noncommercial and to keep the attribution, so an MIT/Apache
badge here would be a promise this project cannot keep.

The **code** is original (host folding, zstd frame parsing, SSE, the page). What it borrows is the
design language, credited in the LICENSE and in the page footer.

**中文** — 因为 HALOFLUX 不是。视觉语言（环、配色、分层布局）来自
[HALOFLUX](https://github.com/Ryder191/haloflux)，它是 PolyForm Noncommercial 1.0.0。
该许可要求衍生作品同为非商业并保留署名，所以这里挂 MIT/Apache 就是兑现不了的承诺。

**代码**是为本插件新写的（宿主折叠、zstd 帧解析、SSE、页面）；借用的是设计语言，
已在 LICENSE 和页面右下角注明。

> The plugin market does not require an OSI license — other listed plugins ship non-OSI terms too.
> 插件市场并不要求 OSI 许可，目录里已有其他非 OSI 许可的插件。

## Does it send my data anywhere? / 会把数据发出去吗？

**EN** — No. The host reads `~/.dsh/sessions/**` read-only, folds it in memory, and serves it on
`/dsh-visualization/*` to the local page. Neither half makes an outbound request, and no session file
is written.

**中文** — 不会。宿主只读 `~/.dsh/sessions/**`，在内存里折叠，通过 `/dsh-visualization/*`
提供给本地页面。前后两端都不对外发请求，也不写任何会话文件。

## Why loopback only? / 为什么只能本机访问？

**EN** — Session logs contain every command you ran and every prompt you typed. The routes answer
loopback addresses only, so exposing the Web UI on a LAN does not expose the instrument. If you really
need remote access, set `allowRemote: true` — and understand that anyone who can reach the port can
read those logs.

**中文** — 会话日志里有你执行过的每条命令和说过的每句话。路由只响应回环地址，所以把 Web 界面
暴露到局域网不会顺带暴露仪表盘。确实要远程访问时写 `allowRemote: true`——但要清楚：能访问该端口的人
都能读到这些日志。

## Can I use it at work? / 能在公司用吗？

**EN** — No. PolyForm Noncommercial excludes use by a for-profit company, including internal use and
use on behalf of a company. Personal study, and noncommercial organisations (charities, educational and
public research institutions), are permitted by the license text.

**中文** — 不行。PolyForm Noncommercial 排除了在营利性公司内部或代表公司的使用。个人学习，以及慈善、
教育、公共研究机构等非商业组织，按许可条文是允许的。

## Does it slow the session down? / 会拖慢会话吗？

**EN** — The fold is incremental: only newly appended zstd frames are decoded, and only new events are
pushed into the accumulator. At ~8.7 k events the first fold is 240–260 ms; afterwards each change is
7–12 ms. When nothing changes the SSE connection sends zero bytes (apart from a 15 s heartbeat).

**中文** — 折叠是增量的：只解新追加的 zstd 帧，只把新事件 push 进累加器。约 8.7k 事件时首次
240~260 ms，之后每次变化 7~12 ms。没有变化时 SSE 一个字节都不发（15 秒一次心跳除外）。

## Known limits

- **Memory grows with the session**: the reducer keeps derived state for every event. Steps, tools and
  the log are capped; counters are cumulative. At ~100 k events `result()` still sorts 1.2 k steps and
  1.5 k tools — roughly 10–20 ms per frame.
- **Two UI languages** (zh/en).
- **Read-only**: the instrument never writes session files.
- **Wallpaper Engine cannot render the page** — its CEF crashes on it; use Lively instead
  (see [GUIDE.md §8](GUIDE.md#8-as-a-desktop-wallpaper)).
