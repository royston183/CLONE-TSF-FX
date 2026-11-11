// POST /api/tsfx-ai/proposals (Propose Tradeflows, design 2026-11-05-manage-propose-tradeflows): Claude ranks the BL
// combinations the app found for a Deal ID, explains each in a sentence, and turns the person's preferences into rules
// the app applies. Claude never computes amounts: it only orders what it is given.
// Only the fields the design lists leave the BackEnd (no party names, references or goods). The key is
// ANTHROPIC_API_KEY in the BackEnd environment; without it the route answers 503 and the page ranks by closeness.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireSession } from './auth.ts';

/** An error with the HTTP status the route answers with. */
class HttpError extends Error {
  readonly status: number;
  readonly details: { message: string }[];
  constructor(status: number, message: string, details: { message: string }[] = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const AI_MODEL = 'claude-opus-5-5';
const RULE_KINDS = ['maxBls', 'minBls', 'includeTf', 'excludeTf', 'includeBl', 'excludeBl', 'preferOlder', 'preferNewer', 'preferFewerTfs', 'tolerancePct'] as const;

const money = z.string().regex(/^-?\d+(\.\d+)?$/);
/** What the page may send. Unknown fields are dropped here, so they can never reach Anthropic. */
const Input = z.object({
  deal: z.object({ dealId: z.string().max(20), tsfCommodity: z.string().max(10), dealUsd: money, remainingUsd: money }),
  candidates: z.array(z.object({
    bls: z.array(z.string().max(10)).min(1).max(600), totalUsd: money, diffPct: z.number(), tfs: z.number().int(),
    fit: z.enum(['under', 'over']).optional(), cap: z.object({ blNo: z.string().max(10), usd: money }).optional()
  })).max(20),
  bls: z.array(z.object({ blNo: z.string().max(10), tfNo: z.string().max(10), tfDate: z.string().max(10), quantity: z.string().max(20), usdValue: z.string().max(20) })).max(1000),
  preferences: z.string().max(500)
});
/** What Claude must answer (structured output). Rule kinds stay free text, so unknown ones can be reported. */
const Output = z.object({
  ranked: z.array(z.object({ index: z.number().int(), reason: z.string() })),
  rules: z.array(z.object({ kind: z.string(), values: z.array(z.string()), number: z.number().nullable() })),
  /** Filters on the data (deal level or BL level); the app normalises and applies them, Claude only reads the request. */
  criteria: z.array(z.object({ scope: z.string(), field: z.string(), op: z.string(), value: z.string() })),
  /** True only when the person explicitly asks to search across deals instead of the chosen one. */
  acrossDeals: z.boolean(),
  notUnderstood: z.array(z.string())
});
/** Older answers (and test doubles) may lack the two new fields. */
const Answer = Output.extend({ criteria: Output.shape.criteria.optional(), acrossDeals: z.boolean().optional() });
type Output = z.infer<typeof Output>;

export type Scope = 'deal' | 'bl';
export type Op = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne';
/** A filter the app applies to the real data: always deterministic, never a value the AI computed. */
export interface Criterion { scope: Scope; field: string; op: Op; value: string }
const NUMERIC = { deal: ['amount', 'remaining'], bl: ['amount', 'quantity'] } as const;
const DATES = { deal: [] as string[], bl: ['tfDate', 'blDate'] };
const TEXT = { deal: ['commodity', 'dealId'], bl: ['commodity', 'tfNo', 'blNo'] };
const OPS: Op[] = ['gt', 'gte', 'lt', 'lte', 'eq', 'ne'];

/** "50K" → 50000, "1.5M" → 1500000, "50,000" → 50000; a trailing "+" means "or more" (>=). Null when it is not a number. */
export function parseAmount(raw: string): { value: string; plus: boolean } | null {
  const m = /^\s*(\d{1,3}(?:,\d{3})+|\d*\.?\d+)\s*([kKmMbB]?)\s*(\+?)\s*$/.exec(raw);
  if (!m) return null;
  const mult = { '': 1, k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? '').toLowerCase() as '' | 'k' | 'm' | 'b'];
  // Decimal-exact: scale the digits instead of multiplying floats.
  const n = Math.round(Number((m[1] ?? '').replace(/,/g, '')) * mult * 100) / 100;
  return Number.isFinite(n) && n >= 0 ? { value: n.toFixed(2), plus: m[3] === '+' } : null;
}

/** The criteria Claude returned, kept only when valid for their scope; the rest is reported back. */
export function toCriteria(raw: { scope: string; field: string; op: string; value: string }[]): { criteria: Criterion[]; rejected: string[] } {
  const criteria: Criterion[] = [], rejected: string[] = [];
  for (const c of raw.slice(0, 10)) {
    const label = `${c.scope} ${c.field} ${c.op} ${c.value}`.slice(0, 100);
    const scope = c.scope as Scope, op = c.op as Op;
    if ((scope !== 'deal' && scope !== 'bl') || !OPS.includes(op)) { rejected.push(label); continue; }
    if ((NUMERIC[scope] as readonly string[]).includes(c.field)) {
      const n = parseAmount(c.value);
      if (!n) { rejected.push(label); continue; }
      criteria.push({ scope, field: c.field, op: n.plus && (op === 'gt' || op === 'eq') ? 'gte' : op, value: n.value });
    } else if (DATES[scope].includes(c.field)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.value.trim()) || Number.isNaN(Date.parse(c.value.trim()))) { rejected.push(label); continue; }
      criteria.push({ scope, field: c.field, op, value: c.value.trim() });
    } else if (TEXT[scope].includes(c.field)) {
      const value = c.value.trim();
      if (!/^[A-Za-z0-9 .&-]{1,30}$/.test(value) || (op !== 'eq' && op !== 'ne')) { rejected.push(label); continue; }
      criteria.push({ scope, field: c.field, op, value });
    } else rejected.push(label);
  }
  return { criteria, rejected };
}

