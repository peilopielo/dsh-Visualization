/* 文档体检：相对链接是否有效 + 中英章节是否成对 */
const fs = require('fs')
const path = require('path')

const docs = ['README.md', 'GUIDE.md', 'AGENTS.md', 'FAQ.md', 'wallpaper/README.md'].filter((f) => fs.existsSync(f))
let bad = 0

for (const f of docs) {
  const text = fs.readFileSync(f, 'utf8')
  const dir = path.dirname(f)

  /* 1) 相对链接 / 图片 */
  const links = [...text.matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)].map((m) => m[1])
  for (const l of new Set(links)) {
    const clean = l.split('#')[0]
    if (!clean) continue
    const target = path.resolve(dir, clean)
    if (!fs.existsSync(target)) { console.log('✗ ' + f + ' → 缺失: ' + l); bad++ }
  }

  /* 2) 双语章节：英文侧 ## 数量 vs 中文侧 ## 数量 */
  const idx = text.search(/^# 中文$/m)
  if (idx > 0) {
    const en = (text.slice(0, idx).match(/^## /gm) || []).length
    const zh = (text.slice(idx).match(/^## /gm) || []).length
    const mark = en === zh ? '✓' : '⚠'
    if (en !== zh) bad++
    console.log(`${mark} ${f} · 英文 ${en} 节 / 中文 ${zh} 节`)
  } else {
    console.log(`· ${f} · 无 "# 中文" 分隔（可能是纯英文文档）`)
  }
}

console.log(bad === 0 ? '\n全部通过' : `\n发现 ${bad} 处问题`)
process.exit(bad === 0 ? 0 : 1)
