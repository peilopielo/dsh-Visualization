/* CDP 探针：连到 WE 的壁纸页面，读控制台/异常/运行时尺寸（带超时和错误处理） */
const http = require('node:http')

function getJson(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 8080, path }, (r) => {
      let b = ''
      r.on('data', (c) => (b += c))
      r.on('end', () => { try { res(JSON.parse(b)) } catch (e) { rej(e) } })
    }).on('error', rej)
  })
}

const die = (msg) => { console.log(msg); process.exit(1) }
setTimeout(() => die('全局超时（25s）'), 25000)

;(async () => {
  const list = await getJson('/json')
  const pages = list.filter((t) => t.type === 'page')
  console.log('页面:', pages.map((p) => p.title).join(' | '))
  const target = pages.find((p) => /DSH-Visualization/i.test(p.url)) || pages[0]
  if (!target) return die('没有页面')

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const logs = []

  ws.onerror = (e) => die('WS 错误: ' + (e.message || e.type))
  ws.onclose = () => die('WS 被关闭')

  const send = (method, params) => new Promise((res) => {
    const mid = ++id
    pending.set(mid, res)
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }))
  })

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); return }
    if (msg.method === 'Runtime.consoleAPICalled') {
      logs.push('[console.' + msg.params.type + '] ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      logs.push('[exception] ' + ((d.exception && (d.exception.description || d.exception.value)) || d.text))
    }
    if (msg.method === 'Log.entryAdded') {
      logs.push('[log.' + msg.params.entry.level + '] ' + msg.params.entry.text)
    }
  }

  await new Promise((r, j) => { ws.onopen = r; setTimeout(() => j(new Error('open timeout')), 6000) })

  await send('Runtime.enable')
  await send('Log.enable')
  await new Promise((r) => setTimeout(r, 800))

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r && r.exceptionDetails) return 'EVAL ERROR: ' + JSON.stringify(r.exceptionDetails).slice(0, 200)
    return r && r.result ? r.result.value : null
  }

  const info = await evalJs(`JSON.stringify({
    innerW: innerWidth, innerH: innerHeight, dpr: devicePixelRatio,
    netW: (document.getElementById('net')||{}).width,
    netStyleW: (document.getElementById('net')||{style:{}}).style.width,
    dash: !!document.querySelector('.dash'),
    bodyLen: document.body.innerText.length,
    hasM: !!window.__M,
    turn: (window.__M && window.__M.turn) || null,
    errs: (window.__ERRS || []).length
  })`)
  console.log('\n运行时:', info)

  console.log('\n控制台/异常:')
  if (!logs.length) console.log('  (无)')
  logs.slice(0, 25).forEach((l) => console.log('  ' + String(l).slice(0, 300)))

  ws.close()
  process.exit(0)
})().catch((e) => die('失败: ' + e.message))