export interface Rules { [kind: string]: number | boolean | string[] | undefined }
/** The part of the Anthropic client this route uses (a stand-in in tests). */
export interface AiClient { messages: { parse: (params: Record<string, unknown>) => Promise<{ parsed_output: unknown; stop_reason?: string | null }> } }
export interface AiDeps { client: AiClient | null }

/** The client for the key in the environment, or null when there is none. */
export function defaultAiDeps(env: Record<string, string | undefined> = process.env): AiDeps {
  const key = (env.ANTHROPIC_API_KEY ?? '').trim();
  return { client: key ? (new Anthropic({ apiKey: key }) as unknown as AiClient) : null };
}

const SYSTEM = [
  'You help a commodity trade-finance team match bills of lading (BLs) to a Deal ID.',
  'The application has already calculated every candidate combination; their totals are exact and within the allowed tolerance,',
  'unless a combination has a "fit": then nothing came within the tolerance and it is one of the closest. fit "over" covers the amount',
  'and its "cap" BL is assigned only the USD still left, so the deal ends filled; fit "under" fills only part of the amount.',
  'Your job: (1) rank the combinations from best to worst for the person, (2) give each ranked combination one short, concrete reason',
  '(for example how close it is, how many BLs or trade flows it uses, how old the trade flows are), and (3) translate the person\'s',
  `preferences into rules of these kinds only: ${RULE_KINDS.join(', ')}.`,
  'maxBls/minBls/tolerancePct use "number"; includeTf/excludeTf/includeBl/excludeBl use "values" (TF or BL numbers);',
  'preferOlder/preferNewer/preferFewerTfs need neither. Put anything you cannot express as such a rule in notUnderstood, in the person\'s words.',
  'Also read any conditions on the data into "criteria": {scope, field, op, value} with scope "deal" or "bl", op one of gt, gte, lt, lte, eq, ne.',
  'Deal fields: amount (the deal amount in USD), remaining (USD still open), commodity, dealId. BL fields: amount (the BL USD value), quantity, commodity,',
  'tfDate and blDate (value YYYY-MM-DD), tfNo, blNo. Never turn a deal condition into a BL condition or the reverse: "deals with an amount greater than 50K"',
  'is scope deal; "BLs worth more than 50K" is scope bl. Copy numbers as the person wrote them ("50K", "50K+"); the app converts them. "greater than" is gt, "at least" or "50K+" is gte.',
  'Every BL shown is already unassigned and active, so never emit an availability criterion. Set acrossDeals true only when the person explicitly asks to search across',
  'all deals; otherwise the chosen deal stays the context. Today is given in the request for relative dates.',
  'Never invent amounts, BLs or trade flows; refer to combinations only by their index. Rank at most 5.'
].join(' ');

