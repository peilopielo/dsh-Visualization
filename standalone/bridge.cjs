// bridge.cjs —— 把 DSH 真实会话状态喂给 instrument.html
//
//   node bridge.cjs            → http://127.0.0.1:8787
//   node bridge.cjs 9000       → 换端口
//   node bridge.cjs 8787 <sessionId>  → 指定会话（默认取当前工作区最新的）
//
// 为什么需要它：页面如果是 file:// 打开的，浏览器不允许它读 ~/.dsh 下的文件。
// 桥用 node 读会话日志（zstd 压缩的 JSONL），折成一份小 JSON，页面每 900ms 拉一次。
//
// 数据源（只读，不写任何东西）：
//   ~/.dsh/sessions/<workspace>/<session-id>/session.v4.jsonl.zstd
'use strict'
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const zlib = require('node:zlib')

const PORT = Number(process.argv[2] || 8787)
/* CURRENT = 当前盯着的会话 id；null 表示"自动跟最新"。可以在页面上切换。 */
let CURRENT = process.argv[3] ? 'session-' + String(process.argv[3]).replace(/^session-/, '') : null
const SESSIONS_ROOT = path.join(os.homedir(), '.dsh', 'sessions')
const PROJ_CACHE = path.join(os.homedir(), '.dsh', 'storages', 'session_projcache', 'sessions')
const PAGE = path.join(__dirname, 'instrument.html')

/* ---------------- 找会话文件 ---------------- */
function workspaceDir(cwd) {
  const enc = '--' + cwd.replace(/[:\\/]+/g, '-').replace(/^-+|-+$/g, '') + '--'
  const p = path.join(SESSIONS_ROOT, enc)
  if (fs.existsSync(p)) return p
  const base = path.basename(cwd).toLowerCase()
  const hit = fs.readdirSync(SESSIONS_ROOT).find((d) => d.toLowerCase().includes(base))
  return hit ? path.join(SESSIONS_ROOT, hit) : null
}

/* 列出所有会话（跨工作区），按最近写盘排序 */
function listSessions(limit) {
  const out = []
  let dirs = []
  try { dirs = fs.readdirSync(SESSIONS_ROOT) } catch (e) { return out }
  for (const ws of dirs) {
    let ids = []
    try { ids = fs.readdirSync(path.join(SESSIONS_ROOT, ws)) } catch (e) { continue }
    for (const id of ids) {
      if (!id.startsWith('session-')) continue
      const file = path.join(SESSIONS_ROOT, ws, id, 'session.v4.jsonl.zstd')
      let st
      try { st = fs.statSync(file) } catch (e) { continue }
      out.push({ id, ws, file, mtime: st.mtimeMs, bytes: st.size })
    }
  }
  out.sort((a, b) => b.mtime - a.mtime)
  const top = out.slice(0, limit || 40)
  /* 从投影缓存的前几百字节里抠出真实 cwd（比解码目录名靠谱） */
  for (const s of top) {
    s.cwd = ''
    try {
      const fd = fs.openSync(path.join(PROJ_CACHE, s.id + '.json'), 'r')
      const buf = Buffer.alloc(700)
      const n = fs.readSync(fd, buf, 0, 700, 0)
      fs.closeSync(fd)
      const m = buf.slice(0, n).toString('utf8').match(/"cwd":\s*"((?:[^"\\]|\\.)*)"/)
      if (m) s.cwd = JSON.parse('"' + m[1] + '"')
    } catch (e) { }
    s.short = s.id.replace('session-', '').slice(0, 8)
    if (!s.cwd) s.cwd = s.ws.replace(/^--|--$/g, '')
    delete s.file
  }
  return top
}

function findById(id) {
  const want = 'session-' + String(id).replace(/^session-/, '')
  let dirs = []
  try { dirs = fs.readdirSync(SESSIONS_ROOT) } catch (e) { return null }
  for (const ws of dirs) {
    const file = path.join(SESSIONS_ROOT, ws, want, 'session.v4.jsonl.zstd')
    try {
      const st = fs.statSync(file)
      return { id: want, ws, file, mtime: st.mtimeMs }
    } catch (e) { }
  }
  return null
}

