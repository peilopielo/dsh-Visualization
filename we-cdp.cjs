const fs = require('fs')
const p = 'd:/software/steam/steamapps/common/wallpaper_engine/config.json'
let t = fs.readFileSync(p, 'utf8')
t = t.replace(/"cefcommandline"\s*:\s*"[^"]*"/, '"cefcommandline" : "--remote-debugging-port=8080 --remote-allow-origins=*"')
fs.writeFileSync(p, t, 'utf8')
console.log('ok:', /"cefcommandline"\s*:\s*"[^"]*"/.exec(t)[0])
