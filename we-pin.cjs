const fs = require('fs')
const p = 'd:/software/steam/steamapps/common/wallpaper_engine/config.json'
let t = fs.readFileSync(p, 'utf8')

/* 把 Monitor1 的当前壁纸指到我们的工程 */
const target = 'D:/SoftWare/Steam/steamapps/common/wallpaper_engine/projects/myprojects/DSH-Visualization/project.json'.replace('D:/SoftWare', 'D:/software')

const re = /("Monitor1"\s*:\s*\{[^}]*?"file"\s*:\s*")([^"]*)(")/
const m = re.exec(t)
if (!m) { console.log('没找到 Monitor1.file'); process.exit(1) }
console.log('before:', m[2])
t = t.replace(re, '$1' + target + '$3')
fs.writeFileSync(p, t, 'utf8')
const m2 = re.exec(t)
console.log('after :', m2[2])
