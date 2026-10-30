import { parse as parseJavaScript } from 'acorn';
import { parse as parseHTML } from 'parse5';

// Parse only: generated JavaScript is never executed on the host.
export function validateJavaScript(files) {
  const byPath = new Map(files.map(file => [file.path, file.content]));
  const check = (source, file, sourceType = 'module') => {
    try { parseJavaScript(source, { ecmaVersion: 'latest', sourceType }); }
    catch (error) { throw new Error(`JavaScript syntax error in ${file}: ${error.message}. Previous visualization preserved.`); }
  };
  for (const file of files) {
    if (/\.(m?js)$/i.test(file.path)) check(file.content, file.path);
    if (!/\.html$/i.test(file.path)) continue;
    let scriptIndex = 0;
    const walk = node => {
      if (node.tagName === 'script') {
        const attrs = Object.fromEntries(node.attrs.map(a => [a.name, a.value]));
        const type = (attrs.type || '').trim().toLowerCase();
        if (!type || type === 'module' || /^(text|application)\/(java|ecma)script$/.test(type)) {
          scriptIndex++;
          if (!attrs.src) check((node.childNodes || []).map(n => n.value || '').join(''), `${file.path} (script ${scriptIndex})`, type === 'module' ? 'module' : 'script');
          else if (!/^[a-z]+:|^\/\//i.test(attrs.src)) {
            const url = new URL(attrs.src, 'http://visualization.local/' + file.path);
            const target = decodeURIComponent(url.pathname.slice(1));
            if (byPath.has(target)) check(byPath.get(target), target, type === 'module' ? 'module' : 'script');
          }
        }
      }
      for (const child of node.childNodes || []) walk(child);
      if (node.content) walk(node.content);
    };
    walk(parseHTML(file.content));
  }
}
