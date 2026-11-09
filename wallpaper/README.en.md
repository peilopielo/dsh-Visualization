[中文](README.md) | **English**

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

