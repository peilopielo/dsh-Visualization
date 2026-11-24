[中文](AGENTS.md) | **English**

# AGENTS — changing dsh-visualization

For DSH agents and developers. English first, **[中文](#中文)** at the bottom.
For using the plugin see [GUIDE.en.md](GUIDE.en.md).

---

## 1. Three commands

```powershell
node build.cjs                  # standalone/instrument.html → web/index.html
```

Changing anything under `fold.cjs` / `index.js` (the host half) **requires a DSH restart** — the
plugin toggle only remounts routes, it does not re-evaluate loaded ESM.

## 2. File map

| Path | Role |
|---|---|
| `standalone/instrument.html` | **the single source of the page.** Edit this, then build. |
| `standalone/i18n/*.js` | language packs (en/ja/ko/ru/hi): `dict` (whole strings), `rules` (regex), `fn` (logic); inlined into `web/index.html` at build time |
| `web/index.html` | **generated** — never edit by hand |
| `standalone/bridge.cjs` | standalone dev server (port 8787), not shipped |
| `fold.cjs` | host: session discovery, zstd frames, incremental fold, HTTP/SSE, fixed-port helper |
| `index.js` | host entry: registers the route, injects origin/policy, starts the helper |
| `client.js` | client half: sidebar icon + main-panel iframe |
| `build.cjs` | regenerates `web/index.html` from the source page |
| `wallpaper/` | Lively wallpaper package (`lively/` + `lively-package.zip`), see its README |
| `we-css-keep.cjs` | CSS bisect helper (`we-css-split.cjs` is the older variant) |
| `screenshots.json` | storefront screenshots declared in-repo |

## 3. Rules that bite

1. **One source.** Change `standalone/instrument.html`, run `node build.cjs`. Hand-editing
   `web/index.html` gets overwritten.
2. **Host changes need a restart.** `fold.cjs` / `index.js` are ESM; a plugin toggle is not enough.
3. **Never overwrite the page with a one-liner.** It has been destroyed that way once — use edits or a
   small `.cjs` patch script. Recovery is documented at the end of this file.
4. **Wallpapers are Lively-only.** Do not reintroduce Wallpaper Engine: its renderer cannot
   composite this page. The old experiment set lives in git history.

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

**Transport**: both `/state` and `/events` negotiate gzip from `accept-encoding`. One state push is around 270 KB for a
20k-event session and gzips to about 10% (measured 551 KB → 57.8 KB). The SSE stream is gzipped incrementally with a
`flush()` after each write, so latency is unchanged. Do not swap `sseWrite()` back to `res.write()` — the browser would
receive raw gzip bytes and EventSource would drop the connection.

**Auto-follow priority** (`pickSession` in `fold.cjs`):

```
1 CURRENT  explicit pin (?session= or the dropdown)
2 VIEWED   the session you selected / last wrote in (6 h TTL)
3 AUTO     sticky: holds its target while several sessions are live (LIVE 12 s / IDLE 45 s)
4 list[0]  newest log
```

VIEWED is written by three things: `agent/created` (once per session), `api-session/activity` (you send a
message), and the client wrapper around `uiWorkspace.openSession` / `sessions.retain` (**fires on every
sidebar click — the reliable one**). `noteViewed()` rejects subagents: a directory without the `session-`
prefix is a child session.


## 5. Adding things

**A ring** — three places in `standalone/instrument.html`: `RINGVIS` / `RING_NAME` / `RING_COL`, the
`if (RINGVIS[n])` block in `draw()`, and `hitReg({...})` so hover/click works. Add a branch in
`showDetail()` if the card needs fields.

**A language** — copy `standalone/i18n/en.js` to `<code>.js`, add one `<script src="i18n/<code>.js">` in `standalone/instrument.html`, and append the code to `LANGS`. `dict` handles whole strings, `rules` handles templated ones (**use `$1` replacements, not functions** — `tr()` calls `k.replace(re, str)`), `fn` handles branching sentences. `LANG`
is `'zh' | 'en'`; to add a third, turn it into a list and key the dictionaries by code.

**A colour** — `toolColor(name)`.

## 6. Debugging

| Flag / tool | What it gives |
|---|---|
| `GET/POST /prefs` | display prefs on the host side (`~/.dsh/dsh-visualization-prefs.json`), shared by panel and wallpaper |
| `?debug=1` (or `#debug`, `localStorage.dshviz.debug=1`) | `window.__M` / `__HIT` / `__CHAIN` |
| `http://127.0.0.1:8799/state` | the fixed-port helper the wallpapers use |
| `node standalone/shot.cjs <url> out.png W H` | screenshot any page (CDP over pipes) |
| `SHOT_EVAL=...` | evaluate JS in the page and print the result |

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

1. **Do not expect Wallpaper Engine to work.** Its renderer cannot composite this page (reproduced
   on Chrome 146, independent of protocol, stylesheet and iframe wrapping). Lively is the only host.
2. **Multi-frame zstd.** The log is append-only multi-frame; older Node decodes only frame 1. Split on
   the magic `28 B5 2F FD`… **only as a fallback**: the correct path is `zstdFrames()`, which parses
   headers and blocks. Magic-scanning is wrong (the real log contains 4838 magic occurrences).
3. **`pointer-events` on overlay layers.** A full-screen overlay without `pointer-events:none` kills
   all canvas hover/click. `elementFromPoint` returning the overlay instead of `#net` is the symptom.
4. **Init order.** `M.sSteps/sJobs/sTools/sLog/sStats` must be `[]` before the first `draw()`, or the
   canvas freezes. `DEBUG` must be module-scope, not inside `render()`.
5. **`CN.turns = 0` means "all"** — guard with `turnLimit = CN.turns || 999`, else no lines are drawn.
6. **`tool/result` id lives at `message.source.callId`**, not `data.toolCallId`.
7. **Zoom-dependent layout** — the rings measure `.rings.getBoundingClientRect()`; if that element is
   hidden or zero-sized, `G.base` is 0 and `draw()` returns early (blank panel with no error).
8. **Never disable `ui-settings` from inside Settings** — the settings page *is* that plugin, so turning
    it off leaves you with a permanently blank page. Recover by editing
    `~/.dsh/profiles/desktop/cordis.patch.yml`:
    ```yaml
    - id: ui-settings
      name: "@deepseek-ai/dsh-client-ui-settings"
      config:
        enabled: false
    ```
    → change to `enabled: true` (or delete the entry). The file is reloaded live; no restart needed.
9. **An emptied `cordis.patch.yml` (`[]`) leaves the package installed but its entry gone.** The plugin
    manager records installed plugins as `insert` entries in that patch; wipe it and only the
    `package.json` dependency and the `node_modules` junction survive — the loader has no entry to read.
    Symptoms: your `entryId` is **absent from `plugin_manager list_plugins`**, the fixed port (8799) is
    not listening, and the plugin page shows it as not installed. Recover with
    `remove_bundle` → `install_bundle` (a local `link:` install, seconds, no network); the entry is
    rebuilt. Rule of thumb: dependency present + junction present + entry missing = this trap.

10. **`team/member` is a historical event**: in current DSH a teammate is a **continuable entry in the Lead's subagent
    catalog** and no `team/member` is emitted. Symptom: team mode is on and `team/task` exists, yet the team block
    shows only the `lead` row. Also `model/selection` is the authoritative model event (it carries `reasoningEffort`);
    `request/context` lags one step, and a child's `subagent/descriptor` may override `agentModel` / `agentProvider`.

## 9. Wallpaper

Lively is the only route: `wallpaper/lively/` + `lively-package.zip` (WebView2, full frame rate,
mouse input forwarded).

> The whole Wallpaper Engine experiment set (screenshot pipeline, hybrid page, CEF debug scripts)
> was removed: WE cannot render this page, only approximate it at ~5 fps without interaction —
> not worth maintaining. The old implementation lives in git history.

## 10. Recovering the page

If `standalone/instrument.html` is ever clobbered:

1. Check `instrument.bak.html` and the working tree (`git status`, `git diff`)
2. If the browser still has the page open, run in its console:
   `fetch('/savehtml',{method:'POST',body:document.documentElement.outerHTML})`
   → the host writes `instrument.recovered.html`
3. Re-apply the last edits, then `node build.cjs`

---

