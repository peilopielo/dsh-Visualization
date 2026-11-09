/* 保留指定块区间：node we-css-keep.cjs 0 17 18 66
   参数成对出现，表示 [from, to) 的块区间（块 = 按 } 切分）。 */
const fs = require('fs')
const path = require('path')
const root = __dirname
const args = process.argv.slice(2).map(Number)

let html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8')
const m = html.match(/<style>([\s\S]*?)<\/style>/i)
if (!m) { console.log('no style'); process.exit(1) }
const chunks = m[1].split('}')

const keep = []
for (let i = 0; i + 1 < args.length; i += 2) {
  for (let k = args[i]; k < Math.min(args[i + 1], chunks.length); k++) keep.push(chunks[k])
}
html = html.replace(m[0], '<style>' + keep.join('}') + '</style>')
html = html.replace(/<head>/i, '<head>\n<base href="http://127.0.0.1:8799/">')

fs.writeFileSync(path.join(root, 'wallpaper', 'debug.html'), html, 'utf8')
console.log('keep blocks ' + args.join(',') + ' → ' + html.length + ' bytes, ' + keep.length + ' rules')