function pickSession() {
  if (CURRENT) {
    const hit = findById(CURRENT)
    if (hit) return hit
  }
  const dir = workspaceDir(process.cwd())
  if (!dir) return null
  const ids = fs.readdirSync(dir).filter((d) => d.startsWith('session-'))
  if (!ids.length) return null
  const scored = ids.map((id) => {
    const f = path.join(dir, id, 'session.v4.jsonl.zstd')
    let mtime = 0
    try { mtime = fs.statSync(f).mtimeMs } catch (e) { }
    return { id, file: f, mtime }
  }).filter((s) => s.mtime > 0)
  if (!scored.length) return null
  scored.sort((a, b) => b.mtime - a.mtime)
  return scored[0]
}

/* ---------------- 折叠事件 → 状态 ---------------- */
const clip = (s, n) => {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content.filter((c) => c && c.type === 'text').map((c) => c.text).join(' ')
}
function shortArgs(raw, max) {
  const lim = max || 88
  if (!raw) return ''
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw
    const first = Object.entries(o).map(([k, v]) => k + '=' + (typeof v === 'string' ? v : JSON.stringify(v)))
    return clip(first.join(' '), lim)
  } catch (e) { return clip(raw, lim) }
}

/* 并发度：把每次工具调用看成一段区间，扫一遍算出「同时有几个在跑」
   返回最忙的并行数 + 重叠区间（给环上的弧段用） */
function concurrency(tools, winMs) {
  const cuts = []
  const from = Date.now() - (winMs || 120000)
  for (const t of tools) {
    const a = t.t
    const b = t.t + (t.ms == null ? (Date.now() - t.t) : t.ms)   // 没回来的算「还在跑」
    if (b < from) continue
    cuts.push([Math.max(a, from), 1], [b, -1])
  }
  cuts.sort((x, y) => x[0] - y[0] || x[1] - y[1])
  let n = 0, max = 0, prev = null
  const segs = []
  for (const [at, d] of cuts) {
    if (prev != null && at > prev && n >= 2) {
      if (at - prev >= 30) segs.push({ a: prev, b: at, n })
    }
    n += d
    if (n > max) max = n
    prev = at
  }
  return { max, segs: segs.slice(-60) }
}

