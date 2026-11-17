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