/** The rules Claude returned, kept only when they are well formed; everything else is reported back. */
function toRules(raw: Output['rules']): { rules: Rules; rejected: string[] } {
  const rules: Rules = {}, rejected: string[] = [];
  for (const r of raw) {
    const kind = r.kind as (typeof RULE_KINDS)[number];
    if (!RULE_KINDS.includes(kind)) { rejected.push(r.kind); continue; }
    if (kind === 'maxBls' || kind === 'minBls') {
      if (r.number !== null && Number.isInteger(r.number) && r.number >= 1 && r.number <= 600) rules[kind] = r.number; else rejected.push(`${kind} ${String(r.number)}`);
    } else if (kind === 'tolerancePct') {
      if (r.number !== null && r.number > 0 && r.number <= 1) rules[kind] = r.number; else rejected.push(`a tolerance wider than 1% (${String(r.number)}%)`);
    } else if (kind === 'preferOlder' || kind === 'preferNewer' || kind === 'preferFewerTfs') {
      rules[kind] = true;
    } else {
      const values = r.values.map(v => v.trim()).filter(v => /^[A-Za-z0-9]{1,10}$/.test(v));
      if (values.length) rules[kind] = values; else rejected.push(kind);
    }
  }
  return { rules, rejected };
}

/** Handles POST /api/ai/proposals. */
export async function aiProposals(body: unknown, deps: AiDeps): Promise<unknown> {
  {
    const parsed = Input.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'The proposal request is not valid.', parsed.error.issues.slice(0, 5).map(i => ({ message: `${i.path.join('.')}: ${i.message}` })));
    if (!deps.client) throw new HttpError(503, 'AI is not configured.');
    const input = parsed.data;
    const response = await deps.client.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: zodOutputFormat(Output) },
      system: SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify({
        deal: input.deal,
        combinations: input.candidates.map((c, index) => ({ index, ...c })),
        bls: input.bls,
        today: new Date().toISOString().slice(0, 10),
        preferences: input.preferences
      }) }]
    });
    const out = Answer.safeParse(response.parsed_output);
    if (response.stop_reason === 'refusal' || !out.success) throw new HttpError(502, 'The AI gave no usable answer; the proposals are ranked by closeness instead.');
    const seen = new Set<number>();
    const ranked = out.data.ranked
      .filter(r => Number.isInteger(r.index) && r.index >= 0 && r.index < input.candidates.length && !seen.has(r.index) && seen.add(r.index))
      .slice(0, 5)
      .map(r => ({ index: r.index, reason: r.reason.trim().slice(0, 300) }));
    const { rules, rejected } = toRules(out.data.rules);
    const parsedCriteria = toCriteria(out.data.criteria ?? []);
    return ({
      ranked, rules, criteria: parsedCriteria.criteria, acrossDeals: out.data.acrossDeals === true,
      notUnderstood: [...out.data.notUnderstood.map(n => n.slice(0, 200)), ...rejected, ...parsedCriteria.rejected], model: AI_MODEL
    });
  }
}

// POST /api/ai/ask: a question about the proposals shown for a Deal ID (why a BL, which trade flows, what would change
// with …). Claude answers in a few sentences from the same fields as the ranking, and may turn the question into rules.
const AskInput = Input.omit({ preferences: true }).extend({
  question: z.string().trim().min(1).max(500),
  history: z.array(z.object({ question: z.string().max(500), answer: z.string().max(2000) })).max(6)
});
const AskOutput = z.object({
  answer: z.string(),
  rules: z.array(z.object({ kind: z.string(), values: z.array(z.string()), number: z.number().nullable() })),
  notUnderstood: z.array(z.string())
});
const ASK_SYSTEM = [
  'You help a commodity trade-finance team decide which bills of lading (BLs) to assign to a Deal ID.',
  'You get the deal, the proposals the application calculated (each with its BLs, exact USD total and difference),',
  'the BLs\' numbers, trade flows, dates, quantities and USD values, and the person\'s question.',
  'Answer in at most four short sentences, in plain language, using only these figures; refer to proposals as "Proposal 1", "Proposal 2" in the order given.',
  'A proposal with fit "over" covers the amount and its cap BL gives only the USD still left; fit "under" fills part of it.',
  `If the question asks to change the proposals, also return rules of these kinds only: ${RULE_KINDS.join(', ')}`,
  '(maxBls/minBls/tolerancePct use "number"; includeTf/excludeTf/includeBl/excludeBl use "values"; preferOlder/preferNewer/preferFewerTfs need neither);',
  'otherwise return no rules. Put a requested change you cannot express as such a rule in notUnderstood.',
  'Never invent amounts, BLs or trade flows, and never claim to have assigned anything: the person assigns.'
].join(' ');

