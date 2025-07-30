const fs = require('fs');
function minifyJs(src, dest){
  let code = fs.readFileSync(src,'utf8');
  code = code.replace(/\/\*[^]*?\*\/|\/\/.*(?=[\n\r])/g, '');
  code = code.replace(/\n+/g,'');
  code = code.replace(/\s{2,}/g,' ');
  fs.writeFileSync(dest, code.trim());
}
function minifyCss(src, dest){
  let css = fs.readFileSync(src,'utf8');
  css = css.replace(/\/\*[^]*?\*\//g,'');
  css = css.replace(/\n+/g,'');
  css = css.replace(/\s{2,}/g,' ');
  css = css.replace(/\s*([{}:;,])\s*/g,'$1');
  fs.writeFileSync(dest, css.trim());
}
minifyJs('main.js','main.min.js');
minifyCss('styles.css','styles.min.css');
