// Reproduce the static inventory from the supplied workbook and program exports.
// Usage: node docs/abap/vtbfha-audit/analyze.cjs [PROGRAM FLOW directory] [workbook]
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const out = __dirname;
const downloads = path.resolve(process.cwd(), '../../..');
const root = process.argv[2] || path.join(downloads, 'PROGRAM FLOW');
const workbook = process.argv[3] || path.join(downloads, 'vtbfha_fields (1).XLSX');
const wb = XLSX.readFile(workbook);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
const includes = rows.filter(r => /^\.INCLUDE_\d+$/.test(r[0])).map(r => ({ name: r[18], offset: +r[8] })).sort((a,b) => a.offset-b.offset);
const fields = rows.slice(1).filter(r => r[4] && +r[8] >= includes[0].offset).map(r => ({
  field: r[0], append: includes.filter(i => i.offset <= +r[8]).at(-1).name,
  position: +r[1], type: r[4], bytes: +r[5], length: r[4] === 'DATS' ? 8 : r[4] === 'TIMS' ? 6 : r[4] === 'CHAR' || r[4] === 'CUKY' ? +r[5]/2 : +r[13], decimals: +r[7], element: r[18],
}));
const fieldSet = new Set(fields.map(f => f.field));
const table = fs.readFileSync(path.join(out, 'ZSGTSFTR_APP_STR.ddic.asddl'), 'utf8');
const tableFields = [...table.matchAll(/^\s*(?:key\s+)?(\w+)\s*:/gm)].map(m => m[1].toUpperCase());
const metadata = fs.readFileSync(path.join(out, 'TrmFxApp.metadata.xml'), 'utf8');
const entity = metadata.match(/<EntityType Name="TrmFxAppType"[\s\S]*?<\/EntityType>/)?.[0] || metadata.match(/<EntityType\b[^>]*>[\s\S]*?<\/EntityType>/)?.[0];
const properties = [...entity.matchAll(/<Property Name="([^"]+)"/g)].map(m => m[1]);
const normalize = s => s.replace(/_/g, '').toUpperCase();
const walk = p => fs.readdirSync(p, { withFileTypes:true }).flatMap(e => e.isDirectory() ? walk(path.join(p,e.name)) : [path.join(p,e.name)]);
const files = walk(root).filter(p => p.endsWith('.abap'));
const evidence = [], calls = [], programs = [];
// Remove full-line and inline comments while respecting ABAP escaped quote literals.
function cleanLine(line) {
  if (line.startsWith('*')) return '';
  let result='', quoted=false;
  for (let i=0;i<line.length;i++) {
    const c=line[i];
    if(c === "'") { result+=c; if(quoted && line[i+1] === "'") {result+=line[++i];continue;} quoted=!quoted; }
    else if(c === '"' && !quoted) break;
    else result+=c;
  }
  return result;
}
for (const file of files) {
  const rel=path.relative(root,file), program=rel.split(path.sep)[0].split('_UI_DATA_EXPORT_')[0];
  const lines=fs.readFileSync(file,'utf8').split(/\r?\n/).map(cleanLine);
  let form='', declaration=false;
  for(let i=0;i<lines.length;i++) {
    const line=lines[i], upper=line.toUpperCase();
    if(/^\s*FORM\s+/i.test(line)) form=line.trim().split(/\s+/)[1];
    if(/^\s*ENDFORM\b/i.test(line)) form='';
    if(/^\s*(?:DATA|TYPES|CONSTANTS|TABLES|RANGES|FIELD-SYMBOLS|PARAMETERS|SELECT-OPTIONS)\b/i.test(line)) declaration=true;
    const isDeclaration=declaration;
    if(/\.\s*$/.test(line)) declaration=false;
    // Strip literals for runtime references; field-catalog strings are not database accesses.
    const code=upper.replace(/'(?:[^']|'')*'/g, "''");
    for (const token of new Set(code.match(/\b[A-Z_][A-Z_0-9]*\b/g)||[])) {
      if(!fieldSet.has(token)) continue;
      const component=new RegExp('([\\w<>]+)[-~]'+token+'\\b').exec(code);
      const e={program,file:rel,line:i+1,form,field:token,kind:isDeclaration?'declaration':'runtime',component:component?.[1]||'',code:line.trim()};
      evidence.push(e);
    }
  }
  const clean=lines.join('\n');
  // Record SQL provenance and CORRESPONDING payload mappings independently of
  // single-line component syntax. In particular, premature processing maps a
  // large number of append fields using bare names on separate lines.
  for (const m of clean.matchAll(/\bSELECT\b[\s\S]*?\.(?=\s|$)/gi)) {
    const sources=[...m[0].matchAll(/\b(?:FROM|JOIN)\s+(\w+)/gi)].map(s=>s[1].toUpperCase());
    const start=clean.slice(0,m.index).split('\n').length, end=start+m[0].split('\n').length-1;
    for(const e of evidence.filter(e=>e.file===rel&&e.line>=start&&e.line<=end)) e.sqlSources=sources;
  }
  for (const m of clean.matchAll(/\b(\w+)\s*=\s*CORRESPONDING\s*#\([\s\S]*?\.(?=\s|$)/gi)) {
    const start=clean.slice(0,m.index).split('\n').length, end=start+m[0].split('\n').length-1;
    for(const e of evidence.filter(e=>e.file===rel&&e.line>=start&&e.line<=end)) e.mappingTarget=m[1].toUpperCase();
  }
  for(const m of clean.matchAll(/CALL\s+FUNCTION\s+'ZSGTRMFM_VTBFHA_(EXPORT|IMPORT)'[\s\S]*?\./gi)) {
    const line=clean.slice(0,m.index).split('\n').length;
    const params=[...m[0].matchAll(/\b(I_\w+)\s*=\s*([\w<>-]+)/gi)].map(v=>({parameter:v[1].toUpperCase(),variable:v[2].toUpperCase()}));
    calls.push({program,file:rel,line,direction:m[1].toUpperCase(),params,code:m[0]});
  }
}
// Bind all component uses of each export payload variable within its owning report.
// These are explicit field references, not an inference from a SELECT * expansion.
for(const e of evidence) {
  e.exportParameters=[...new Set(calls.filter(c=>c.program===e.program).flatMap(c=>c.params.filter(p=>p.variable===e.component||p.variable===e.mappingTarget).map(p=>p.parameter)))];
  e.explicitPayloadAssignment = e.kind==='runtime' && new RegExp('^\\s*[\\w<>]+-'+e.field+'\\s*=').test(e.code.toUpperCase()) && e.exportParameters.length>0;
  e.verified = e.kind==='runtime' && (e.exportParameters.length>0 || e.sqlSources?.some(s=>['VTBFHA','ZSGTSFV_FX','ZSGTSFCDS_FX','ZSGTSFV_OP','ZSGTSFCDS_OPTION'].includes(s)));
}
for(const dir of fs.readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory())) {
  const program=dir.name.split('_UI_DATA_EXPORT_')[0], es=evidence.filter(e=>e.program===program&&e.verified);
  programs.push({program,files:files.filter(f=>path.relative(root,f).split(path.sep)[0]===dir.name).length,exportCalls:calls.filter(c=>c.program===program&&c.direction==='EXPORT').length,fields:[...new Set(es.map(e=>e.field))].sort()});
}
for(const f of fields) {
  const es=evidence.filter(e=>e.field===f.field&&e.kind==='runtime');
  f.inTable=tableFields.includes(f.field);
  f.property=properties.find(p=>normalize(p)===normalize(f.field))||'';
  f.runtimeCount=es.length;
  f.verifiedCount=es.filter(e=>e.verified).length;
  f.explicitPayloadAssignment=es.some(e=>e.explicitPayloadAssignment);
  f.programs=[...new Set(es.filter(e=>e.verified).map(e=>e.program))];
  f.exportParameters=[...new Set(es.flatMap(e=>e.exportParameters))];
  f.examples=es.filter(e=>e.exportParameters.length).slice(0,4);
  if(!f.examples.length)f.examples=es.slice(0,4);
}
const data={root,workbook,sourceFiles:files.length,tableFields,properties,fields,programs,calls,evidence};
fs.writeFileSync(path.join(out,'inventory.json'),JSON.stringify(data,null,2));
console.log(JSON.stringify({files:files.length,programs:programs.length,fields:fields.length,calls:calls.length,properties:properties.length,tableFields:tableFields.length}));
console.log(fields.filter(f=>f.verifiedCount).map(f=>`${f.field}|${f.append}|${f.inTable?'PRESENT':'MISSING'}|${f.explicitPayloadAssignment?'SET':'COPY/READ'}|${f.programs.join(',')}`).join('\n'));
