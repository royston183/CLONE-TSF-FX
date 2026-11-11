// Propose Tradeflows: where its data comes from. The page talks only to a ProposeData: sample data now (UI approval),
// the live sources (Deal IDs and master contracts from the middleware, BLs and commodities from SAP, exchange rates,
// and the AI through the BackEnd) once they are connected.
import { str } from '@tsfx/lib/grid/grid';
import type { Row } from '@tsfx/lib/grid/types';
import type { Combination, Rules } from '@tsfx/lib/propose/match';
import { rankByCloseness } from '@tsfx/lib/propose/match';
import { readConditions, type Reading } from '@tsfx/lib/propose/query';
import { assignmentProblems, type AssignTarget } from './logic';
import { tradeflowManageSeed } from '@tsfx/modules/tradeflow-manage/seed';
import { valueOf } from '@tsfx/modules/tradeflow/pricing';

/** A TSF Deal ID as Propose needs it: its commodity comes from its master contract (TSF FX commodity code). */
export interface Deal { dealId: string; dealDesc: string; tsfCommodity: string; tsfCommodityText: string; amount: string; currency: string; /** The Deal ID's workflow status (ZDEAL_STAT) when it was read; absent on sample data. */ dealStatus?: string }
/** What goes to the AI (and nothing more): the deal's figures and, per combination, its BLs' numbers and USD values. */
export interface AiRequest {
  deal: { dealId: string; tsfCommodity: string; dealUsd: string; remainingUsd: string };
  candidates: Combination[];
  bls: { blNo: string; tfNo: string; tfDate: string; quantity: string; usdValue: string }[];
  preferences: string;
}
export interface AiAnswer { ranked: { index: number; reason: string }[]; rules: Rules; notUnderstood: string[]; model: string }
/** A question about the proposals shown (the same fields as AiRequest, plus the question and the earlier turns). */
export interface AskRequest extends Omit<AiRequest, 'preferences'> { question: string; history: { question: string; answer: string }[] }
export interface AskAnswer { answer: string; rules: Rules; notUnderstood: string[]; model: string }
/** Typed conditions as criteria: read by the app, or (for what it could not read) by the AI, validated. */
export interface Interpretation extends Reading { model: string; /** "top N" conditions with the BL numbers they took. */ picked?: string[] }
/** What the AI may know to read the conditions: the chosen deal and the commodity master (no names, no references). */
export interface InterpretContext {
  deal: { dealId: string; tsfCommodity: string } | null; commodities: Row[]; today: string;
  /** The notify parties and contracts the deal's free BLs carry (so a name typed alone is understood). */
  known?: { notifyParty?: string[]; contractRef?: string[] };
}

export interface ProposeData {
  /** True while the page runs on its sample data. */
  sample: boolean;
  deals(): Promise<Deal[]>;
  /** Every BL with: blNo, blRecordDate, tfNo, tfDate, commodity, quantity, usdValue, dealId, assignedUsd, deletedFlag. */
  bls(): Promise<Row[]>;
  /** The commodity master: commodity, description, tsfCommodity. */
  commodities(): Promise<Row[]>;
  /** USD per unit of each currency (rate type M, today). */
  rates(): Promise<Record<string, string>>;
  /**
   * Gives the BLs the Deal ID, each storing the USD it was matched with. The BLs are read again first and the
   * acceptance is refused when any rule fails on them (assignmentProblems); the write carries their ETags.
   */
  assign(target: AssignTarget, usdByBl: Record<string, string>, values: Record<string, string>): Promise<void>;
  /** Typed conditions → criteria. */
  interpret(text: string, context: InterpretContext): Promise<Interpretation>;
  /** Moves every Deal ID that has BLs assigned to status 04 (from 01–03); returns the Deal IDs moved. */
  syncStatuses?(bls: Row[]): Promise<string[]>;
  /** Writes the invoice rows (ZSGTSFTR_BL) of a Deal ID's assigned BLs that have none; returns the BL numbers written. */
  repairMiddleware?(dealId: string): Promise<string[]>;
  ai(request: AiRequest): Promise<AiAnswer>;
  /** Answers a question about the proposals; it may also return rules to apply. */
  ask(request: AskRequest): Promise<AskAnswer>;
}

export const AI_OFFLINE = 'AI not connected (sample data): ranked by closeness to the amount left.';

/** Sample data: the Manage Tradeflows sample BLs, three commodities, four Deal IDs (one INR, one without a USD rate). */
export function sampleProposeData(): ProposeData {
  const { tables } = tradeflowManageSeed();
  const price = new Map(tables.tradeflows.map(t => [`${t.tfNo}|${t.tfDate}`, str(t.price)]));
  let bls: Row[] = tables.bl.map(b => {
    const p = price.get(`${b.tfNo}|${b.tfDate}`) ?? '';
    return { ...b, usdValue: p && Number(p) > 0 ? valueOf(p, str(b.quantity)) : '' };
  });
  const commodities: Row[] = [
    { commodity: 'ALMOND', description: 'Almonds', tsfCommodity: 'C130' },
    { commodity: 'COTTON', description: 'Cotton', tsfCommodity: 'C140' },
    { commodity: 'CASHEW', description: 'Cashew kernels', tsfCommodity: '' }
  ];
  const deals: Deal[] = [
    { dealId: 'DL26000101', dealDesc: 'Almond forward, October shipments', tsfCommodity: 'C130', tsfCommodityText: 'ALMOND', amount: '189200.00', currency: 'USD' },
    { dealId: 'DL26000142', dealDesc: 'Almond INR deal, OSIPL', tsfCommodity: 'C130', tsfCommodityText: 'ALMOND', amount: '23650000.00', currency: 'INR' },
    { dealId: 'DL26000150', dealDesc: 'Cotton forward', tsfCommodity: 'C140', tsfCommodityText: 'COTTON', amount: '36000.00', currency: 'USD' },
    { dealId: 'DL26000160', dealDesc: 'Almond VND deal', tsfCommodity: 'C130', tsfCommodityText: 'ALMOND', amount: '2400000000.00', currency: 'VND' }
  ];
  return {
    sample: true,
    deals: async () => deals.map(d => ({ ...d })),
    bls: async () => bls.map(b => ({ ...b })),
    commodities: async () => commodities.map(c => ({ ...c })),
    rates: async () => ({ INR: '0.0120' }),
    assign: async (target, usdByBl, values) => {
      const problems = assignmentProblems(target, usdByBl, Object.keys(usdByBl), bls, values);
      if (problems.length) throw new Error(`Not assigned: ${problems.join(' ')}`);
      bls = bls.map(b => (usdByBl[b.blNo] !== undefined ? { ...b, dealId: target.dealId, assignedUsd: usdByBl[b.blNo] } : b));
    },
    interpret: async (text, context) => ({ ...readConditions(text, context.commodities, { known: context.known, today: context.today }), model: 'none' }),
    ai: async request => ({
      ranked: rankByCloseness(request.candidates).slice(0, 5).map(c => ({ index: request.candidates.indexOf(c), reason: AI_OFFLINE })),
      rules: {},
      notUnderstood: request.preferences.trim() ? ['AI not connected: preferences are applied once Claude is connected.'] : [],
      model: 'none'
    }),
    ask: async () => ({ answer: 'AI not connected (sample data): questions are answered once Claude is connected.', rules: {}, notUnderstood: [], model: 'none' })
  };
}
