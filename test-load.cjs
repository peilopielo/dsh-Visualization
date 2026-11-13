/* 模拟 DSH 的加载方式：import index.js 并 apply 一个假 ctx，看会不会抛 */
const path = require('path')

const calls = []
const fakeCtx = {
  webServer: {
    getOrigin: () => 'http://127.0.0.1:12527',
    register: (route) => { calls.push(['register', route.path, route.kind]); return () => { } },
  },
  effect(fn) { calls.push(['effect']); const d = fn(); return d || (() => { }) },
  on(name, cb) { calls.push(['on', name]); return () => { } },
  get(name) { calls.push(['get', name]); return undefined },
}

;(async () => {
  try {
    const mod = await import('file://' + path.resolve('index.js').replace(/\\/g, '/'))
    console.log('import ok · name =', mod.name, '· inject =', JSON.stringify(mod.inject))
    mod.apply(fakeCtx, { wallpaperPort: 0 })   /* 端口关掉，避免测试时占 8799 */
    console.log('apply ok')
    console.log('调用序列:', calls.map((c) => c.join(':')).join(' → '))
  } catch (e) {
    console.log('❌ 抛错:', e && e.message)
    console.log(e && e.stack && e.stack.split('\n').slice(0, 5).join('\n'))
    process.exit(1)
  }
})()
