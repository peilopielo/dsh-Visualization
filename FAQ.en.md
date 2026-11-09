[中文](FAQ.md) | **English**

# FAQ

Only the "why" questions. For usage see [GUIDE.en.md](GUIDE.en.md); for changing the code see
[AGENTS.en.md](AGENTS.en.md).

## Why is the license not OSI-approved?

Because HALOFLUX is not. The visual language — rings, palette, layered layout — derives from
[HALOFLUX](https://github.com/Ryder191/haloflux), which is licensed under PolyForm Noncommercial 1.0.0.
Those terms require derivatives to stay noncommercial and to keep the attribution, so an MIT/Apache
badge here would be a promise this project cannot keep.

The **code** is original (host folding, zstd frame parsing, SSE, the page). What it borrows is the
design language, credited in the LICENSE and in the page footer.

> The plugin market does not require an OSI license — other listed plugins ship non-OSI terms too.

## Does it send my data anywhere?

No. The host reads `~/.dsh/sessions/**` read-only, folds it in memory, and serves it on
`/dsh-visualization/*` to the local page. Neither half makes an outbound request, and no session file
is written.

## Why loopback only?

Session logs contain every command you ran and every prompt you typed. The routes answer loopback
addresses only, so exposing the Web UI on a LAN does not expose the instrument. If you really need
remote access, set `allowRemote: true` — and understand that anyone who can reach the port can read
those logs.

## Can I use it at work?

No. PolyForm Noncommercial excludes use by a for-profit company, including internal use and use on
behalf of a company. Personal study, and noncommercial organisations (charities, educational and
public research institutions), are permitted by the license text.

## Does it slow the session down?

The fold is incremental: only newly appended zstd frames are decoded, and only new events are pushed
into the accumulator. At ~8.7 k events the first fold is 240–260 ms; afterwards each change is 7–12 ms.
When nothing changes the SSE connection sends zero bytes (apart from a 15 s heartbeat).

## Known limits

- **Memory grows with the session**: the reducer keeps derived state for every event. Steps, tools and
  the log are capped; counters are cumulative. At ~100 k events `result()` still sorts 1.2 k steps and
  1.5 k tools — roughly 10–20 ms per frame.
- **Two UI languages** (zh/en).
- **Read-only**: the instrument never writes session files.
- **Wallpaper Engine cannot render the page** — its CEF crashes on it; use Lively instead
  (see [GUIDE.en.md §8](GUIDE.en.md#8-as-a-desktop-wallpaper)).
