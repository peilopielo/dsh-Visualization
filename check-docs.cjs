/* 文档体检：
   - README / GUIDE 六语齐全、章节数一致、语言切换行完整
   - AGENTS / FAQ / wallpaper README 仍按中文 + 英文成对
   另检查相对链接是否有效 */
const fs = require('fs')
const path = require('path')

const SIX = {
  README: ['README.md', 'README.en.md', 'README.ja.md', 'README.ko.md', 'README.ru.md', 'README.hi.md'],
  GUIDE: ['GUIDE.md', 'GUIDE.en.md', 'GUIDE.ja.md', 'GUIDE.ko.md', 'GUIDE.ru.md', 'GUIDE.hi.md'],
}
const PAIRS = ['AGENTS.md', 'FAQ.md', 'wallpaper/README.md']
let bad = 0
const sections = (t) => (t.match(/^## /gm) || []).length

for (const [group, files] of Object.entries(SIX)) {
  const texts = {}
  for (const f of files) {
    if (!fs.existsSync(f)) { console.log('✗ 缺 ' + f); bad++; continue }
    texts[f] = fs.readFileSync(f, 'utf8')
  }
  const list = Object.values(texts)
  const base = list.length ? sections(list[0]) : 0
  const uniform = list.every((t) => sections(t) === base)
  if (!uniform) { console.log('⚠ ' + group + ' 章节数不一致: ' + Object.entries(texts).map(([f, t]) => f + '=' + sections(t)).join(' ')); bad++ }
  else console.log('✓ ' + group + ' 六语 · ' + base + ' 节 (' + list.length + ' 个文件)')

  for (const [f, t] of Object.entries(texts)) {
    const head = t.split('\n')[0]
    const missing = files.filter((r) => r !== f && !head.includes('(' + path.basename(r) + ')'))
    if (missing.length) { console.log('✗ ' + f + ' 切换行缺: ' + missing.join(', ')); bad++ }
  }
}

for (const base of PAIRS) {
  const en = base.replace(/\.md$/, '.en.md')
  if (!fs.existsSync(base) || !fs.existsSync(en)) { console.log('✗ 缺版本: ' + base); bad++; continue }
  const zhText = fs.readFileSync(base, 'utf8')
  const enText = fs.readFileSync(en, 'utf8')
  const a = sections(zhText), b = sections(enText)
  if (a !== b) { console.log('⚠ ' + base + ' 章节数不一致：中文 ' + a + ' / 英文 ' + b); bad++ }
  else console.log('✓ ' + base + ' ↔ ' + path.basename(en) + ' · ' + a + ' 节')

  for (const [file, text] of [[base, zhText], [en, enText]]) {
    const dir = path.dirname(file)
    for (const m of text.matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)) {
      const clean = m[1].split('#')[0]
      if (!clean) continue
      if (!fs.existsSync(path.resolve(dir, clean))) { console.log('✗ ' + file + ' → 缺失: ' + m[1]); bad++ }
    }
  }
}

console.log(bad === 0 ? '\n全部通过' : '\n发现 ' + bad + ' 处问题')
process.exit(bad === 0 ? 0 : 1)
