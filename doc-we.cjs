const fs = require('fs')
let n = 0
const edit = (f, pairs) => {
  let t = fs.readFileSync(f, 'utf8')
  for (const [a, b] of pairs) {
    if (t.includes(a)) { t = t.split(a).join(b); n++ } else console.log('MISS ' + f + ' :: ' + a.slice(0, 50))
  }
  fs.writeFileSync(f, t, 'utf8')
}

/* AGENTS 坑 1：补上 iframe 也失败 + 误判来源 */
edit('AGENTS.md', [
  ['1. **WE 渲染器跑不动完整页**：Chrome 146 复现，与协议无关（file:// 和 http:// 都崩）、与 CSS 文件无关（换极简 CSS 也崩）；崩溃与合成 `.rings` 子树相关。别再花时间，用 Lively。',
   '1. **WE 渲染器跑不动完整页**：Chrome 146 复现，与协议无关（file:// 和 http:// 都崩）、与 CSS 文件无关（换极简 CSS 也崩）、**iframe 套一层也崩**（外层页面活着，iframe 区域不合成）。崩溃与合成 `.rings` 子树相关。别再花时间，用 Lively。\n   > 排查时务必先**退出 Lively**：两个壁纸软件会抢桌面层，曾把 Lively 渲染的画面误判成"WE 成功了"。'],
])

edit('AGENTS.en.md', [
  ['1. **WE\'s renderer crashes on the full page.** Reproduced on Chrome 146; independent of protocol\n   (`file://` and `http://` both crash) and of the CSS file (a minimal stylesheet still crashes). The\n   crash correlates with compositing the `.rings` subtree. Do not spend more time on it — use Lively.',
   '1. **WE\'s renderer crashes on the full page.** Reproduced on Chrome 146; independent of protocol\n   (`file://` and `http://` both crash), of the CSS file (a minimal stylesheet still crashes), and of\n   framing (an iframe wrapper keeps the outer page alive but the frame never composites). The crash\n   correlates with compositing the `.rings` subtree. Do not spend more time on it — use Lively.\n   > Always **quit Lively first** when testing WE: the two apps fight over the desktop layer, and a\n   > Lively-rendered frame was once mistaken for "WE works".'],
])

/* wallpaper/README：WE 一节补充结论 */
edit('wallpaper/README.md', [
  ['WE 自己的渲染器在完整页面上**会崩**（Chrome 146，与协议和样式表都无关）。替代方案是截图：',
   'WE 自己的渲染器在完整页面上**会崩**（Chrome 146，与协议、样式表、iframe 包装都无关）。替代方案是截图：'],
])
edit('wallpaper/README.en.md', [
  ['Wallpaper Engine\'s own renderer **crashes** on the full page (Chrome 146, independent of protocol and\nof the stylesheet). The workaround captures the page and displays the picture:',
   'Wallpaper Engine\'s own renderer **crashes** on the full page (Chrome 146, independent of protocol,\nstylesheet, and iframe wrapping). The workaround captures the page and displays the picture:'],
])

/* 实验目录说明补一行 */
edit('wallpaper/README.md', [
  ['| `img-wallpaper.html` | 单张整页截图的壁纸（`live.html` 的前身） |',
   '| `img-wallpaper.html` | 单张整页截图的壁纸（`live.html` 的前身） |\n| `theirs-iframe.html` | 另一个项目（ACyCar1o/dsh-hud-haloflux）的 WE 页面，改端口后仍崩——证明 iframe 也救不了 |\n| `hybrid-script.html` | 对方 CSS + 我们的脚本，用来隔离崩溃点 |'],
])

fs.writeFileSync('README.md', fs.readFileSync('README.md', 'utf8'), 'utf8')
console.log('改动', n, '处')
