// DSH VISUALIZATION client half：侧栏一个环图标，点开在主面板里显示会话仪表盘。
// 面板用 iframe 承载 /dsh-visualization/ 页面 —— 页面本身就是完整的仪表盘，
// 这样绘制、交互、表格都只有一份实现，插件这边只负责"挂上去"。
window.__ModuleLoader__.load({
  id: 'dsh-visualization',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    const h = React.createElement

    const URL = '/dsh-visualization/'

    /* 宿主页面地址里通常带着当前会话 id（uuid）；带着就让面板跟随它。
       读不到就退回"自动跟最新会话"。 */
    function sessionFromUrl() {
      try {
        const m = String(location.href).match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
        return m ? m[1] : ''
      } catch (e) { return '' }
    }

    /* 侧栏图标：三层同心环 + 中心点，和仪表盘的环一致 */
    function Icon(props) {
      const size = (props && props.size) || 20
      const active = !!(props && props.active)
      return h('svg', {
        viewBox: '0 0 32 32', width: size, height: size, 'aria-hidden': true,
        style: { display: 'block', opacity: active ? 1 : 0.72 },
      },
        h('circle', { cx: 16, cy: 16, r: 13.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, opacity: 0.35 }),
        h('circle', { cx: 16, cy: 16, r: 8.4, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, opacity: 0.6 }),
        h('circle', { cx: 16, cy: 16, r: 4, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }),
        h('circle', { cx: 16, cy: 16, r: 1.7, fill: 'currentColor' }))
    }

    /* 主面板：整块 iframe，仪表盘是独立页面，交互全部在里面 */
    function Panel() {
      const [sid, setSid] = React.useState(sessionFromUrl())
      /* 宿主切会话时地址会变，但 pushState 不触发 popstate —— 轻量轮询兜住 */
      React.useEffect(() => {
        const id = setInterval(() => {
          const next = sessionFromUrl()
          setSid((cur) => (cur === next ? cur : next))
        }, 1000)
        return () => clearInterval(id)
      }, [])
      const src = sid ? URL + '?session=' + encodeURIComponent(sid) : URL
      return h('div', {
        style: {
          position: 'relative', display: 'flex', flexDirection: 'column',
          width: '100%', height: '100%', minHeight: 0, background: '#0b0d11',
        },
      }, h('iframe', {
        src: src,
        title: 'DSH VISUALIZATION',
        style: { flex: 1, width: '100%', minHeight: 0, border: 0, display: 'block', background: '#0b0d11' },
      }))
    }

    async function waitSlots(ctx) {
      for (let i = 0; i < 80; i++) {
        try {
          const sv = ctx.get('slots')
          if (sv) return sv
        } catch (e) { /* 还没挂上，继续等 */ }
        await new Promise((r) => setTimeout(r, 100))
      }
      return null
    }

    /* 全局跟随：DSH 页面地址里通常带着当前会话 uuid。
       不依赖仪表盘面板是否打开——在聊天页切换会话也能被跟随。 */
    function watchViewedSession() {
      let last = ''
      const tick = () => {
        try {
          const m = String(location.href).match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
          const id = m ? m[1] : ''
          if (!id || id === last) return
          last = id
          fetch(URL + 'focus?session=' + encodeURIComponent(id), { method: 'POST' }).catch(() => { })
        } catch (e) { }
      }
      tick()
      setInterval(tick, 1500)
    }

    async function apply(ctx) {
      watchViewedSession()
      try {
        const slots = await waitSlots(ctx)
        if (!slots) {
          console.warn('[dsh-visualization] slots 服务等不到，放弃注册')
          return
        }
        slots.inject('sidebar.panellist', () => slots.register({
          name: 'sidebar.panellist', id: 'dsh-visualization', order: 30,
          label: () => 'DSH VISUALIZATION',
        }, Icon))
        slots.inject('main', () => slots.register({
          name: 'main', key: 'dsh-visualization',
        }, Panel))
      } catch (e) {
        console.error('[dsh-visualization] apply 失败:', e)
      }
    }

    exports.apply = apply
    exports.inject = []
    exports.name = 'dsh-visualization'
    return module.exports
  },
})
