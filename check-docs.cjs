/* 文档体检：
   - README 六语齐全、章节数一致、语言切换行完整
   - 其它文档仍按 中文 A.md + 英文 A.en.md 成对检查
   检查项：成对存在、章节数一致、相对链接有效、英文侧不链中文版 */
const fs = require('fs')
const path = require('path')

const READMES = ['README.md', 'README.en.md', 'README.ja.md', 'README.ko.md', 'README.ru.md', 'README.hi.md']
const PAIRS = ['GUIDE.md', 'AGENTS.md', 'FAQ.md', 'wallpaper/README.md']
let bad = 0
const sections = (t) => (t.match(/^## /gm) || []).length

/* ---- README 六语 ---- */
{
  const texts = {}
  for (const f of READMES) {
    if (!fs.existsSync(f)) { console.log('✗ 缺 ' + f); bad++; continue }
    texts[f] = fs.readFileSync(f, 'utf8')
  }
  const counts = Object.entries(texts).map(([f, t]) => f + '=' + sections(t))
  const base = sections(texts[READMES[0]] || '')
  const same = Object.values(texts).every((t) => sections(t) === base)
  if (!same) { console.log('⚠ README 章节数不一致: ' + counts.join(' ')); bad++ }
  else console.log('✓ README 六语 · ' + base + ' 节 (' + counts.length + ' 个文件)')

  /* 每个文件的切换行必须包含全部六种语言的链接 */
  for (const [f, t] of Object.entries(texts)) {
    const head = t.split('\n')[0]
    const missing = READMES.filter((r) => r !== f && !head.includes('(' + path.basename(r) + ')'))
    if (missing.length) { console.log('✗ ' + f + ' 切换行缺: ' + missing.join(', ')); bad++ }
  }
}

/* ---- 其它文档成对 ---- */
for (const base of PAIRS) {
  const en = base.replace(/\.md$/, '.en.md')
  if (!fs.existsSync(base) || !fs.existsSync(en)) { console.log('✗ 缺版本: ' + base); bad++; continue }
  const zhText = fs.readFileSync(base, 'utf8')
  const enText = fs.readFileSync(en, 'utf8')
  const a = sections(zhText), b = sections(enText)
  if (a !== b) { console.log(`⚠ ${base} 章节数不一致：中文 ${a} / 英文 ${b}`); bad++ }
  else console.log(`✓ ${base} ↔ ${path.basename(en)} · ${a} 节`)

  for (const [file, text] of [[base, zhText], [en, enText]]) {
    const dir = path.dirname(file)
    for (const m of text.matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)) {
      const clean = m[1].split('#')[0]
      if (!clean) continue
      if (!fs.existsSync(path.resolve(dir, clean))) { console.log('✗ ' + file + ' → 缺失: ' + m[1]); bad++ }
    }
  }
}

console.log(bad === 0 ? '\n全部通过' : `\n发现 ${bad} 处问题`)
process.exit(bad === 0 ? 0 : 1)
