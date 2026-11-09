const fs = require('fs')
const p = 'd:/software/steam/steamapps/common/wallpaper_engine/config.json'
let t = fs.readFileSync(p, 'utf8')
const flags = '--remote-debugging-port=8080 --remote-allow-origins=* --disable-gpu --disable-gpu-compositing --disable-software-rasterizer=false'
t = t.replace(/"cefcommandline"\s*:\s*"[^"]*"/, '"cefcommandline" : "' + flags + '"')
fs.writeFileSync(p, t, 'utf8')
console.log('cefcommandline =', /"cefcommandline"\s*:\s*"[^"]*"/.exec(t)[0])
