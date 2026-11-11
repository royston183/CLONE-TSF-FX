// The tables of a module as the backends need them: keys, the fields read from SAP and their types; its contract and
// seed (a report over another module has neither), and the check of such a report against its source module.
import { typeOf, valueFields, type AnyField } from '@tsfx/lib/fields';
import { reportFieldDefs, reportList } from '@tsfx/lib/report/report';
import type { ModuleData } from './server-registry';
import type { AnyModuleDef, AnyReportDef, ModuleSeed, ODataContract } from './types';

export interface TableInfo { keys: string[]; fields: string[]; defs: AnyField[]; large?: boolean }

const uniq = (xs: string[]) => [...new Set(xs)];
const names = (defs: AnyField[]) => valueFields(defs).map(d => d.field);

export function moduleTables(def: AnyModuleDef): Record<string, TableInfo> {
  switch (def.kind) {
    case 'object': {
      const groups = def.tabs.flatMap(t => (t.kind === 'fields' ? t.groups.flatMap(g => g.fields) : []));
      const headerDefs = [...def.list.fields, ...def.header, ...groups];
      const out: Record<string, TableInfo> = { [def.list.entity]: { keys: def.list.keys, fields: uniq([...def.list.keys, ...names(headerDefs)]), defs: headerDefs } };
      for (const t of def.tabs) if (t.kind === 'items') out[t.table] = { keys: t.keys, fields: uniq([...t.keys, ...names(t.grid)]), defs: t.grid };
      return out;
    }
    case 'items': {
      const defs = [...def.selection, ...def.grid];
      return { [def.entity]: { keys: def.keys, fields: uniq([...def.keys, ...names(defs)]), defs } };
    }
    case 'upload':
      return { [def.entity]: { keys: def.keys, fields: uniq([...def.keys, ...names(def.columns)]), defs: def.columns } };
    case 'report': {
      // A report over another module (source) reads that module's table; it has none of its own.
      if (def.source) return {};
      const defs = reportFieldDefs(def);
      return { [def.report.entity]: { keys: reportList(def).keys, fields: uniq(names(defs)), defs } };
    }
    case 'dashboard':
      // A dashboard reads through report modules (its server part); it has no tables of its own.
      return {};
    default:
      return Object.fromEntries(def.tabs.map(t => [t.id, { keys: t.keys, fields: def.fields[t.id] ?? names(t.grid), defs: [...t.grid, ...(t.list?.fields ?? [])], large: Boolean(t.large) }]));
  }
}

const NO_CONTRACT: ODataContract = { service: '', naming: 'pascal', tables: {} };
const NO_SEED: ModuleSeed = { tables: {} };
/** A module's OData contract; a report over another module (`source`) has none: no tables, no lookups. */
export const contractOf = (entry: ModuleData): ODataContract => entry.contract ?? NO_CONTRACT;
/** A module's sample data; a report over another module (`source`) has none. */
export const seedOf = (entry: ModuleData): ModuleSeed | (() => ModuleSeed) => entry.seed ?? NO_SEED;

/**
 * Why a report over another module (`source`) cannot read it, or '' when it can (and for a report without a source): the
 * module is a registered object module, its list is the report's entity, and its header table has every field the
 * report filters and orders by. The definitions test runs it on every such report; the report service refuses to run one
 * that fails it.
 */
export function reportSourceProblem(def: AnyReportDef, target: AnyModuleDef | undefined): string {
  if (!def.source) return '';
  const id = def.source.module;
  if (!target) return `source module ${id} is not registered.`;
  if (target.kind !== 'object') return `source module ${id} is not an object module.`;
  if (def.report.entity !== target.list.entity) return `report.entity ${def.report.entity} is not the list entity ${target.list.entity} of ${id}.`;
  const w = def.report.window;
  const inputs = w ? [w.keyDate, w.days] : [];
  // A date range filters its own field only (between), so its to-field need not be one of the module's.
  const filtered = def.selection.filter(d => !d.computed).flatMap(d => (typeOf(d) === 'dateRange' ? [d.field] : valueFields([d]).map(v => v.field)));
  const used = [...filtered.filter(f => !inputs.includes(f)), ...(w ? [w.field] : []), ...reportList(def).keys];
  const fields = new Set(moduleTables(target)[target.list.entity].fields);
  const missing = used.find(f => !fields.has(f));
  return missing ? `${id} has no field ${missing} (the report filters or orders by it).` : '';
}
