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
}
