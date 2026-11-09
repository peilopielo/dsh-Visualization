/* 生成"完整版"壁纸页：
   1) 用 <base> 把相对请求指向固定端口
   2) 去掉会崩 WE 渲染器的 -webkit-line-clamp（换成 max-height 裁切） */
const fs = require('fs')
const path = require('path')

const root = __dirname
const PORT = Number(process.env.HALOFLUX_WALLPAPER_PORT || 8799)

let html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8')

/* 1) base */
const base = '<base href="http://127.0.0.1:' + PORT + '/">'
if (/<base\s/i.test(html)) html = html.replace(/<base[^>]*>/i, base)
else html = html.replace(/<head>/i, '<head>\n' + base)

/* 2) 去掉 -webkit-line-clamp（WE 的 CEF 会因它崩溃） */
const before = html
html = html.replace(
  /display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden/,
  'display:block;max-height:2.9em;overflow:hidden'
)
if (html === before) console.log('WARN: line-clamp 规则没找到，可能已被改过')

fs.writeFileSync(path.join(root, 'wallpaper', 'index.html'), html, 'utf8')
console.log('壁纸页（完整版）已生成: ' + html.length + ' 字节, base → :' + PORT)