function fold(events) {
  const S = {
    session: { id: '', cwd: '', preset: '', depth: 0, title: '', createdAt: 0 },
    turn: 0, step: 0, turnOpen: false, turns: 0, model: '', provider: '',
    ctxWin: 0, ctxUsed: 0,
    tok: { in: 0, out: 0, cache: 0 },
    tools: [], toolCount: 0, pending: new Set(),
    jobs: [], steps: [], turns: [], pendingPrompt: '', skills: [], ticks: [], toolAgg: {},
    approvalsList: [], changes: [], delivs: [],
    subagents: 0, approvals: 0, todos: 0, files: 0,
    log: [], lastEvent: 0, lastAssistant: 0, prevAssistant: 0, lastOut: 0,
    text: '', errs: 0
  }
  S.turnRec = []
  const byCall = new Map()
  const byJob = new Map()
  let NOWT = 0
  let NOWTURN = 0

  /* 步骤节奏：每个 step 从 step/start 到下一条 step/start（或本轮结束）的时长 */
  const closeStep = (at) => {
    const s = S.steps[S.steps.length - 1]
    if (s && !s.end && at > s.t) s.end = at
  }

  const addLog = (layer, name, detail, ms, ok) => {
    S.log.push({
      atMs: NOWT, turn: NOWTURN, layer, name: clip(name, 40),
      detail: clip(detail, 120), ms: ms == null ? null : ms, ok: ok !== false
    })
    if (S.log.length > 400) S.log.shift()
    return S.log[S.log.length - 1]
  }

  for (const e of events) {
    const d = e.data || {}
    NOWT = e.time || 0
    if (typeof d.turn === 'number') NOWTURN = d.turn
    S.lastEvent = Math.max(S.lastEvent, e.time || 0)
    switch (e.type) {
      case 'session': {
        const sd = (e.id ? e : (e.data || {}))
        S.session.id = sd.id || ''
        S.session.cwd = sd.cwd || ''
        S.session.preset = sd.agentPreset || ''
        S.session.depth = sd.delegationDepth || 0
        S.session.createdAt = sd.createdAt || 0
        break
      }
      case 'session/title':
        S.session.title = d.title || ''
        break
      case 'request/context':
        if (d.contextWindow) S.ctxWin = d.contextWindow
        if (d.model) S.model = d.model
        if (d.provider) S.provider = d.provider
        break
      case 'turn/start':
        S.turn = d.turn; S.step = 0; S.turnOpen = true
        S.turnRec.push({
          no: d.turn, start: e.time, end: 0, prompt: S.pendingPrompt || '',
          steps: 0, tools: 0, files: 0, reason: ''
        })
        S.pendingPrompt = ''
        addLog('session', 'TURN ' + d.turn, '会话开始')
        break
      case 'turn/end': {
        S.turnOpen = false
        closeStep(e.time)
        const tr = S.turnRec[S.turnRec.length - 1]
        if (tr && !tr.end) { tr.end = e.time; tr.reason = clip(d.reason || '', 40) }
        addLog('session', 'TURN ' + d.turn, '结束 · ' + clip(d.reason || '', 20))
        break
      }
      case 'step/start': {
        S.turn = d.turn; S.step = d.step
        closeStep(e.time)
        S.steps.push({ turn: d.turn, step: d.step, t: e.time, end: 0 })
        const t2 = S.turnRec[S.turnRec.length - 1]
        if (t2) t2.steps++
        break
      }
      case 'user/message': {
        const txt = textOf(d.content)
        const kind = (d.source && d.source.kind) || 'user'
        /* 只把真人说的话当"这一轮的请求"；runtime-context / time-context / skill-catalog 是系统注入的 */
        if (kind === 'user') {
          const cur = S.turnRec[S.turnRec.length - 1]
          if (cur && !cur.end && !cur.prompt) cur.prompt = clip(txt, 60)
          else S.pendingPrompt = clip(txt, 60)
        }
        addLog('user', kind === 'user' ? 'user' : kind, txt)
        break
      }
      case 'assistant/message': {
        S.turn = d.turn || S.turn; S.step = d.step || S.step
        const u = d.usage
        if (u) {
          S.tok.in += u.inputTokens || 0
          S.tok.out += u.outputTokens || 0
          S.tok.cache += u.cacheReadTokens || 0
          S.ctxUsed = u.totalTokens || S.ctxUsed
          S.prevAssistant = S.lastAssistant
          S.lastAssistant = e.time
          S.lastOut = u.outputTokens || 0
        }
        const blocks = (d.message && d.message.content) || []
        const txt = textOf(blocks)
        if (txt) { S.text = clip(txt, 160); addLog('session', 'assistant', clip(txt, 90)) }
        break
      }
      case 'tool/call': {
        S.toolCount++
        const rec = { name: d.name, args: shortArgs(d.arguments).slice(0, 40), t: e.time, ms: null, ok: true, id: d.callId, turn: d.turn || 0, step: d.step || 0 }
        S.tools.push(rec)
        if (S.tools.length > 1500) S.tools.shift()
        /* 常驻记忆：全程每次调用的时间点（给环上的淡痕），以及按工具的累计 */
        S.ticks.push(e.time)
        if (S.ticks.length > 1500) S.ticks.shift()
        const agg = S.toolAgg[d.name] || (S.toolAgg[d.name] = { name: d.name, count: 0, ms: 0, fail: 0, last: 0 })
        agg.count++; agg.last = e.time
        const curT = S.turnRec[S.turnRec.length - 1]
        if (curT) curT.tools++
        byCall.set(d.callId, rec)
        S.pending.add(d.callId)
        if (d.name === 'skill') {
          let nm = 'skill'
          try { nm = JSON.parse(d.arguments).name || nm } catch (err) { }
          const sk = S.skills.find((s) => s.name === nm)
          if (sk) { sk.uses++; sk.last = e.time } else S.skills.push({ name: nm, uses: 1, last: e.time })
        }
        if (d.name === 'subagent' || d.name === 'subagent_fork') S.subagents++
        rec.entry = addLog('tool', d.name, shortArgs(d.arguments), null, true)
        break
      }
      case 'tool/result': {
        // 注意：调用 id 藏在 message.source.callId 里，data 顶层没有 toolCallId
        const rid = d.toolCallId
          || (d.message && d.message.source && d.message.source.callId)
          || (d.message && d.message.toolCallId) || ''
        const rec = byCall.get(rid)
        if (rid) S.pending.delete(rid)
        const bad = !!(d.message && d.message.isError)
        if (bad) S.errs++
        if (rec) {
          rec.ms = e.time - rec.t; rec.ok = !bad
          if (rec.entry) { rec.entry.ms = rec.ms; rec.entry.ok = !bad }
          const agg = S.toolAgg[rec.name]
          if (agg) { if (rec.ms != null) agg.ms += rec.ms; if (bad) agg.fail++ }
        }
        break
      }
      case 'job/registered': {
        const j = { id: d.jobId, kind: d.kind || 'job', label: clip(d.label, 64), state: 'RUN', t: d.startedAt || e.time, end: 0, turn: NOWTURN }
        S.jobs.push(j); byJob.set(d.jobId, j)
        addLog('task', d.kind || 'job', j.label)
        break
      }
      case 'job/settled': {
        const j = byJob.get(d.jobId)
        if (j) { j.state = d.status || 'DONE'; j.end = d.finishedAt || e.time }
        addLog('task', d.kind || 'job', 'settled · ' + (d.status || ''))
        break
      }
      case 'approval/asked':
        S.approvals++
        S.approvalsList.push({ t: e.time, id: d.id, tool: d.toolName || '', outcome: '' })
        addLog('state', 'approval', d.toolName + ' · ' + clip(d.reason || '', 60))
        break
      case 'approval/decided': {
        const ap = S.approvalsList.filter(function (x) { return x.id === d.id })[0]
        if (ap) ap.outcome = d.outcome || 'done'
        else S.approvalsList.push({ t: e.time, id: d.id, tool: '', outcome: d.outcome || 'done' })
        break
      }
      case 'workspace/changes':
        S.changes.push({ t: e.time, turn: d.turn || NOWTURN })
        break
      case 'todo/write':
        S.todos = Array.isArray(d.todos) ? d.todos.length : S.todos
        addLog('state', 'todo', S.todos + ' 项待办')
        break
      case 'deliverables/presented': {
        const nf = Array.isArray(d.files) ? d.files.length : 0
        S.files += nf
        S.delivs.push({ t: e.time, turn: d.turn || NOWTURN, n: nf })
        const curD = S.turnRec[S.turnRec.length - 1]
        if (curD) curD.files += nf
      }
        addLog('state', 'present', S.files + ' 个文件')
        break
      default: break
    }
  }
  if (S.jobs.length > 200) S.jobs = S.jobs.slice(-200)
  if (S.steps.length > 1200) S.steps = S.steps.slice(-1200)
  S.turnsList = S.turnRec.slice(-60)
  delete S.turnRec
  delete S.pendingPrompt
  S.toolStats = Object.keys(S.toolAgg).map(function (k) { return S.toolAgg[k] })
    .sort(function (a, b) { return b.count - a.count })
  delete S.toolAgg
  /* 最后一步还开着就不补 end —— 页面按「现在」算，这样它是会继续长的 */
  if (S.log.length > 300) S.log = S.log.slice(-300)
  return S
}

