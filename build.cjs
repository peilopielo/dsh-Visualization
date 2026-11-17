// 把工作区的 instrument.html 生成为插件里的页面（单一源，避免两份漂移）
// 语言包 i18n/<lang>.js 会被内联进 web/index.html —— 页面本身仍是单文件
// 用法：node build.cjs
const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, 'standalone', 'instrument.html')
const out = path.join(__dirname, 'web', 'index.html')

if (!fs.existsSync(src)) {
  console.log('（包内不含 instrument.html —— 这是仓库里的构建脚本，安装后的包不需要跑它）')
  process.exit(0)
}
let h = fs.readFileSync(src, 'utf8')

/* 1) 插件挂在 /dsh-visualization 前缀下，接口要改成相对路径 */
for (const ep of ['sessions', 'state', 'savehtml']) h = h.split("'/" + ep + "'").join("'" + ep + "'")
for (const ep of ['replay', 'calls', 'select']) h = h.split("'/" + ep + "?").join("'" + ep + "?")

/* 2) 把外链语言包内联进来（产物必须是单文件，壁纸与离线阅读都靠它） */
let inlined = 0
h = h.replace(/<script src="(i18n\/[a-z]+\.js)"><\/script>/g, (m, rel) => {
  const f = path.join(__dirname, 'standalone', rel)
  if (!fs.existsSync(f)) { console.log('⚠ 缺少语言包 ' + rel); return m }
  inlined++
  return '<script>\n/* ' + rel + ' */\n' + fs.readFileSync(f, 'utf8') + '</script>'
})

fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, h, 'utf8')
console.log('build → ' + path.relative(process.cwd(), out) + '  ' + h.length + ' bytes  · 内联语言包 ' + inlined + ' 个')
