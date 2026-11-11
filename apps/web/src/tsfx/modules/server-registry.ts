import type { DashboardServer } from '@tsfx/core/server/dashboard-types';
import { MODULES } from './registry';
import type { AnyModuleDef, ModuleSeed, ODataContract, RestContract } from './types';
import { contract as tsfDealIdContract } from './tsf-deal-id/contract';
import { rest as tsfDealIdRest } from './tsf-deal-id/rest';
import { tsfDealIdSeed } from './tsf-deal-id/seed';
import { contract as commodityContract } from './commodity/contract';
import { commoditySeed } from './commodity/seed';
import { contract as commodityPriceContract } from './commodity-price/contract';
import { commodityPriceSeed } from './commodity-price/seed';
import { contract as tradeflowContract } from './tradeflow/contract';
import { tradeflowSeed } from './tradeflow/seed';
import { contract as tradeflowUploadContract } from './tradeflow-upload/contract';
import { tradeflowUploadSeed } from './tradeflow-upload/seed';
import { contract as tradeflowManageContract } from './tradeflow-manage/contract';
import { tradeflowManageSeed } from './tradeflow-manage/seed';
import { contract as blAssignContract } from './bl-assign/contract';
import { blAssignSeed } from './bl-assign/seed';

/**
 * Where a module's data lives: inside SAP (`sap`, through its OData service), the application's own data (`app`), or
 * an external REST data service the BackEnd calls (`rest`, FE + BE + DB only; its `rest` contract names the service).
 */
export type DataSource = 'sap' | 'app' | 'rest';
/** Sources whose data the BackEnd keeps in an FE + BE + DB application (the browser calls it through backend-api). */
export const BACKEND_SOURCES: readonly DataSource[] = ['app', 'rest'];
/** Whether the BackEnd answers this source's data (an FE + BE + DB application). */
export const keptByBackend = (source: DataSource | undefined): boolean => source !== undefined && BACKEND_SOURCES.includes(source);

export interface ModuleData {
  def: AnyModuleDef;
  /** Every module has one, except a report over another module (`source`), which reads that module's. */
  contract?: ODataContract;
  /** Every module has one, except a report over another module (`source`). */
  seed?: ModuleSeed | (() => ModuleSeed);
  /** Dashboard modules: their server part (section loaders). */
  dashboard?: DashboardServer;
  /** Source `rest`: the REST data service, its resources and their columns (BackEnd/src/rest/). */
  rest?: RestContract;
  /**
   * Where its data lives; absent while the module still runs on the sample data in `seed` (kept in memory). A report over
   * another module (`def.source`) leaves it out: its data source is that module's (see sourceOf; a value here is ignored).
   */
  source?: DataSource;
  /**
   * A template example registered back only for the template's own tests (FS Sprint moves the examples of a new application
   * to FrontEnd/tests/support/reference/): never one of the application's modules, so never in its generated schema.
   */
  reference?: true;
}

/**
 * Where a module's data lives, as every reader of a source asks it: its own `source`, or for a report over another
 * module (`def.source`) that module's source, so the report always runs and reads where that data lives.
 */
export function sourceOf(entry: ModuleData): DataSource | undefined {
  const from = entry.def.kind === 'report' ? entry.def.source?.module : undefined;
  if (!from) return entry.source;
  return Object.hasOwn(SERVER_MODULES, from) ? SERVER_MODULES[from].source : undefined;
}

/** The data parts of each module: its source, its OData contract and its sample data. */
export const SERVER_MODULES: Record<string, ModuleData> = {
  'tsf-deal-id': { def: MODULES['tsf-deal-id'], contract: tsfDealIdContract, seed: () => tsfDealIdSeed(), source: 'rest', rest: tsfDealIdRest },
  commodity: { def: MODULES.commodity, contract: commodityContract, seed: commoditySeed, source: 'sap' },
  'commodity-price': { def: MODULES['commodity-price'], contract: commodityPriceContract, seed: commodityPriceSeed, source: 'sap' },
  tradeflow: { def: MODULES.tradeflow, contract: tradeflowContract, seed: tradeflowSeed, source: 'sap' },
  'tradeflow-upload': { def: MODULES['tradeflow-upload'], contract: tradeflowUploadContract, seed: tradeflowUploadSeed, source: 'sap' },
  'tradeflow-manage': { def: MODULES['tradeflow-manage'], contract: tradeflowManageContract, seed: tradeflowManageSeed, source: 'sap' },
  'bl-assign': { def: MODULES['bl-assign'], contract: blAssignContract, seed: blAssignSeed, source: 'sap' }
};
