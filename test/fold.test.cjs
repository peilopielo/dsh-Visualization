/* fold.cjs 的单元测试：node --test test/ */
const test = require('node:test')
const assert = require('node:assert')
const zlib = require('node:zlib')
const path = require('node:path')

const core = require(path.join(__dirname, '..', 'fold.cjs'))

test('zstdFrames 能切出多个帧，unzstdAll 全部解开', () => {
  const a = Buffer.from(JSON.stringify({ type: 'session', id: 'x1' }) + '\n', 'utf8')
  const b = Buffer.from(JSON.stringify({ type: 'turn/start', turn: 1 }) + '\n', 'utf8')
  const buf = Buffer.concat([zlib.zstdCompressSync(a), zlib.zstdCompressSync(b)])

  const frames = core.zstdFrames(buf)
  assert.strictEqual(frames.length, 2, '应当正好两帧')

  const text = core.unzstdAll(buf).toString('utf8')
  assert.match(text, /session/, '第一帧内容要解开')
  assert.match(text, /turn\/start/, '第二帧内容要解开')
})

test('makeFolder 统计轮次与工具调用', () => {
  const f = core.makeFolder()
  f.push({ type: 'session', time: 1, data: { id: 's1' } })
  f.push({ type: 'turn/start', time: 2, data: { turn: 1 } })
  f.push({ type: 'tool/call', time: 3, data: { name: 'read', callId: 'c1' } })
  f.push({ type: 'tool/result', time: 4, data: { name: 'read', ok: true }, message: { source: { callId: 'c1' } } })
  const S = f.result()
  assert.strictEqual(S.turn, 1)
  assert.ok(S.toolCount >= 1, '至少要数到一次工具调用')
})

test('团队事件：成员与任务都被解析', () => {
  const f = core.makeFolder()
  f.push({ type: 'team/mode', time: 1, data: { enabled: true } })
  f.push({ type: 'team/member', time: 2, data: { teamId: 't1', member: { id: 'm1', name: '前端', phase: 'active' } } })
  f.push({ type: 'team/task', time: 3, data: { teamId: 't1', task: { id: '1', revision: 1, subject: '改面板', status: 'in_progress', blockedBy: [], writeScopes: [], ownerId: 'm1' } } })
  const S = f.result()
  assert.strictEqual(S.team.enabled, true)
  assert.strictEqual(S.team.members.length, 1)
  assert.strictEqual(S.team.members[0].name, '前端')
  assert.strictEqual(S.team.tasks[0].status, 'in_progress')
  assert.strictEqual(S.team.tasks[0].ownerId, 'm1')
})

test('坏事件只记告警，不让整份状态崩掉', () => {
  const f = core.makeFolder()
  f.push({ type: 'turn/start', time: 1, data: { turn: 1 } })
  /* null 事件：读 e.type 就会抛，必须被 pushSafe 兜住 */
  f.push(null)
  const S = f.result()
  assert.strictEqual(S.turn, 1, '坏事件之前的状态要保住')
  assert.ok(S.warn && S.warn.count >= 1, '要记录告警次数')
  assert.strictEqual(S.warn.lastType, '?')
})

