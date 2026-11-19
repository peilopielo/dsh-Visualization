const fs = require('fs')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
pkg.version = '0.1.65'
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n', 'utf8')
let c = fs.readFileSync('client.js', 'utf8')
c = c.replace(/ASSET_V = '[^']+'/, "ASSET_V = '0.1.65'")
fs.writeFileSync('client.js', c, 'utf8')
console.log('version', pkg.version)
