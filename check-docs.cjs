/* 文档体检（拆分后模型）：
   每份文档都有 中文 A.md + 英文 A.en.md
   检查：成对存在、章节数一致、相对链接有效、英文侧链接指向 .en.md */
const fs = require('fs')
const path = require('path')

const bases = ['README.md', 'GUIDE.md', 'AGENTS.md', 'FAQ.md', 'wallpaper/README.md']
let bad = 0

const sections = (t) => (t.match(/^## /gm) || []).length

for (const base of bases) {
  const en = base.replace(/\.md$/, '.en.md')
  if (!fs.existsSync(base)) { console.log('✗ 缺中文版: ' + base); bad++; continue }
  if (!fs.existsSync(en)) { console.log('✗ 缺英文版: ' + en); bad++; continue }

  const zhText = fs.readFileSync(base, 'utf8')
  const enText = fs.readFileSync(en, 'utf8')

  /* 语言切换行 */
  const zhOk = zhText.split('\n')[0].includes('.en.md')
  const enOk = enText.split('\n')[0].includes('**English**') || enText.split('\n')[0].includes('English**')
  if (!zhOk) { console.log('✗ ' + base + ' 首行没有指向英文版的链接'); bad++ }
  if (!enOk) { console.log('✗ ' + en + ' 首行没有语言切换'); bad++ }

  /* 章节数一致 */
  const a = sections(zhText), b = sections(enText)
  if (a !== b) { console.log(`⚠ ${base} 章节数不一致：中文 ${a} / 英文 ${b}`); bad++ }
  else console.log(`✓ ${base} ↔ ${path.basename(en)} · ${a} 节`)

  /* 相对链接 */
  for (const [file, text] of [[base, zhText], [en, enText]]) {
    const dir = path.dirname(file)
    for (const m of text.matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)) {
      const clean = m[1].split('#')[0]
      if (!clean) continue
      if (!fs.existsSync(path.resolve(dir, clean))) { console.log('✗ ' + file + ' → 缺失: ' + m[1]); bad++ }
    }
    /* 英文侧不该链接到中文版 */
    if (file.endsWith('.en.md')) {
      const body = text.split('\n').slice(1).join('\n')
      for (const m of body.matchAll(/\]\((?!https?:|#)([^)\s]+\.md)(#[^)]*)?\)/g)) {
        if (!m[1].endsWith('.en.md')) { console.log('⚠ ' + file + ' 链到了中文版: ' + m[1]); bad++ }
      }
    }
  }
}

console.log(bad === 0 ? '\n全部通过' : `\n发现 ${bad} 处问题`)
process.exit(bad === 0 ? 0 : 1)
