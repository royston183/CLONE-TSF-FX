import type { Database } from '../db.ts'
import { createDdicRepository, DdicInputError, ddicRepository } from './ddic-table.ts'
import type { DdicRepository, DdicRow, DdicTable } from './ddic-table.ts'
import { TRD_POS_CLIENT, TRD_POS_COLUMNS } from './trd-pos-columns.ts'

/** A ZSGTSFTR_TRD_POS row as the API speaks it: SAP field names, text or numbers. */
export type TrdPosRow = DdicRow
export const TrdPosInputError = DdicInputError

export const TRD_POS_TABLE: DdicTable = { table: 'zsgtsftr_trd_pos', client: TRD_POS_CLIENT, columns: TRD_POS_COLUMNS }

/** Keyed by Deal ID + settlement sequence. */
function byDealAndSeq(repo: DdicRepository) {
  const key = (dealId: string, seq: string) => ({ ZDEAL_ID: dealId, ZSEQ: seq })
  return {
    list: (dealId?: string): TrdPosRow[] => repo.list(dealId ? { column: 'ZDEAL_ID', value: dealId } : undefined),
    get: (dealId: string, seq: string) => repo.get(key(dealId, seq)),
    upsert: (dealId: string, seq: string, body: Record<string, unknown>) => repo.upsert(key(dealId, seq), body),
    remove: (dealId: string, seq: string) => repo.remove(key(dealId, seq)),
  }
}

export const createTrdPosRepository = (db: Database) => byDealAndSeq(createDdicRepository(db, TRD_POS_TABLE))
export const trdPosRepository = (db: Database) => byDealAndSeq(ddicRepository(db, TRD_POS_TABLE))
