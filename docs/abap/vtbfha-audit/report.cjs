// Build the reviewable report and workbook after running analyze.cjs.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const XLSX=require('xlsx');
const a=JSON.parse(fs.readFileSync(path.join(__dirname,'inventory.json'),'utf8'));
const used=a.fields.filter(f=>f.verifiedCount);
const missing=used.filter(f=>!f.inTable&&!f.property);
const explicit=missing.filter(f=>f.explicitPayloadAssignment);
const copied=missing.filter(f=>!f.explicitPayloadAssignment);
const present=used.filter(f=>f.inTable&&f.property);
const verified=a.evidence.filter(e=>e.verified);
assert.equal(a.programs.length,17);
assert.equal(a.sourceFiles,108);
assert.equal(a.calls.length,35);
assert.equal(missing.length,66);
assert.equal(explicit.length,9);
assert.equal(copied.length,57);
assert.equal(present.length,33);
assert(used.every(f=>f.inTable===Boolean(f.property)), 'Table and service coverage disagree');
assert(missing.every(f=>verified.some(e=>e.field===f.field&&e.mappingTarget&&e.program==='ZSGTSFP_PRE_MATURE')), 'A gap lacks premature payload mapping evidence');
const type=f=>f.type==='DEC'?`DEC(${f.length},${f.decimals})`:f.type==='DATS'?'DATS':`${f.type}(${f.length})`;
const source=e=>`${e.file.replaceAll('\\','/')}:${e.line}`;
const link=e=>`[${path.basename(e.file)}:${e.line}](<${path.join(a.root,e.file).replaceAll('\\','/')}:${e.line}>)`;
const direct=f=>verified.find(e=>e.field===f.field&&e.explicitPayloadAssignment);
const mapping=f=>verified.find(e=>e.field===f.field&&e.mappingTarget&&e.program==='ZSGTSFP_PRE_MATURE');
const read=f=>verified.find(e=>e.field===f.field&&e.sqlSources?.includes('VTBFHA'));
const payload=f=>f.append==='ZZAP_TRM_FOREX'?'I_FOREX':f.append==='ZZAP_TRM_FTR'?'I_TRM':f.append==='ZZAPST_TSF'?'I_TSF':'';
const description={
  ZCPAIR:'Currency pair; assigned from the blotter row.',
  ZSWAP_NO:'Swap reference number; assigned by the upload program.',
  REMARK:'General / MO remark; assigned by upload, NDF MO and option MO processing.',
  FO_REMARK:'General / FO remark; assigned by upload, premature processing and reversal.',
  SWAP:'Swap points; assigned by both blotter programs.',
  EXP_RATE:'Exercise / cash-settlement rate; assigned in settlement workspace CASH_SETTLE_RATE.',
  TSF_CODE:'Blotter / TSF code; assigned during spot and blotter creation.',
  ZGRP:'Treasury group; assigned during spot and blotter creation.',
  ZO_COVER_TXN:'Cover transaction reference; assigned during settlement workspace spot creation.',
};
const header=['Field','Append structure','Export parameter','DDIC type','Data element','In APP_STR','In TrmFxApp','Usage','Programs','Read evidence','Mapping evidence','Explicit assignment evidence'];
const fieldRow=f=>[f.field,f.append,payload(f),type(f),f.element,f.inTable?'Yes':'No',f.property||'No',f.explicitPayloadAssignment?'Explicit payload assignment + read/copy':'Read/copy payload',f.programs.join('; '),read(f)?source(read(f)):'',mapping(f)?source(mapping(f)):'',direct(f)?source(direct(f)):''];
const wb=XLSX.utils.book_new();
function sheet(name,rows){const ws=XLSX.utils.aoa_to_sheet(rows);ws['!autofilter']={ref:ws['!ref']};ws['!cols']=rows[0].map((_,i)=>({wch:Math.min(85,Math.max(14,...rows.slice(0,100).map(r=>String(r[i]??'').length)))}));XLSX.utils.book_append_sheet(wb,ws,name);}
sheet('Readme',[
 ['Item','Value'],['As of','14 October 2026 (Asia/Calcutta)'],['Scope','17 supplied programs; 108 ABAP source files'],
 ['Compared with','Live DS4 client 100 TrmFxApp metadata + ZSGTSFTR_APP_STR ADT source; GET only'],
 ['Missing fields',66],['Explicit payload assignments',9],['Additional read/copy fields',57],['Already covered used fields',33],
 ['Method','Workbook append membership; active SQL, component assignments and CORRESPONDING mappings; comments and declarations excluded'],
 ['Preservation','All 66 missing fields are explicitly read and mapped into LS_TRM or LS_FOREX in premature GET_DETAILS.'],
 ['Important names','REMARK, FO_REMARK and NDF_MO_REMARK differ from NDF_FO_REM / NDF_MO_REM.'],
 ['Aliased view columns','MO_REMARK is not a workbook append field; no alias equivalence is assumed.'],
 ['Limit','35 EXPORT call sites; no active IMPORT calls or EXPORT/IMPORT implementations supplied. No transitive runtime or persistence proof.'],
 ['Star accesses','SELECT * and full-row MODIFY are not treated as business usage of every append field.'],
 ['Source root',a.root],['Workbook',a.workbook],
]);
sheet('Missing 66',[header,...missing.map(fieldRow)]);
sheet('Explicit assignments 9',[header,...explicit.map(fieldRow)]);
sheet('Additional copied 57',[header,...copied.map(fieldRow)]);
sheet('Already covered 33',[header,...present.map(fieldRow)]);
sheet('Programs 17',[
 ['Program','ABAP source files','EXPORT calls','Missing fields used','Existing fields used'],
 ...a.programs.map(p=>[p.program,p.files,p.exportCalls,p.fields.filter(n=>missing.some(f=>f.field===n)).join('; '),p.fields.filter(n=>present.some(f=>f.field===n)).join('; ')]),
]);
sheet('Export calls 35',[
 ['Program','File','Line','Direction','Parameters'],
 ...a.calls.map(c=>[c.program,c.file,c.line,c.direction,c.params.map(p=>`${p.parameter} = ${p.variable}`).join('; ')]),
]);
sheet('Source evidence',[
 ['Field','Program','File','Line','FORM','Component','Mapping target','SQL sources','Export parameters','Explicit assignment','Code'],
 ...verified.map(e=>[e.field,e.program,e.file,e.line,e.form,e.component,e.mappingTarget||'',e.sqlSources?.join('; ')||'',e.exportParameters.join('; '),e.explicitPayloadAssignment?'Yes':'No',e.code]),
]);
sheet('Workbook append inventory',[
 ['Field','Append','Type','Data element','Used','In APP_STR','TrmFxApp property'],
 ...a.fields.map(f=>[f.field,f.append,type(f),f.element,f.verifiedCount?'Yes':'No',f.inTable?'Yes':'No',f.property]),
]);
const xlsxPath=path.join(__dirname,'VTBFHA-Append-Field-Gap.xlsx');
XLSX.writeFile(wb,xlsxPath);
fs.writeFileSync(path.join(__dirname,'Missing-VTBFHA-Fields.csv'),XLSX.utils.sheet_to_csv(wb.Sheets['Missing 66']));
const lines=[
 '# VTBFHA append fields missing from TRMFXAPP / ZSGTSFTR_APP_STR',
 '',
 '**66 explicitly used append fields are absent from both the live table and the live OData entity.** Nine receive explicit component assignments in export payloads; another 57 are read and copied into those payloads by premature processing. The full existing flow therefore has a 66-field coverage gap.',
 '',
 'Reviewed on 14 October 2026. Scope: all 108 `.abap` files across the 17 program export folders under `'+a.root+'`. Append membership and DDIC types come from the supplied `vtbfha_fields (1).XLSX`.',
 '',
 'Compared with successful read-only SAP GETs of DS4 client 100: `ZFS_SB_TRMFXAPP_O4_API/$metadata` and ADT `/sap/bc/adt/ddic/tables/zsgtsftr_app_str/source/main`. Saved evidence: [service metadata](vtbfha-audit/TrmFxApp.metadata.xml) and [table definition](vtbfha-audit/ZSGTSFTR_APP_STR.ddic.asddl). No SAP records were changed.',
 '',
 '[Excel workbook with complete field, program and line-level evidence](vtbfha-audit/VTBFHA-Append-Field-Gap.xlsx) | [Missing-field CSV](vtbfha-audit/Missing-VTBFHA-Fields.csv)',
 '',
 '## Nine missing fields with explicit payload assignments',
 '',
 '| Field | Parameter / structure | DDIC type | Use | Assignment evidence |',
 '| --- | --- | --- | --- | --- |',
 ...explicit.map(f=>`| \`${f.field}\` | \`${payload(f)}\` / \`${f.append}\` | ${type(f)} | ${description[f.field]} | ${link(direct(f))} |`),
 '',
 'These nine are the immediate gaps visible in individual assignment statements. They are included in the 66 below.',
 '',
 '## Complete missing-field list',
 '',
 'Premature `GET_DETAILS` reads these fields directly from VTBFHA, maps them into `LS_FOREX` / `LS_TRM`, and the report later supplies those structures to `ZSGTRMFM_VTBFHA_EXPORT`. The additional fields remain part of the original program flow even where their only explicit usage is copying existing values. Copying alone does not prove a separate UI control or new-value calculation is needed for each field.',
 '',
 '### I_FOREX / ZZAP_TRM_FOREX: 12 missing fields',
 '',
 '| Field | DDIC type | Data element | Usage | Source mapping |',
 '| --- | --- | --- | --- | --- |',
 ...missing.filter(f=>payload(f)==='I_FOREX').map(f=>`| \`${f.field}\` | ${type(f)} | \`${f.element}\` | ${f.explicitPayloadAssignment?'Explicit assignment + copy':'Read / copy'} | ${link(mapping(f))} |`),
 '',
 '### I_TRM / ZZAP_TRM_FTR: 54 missing fields',
 '',
 '| Field | DDIC type | Data element | Usage | Source mapping |',
 '| --- | --- | --- | --- | --- |',
 ...missing.filter(f=>payload(f)==='I_TRM').map(f=>`| \`${f.field}\` | ${type(f)} | \`${f.element}\` | ${f.explicitPayloadAssignment?'Explicit assignment + copy':'Read / copy'} | ${link(mapping(f))} |`),
 '',
 '## Already covered',
 '',
 'All 27 fields of `ZZAPST_TSF` in the supplied workbook are already in `ZSGTSFTR_APP_STR` and exposed by `TrmFxApp`. Do not add duplicate columns for those fields.',
 '',
 'The other already-covered fields used in the supplied code are `NDF_FO_REM`, `NDF_MO_REM`, `ZOLAM_DEAL_NO`, `TXN_STATUS`, `ZTRCODE` and `BLOTTER_DATE`. This makes 33 already-covered used append fields. `OPT_FO_REM` and `OPT_MO_REM` are also present in the table/service, but have no explicit active usage in these exports.',
 '',
 'There are no verified used fields that exist in this table but are absent from this service: all 66 gaps are absent from both.',
 '',
 '## Names that must remain distinct',
 '',
 '- `FO_REMARK`, `REMARK` and `NDF_MO_REMARK` are missing. `NDF_FO_REM`, `NDF_MO_REM`, `OPT_FO_REM` and `OPT_MO_REM` are already present. The supplied workbook lists them as separate physical fields; similar names are not proof of equivalence.',
 '- The uploader assigns `LS_TRM-FO_REMARK` and `LS_TRM-REMARK`; NDF MO and option MO also assign `LS_TRM-REMARK`. Reusing `NdfFoRem` / `NdfMoRem` for these writes needs an explicit backend mapping decision.',
 '- `TRD_CODE` and `ZTRCODE` are separate fields. `TRD_CODE` is missing; `ZTRCODE` exists. Likewise, `GRP_CODE` and `ZGRP` are separate missing fields.',
 '- `MO_REMARK` is a selected view column, not an append field in the supplied workbook. Its underlying expression was not supplied, so it has not been counted as another physical field or assumed to be a particular remark column.',
 '',
 '## Coverage of all supplied programs',
 '',
 '| Program | ABAP files | EXPORT call sites | Missing append fields used |',
 '| --- | ---: | ---: | --- |',
 ...a.programs.map(p=>`| \`${p.program}\` | ${p.files} | ${p.exportCalls} | ${p.fields.filter(n=>missing.some(f=>f.field===n)).map(n=>'`'+n+'`').join(', ')||'None explicitly verified'} |`),
 '',
 'The workbook lists each of the 35 EXPORT call sites with its actual parameters. No active `CALL FUNCTION ZSGTRMFM_VTBFHA_IMPORT` occurs in the supplied source; the name appears in comments describing the consumer. The EXPORT / IMPORT implementations and enhancement implementation are not in these exports, so this review proves caller payload usage rather than the consumer\'s final database writes.',
 '',
 '## Interpretation and limits',
 '',
 '- Comments, type declarations and field-catalog strings do not establish runtime field usage. A `SELECT *` / full-row `MODIFY VTBFHA` also does not establish separate business usage of every column. For example, NDF FO reads and rewrites a full VTBFHA row while explicitly changing `TXN_STATUS`; this does not add every unrelated append field to the gap list.',
 '- Same-name fields on other tables were excluded: `ZENT_DESC` from entity masters, `ZRBUSA` from company configuration, and `ZBU` from bill tables. `ZSLC_PRCTR` is declaration-only in the supplied sources. The ABAP `CLASS` keyword is not counted as use of the append field; the genuine `CLASS` SELECT / mapping in premature processing is counted.',
 '- Existing source maps `LS_TRM-ZFACILITY` from `LS_VTBFHA-CLASS` (`zfacility = class`), despite also selecting `ZFACILITY`. This report records the field gap without assuming that mapping is correct.',
 '- The nine explicit-assignment fields are a useful first implementation slice. Full parity with the supplied premature processing requires handling the additional 57 read/copy fields as well. Existing VTBFHA values are not automatically populated in the new table merely by adding columns.',
 '- For lengths, the supplied workbook reports Unicode byte lengths. CHAR lengths here are characters (bytes divided by two); DEC precision is the workbook\'s Number of Places with Decimal Places. Reuse DDIC data elements when implementing the additions.',
 '',
 'Reproduce the inventory and artifacts from the repository root with `node docs/abap/vtbfha-audit/analyze.cjs` followed by `node docs/abap/vtbfha-audit/report.cjs`. Optional analyzer arguments are the program directory and workbook path. The saved SAP schema snapshots are used as the comparison baseline.',
 '',
];
const mdPath=path.resolve(__dirname,'../VTBFHA-Append-Field-Gap.md');
fs.writeFileSync(mdPath,lines.join('\n'));
// Check the generated workbook itself, not just the in-memory counts.
const roundTrip=XLSX.readFile(xlsxPath);
for(const [name,count] of [['Missing 66',66],['Explicit assignments 9',9],['Additional copied 57',57],['Already covered 33',33],['Programs 17',17],['Export calls 35',35]])assert.equal(XLSX.utils.sheet_to_json(roundTrip.Sheets[name]).length,count);
console.log(JSON.stringify({missing:missing.length,explicit:explicit.length,copied:copied.length,present:present.length,verifiedEvidence:verified.length,report:mdPath,workbook:xlsxPath}));
