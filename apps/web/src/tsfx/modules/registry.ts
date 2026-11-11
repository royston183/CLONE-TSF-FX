import type { AnyModuleDef, ModuleDef, ModuleKind } from './types';
import { tsfDealId } from './tsf-deal-id/definition';
import { commodity } from './commodity/definition';
import { commodityPrice } from './commodity-price/definition';
import { tradeflow } from './tradeflow/definition';
import { tradeflowUpload } from './tradeflow-upload/definition';
import { tradeflowManage } from './tradeflow-manage/definition';
import { blAssign } from './bl-assign/definition';

// Definitions differ only in their lookup type; the Workbench and planner are generic over it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous lookup types in one registry
export type AnyModule = ModuleDef<any>;

export const kindOf = (def: AnyModuleDef): ModuleKind => def.kind ?? 'table';
export const isTableModule = (def: AnyModuleDef): def is AnyModule => kindOf(def) === 'table';

/** Module id (catalog `module`) → definition. Register every new application here. */
export const MODULES: Record<string, AnyModuleDef> = {
  'tsf-deal-id': tsfDealId,
  commodity,
  'commodity-price': commodityPrice,
  tradeflow,
  'tradeflow-upload': tradeflowUpload,
  'tradeflow-manage': tradeflowManage,
  'bl-assign': blAssign
};
