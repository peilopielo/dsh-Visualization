/* 生成完整版壁纸页 + 屏幕诊断层
   node make-wallpaper-debug.cjs  */
const fs = require('fs')
const path = require('path')

const root = __dirname
const PORT = 8799
let html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8')

/* 1) 去掉会崩 WE 的 line-clamp */
html = html.replace(
  /display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden/,
  'display:block;max-height:2.9em;overflow:hidden'
)

/* 2) 诊断层：抢在一切之前挂上，任何错误都显示出来 */
const dbg = `
<base href="http://127.0.0.1:${PORT}/">
<div id="__dbg" style="position:fixed;left:8px;top:8px;z-index:99999;max-width:60vw;
background:rgba(0,0,0,.86);color:#8fe0c8;font:12px/1.5 Consolas,monospace;padding:8px 10px;
border:1px solid #2f4a63;border-radius:6px;white-space:pre-wrap;pointer-events:none"></div>
<script>
(function(){
  var el=document.getElementById('__dbg'),lines=[];
  function show(){ el.textContent = lines.join('\\n') }
  function add(s){ if(lines.length<14) lines.push(String(s).slice(0,220)); show() }
  window.__ERRS=[];
  window.addEventListener('error',function(e){
    window.__ERRS.push(e.message);
    add('ERR ' + (e.filename||'').split('/').pop() + ':' + e.lineno + ' ' + e.message);
  });
  window.addEventListener('unhandledrejection',function(e){
    window.__ERRS.push(String(e.reason));
    add('REJ ' + String(e.reason).slice(0,160));
  });
  add('boot');
  setTimeout(function(){
    add('inner ' + innerWidth + 'x' + innerHeight + ' dpr=' + devicePixelRatio);
    add('dash=' + !!document.querySelector('.dash') + ' netW=' + ((document.getElementById('net')||{}).width||'-'));
    add('bodyText=' + document.body.innerText.length + ' hasM=' + !!window.__M);
    add('turn=' + ((window.__M&&window.__M.turn)||'-'));
  }, 1500);
  setTimeout(function(){
    add('t+4s errs=' + window.__ERRS.length + ' turn=' + ((window.__M&&window.__M.turn)||'-'));
    add('net=' + ((document.getElementById('net')||{}).width||'-') + 'x' + ((document.getElementById('net')||{}).height||'-'));
  }, 4000);
})();
</script>
`
html = html.replace(/<head>/i, '<head>' + dbg)
fs.writeFileSync(path.join(root, 'wallpaper', '_experiments', 'debug.html'), html, 'utf8')
console.log('debug.html 生成:', html.length, '字节')
