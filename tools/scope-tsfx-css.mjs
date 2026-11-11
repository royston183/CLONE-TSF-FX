import postcss from 'postcss';
import fs from 'node:fs';
const SCOPE = '.tsfx';
export function scope(css, file) {
  const root = postcss.parse(css, { from: file });
  const fix = (sel) => {
    sel = sel.trim();
    if (!sel) return sel;
    if (sel.startsWith(SCOPE)) return sel;
    // :root[data-theme=...] rest  -> :root[data-theme=...] .tsfx rest ; [data-theme=dark] rest likewise
    let m = sel.match(/^(:root|html)((?:\[[^\]]+\])+)\s*(.*)$/);
    if (m) return `${m[1]}${m[2]} ${SCOPE}${m[3] ? ' ' + m[3] : ''}`;
    m = sel.match(/^((?:\[data-[^\]]+\])+)\s+(.*)$/);
    if (m) return `${m[1]} ${SCOPE} ${m[2]}`;
    m = sel.match(/^((?:\[data-[^\]]+\])+)$/);
    if (m) return `${m[1]} ${SCOPE}`;
    if (/^(:root|html|body)$/.test(sel)) return SCOPE;
    m = sel.match(/^(:root|html|body)\s+(.*)$/);
    if (m) return `${SCOPE} ${m[2]}`;
    m = sel.match(/^(:root|html|body)([.:#\[].*)$/);
    if (m) return `${SCOPE}${m[2]}`;
    return `${SCOPE} ${sel}`;
  };
  root.walkRules((rule) => {
    const p = rule.parent;
    if (p && p.type === 'atrule' && /keyframes$/i.test(p.name)) return;
    rule.selectors = rule.selectors.map(fix);
  });
  root.walkAtRules(/^(font-face|import)$/i, () => {});
  return root.toString();
}
if (process.argv[1]?.endsWith('scope-css.mjs') && process.argv[2]) {
  const f = process.argv[2];
  fs.writeFileSync(f, scope(fs.readFileSync(f, 'utf8'), f));
}