test('model/selection 解析出模型、供应商与推理强度，并记入 modelHist', () => {
  const f = core.makeFolder()
  f.push({ type: 'session', time: 1, data: { id: 's1' } })
  f.push({ type: 'turn/start', time: 2, data: { turn: 1 } })
  f.push({ type: 'model/selection', time: 3, data: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'max' } })
  let S = f.result()
  assert.strictEqual(S.provider, 'deepseek-account')
  assert.strictEqual(S.model, 'deepseek-flash')
  assert.strictEqual(S.effort, 'max')
  assert.strictEqual(S.modelHist.length, 1, '第一次选择要记一条')
  assert.strictEqual(S.modelHist[0].turn, 1)

  /* 第二轮换供应商 + 模型：必须再记一条，且字段更新 */
  f.push({ type: 'turn/start', time: 4, data: { turn: 2 } })
  f.push({ type: 'model/selection', time: 5, data: { provider: 'opencode-go', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' } })
  S = f.result()
  assert.strictEqual(S.provider, 'opencode-go')
  assert.strictEqual(S.model, 'deepseek-v4.1-flash')
  assert.strictEqual(S.effort, 'high')
  assert.strictEqual(S.modelHist.length, 2)
  assert.strictEqual(S.modelHist[1].turn, 2)
  assert.strictEqual(S.modelHist[1].provider, 'opencode-go')
})

test('只改推理强度也算一次模型变更', () => {
  const f = core.makeFolder()
  f.push({ type: 'turn/start', time: 1, data: { turn: 1 } })
  f.push({ type: 'model/selection', time: 2, data: { provider: 'p', model: 'm', reasoningEffort: 'low' } })
  f.push({ type: 'model/selection', time: 3, data: { provider: 'p', model: 'm', reasoningEffort: 'max' } })
  const S = f.result()
  assert.strictEqual(S.effort, 'max')
  assert.strictEqual(S.modelHist.length, 2, '强度变化也要留痕')
})

test('request/context 仍然补模型与上下文窗口', () => {
  const f = core.makeFolder()
  f.push({ type: 'request/context', time: 1, data: { contextWindow: 1000000, model: 'deepseek-v4.1-flash', provider: 'opencode-go' } })
  const S = f.result()
  assert.strictEqual(S.ctxWin, 1000000)
  assert.strictEqual(S.model, 'deepseek-v4.1-flash')
  assert.strictEqual(S.provider, 'opencode-go')
})

test('上下文压缩：轮次、裁掉的 token、摘要都能读出来', () => {
  const f = core.makeFolder()
  f.push({ type: 'turn/start', time: 1, data: { turn: 77 } })
  f.push({ type: 'compaction/start', time: 2, data: { compactionId: 'c1', turn: 77 } })
  f.push({ type: 'compaction/prune', time: 3, data: { shadowedTokenCount: 2917 } })
  f.push({ type: 'compaction/prune', time: 4, data: { shadowedTokenCount: 1000 } })
  f.push({ type: 'compaction/summary', time: 5, data: { compactionId: 'c1', summary: [{ type: 'text', text: '## 摘要：主线是运维' }] } })
  f.push({ type: 'compaction/end', time: 6, data: { compactionId: 'c1', turn: 77 } })
  const S = f.result()
  assert.strictEqual(S.compactions.length, 1)
  assert.strictEqual(S.compactions[0].turn, 77, '压缩发生在第 77 轮')
  assert.strictEqual(S.compactions[0].pruned, 3917, '两次 prune 要累加')
  assert.strictEqual(S.prunedTokens, 3917)
  assert.match(S.compactions[0].summary, /运维/, '摘要要留下')
  assert.strictEqual(S.compactions[0].done, true)
})

test('模型失败尝试：从 assistant/attempt 的 stream 里识别错误', () => {
  const f = core.makeFolder()
  f.push({
    type: 'assistant/attempt', time: 1,
    data: { turn: 9, step: 1, stream: [{ type: 'chunk', chunk: { type: 'finish', reason: { kind: 'error', failure: { message: '400 region blocked', code: 'INVALID_REQUEST' } } } }] },
  })
  let S = f.result()
  assert.strictEqual(S.llmErrors, 1)
  assert.match(S.lastError, /region blocked/)

  /* 正常结束的 attempt 不算失败 */
  f.push({
    type: 'assistant/attempt', time: 2,
    data: { turn: 9, step: 2, stream: [{ type: 'chunk', chunk: { type: 'finish', reason: { kind: 'stop' } } }] },
  })
  S = f.result()
  assert.strictEqual(S.llmErrors, 1, '正常结束不应增加失败数')
})

test('运行时模式：沙箱、权限档、计划模式', () => {
  const f = core.makeFolder()
  f.push({ type: 'sandbox/mode', time: 1, data: { mode: 'danger-full-access' } })
  f.push({ type: 'permission/preset', time: 2, data: { preset: 'workspace-write' } })
  f.push({ type: 'plan/mode', time: 3, data: { enabled: true } })
  f.push({ type: 'llm/retry', time: 4, data: {} })
  const S = f.result()
  assert.strictEqual(S.sandbox, 'danger-full-access')
  assert.strictEqual(S.permission, 'workspace-write')
  assert.strictEqual(S.planMode, true)
  assert.strictEqual(S.retries, 1)
})
