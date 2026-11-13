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
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const zlib = require('node:zlib')

const PORT = 0
/* CURRENT = 当前盯着的会话 id；null 表示"自动跟最新"。可以在页面上切换。 */
let CURRENT = null
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const SESSIONS_ROOT = process.env.DSHVIZ_SESSIONS_ROOT || path.join(DSH_HOME, 'sessions')
/* 老一些的 Node 没有 zstd API（22.15 才有）；没有就给出人话，而不是 TypeError */
const HAS_ZSTD = typeof zlib.zstdDecompressSync === 'function'
const PROJ_CACHE = path.join(DSH_HOME, 'storages', 'session_projcache', 'sessions')
/* 显示选项：跟着插件走，不跟着浏览器——面板、壁纸、任意浏览器共用同一份 */
const PREFS_FILE = path.join(DSH_HOME, 'dsh-visualization-prefs.json')
const PAGE = path.join(__dirname, 'web', 'index.html')


/* 日志是「多帧 zstd」追加写的：较老的 Node 的 zstdDecompressSync 只解第一帧。
   这里按 zstd 帧头魔数 28 B5 2F FD 切开，逐帧解压再拼起来。 */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/* 按 RFC 8878 走一遍帧结构，得到精确边界（不再靠扫魔数猜）：
   帧头 = 魔数(4) + FHD(1) + [Window_Descriptor] + [Dictionary_ID] + [Frame_Content_Size]
   块   = 3 字节块头 + 块体（RLE 块只有 1 字节）+ ... 直到 Last_Block
   末尾可能还有 4 字节 content checksum。
   解析不动数据，只算长度；遇到写了一半的尾帧就停在那里。 */
function zstdFrameEnd(buf, off) {
  if (off + 5 > buf.length) return -1
  if (buf[off] !== 0x28 || buf[off + 1] !== 0xb5 || buf[off + 2] !== 0x2f || buf[off + 3] !== 0xfd) return -1
  let p = off + 4
  const fhd = buf[p++]
  const fcsFlag = fhd >> 6
  const singleSegment = (fhd >> 5) & 1
  const hasChecksum = (fhd >> 2) & 1
  const dictFlag = fhd & 3
  if (!singleSegment) p += 1
  p += [0, 1, 2, 4][dictFlag]
  p += (fcsFlag === 0) ? (singleSegment ? 1 : 0) : [2, 4, 8][fcsFlag - 1]
  if (p > buf.length) return -1
  for (;;) {
    if (p + 3 > buf.length) return -1
    const h = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16)
    p += 3
    const last = h & 1
    const type = (h >> 1) & 3
    const size = h >>> 3
    if (type === 3) return -1                 /* 保留类型，说明这不是合法的块头 */
    p += (type === 1) ? 1 : size              /* RLE 块在流里只占 1 字节 */
    if (p > buf.length) return -1
    if (last) break
  }
  if (hasChecksum) p += 4
  if (p > buf.length) return -1
  return p
}

/* 返回 [{start, end}]，解析不了就停（尾帧没写完就是这种情况） */
function zstdFrames(buf) {
  const out = []
  let off = 0
  while (off + 5 <= buf.length) {
    const end = zstdFrameEnd(buf, off)
    if (end < 0) break
    out.push({ start: off, end: end })
    off = end
  }
  return out
}

/* 兼容旧接口：只要起始位置 */
function zstdFrameHeads(buf) {
  const fr = zstdFrames(buf)
  return fr.length ? fr.map(function (f) { return f.start }) : [0]
}
function unzstdAll(buf) {
  const frames = zstdFrames(buf)
  if (frames.length <= 1) return zlib.zstdDecompressSync(buf)
  const parts = []
  for (const f of frames) {
    try { parts.push(zlib.zstdDecompressSync(buf.slice(f.start, f.end))) } catch (e) {
      /* 单帧损坏就跳过它，别让整份日志都读不出来 */
    }
  }
  return Buffer.concat(parts)
}

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
/* 会话日志文件名带版本号（session.v4.jsonl.zstd）。DSH 升版后不要直接失效，
   取目录里版本号最大的那个。 */