/** Handles POST /api/ai/ask. */
export async function aiAsk(body: unknown, deps: AiDeps): Promise<unknown> {
  {
    const parsed = AskInput.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'The question is not valid.', parsed.error.issues.slice(0, 5).map(i => ({ message: `${i.path.join('.')}: ${i.message}` })));
    if (!deps.client) throw new HttpError(503, 'AI is not configured.');
    const input = parsed.data;
    const response = await deps.client.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: zodOutputFormat(AskOutput) },
      system: ASK_SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify({
        deal: input.deal,
        proposals: input.candidates.map((c, i) => ({ proposal: i + 1, ...c })),
        bls: input.bls,
        earlier: input.history,
        question: input.question
      }) }]
    });
    const out = AskOutput.safeParse(response.parsed_output);
    if (response.stop_reason === 'refusal' || !out.success) throw new HttpError(502, 'The AI gave no usable answer.');
    const { rules, rejected } = toRules(out.data.rules);
    return ({ answer: out.data.answer.trim().slice(0, 1200), rules, notUnderstood: [...out.data.notUnderstood.map(n => n.slice(0, 200)), ...rejected], model: AI_MODEL });
  }
}

// POST /api/ai/interpret: typed conditions the app's own reader could not place, turned into the same structured criteria
// (src/lib/propose/query.ts Criteria). Claude only reads the text; everything it returns is checked here, and the
// proposals are still calculated by the app on real SAP rows. Sent: the text, the chosen Deal ID with its TSF FX
// commodity, the commodity master (code, description, TSF FX commodity) and today's date. Nothing else.
const InterpretInput = z.object({
  text: z.string().trim().min(1).max(500),
  deal: z.object({ dealId: z.string().max(20), tsfCommodity: z.string().max(10) }).nullable(),
  commodities: z.array(z.object({ commodity: z.string().max(20), description: z.string().max(80), tsfCommodity: z.string().max(10) })).max(300),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});
const CmpOut = z.object({ op: z.enum(['>', '>=', '<', '<=', '=', 'between']), value: z.number(), to: z.number().nullable() }).nullable();
const RangeOut = z.object({ from: z.string().nullable(), to: z.string().nullable(), fromStrict: z.boolean(), toStrict: z.boolean() }).nullable();
const InterpretOutput = z.object({
  scope: z.enum(['selected', 'all']),
  dealAmount: CmpOut, dealRemaining: CmpOut, dealIds: z.array(z.string()),
  blAmount: CmpOut, blQuantity: CmpOut, tfDate: RangeOut,
  onlyBls: z.array(z.string()), includeBls: z.array(z.string()), excludeBls: z.array(z.string()), onlyTfs: z.array(z.string()), excludeTfs: z.array(z.string()),
  commodities: z.array(z.string()), maxBls: z.number().nullable(), minBls: z.number().nullable(),
  olderFirst: z.boolean(), newerFirst: z.boolean(), fewerTradeFlows: z.boolean(),
  notUnderstood: z.array(z.string())
});
export type InterpretReading = z.infer<typeof InterpretOutput>;
const INTERPRET_SYSTEM = [
  "You turn a commodity trade-finance user's typed conditions into filters for proposing bills of lading (BLs) for a Deal ID.",
  'Deal-level conditions (deal amount, amount left on the deal, Deal IDs) are never BL-level conditions, and the reverse;',
  'an amount whose subject is not stated goes to notUnderstood. Amounts are USD numbers: K = 1,000, L or lakh = 100,000,',
  'M = 1,000,000, Cr or crore = 10,000,000. "greater than 50K" is op ">" 50000; "50K+" is op ">=" 50000.',
  'BL numbers start with 40, trade flow numbers with 30, Deal IDs with 70 (10 digits). scope is "all" only when the user',
  'explicitly asks about deals in general (e.g. "show deals ..."); otherwise "selected". Dates are YYYY-MM-DD; tfDate is the',
  'trade flow date. Commodities only from the given master (use its commodity code). Use null or [] for what is not asked.',
  "Never invent numbers, BLs, trade flows or deals. Put anything you cannot express in notUnderstood, in the user's words."
].join(' ');

const ID10 = /^\d{10}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Handles POST /api/ai/interpret. */
export async function aiInterpret(body: unknown, deps: AiDeps): Promise<unknown> {
  {
    const parsed = InterpretInput.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'The conditions request is not valid.', parsed.error.issues.slice(0, 5).map(i => ({ message: `${i.path.join('.')}: ${i.message}` })));
    if (!deps.client) throw new HttpError(503, 'AI is not configured.');
    const input = parsed.data;
    const response = await deps.client.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: zodOutputFormat(InterpretOutput) },
      system: INTERPRET_SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(input) }]
    });
    const out = InterpretOutput.safeParse(response.parsed_output);
    if (response.stop_reason === 'refusal' || !out.success) throw new HttpError(502, 'The AI gave no usable reading of the conditions.');
    return ({ ...criteriaOf(out.data, input.commodities.map(c => c.commodity)), model: AI_MODEL });
  }
}

