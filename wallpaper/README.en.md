[中文](README.md) | **English**

# wallpaper — Lively desktop wallpaper

Putting the instrument on the desktop needs **only Lively Wallpaper** (free, open source). It renders
with WebView2 at the display's frame rate and forwards mouse input, so the rings and tables stay
clickable on the desktop.

## Install

1. Install [Lively Wallpaper](https://github.com/rocksdanister/lively)
2. Drag `lively-package.zip` into Lively, or **Add wallpaper → open file** → `lively/index.html`

The page probes `127.0.0.1:8799` … `8795` and loads whichever answers; when DSH is off it shows a hint
and retries every 5 seconds.

## Ports

The plugin opens a fixed local port so the wallpaper never has to know DSH's random Web port:

```
8799 → 8798 → 8797 → 8796 → 8795
```

Change the base with the plugin's `wallpaperPort` config; `0` disables the helper.

## No Lively? Use a browser

`http://127.0.0.1:8799/` is the same page; `msedge --app=http://127.0.0.1:8799/` gives a chromeless
window.

> A Wallpaper Engine screenshot route used to exist and has been removed: WE's own renderer cannot
> render this page, so it only ever approximated it at ~5 fps without interaction — not worth keeping.