/* ---------------- 缓存 + 轮询 + 重放 ---------------- */
let cache = { key: '', at: 0, state: null, error: null }
let EVENTS = { key: '', list: [] }
/* REPLAY：把会话自己的历史按虚拟时钟快进播放
   t0/t1 = 首末事件时间；elapsed = 已播放的真实毫秒；vtime = t0 + elapsed*speed */
let REPLAY = null

function replayAdvance() {
  if (!REPLAY) return
  const nowMs = Date.now()
  const dt = nowMs - REPLAY.lastTick
  REPLAY.lastTick = nowMs
  if (!REPLAY.playing) return
  if (REPLAY.mode === 'seq') {
    /* 事件序列：每 stepMs 走一条事件，事件之间的真实间隔一律不保留 */
    REPLAY.elapsed += dt
    const k = Math.floor(REPLAY.elapsed / REPLAY.stepMs)
    if (k > 0) {
      REPLAY.elapsed -= k * REPLAY.stepMs
      REPLAY.idx = Math.min(REPLAY.total - 1, REPLAY.idx + k)
      if (REPLAY.idx >= REPLAY.total - 1) REPLAY.playing = false
    }
  } else {
    REPLAY.elapsed += dt * REPLAY.speed
  }
}
function replayVTime() {
  if (!REPLAY) return 0
  if (REPLAY.mode === 'seq') return REPLAY.vtime || REPLAY.t0
  const v = REPLAY.t0 + REPLAY.elapsed
  if (v >= REPLAY.t1) {
    REPLAY.playing = false
    REPLAY.elapsed = REPLAY.t1 - REPLAY.t0
    return REPLAY.t1
  }
  return v
}

