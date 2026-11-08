// shot.cjs —— 用 CDP over pipes 截图（本机唯一能跑的自动截图方式）
//
//   node shot.cjs preview.html shot.png [宽] [高]
//
// 为什么不用 --screenshot：Edge/Chrome 的 --screenshot 在本机不出图（沙箱挡命名管道的老问题，
// README 第 7 节记过）。这里改用 `--remote-debugging-pipe`：CDP 消息走子进程的 stdio[3]/[4]，
// 每条 JSON 以 \0 结尾，完全绕开命名管道和 9222 端口。archify 技能包里的
// bin/visual-check.mjs 用的就是这套办法，这里抽出来做成通用小工具。
'use strict'
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const BROWSERS = [
  process.env.SHOT_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean)
const browser = BROWSERS.find((p) => fs.existsSync(p))
if (!browser) { console.error('no Edge/Chrome found'); process.exit(2) }

const target = process.argv[2]
const outFile = process.argv[3] || 'shot.png'
const W = Number(process.argv[4] || 1920)
const H = Number(process.argv[5] || 1080)
const settle = Number(process.env.SHOT_SETTLE_MS || 1500)
if (!target) { console.error('usage: node shot.cjs <html-or-url> [out.png] [W] [H]'); process.exit(2) }
const url = /^https?:|^file:/.test(target) ? target : pathToFileURL(path.resolve(target)).href

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-shot-'))
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--mute-audio',
  '--disable-extensions', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-pipe', '--user-data-dir=' + profile,
  '--window-size=' + W + ',' + H, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] })

const failures = []
child.stderr.on('data', (d) => { const s = String(d); if (/FATAL|pipe|CDP/i.test(s)) failures.push(s.trim().slice(0, 200)) })

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
    } else if (msg.method && listeners.has(msg.method)) {
      listeners.get(msg.method).forEach((fn) => { try { fn(msg.params) } catch (e) { } })
    }
  }
})
const listeners = new Map()
const on = (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn) }

function send(method, params = {}, sessionId) {
  const id = nextId++
  const msg = { id, method, params }
  if (sessionId) msg.sessionId = sessionId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    child.stdio[3].write(JSON.stringify(msg) + '\0')
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout: ' + method)) } }, 20000)
  })
}

const cleanup = (code) => {
  try { child.kill() } catch (e) { }
  try { fs.rmSync(profile, { recursive: true, force: true }) } catch (e) { }
  process.exit(code)
}

;(async () => {
  try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    await send('Page.enable', {}, sessionId)
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sessionId)
    const loaded = new Promise((res) => on('Page.loadEventFired', res))
    await send('Page.navigate', { url }, sessionId)
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 12000))])
    await new Promise((r) => setTimeout(r, settle))
    // SHOT_PRE：截图「之前」在页面里执行一段脚本（比如点开某个面板）
    if (process.env.SHOT_PRE) {
      await send('Runtime.evaluate', { expression: process.env.SHOT_PRE, returnByValue: true, awaitPromise: true }, sessionId)
      const post = Number(process.env.SHOT_POST_WAIT || 400)
      await new Promise((r) => setTimeout(r, post))
    }
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId)
    fs.writeFileSync(path.resolve(outFile), Buffer.from(data, 'base64'))
    console.log('OK ' + outFile + '  ' + W + 'x' + H + '  ' + fs.statSync(outFile).size + ' bytes')

    // SHOT_EVAL：在页面里取一眼数据（查 DOM / 控制台错误），比瞎猜省事
    if (process.env.SHOT_EVAL) {
      const r = await send('Runtime.evaluate', {
        expression: process.env.SHOT_EVAL, returnByValue: true, awaitPromise: true
      }, sessionId)
      console.log('EVAL ' + JSON.stringify(r.result && 'value' in r.result ? r.result.value : r.result))
    }
    cleanup(0)
  } catch (e) {
    console.error('FAIL ' + e.message)
    if (failures.length) console.error(failures.join('\n'))
    cleanup(1)
  }
})()
