// 把工作区的 instrument.html 生成为插件里的页面（单一源，避免两份漂移）
// 用法：node dsh-visualization/build.cjs
const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '..', 'instrument.html')
const out = path.join(__dirname, 'web', 'index.html')

if (!fs.existsSync(src)) {
  console.log('（包内不含 instrument.html —— 这是仓库里的构建脚本，安装后的包不需要跑它）')
  process.exit(0)
}
let h = fs.readFileSync(src, 'utf8')
/* 插件挂在 /dsh-visualization 前缀下，接口要改成相对路径 */
for (const ep of ['sessions', 'state', 'savehtml']) h = h.split("'/" + ep + "'").join("'" + ep + "'")
for (const ep of ['replay', 'calls', 'select']) h = h.split("'/" + ep + "?").join("'" + ep + "?")

fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, h, 'utf8')
console.log('build → ' + path.relative(process.cwd(), out) + '  ' + h.length + ' bytes')