function logFileOf(dirPath) {
  let best = null, bestV = -1
  try {
    const names = fs.readdirSync(dirPath)
    for (const nm of names) {
      const m = /^session\.v(\d+)\.jsonl\.zstd$/.exec(nm)
      if (!m) continue
      const v = Number(m[1])
      if (v > bestV) { bestV = v; best = nm }
    }
  } catch (e) { }
  return best ? path.join(dirPath, best) : path.join(dirPath, 'session.v4.jsonl.zstd')
}

function listSessions(limit) {
  const out = []
  let dirs = []
  try { dirs = fs.readdirSync(SESSIONS_ROOT) } catch (e) { return out }
  for (const ws of dirs) {
    let ids = []
    try { ids = fs.readdirSync(path.join(SESSIONS_ROOT, ws)) } catch (e) { continue }
    for (const id of ids) {
      if (!id.startsWith('session-')) continue
      const file = logFileOf(path.join(SESSIONS_ROOT, ws, id))
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
    const file = logFileOf(path.join(SESSIONS_ROOT, ws, want))
    try {
      const st = fs.statSync(file)
      return { id: want, ws, file, mtime: st.mtimeMs }
    } catch (e) { }
  }
  return null
}

/* 自动跟随的"粘性"状态：
   - AUTO.id  当前跟随的会话
   - AUTO.liveAt 它最后一次有写入的时间
   规则：多个会话同时在活动时，不追最新的，咬住当前这个；
        等它安静 AUTO_IDLE_MS 之后才让位给新的活跃会话。 */
const AUTO = { id: null, liveAt: 0, since: 0 }
/* 面板正在显示哪个会话（由 client.js 每秒上报一次）。
   固定端口（壁纸 / 浏览器标签）就跟着它走，不再自己挑"最新的"。 */
const VIEWED = { id: null, at: 0 }
const VIEWED_TTL = 6 * 3600 * 1000   /* 6 小时内有效 */

/* 由宿主事件调用：用户在某会话里发了消息、或在左侧栏选中了它 = 他现在正在这个会话里 */
const META_CACHE = new Map()   /* id → { key, parent } */
/* 子会话的目录名不带 session- 前缀，findById 找不到它们；这里两种都试 */
function locateAnySession(id) {
  const raw = String(id || '').replace(/^session-/, '')
  let dirs = []
  try { dirs = fs.readdirSync(SESSIONS_ROOT) } catch (e) { return null }
  for (const ws of dirs) {
    for (const cand of ['session-' + raw, raw]) {
      const file = logFileOf(path.join(SESSIONS_ROOT, ws, cand))
      try {
        const st = fs.statSync(file)
        return { id: raw, ws, file, mtime: st.mtimeMs, isChild: cand === raw }
      } catch (e) { /* 试下一个 */ }
    }
  }
  return null
}

function sessionParent(id) {
  const hit = locateAnySession(id)
  if (!hit || !hit.file) return null
  if (hit.isChild) return '(subagent)'   /* 目录名没有前缀 = 子会话 */

  /* 主会话也可能自己声明 parentSession（比如是某个会话的子智能体） */
  const hit2 = hit
  let st = null
  try { st = fs.statSync(hit2.file) } catch (e) { return null }
  const key = st.mtimeMs + ':' + st.size
  const cached = META_CACHE.get(id)
  if (cached && cached.key === key) return cached.parent
  const ev = firstSessionEvent(hit2.file)
  const sd = ev && (ev.type === 'session' ? (ev.data || ev) : (ev.data || ev))
  const parent = (sd && sd.parentSession) || null
  META_CACHE.set(id, { key, parent })
  return parent
}

function noteViewed(id) {
  const raw = String(id || '').replace(/^session-/, '')
  if (!/^[0-9a-f][0-9a-f-]{7,}$/i.test(raw)) return false
  const full = 'session-' + raw
  /* 子智能体不是"你在看的会话"——它被派出去干活，不能抢跟随目标 */
  let parent = null
  try { parent = sessionParent(full) } catch (e) { parent = null }
  if (parent) return false
  VIEWED.id = full
  VIEWED.at = Date.now()
  return true
}
const LIVE_MS = 12000       /* 12 秒内有写入 = 正在活动 */
const IDLE_MS = 45000       /* 跟随目标安静 45 秒才换 */

function activeIds(list) {
  const now = Date.now()
  const live = list.filter((s) => now - s.mtime < LIVE_MS)
  return { live, now }
}

function pickSession() {
  if (CURRENT) {
    const hit = findById(CURRENT)
    if (hit) { AUTO.id = null; return hit }
  }
  /* 0) 面板正在看某个会话 → 就跟着它（壁纸、独立浏览器页也一致） */
  if (VIEWED.id && (Date.now() - VIEWED.at) < VIEWED_TTL) {
    const v = findById(VIEWED.id)
    if (v) { AUTO.id = VIEWED.id; return v }
  }

  /* 插件跑在 harness 进程里，cwd 不是用户工作区 —— 跨工作区按最近写盘排序 */
  const list = listSessions(0)
  if (!list.length) return null
  const { live, now } = activeIds(list)

  /* 1) 已有跟随目标：它还在活动，或者安静得不够久 → 咬住不放 */
  if (AUTO.id) {
    const cur = list.find((s) => s.id === AUTO.id)
    if (cur) {
      const quietFor = now - cur.mtime
      const iAmLive = quietFor < LIVE_MS
      if (iAmLive) AUTO.liveAt = cur.mtime
      /* 多个会话同时活动时绝不跳；只有一个活动且我已安静太久才让位 */
      if (iAmLive || quietFor < IDLE_MS) {
        if (live.length > 1 && iAmLive) return findById(cur.id) || cur
        if (iAmLive) return findById(cur.id) || cur
        if (live.length >= 1) return findById(cur.id) || cur
        return findById(cur.id) || cur
      }
    }
    AUTO.id = null
  }

  /* 2) 没目标：挑一个。多会话并发时挑"最新开始活动的那一批里最早的那个"，
        这样拿到手之后就不会因为另一个更活跃而立刻换人。 */
  let pick = list[0]
  if (live.length > 1) {
    const byStart = live.slice().sort((a, b) => a.mtime - b.mtime)
    pick = byStart[0]
  }
  const hit = findById(pick.id)
  if (!hit) return null
  AUTO.id = pick.id
  AUTO.liveAt = pick.mtime
  AUTO.since = now
  return hit
}

/* 给状态页看：当前有几个会话在同时活动 */
function followInfo() {
  const list = listSessions(0)
  const { live } = activeIds(list)
  return {
    auto: !CURRENT,
    viewed: VIEWED.id && (Date.now() - VIEWED.at) < VIEWED_TTL ? VIEWED.id : null,
    live: live.length,
    locked: !CURRENT && live.length > 1,
    following: AUTO.id || (CURRENT || null),
    liveOnes: live.slice(0, 6).map((s) => ({ id: s.id, ws: s.ws, mtime: s.mtime })),
  }
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

function makeFolder() {
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

  const push = function (e) {
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
  /* 输出：字段照旧，但不在累加器上做破坏性删除 —— 这样同一个折叠器可以一直 push 下去 */
  const result = function () {
    const out = {}
    for (const k in S) {
      if (k === 'turnRec' || k === 'pendingPrompt' || k === 'toolAgg') continue
      out[k] = S[k]
    }
    out.jobs = S.jobs.length > 200 ? S.jobs.slice(-200) : S.jobs
    out.steps = S.steps.length > 1200 ? S.steps.slice(-1200) : S.steps
    out.log = S.log.length > 300 ? S.log.slice(-300) : S.log
    out.turnsList = S.turnRec.slice(-60)
    out.toolStats = Object.keys(S.toolAgg).map(function (k) { return S.toolAgg[k] })
      .sort(function (a, b) { return b.count - a.count })
    return out
  }

  return { push: push, result: result }
}

/* 全量折叠（重放、测试用）；线上走增量 */
function fold(events) {
  const f = makeFolder()
  for (const e of events) f.push(e)
  return f.result()
}

/* ---------------- 缓存 + 轮询 + 重放 ---------------- */
let cache = { key: '', at: 0, state: null, error: null }
let EVENTS = { key: '', list: [], file: '', frames: 0 }
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

/* 增量折叠：日志只追加时，把新事件 push 进已有的折叠器，不必重扫全部历史 */
let FOLDER = null
let FOLDED = 0

function refresh(force, sessionId) {
  const s = sessionId ? (findById(sessionId) || pickSession()) : pickSession()
  if (!s) {
    let why
    try {
      if (!fs.existsSync(SESSIONS_ROOT)) why = '还没找到 DSH 会话目录（' + SESSIONS_ROOT + '），确认 DSH_HOME 是否正确'
      else if (!fs.readdirSync(SESSIONS_ROOT).length) why = '会话目录是空的 —— 先在这个 profile 里跑一轮对话'
      else why = '这些会话里还没有可读的日志 —— 先跑一轮对话'
    } catch (e) { why = String(e.message || e) }
    cache = { key: '', at: Date.now(), state: null, error: why }
    return cache
  }
  if (!HAS_ZSTD) {
    cache = {
      key: '', at: Date.now(), state: null,
      error: '这个运行环境不支持 zstd 解压（需要 Node ≥ 22.15），DSH VISUALIZATION 读不了会话日志。Node 版本：' +
        process.version,
    }
    return cache
  }
  const st = fs.statSync(s.file)
  const key = s.id + ':' + st.size + ':' + st.mtimeMs
  if (!force && key === cache.key && !REPLAY) return cache
  try {
    let events
    let readFrom = -1          /* -1 = 没读盘（命中缓存）；0 = 整份重读；>0 = 只追加 */
    if (EVENTS.key === key) events = EVENTS.list
    else {
      /* 日志是多帧追加的：只解「上次之后新追加的帧」，不必每次啃完 14MB */
      const buf = fs.readFileSync(s.file)
      const frames = zstdFrames(buf)
      const heads = frames.length ? frames.map(function (f) { return f.start }) : [0]
      const sameFile = EVENTS.file === s.file
      const canAppend = sameFile && EVENTS.frames > 0 && heads.length >= EVENTS.frames
      const from = canAppend ? EVENTS.frames : 0
      readFrom = from
      const keep = canAppend ? EVENTS.list.length : 0
      const list = canAppend ? EVENTS.list : []
      if (!canAppend) list.length = 0
      const chunks = []
      let used = 0, parseFails = 0
      for (let i = from; i < heads.length; i++) {
        const stop = frames.length ? frames[i].end : buf.length
        const seg = buf.slice(heads[i], stop)
        try {
          chunks.push(zlib.zstdDecompressSync(seg))
          used++
        } catch (e) {
          break   /* 尾帧还没写完：停在这里，下次从这一帧继续 */
        }
      }
      const text = chunks.length ? Buffer.concat(chunks).toString('utf8') : ''
      for (const line of text.split('\n')) {
        if (!line) continue
        try { list.push(JSON.parse(line)) } catch (e) { parseFails++ }
      }
      events = list
      /* 帧是按魔数切出来的，理论上可能切错。发现解析失败就整包再解一次，
         取数量多的那一份 —— 宁可慢一次，也不静默丢事件。 */
      if (parseFails > 0) {
        try {
          const whole = zlib.zstdDecompressSync(buf).toString('utf8')
          const alt = []
          for (const line of whole.split('\n')) {
            if (!line) continue
            try { alt.push(JSON.parse(line)) } catch (e) { }
          }
          if (alt.length > list.length) {
            events = alt
            EVENTS = { key: EVENTS.key, list: alt, file: s.file, frames: 0 }
            addLog && 0
          }
        } catch (e) { }
      }
      if (events !== list) { /* 已经换成整包结果 */ }
      else EVENTS = { key, list: list, file: s.file, frames: from + used }
      /* 文件很大却只解析出个位数事件 = 撞上写入窗口，别缓存这次结果 */
      if (events.length < 5 && st.size > 50000) throw new Error('会话日志正在写入（读到 ' + events.length + ' 条），稍后重试')
      if (keep === 0 && events.length === 0) throw new Error('会话日志还是空的')
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
    let S
    if (REPLAY) {
      S = fold(use)                       /* 重放喂的是切片，只能整体折 */
    } else {
      if (!FOLDER || FOLDED > events.length || readFrom === 0) { FOLDER = makeFolder(); FOLDED = 0 }
      for (let i = FOLDED; i < events.length; i++) FOLDER.push(events[i])
      FOLDED = events.length
      S = FOLDER.result()
    }
  /* 压包体：页面只用得到这几个字段（args 走 /calls 按需拉） */
  if (S.tools) {
    S.tools = S.tools.map(function (x) {
      return { name: x.name, t: x.t, ms: x.ms, ok: x.ok, turn: x.turn, step: x.step }
    })
  }
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
/* 真实 http origin（桌面端是 dsh-app:// 协议，浏览器打不开） */
let ORIGIN = ''
function setOrigin(o) { ORIGIN = String(o || '').replace(/\/+$/, '') }

/* 响应体：会话状态 + 自动跟随标记 + 重放射影 */
/* ---------------- 子智能体（子会话） ----------------
   子会话的目录名是不带 session- 前缀的 uuid，第一条事件里带 parentSession。
   这里按 parentSession 找子会话，只折它自己（几百 KB 级，很轻），结果按 mtime+size 缓存。 */
const CHILD_CACHE = new Map()

function firstSessionEvent(file) {
  try {
    /* 只需要第一帧：读前 512KB 就够（一帧装不下时会退化成整文件） */
    let buf
    try {
      const fd = fs.openSync(file, 'r')
      const head = Buffer.alloc(Math.min(524288, fs.fstatSync(fd).size))
      fs.readSync(fd, head, 0, head.length, 0)
      fs.closeSync(fd)
      buf = head
    } catch (e) { buf = fs.readFileSync(file) }
    let frames = zstdFrames(buf)
    if (!frames.length) { buf = fs.readFileSync(file); frames = zstdFrames(buf) }
    if (!frames.length) return null
    const text = zlib.zstdDecompressSync(buf.slice(frames[0].start, frames[0].end)).toString('utf8')
    const first = text.split('\n')[0]
    return first ? JSON.parse(first) : null
  } catch (e) { return null }
}

function childSessionsOf(parentId) {
  if (!parentId) return []
  const out = []
  let dirs = []
  try { dirs = fs.readdirSync(SESSIONS_ROOT) } catch (e) { return out }
  for (const ws of dirs) {
    const wsd = path.join(SESSIONS_ROOT, ws)
    let ids = []
    try { ids = fs.readdirSync(wsd) } catch (e) { continue }
    for (const id of ids) {
      if (id.startsWith('session-')) continue          /* 主会话 */
      if (out.length >= 24) break
      const dir = path.join(wsd, id)
      let file = null
      try { file = logFileOf(dir) } catch (e) { continue }
      if (!file) continue
      const ev = firstSessionEvent(file)
      if (!ev) continue
      const sd = ev.type === 'session' ? (ev.data || ev) : (ev.data || ev)
      if (sd.parentSession !== parentId) continue
      out.push({ id: sd.id || id, file, depth: sd.delegationDepth || 1, preset: sd.agentPreset || '', createdAt: sd.createdAt || 0 })
    }
  }
  return out
}

function childStats(entry) {
  let st = null
  try { st = fs.statSync(entry.file) } catch (e) { return null }
  const key = st.mtimeMs + ':' + st.size
  const hit = CHILD_CACHE.get(entry.id)
  if (hit && hit.key === key) return hit.data

  let data = {
    id: entry.id, preset: entry.preset, depth: entry.depth,
    turn: null, step: 0, tools: 0, steps: 0, errs: 0,
    ctx: 0, tokIn: 0, tokOut: 0, state: '', model: '',
    last: 0, running: false,
  }
  try {
    const buf = fs.readFileSync(entry.file)
    const text = unzstdAll(buf).toString('utf8')
    const f = makeFolder()
    for (const line of text.split('\n')) {
      if (!line) continue
      let ev2 = null
      try { ev2 = JSON.parse(line) } catch (e) { continue }
      if (!ev2 || !ev2.type) continue
      f.push(ev2)
      if (ev2.time && ev2.time > data.last) data.last = ev2.time
    }
    const S2 = f.result()
    data.turn = S2.turn
    data.tools = S2.toolCount || 0
    data.steps = (S2.sSteps || []).length
    data.errs = S2.errs || 0
    data.ctx = S2.ctxPct || 0
    data.tokIn = (S2.tok && S2.tok.in) || 0
    data.tokOut = (S2.tok && S2.tok.out) || 0
    data.step = S2.step || 0
    data.model = S2.model || ''
    /* state 不在 result() 里，按 refresh() 同一套规则推：
       pending 工具 → TOOL；刚出过 assistant 文本 → STREAMING；否则 THINKING；回合结束 → IDLE */
    var pend = S2.pending ? S2.pending.size : 0
    data.state = !S2.turnOpen ? 'IDLE'
      : (pend ? 'TOOL'
        : ((Date.now() - (S2.lastAssistant || 0)) < 4000 ? 'STREAMING' : 'THINKING'))
    data.running = !!(S2.turnOpen || pend)
    data.pending = pend
    data.preset = S2.session.preset || data.preset
  } catch (e) { /* 读不了就只报 id */ }

  CHILD_CACHE.set(entry.id, { key, data })
  return data
}

function childrenOf(parentId) {
  return childSessionsOf(parentId).map(childStats).filter(Boolean)
}

function stateBody(c) {
  const body = c.state || { ok: false, error: c.error }
  body.autoFollow = !CURRENT
  try { body.follow = followInfo() } catch (e) { }
  /* 子智能体：派出去的分身（按 parentSession 关联，带缓存） */
  if (body.session && body.session.id) {
    try { body.children = childrenOf(body.session.id) } catch (e) { body.children = [] }
  }
  if (ORIGIN) body.origin = ORIGIN
  if (REPLAY) {
    const vt = replayVTime()
    body.replay = {
      on: true, mode: REPLAY.mode, playing: REPLAY.playing, speed: REPLAY.speed,
      stepMs: REPLAY.stepMs, idx: REPLAY.idx, total: REPLAY.total,
      t0: REPLAY.t0, t1: REPLAY.t1, vtime: vt,
      pct: REPLAY.mode === 'seq'
        ? (REPLAY.total > 1 ? REPLAY.idx / (REPLAY.total - 1) : 0)
        : (REPLAY.t1 > REPLAY.t0 ? (vt - REPLAY.t0) / (REPLAY.t1 - REPLAY.t0) : 0),
      done: REPLAY.mode === 'seq' ? REPLAY.idx >= REPLAY.total - 1 : vt >= REPLAY.t1,
    }
  } else body.replay = { on: false }
  return body
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
function isLoopback(req) {
  const ip = (req.socket && (req.socket.remoteAddress || '')) || ''
  return LOOPBACK.has(ip)
}
let ALLOW_REMOTE = false
let sseClients = 0
function setPolicy(policy) {
  if (policy && typeof policy.allowRemote === 'boolean') ALLOW_REMOTE = policy.allowRemote
}


/* ---------------- 固定端口的"壁纸入口" ----------------
   DSH 的 Web 端口每次启动都会变，壁纸里写死端口就必然失效。
   这里在 127.0.0.1 上开一个固定端口（默认 8799，被占用就依次退），
   只转发到本进程的 handle()，所以壁纸永远访问同一个地址。 */
let HELPER = null

function startHelper(preferredPort) {
  if (HELPER) return HELPER
  const http = require('node:http')
  const base = Number(preferredPort) || 8799
  let attempt = 0
  const tryListen = () => {
    if (attempt > 4) return null
    const port = base - attempt
    attempt++
    const srv = http.createServer((rq, rs) => {
      /* 把根路径映射成插件前缀，handle() 内部按 /dsh-visualization 路由 */
      rq.url = '/dsh-visualization' + (rq.url || '/')
      handle(rq, rs)
    })
    srv.on('error', () => { try { srv.close() } catch (e) { } tryListen() })
    srv.listen(port, '127.0.0.1', () => {
      HELPER = { port: port, server: srv }
      try { console.log('[dsh-visualization] wallpaper entry: http://127.0.0.1:' + port + '/') } catch (e) { }
    })
    return srv
  }
  tryListen()
  return HELPER
}

function helperPort() { return HELPER ? HELPER.port : 0 }

function handle(req, res) {
  if (!ALLOW_REMOTE && !isLoopback(req)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('DSH VISUALIZATION: 只允许本机访问（需要远程访问请在插件配置里打开 allowRemote）')
    return
  }
  const full = (req.url || '/').replace(/^\/dsh-visualization/, '') || '/'
  const url = full.split('?')[0]
  const q = new URLSearchParams(full.split('?')[1] || '')
  const json = (obj) => {
    const body = Buffer.from(JSON.stringify(obj), 'utf8')
    const ae = String(req.headers['accept-encoding'] || '')
    /* 状态里有几千条记录，gzip 能压到 1/5，值得做 */
    if (body.length > 2048 && /\bgzip\b/.test(ae)) {
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-encoding': 'gzip',
        vary: 'accept-encoding',
        'access-control-allow-origin': '*',
      })
      res.end(zlib.gzipSync(body))
      return
    }
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    })
    res.end(body)
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

  /* 面板上报"我现在在看哪个会话" —— 壁纸/独立页面据此跟随 */
  if (url === '/focus') {
    const raw = String(q.get('session') || '').replace(/^session-/, '')
    /* 只收 uuid 形状，而且必须真的存在（页面 URL 里可能带的是工作区 id） */
    const exists = !!(raw && /^[0-9a-f][0-9a-f-]{7,}$/i.test(raw) && findById('session-' + raw))
    if (exists) {
      VIEWED.id = 'session-' + raw
      VIEWED.at = Date.now()
      json({ ok: true, viewed: VIEWED.id })
    } else {
      json({ ok: false, viewed: VIEWED.id, at: VIEWED.at })
    }
    return
  }

  /* 显示选项的读写：GET 返回 JSON，POST 覆盖保存 */
  if (url === '/prefs') {
    if (req.method === 'POST') {
      let body = ''
      let tooBig = false
      req.on('data', (c) => {
        body += c
        if (body.length > 16384) { tooBig = true; req.destroy() }
      })
      req.on('end', () => {
        if (tooBig) return
        try {
          const o = JSON.parse(body)
          if (!o || typeof o !== 'object') throw new Error('not an object')
          fs.writeFileSync(PREFS_FILE, JSON.stringify(o), 'utf8')
          json({ ok: true })
        } catch (e) {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' })
          res.end('{"ok":false}')
        }
      })
      return
    }
    let saved = null
    try { saved = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8')) } catch (e) { saved = null }
    json(saved || {})
    return
  }

  if (url === '/state') {
    const c = refresh(false, q.get('session') || null)
    json(stateBody(c))
    return
  }
  /* SSE：宿主这边一有变化就推，前端不必每 900ms 拉一次 */
  if (url === '/events') {
    if (sseClients >= 8) {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('DSH VISUALIZATION: 同时打开的窗口太多了（上限 8）')
      return
    }
    sseClients++
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    res.write('retry: 2000\n\n')
    const sid = q.get('session') || null
    let last = ''
    let closed = false
    const tick = () => {
      if (closed) return
      try {
        const c = refresh(false, sid)
        const body = stateBody(c)
        /* 变化判据：文件版本 + 重放进度 + 运行状态 —— 没变就不发 */
        const key = String(c.key) + '|' + (REPLAY ? REPLAY.idx : '') + '|' +
          (body.state || '') + '|' + (body.turn || 0) + '|' + (body.step || 0)
        if (key === last) return
        last = key
        res.write('data: ' + JSON.stringify(body) + '\n\n')
      } catch (e) { /* 单次失败不影响连接 */ }
    }
    tick()
    const timer = setInterval(tick, 250)
    const ping = setInterval(() => {
      if (closed) return
      try { res.write(': ping\n\n') } catch (e) { }
    }, 15000)
    req.on('close', () => { closed = true; sseClients = Math.max(0, sseClients - 1); clearInterval(timer); clearInterval(ping) })
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
}

module.exports = {
  handle, listSessions, pickSession, refresh, fold, makeFolder, childrenOf, followInfo, noteViewed,
  setOrigin, setPolicy, startHelper, helperPort, hasZstd: HAS_ZSTD,
}