function refresh(force) {
  const s = pickSession()
  if (!s) { cache = { key: '', at: Date.now(), state: null, error: '找不到会话日志（工作区不匹配？）' }; return cache }
  const st = fs.statSync(s.file)
  const key = s.id + ':' + st.size + ':' + st.mtimeMs
  if (!force && key === cache.key && !REPLAY) return cache
  try {
    let events
    if (EVENTS.key === key) events = EVENTS.list
    else {
      const raw = zlib.zstdDecompressSync(fs.readFileSync(s.file)).toString('utf8')
      events = []
      for (const line of raw.split('\n')) {
        if (!line) continue
        try { events.push(JSON.parse(line)) } catch (e) { }
      }
      EVENTS = { key, list: events }
    }
    /* 重放：只喂「虚拟时钟之前」的事件 */
    let use = events
    let vtime = 0
    if (REPLAY) {
      replayAdvance()
      if (REPLAY.mode === 'seq') {
        use = events.slice(0, REPLAY.idx + 1)
        let vt = REPLAY.t0
        for (let k = use.length - 1; k >= 0; k--) {
          if (typeof use[k].time === 'number') { vt = use[k].time; break }
        }
        REPLAY.vtime = vt
        vtime = vt
      } else {
        vtime = replayVTime()
        use = events.filter((e) => typeof e.time !== 'number' || e.time <= vtime)
      }
    }
    const S = fold(use)
    S.ok = true
    S.bridge = { port: PORT, polledAt: Date.now(), file: path.basename(path.dirname(s.file)), bytes: st.size, events: use.length }
    S.running = S.turnOpen || S.pending.size > 0
    S.state = !S.turnOpen ? 'IDLE' : (S.pending.size ? 'TOOL'
      : ((Date.now() - S.lastAssistant) < 4000 && !REPLAY ? 'STREAMING' : 'THINKING'))
    S.tps = (S.lastAssistant && S.prevAssistant && S.lastAssistant > S.prevAssistant)
      ? Math.round(S.lastOut / Math.max(0.4, (S.lastAssistant - S.prevAssistant) / 1000)) : 0
    S.ctxPct = S.ctxWin ? Math.min(1, S.ctxUsed / S.ctxWin) : 0
    S.conc = concurrency(S.tools, 120000)
    S.pendingIds = [...S.pending]
    delete S.pending
    cache = { key, at: Date.now(), state: S, error: null }
  } catch (e) {
    cache = { key, at: Date.now(), state: cache.state, error: String(e.message || e) }
  }
  return cache
}

