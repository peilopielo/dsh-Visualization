const https = require('node:https')
const HEAD = 'https://api.github.com/repos/awesome-dsh-plugin/awesome-dsh-plugin'
const sha = process.argv[2]
const opts = { headers: { 'user-agent': 'node', accept: 'application/vnd.github+json' } }

function get(u) {
  return new Promise((res, rej) => {
    https.get(u, opts, (r) => {
      let b = ''
      r.on('data', (c) => (b += c))
      r.on('end', () => res(b))
    }).on('error', rej)
  })
}

function fmt(c) {
  return '  ' + c.name.padEnd(16) + ' | ' + (c.conclusion || c.status).padEnd(11) + ' | ' + (c.completed_at || '…')
}

;(async () => {
  const t0 = Date.now()
  for (let i = 0; i < 40; i++) {
    const cr = JSON.parse(await get(HEAD + '/commits/' + sha + '/check-runs'))
    const runs = cr.check_runs || []
    const busy = runs.some((c) => c.status === 'in_progress' || c.status === 'queued')
    const gate = runs.find((c) => /Submission gate/i.test(c.name))
    if (!busy && gate && gate.started_at > '2026-11-09') {
      console.log('=== 全部完成（' + Math.round((Date.now() - t0) / 1000) + 's）===')
      runs.forEach((c) => {
        console.log(fmt(c))
        if (c.output && c.output.summary) console.log('     → ' + c.output.summary.replace(/\n/g, ' ').slice(0, 220))
      })
      return
    }
    if (i % 5 === 0) console.log('等待中… ' + runs.map((c) => c.name + ':' + (c.conclusion || c.status)).join('  '))
    await new Promise((r) => setTimeout(r, 20000))
  }
  console.log('10 分钟还没跑完')
})()
