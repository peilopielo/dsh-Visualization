/* 混合壁纸的截图流水线：
   1) 截整页 2560×1440 → frame.png
   2) 用 Pillow 裁三块：顶栏 2560×56 / 右栏 430×1158 / 底部 2560×226
   3) 只在内容变化时写盘

   用法：node wallpaper-capture.cjs [间隔秒]
*/
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const INTERVAL = Number(process.argv[2] || 8) * 1000
const W = 2560, H = 1440
const DIR = 'd:/software/steam/steamapps/common/wallpaper_engine/projects/myprojects/DSH-Visualization'
const FULL = path.join(DIR, '.frame-full.png')
const SHOT = path.join(__dirname, 'standalone', 'shot.cjs')
const PY = 'C:/Users/m1593/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe'

const CROPS = [
  { name: 'strip-top.png', box: [0, 0, 2560, 56] },
  { name: 'strip-right.png', box: [2130, 56, 2560, 1214] },
  { name: 'strip-bottom.png', box: [0, 1214, 2560, 1440] },
]

function hash(p) {
  try { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex') } catch (e) { return '' }
}

function runCapture() {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [SHOT, 'http://127.0.0.1:8799/', FULL, String(W), String(H)], {
      cwd: __dirname, stdio: 'ignore',
    })
    p.on('exit', () => resolve())
  })
}

function runCrop() {
  return new Promise((resolve) => {
    const py = [
      'from PIL import Image',
      'im = Image.open(r"' + FULL.replace(/\\/g, '/') + '")',
    ]
    for (const c of CROPS) {
      const out = (DIR + '/' + c.name).replace(/\\/g, '/')
      const tmp = out + '.tmp.png'
      py.push('im.crop(' + JSON.stringify(c.box) + ').save(r"' + tmp + '")')
      py.push('import os; os.replace(r"' + tmp + '", r"' + out + '")')
    }
    const p = spawn(PY, ['-c', py.join('\n')], { stdio: 'ignore' })
    p.on('exit', () => resolve())
  })
}

let busy = false
async function cycle() {
  if (busy) return
  busy = true
  try {
    const before = hash(FULL)
    await runCapture()
    const after = hash(FULL)
    if (after && after !== before) await runCrop()
  } finally { busy = false }
}

cycle()
setInterval(cycle, INTERVAL)
console.log('hybrid capture: every ' + INTERVAL / 1000 + 's → ' + DIR)
