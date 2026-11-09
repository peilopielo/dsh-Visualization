/* 壁纸完整版：原版 HTML + 原版 JS，只把 CSS 换成极简版
   （原版 CSS 会崩 WE 渲染器；JS 是安全的）

   关键：.rings 在 .dash 里，不能把 .dash 隐藏（否则 .rings 尺寸为 0，draw() 直接 return）。
   做法是保留 .dash 的网格布局，只把 .rings 以外的子元素 visibility:hidden。 */
const fs = require('fs')
const path = require('path')

const root = __dirname
const PORT = 8799
let html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8')

const css = `
html, body { margin: 0; height: 100%; overflow: hidden; background: #1b1e23 }
#bg { position: fixed; inset: 0; z-index: 0;
  background: radial-gradient(ellipse 64% 60% at 38% 44%, #31363e 0%, #282d34 40%, #1f2329 72%, #191c21 100%) }
#grain { position: fixed; inset: 0; z-index: 1; opacity: .2; pointer-events: none;
  background-image: repeating-linear-gradient(0deg, rgba(255,255,255,.022) 0 1px, transparent 1px 2px) }
#net { position: fixed; inset: 0; z-index: 2 }
.dash { position: fixed; inset: 0; z-index: 3; pointer-events: none; display: block }
.dash > * { visibility: hidden }
.dash > .rings { visibility: visible; position: fixed; left: 0; top: 56px; width: calc(100% - 430px); height: calc(100% - 282px) }
#tip, #tdetail, #popPanel { display: none !important }
`

html = html.replace(/<style>[\s\S]*?<\/style>/i, '<style>' + css + '</style>')
html = html.replace(/<head>/i, '<head>\n<base href="http://127.0.0.1:' + PORT + '/">')

fs.writeFileSync(path.join(root, 'wallpaper', 'full.html'), html, 'utf8')
console.log('full.html:', html.length, '字节')