/* ---------------- HTTP ---------------- */
const server = http.createServer((req, res) => {
  const full = req.url || '/'
  const url = full.split('?')[0]
  const q = new URLSearchParams(full.split('?')[1] || '')
  const json = (obj) => {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(obj))
  }
  /* 救急：把浏览器里还开着的那一页 DOM 存回磁盘（instrument.html 被误覆盖时用） */
  if (req.method === 'POST' && url === '/savehtml') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      try {
        fs.writeFileSync(path.join(__dirname, 'instrument.recovered.html'), body, 'utf8')
        json({ ok: true, bytes: body.length })
      } catch (e) { res.writeHead(500); res.end(String(e.message)) }
    })
    return
  }

  if (url === '/state') {
    const c = refresh(false)
    const body = c.state || { ok: false, error: c.error }
    body.autoFollow = !CURRENT
    if (REPLAY) {
      const vt = replayVTime()
      body.replay = {
        on: true, mode: REPLAY.mode, playing: REPLAY.playing, speed: REPLAY.speed,
        stepMs: REPLAY.stepMs, idx: REPLAY.idx, total: REPLAY.total,
        t0: REPLAY.t0, t1: REPLAY.t1, vtime: vt,
        pct: REPLAY.mode === 'seq'
          ? (REPLAY.total > 1 ? REPLAY.idx / (REPLAY.total - 1) : 0)
          : (REPLAY.t1 > REPLAY.t0 ? (vt - REPLAY.t0) / (REPLAY.t1 - REPLAY.t0) : 0),
        done: REPLAY.mode === 'seq' ? REPLAY.idx >= REPLAY.total - 1 : vt >= REPLAY.t1
      }
    } else body.replay = { on: false }
    json(body)
    return
  }
  /* 某个工具的最近几次调用（含完整参数，按需拉，不进 /state 免得放大轮询） */
  if (url === '/calls') {
    const tool = q.get('tool') || ''
    const lim = Math.min(40, Number(q.get('limit') || 8))
    refresh(false)
    const list = EVENTS.list || []
    const out = []
    for (let k = list.length - 1; k >= 0 && out.length < lim; k--) {
      const e = list[k]
      if (e.type !== 'tool/call' || !e.data || e.data.name !== tool) continue
      out.push({
        t: e.time, turn: e.data.turn, step: e.data.step,
        args: shortArgs(e.data.arguments, 240)
      })
    }
    json({ tool, calls: out })
    return
  }
  /* 重放：把选中会话的历史按虚拟时钟快进
     /replay?action=start|pause|resume|restart|stop&speed=50 */
  if (url === '/replay') {
    const act = q.get('action') || 'start'
    if (act === 'stop') {
      REPLAY = null
      cache = { key: '', at: 0, state: null, error: null }
      json({ ok: true, replay: { on: false } })
      return
    }
    if (!REPLAY || act === 'start' || act === 'restart') {
      if (act === 'start' && !q.get('speed')) { /* 沿用已有速度 */ }
      refresh(!REPLAY)
      const list = EVENTS.list || []
      if (!list.length) { json({ ok: false, error: '这个会话没有事件可重放' }); return }
      const timed = list.filter((e) => typeof e.time === 'number')
      const t0 = timed.length ? timed[0].time : Date.now()
      const t1 = timed.length ? timed[timed.length - 1].time : t0
      const speed = Math.max(1, Math.min(2000, Number(q.get('speed') || (REPLAY ? REPLAY.speed : 50)) || 50))
      const mode = q.get('mode') || (REPLAY ? REPLAY.mode : 'seq')
      const stepMs = Math.max(16, Math.min(3000, Number(q.get('step') || (REPLAY ? REPLAY.stepMs : 110)) || 110))
      REPLAY = {
        mode, t0, t1, speed, stepMs, total: list.length, idx: 0,
        playing: true, elapsed: 0, lastTick: Date.now(), vtime: t0
      }
    } else {
      if (act === 'pause' && REPLAY.playing) { replayAdvance(); REPLAY.playing = false }
      if (act === 'resume' && !REPLAY.playing) { REPLAY.playing = true; REPLAY.lastTick = Date.now() }
      const sp = Number(q.get('speed') || 0)
      if (sp) REPLAY.speed = Math.max(1, Math.min(2000, sp))
      const st = Number(q.get('step') || 0)
      if (st) REPLAY.stepMs = Math.max(16, Math.min(3000, st))
    }
    cache = { key: '', at: 0, state: null, error: null }
    const c = refresh(true)
    const vt = replayVTime()
    json({
      ok: !!c.state,
      replay: {
        on: true, playing: REPLAY.playing, speed: REPLAY.speed, t0: REPLAY.t0, t1: REPLAY.t1,
        vtime: vt, pct: REPLAY.t1 > REPLAY.t0 ? (vt - REPLAY.t0) / (REPLAY.t1 - REPLAY.t0) : 0,
        done: vt >= REPLAY.t1
      }
    })
    return
  }
  /* 会话列表：跨工作区，最近写盘的在前 */
  if (url === '/sessions') {
    json({ sessions: listSessions(40), current: (refresh(false).state || {}).session || null, auto: !CURRENT })
    return
  }
  /* 切换会话：?session=<id 或空=自动跟最新> */
  if (url === '/select') {
    const id = q.get('session') || ''
    CURRENT = id ? 'session-' + id.replace(/^session-/, '') : null
    REPLAY = null                    /* 换会话就退出重放 */
    cache = { key: '', at: 0, state: null, error: null }
    const c = refresh(true)
    json({ ok: !!c.state, current: c.state ? c.state.session : null, auto: !CURRENT, error: c.error })
    return
  }
  if (url === '/' || url === '/index.html' || url === '/instrument.html') {
    fs.readFile(PAGE, (err, buf) => {
      if (err) { res.writeHead(500); res.end('instrument.html 读不到: ' + err.message); return }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(buf)
    })
    return
  }
  res.writeHead(404); res.end('not found')
})

refresh(true)
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log('端口 ' + PORT + ' 已被占用 —— 桥可能已经在跑了，直接开 http://127.0.0.1:' + PORT)
    process.exit(0)
  }
  throw e
})
server.listen(PORT, '127.0.0.1', () => {
  const s = cache.state
  console.log('bridge  → http://127.0.0.1:' + PORT)
  console.log('session→ ' + (s ? s.session.id : '未找到') + (s ? '  turn ' + s.turn + ' step ' + s.step : ''))
  if (cache.error) console.log('warning→ ' + cache.error)
})
