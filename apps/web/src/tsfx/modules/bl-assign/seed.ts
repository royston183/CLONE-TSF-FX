// Sample data of bl-assign (tests): the Manage Tradeflows sample BLs.
import type { ModuleSeed } from '../types';
import { tradeflowManageSeed } from '../tradeflow-manage/seed';
import { BL_ASSIGN_FIELDS } from './definition';

export const blAssignSeed = (): ModuleSeed => ({
  tables: { bls: tradeflowManageSeed().tables.bl.map(b => Object.fromEntries(BL_ASSIGN_FIELDS.map(f => [f, b[f] ?? '']))) }
});
