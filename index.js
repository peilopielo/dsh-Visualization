import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)

/* 本地开发时 fold.cjs 会被频繁改动；清掉 require 缓存，
   每次插件激活都拿到最新代码（发布版相当于零成本地多 require 一次）。 */
let core
try {
  const corePath = req.resolve('./fold.cjs')
  delete req.cache[corePath]
  core = req(corePath)
} catch (e) {
  console.error('[dsh-visualization] 载入 fold.cjs 失败:', e && e.message)
  throw e
}

export const name = 'dsh-visualization'
export const inject = ['webServer']

export function apply(ctx, config = {}) {
  try { core.setOrigin(ctx.webServer.getOrigin()) } catch (e) { /* 拿不到就留空 */ }
  /* 默认只允许本机；需要远程访问时在插件的 config 里写 { "allowRemote": true } */
  try { core.setPolicy({ allowRemote: config && config.allowRemote === true }) } catch (e) { }
  const prefix = String(config.basePath || '/dsh-visualization').replace(/\/+$/, '') || '/dsh-visualization'
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: prefix,
    handler: (req2, res) => core.handle(req2, res),
  }))

  /* 用户在某会话里发消息（api-session/activity）→ 记住"他正在看这个会话"，
     固定端口（壁纸 / 独立浏览器页）就跟着它，而不是按 mtime 猜最新的。
     注意：后台工具写盘不会触发这个事件，所以多工作区并发时不会再乱跳。 */
  try {
    ctx.effect(() => ctx.on('api-session/activity', (sessionId) => {
      try { core.noteViewed(sessionId) } catch (e) { }
    }))

    /* 侧栏选中 / 打开一个会话时，宿主会为该会话建立 Agent —— 这是"我只是切过去看看"的信号。
       noteViewed 内部会过滤掉子智能体，避免被派出去的分身抢走跟随目标。 */
    ctx.effect(() => ctx.on('agent/created', (payload) => {
      try {
        const a = payload && payload.agent
        if (a && a.id) core.noteViewed(a.id)
      } catch (e) { }
    }))
  } catch (e) { /* 事件不存在时静默跳过 */ }

  /* 固定端口的壁纸入口（默认 8799）：桌面壁纸没法知道 DSH 每次随机分配的端口。
     config.wallpaperPort 可以改，写 0 关闭。 */
  try {
    const port = config && config.wallpaperPort !== undefined ? Number(config.wallpaperPort) : 8799
    if (port > 0) ctx.effect(() => (core.startHelper(port), () => { }))
  } catch (e) { /* 端口被占之类的情况不影响主路由 */ }
}