/** The AI's reading as the app's Criteria, keeping only well-formed values; the rest is reported as not applied. */
export function criteriaOf(o: InterpretReading, known: string[]): { criteria: Record<string, unknown>; notUnderstood: string[] } {
  const rejected: string[] = [];
  const ids = (list: string[], prefix: string, what: string) => {
    const ok = list.filter(x => ID10.test(x) && x.startsWith(prefix));
    for (const x of list) if (!ok.includes(x)) rejected.push(`${what} ${x}`);
    return ok;
  };
  const cmp = (c: InterpretReading['dealAmount'], what: string) => {
    if (!c) return undefined;
    if (!(c.value >= 0) || (c.op === 'between' && !(c.to !== null && c.to >= c.value))) { rejected.push(what); return undefined; }
    return c.op === 'between' ? { op: c.op, value: c.value, to: c.to } : { op: c.op, value: c.value };
  };
  const range = (r: InterpretReading['tfDate']) => {
    if (!r) return undefined;
    const from = r.from && ISO.test(r.from) ? r.from : undefined, to = r.to && ISO.test(r.to) ? r.to : undefined;
    if (!from && !to) { rejected.push('a trade-flow date'); return undefined; }
    return { ...(from ? { from, fromStrict: r.fromStrict } : {}), ...(to ? { to, toStrict: r.toStrict } : {}) };
  };
  const count = (n: number | null, what: string) => {
    if (n === null) return undefined;
    if (Number.isInteger(n) && n >= 1 && n <= 600) return n;
    rejected.push(what);
    return undefined;
  };
  const commodity = o.commodities.filter(c => known.includes(c));
  for (const c of o.commodities) if (!commodity.includes(c)) rejected.push(`commodity ${c}`);
  const clean = (x: Record<string, unknown>) => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length)));
  const order = clean({ older: o.olderFirst || undefined, newer: o.newerFirst || undefined, fewerTfs: o.fewerTradeFlows || undefined });
  const criteria = {
    scope: o.scope,
    deal: clean({ amount: cmp(o.dealAmount, 'a deal amount'), remaining: cmp(o.dealRemaining, 'an amount left'), dealIds: ids(o.dealIds, '7', 'Deal ID') }),
    bl: clean({
      amount: cmp(o.blAmount, 'a BL value'), quantity: cmp(o.blQuantity, 'a BL quantity'), tfDate: range(o.tfDate),
      only: ids(o.onlyBls, '4', 'BL'), include: ids(o.includeBls, '4', 'BL'), exclude: ids(o.excludeBls, '4', 'BL'),
      onlyTf: ids(o.onlyTfs, '3', 'trade flow'), excludeTf: ids(o.excludeTfs, '3', 'trade flow')
    }),
    ...(commodity.length ? { commodity } : {}),
    ...clean({ maxBls: count(o.maxBls, 'a number of BLs'), minBls: count(o.minBls, 'a number of BLs') }),
    ...(Object.keys(order).length ? { order } : {})
  };
  return { criteria, notUnderstood: [...o.notUnderstood.map(n => n.slice(0, 200)), ...rejected.map(r => `${r} (not valid)`)] };
}

/** Registers the three AI routes of Propose Tradeflow. The key is ANTHROPIC_API_KEY in the gateway environment; without it they answer 503. */
export async function tsfxAiRoutes(app: FastifyInstance, deps: AiDeps = defaultAiDeps()): Promise<void> {
  const route = (path: string, run: (body: unknown, deps: AiDeps) => Promise<unknown>) =>
    app.post(path, async (req: FastifyRequest, reply: FastifyReply) => {
      if (!requireSession(req, reply)) return;
      try {
        let body: unknown = {};
        if (Buffer.isBuffer(req.body) && req.body.length) {
          if (req.body.length > 512 * 1024) throw new HttpError(413, 'Request exceeds 1 MB.');
          try { body = JSON.parse(req.body.toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON.'); }
        }
        reply.send(await run(body, deps));
      } catch (error) {
        if (error instanceof HttpError) { reply.code(error.status).send({ error: { message: error.message, details: error.details } }); return; }
        req.log.error(error);
        reply.code(500).send({ error: { message: 'Something went wrong on the server. Try again.', details: [] } });
      }
    });
  route('/api/tsfx-ai/proposals', aiProposals);
  route('/api/tsfx-ai/ask', aiAsk);
  route('/api/tsfx-ai/interpret', aiInterpret);
}
