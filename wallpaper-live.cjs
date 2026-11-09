/* 常驻截图流水线：Edge 只启动一次，之后循环 CDP 截图
   用法：node wallpaper-live.cjs [间隔毫秒] [质量]

   输出：项目目录下 frame.jpg（壁纸页每 200ms 拉一次）
*/
'use strict'
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const INTERVAL = Number(process.argv[2] || 200)
const QUALITY = Number(process.argv[3] || 78)
const W = 2560, H = 1440
const OUT = 'd:/software/steam/steamapps/common/wallpaper_engine/projects/myprojects/DSH-Visualization/frame.jpg'
const URL_ = 'http://127.0.0.1:8799/'

const BROWSERS = [
  process.env.SHOT_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean)
const browser = BROWSERS.find((p) => fs.existsSync(p))
if (!browser) { console.error('no Edge/Chrome'); process.exit(2) }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-live-'))
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--mute-audio',
  '--disable-extensions', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-pipe', '--user-data-dir=' + profile,
  '--window-size=' + W + ',' + H, 'about:blank'
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })

let buf = ''
const pending = new Map()
let nextId = 1
child.stdio[4].setEncoding('utf8')
child.stdio[4].on('data', (chunk) => {
  buf += chunk
  let i
  while ((i = buf.indexOf('\0')) >= 0) {
    const raw = buf.slice(0, i); buf = buf.slice(i + 1)
    let msg
    try { msg = JSON.parse(raw) } catch (e) { continue }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    }
  }
})

function send(method, params = {}, sessionId) {
  const id = nextId++
  const msg = { id, method, params }
  if (sessionId) msg.sessionId = sessionId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    child.stdio[3].write(JSON.stringify(msg) + '\0')
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)) } }, 30000)
  })
}

const die = (msg) => {
  console.error('FATAL ' + msg)
  try { child.kill() } catch (e) { }
  try { fs.rmSync(profile, { recursive: true, force: true }) } catch (e) { }
  process.exit(1)
}

;(async () => {
  try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    await send('Page.enable', {}, sessionId)
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sessionId)
    await send('Page.navigate', { url: URL_ }, sessionId)
    await new Promise((r) => setTimeout(r, 4000))

    let frames = 0
    const t0 = Date.now()
    for (;;) {
      const t = Date.now()
      try {
        const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: QUALITY }, sessionId)
        const tmp = OUT + '.tmp'
        fs.writeFileSync(tmp, Buffer.from(data, 'base64'))
        fs.renameSync(tmp, OUT)
        frames++
      } catch (e) {
        console.error('capture failed: ' + e.message)
      }
      const spent = Date.now() - t
      if (frames % 20 === 0) {
        const fps = frames / ((Date.now() - t0) / 1000)
        console.log('frames=' + frames + ' fps=' + fps.toFixed(2) + ' last=' + spent + 'ms size=' +
          (fs.existsSync(OUT) ? Math.round(fs.statSync(OUT).size / 1024) + 'KB' : '-'))
      }
      const wait = Math.max(0, INTERVAL - spent)
      if (wait) await new Promise((r) => setTimeout(r, wait))
    }
  } catch (e) {
    die(e.message)
  }
})()
