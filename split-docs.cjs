/* 把双语单文件拆成 中文.md + 英文.en.md，并加语言切换行 */
const fs = require('fs')
const path = require('path')

const EN_LINK = (f) => '**[中文](' + f + ')** | [English](' + f.replace('.md', '.en.md') + ')'
const ZH_LINK = (f) => '**[中文](' + f + ')** | [English](' + f.replace('.md', '.en.md') + ')'
const ZH_LINK_FROM_EN = (f) => '[中文](' + f + ') | **English**'

const files = ['README.md', 'GUIDE.md', 'AGENTS.md', 'FAQ.md', 'wallpaper/README.md']
const rd = (f) => fs.readFileSync(f, 'utf8')
const wr = (f, s) => fs.writeFileSync(f, s.replace(/\r\n/g, '\n'), 'utf8')

/* 英文侧的兄弟文档链接：指向 .en.md */
const EN_SIBLINGS = ['README.md', 'GUIDE.md', 'AGENTS.md', 'FAQ.md', 'wallpaper/README.md']
function toEnLinks(text) {
  let t = text
  for (const f of EN_SIBLINGS) {
    const base = path.basename(f)
    /* 只替换 ](xxx.md 形式，避开已带 .en.md 的 */
    t = t.replace(new RegExp('\\]\\(' + base.replace('.', '\\.') + '(#[^)]*)?\\)', 'g'), '](' + base.replace('.md', '.en.md') + '$1)')
  }
  return t
}

for (const f of files) {
  const text = rd(f)
  const name = path.basename(f)

  /* 找分隔：优先 "# 中文"，其次 "## 中文" */
  let idx = text.search(/^# 中文\s*$/m)
  let zhHeadingLevel = 1
  if (idx < 0) { idx = text.search(/^## 中文\s*$/m); zhHeadingLevel = 2 }
  if (idx < 0) { console.log('SKIP ' + f + '（没有中文分隔）'); continue }

  let enPart = text.slice(0, idx)
  let zhPart = text.slice(idx)

  /* 去掉中文那行的标题本身 */
  zhPart = zhPart.replace(/^##? 中文\s*$/m, '')

  /* 英文侧：去掉 "# English" 行与前言里"English first / 中文 at the bottom"的说法 */
  enPart = enPart.replace(/^# English\s*$/m, '')
  enPart = enPart.replace(/[^\n]*(English first|中文)\s*(at the bottom|见下|在最后)[^\n]*\n/gi, '')

  /* 整理空行 */
  const tidy = (s) => s.replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '')

  enPart = tidy(toEnLinks(enPart))
  zhPart = tidy(zhPart)

  /* 中文侧：兄弟链接保持 .md（默认就是中文版） */
  const zhFile = f
  const enFile = f.replace(/\.md$/, '.en.md')

  wr(zhFile, '**[中文](' + name + ')** | [English](' + path.basename(enFile) + ')\n\n' + zhPart)
  wr(enFile, '[中文](' + name + ') | **English**\n\n' + enPart)
  console.log('拆好 ' + f + ' → ' + name + ' (中文) + ' + path.basename(enFile) + ' (英文)')
}
