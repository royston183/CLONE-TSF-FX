import { fmtDate, fmtNum } from './format.ts'
import type { MasterContract } from './types.ts'

const date = (value: Date) => Number.isFinite(value.getTime()) ? fmtDate(value) : '—'

/** Read-only form groups keep the review in the same order as contract creation. */
export function ContractReview({ contract: mc, open }: { contract: MasterContract; open: boolean }) {
  const groups: Array<{ title: string; fields: Array<[string, string | number, number?]> }> = [
    { title: 'Basic Selection', fields: [
      ['Origin Entity', mc.originEntity], ['MC Number', mc.mcNumber], ['Current Status', mc.status],
    ] },
    { title: 'Basic Details', fields: [
      ['MC Date', date(mc.mcDate)], ['MC Amount (USD)', `${fmtNum(mc.amtUSD)} USD`], ['Exchange Rate', mc.exRate.toFixed(4)],
      ['MC Reference No', mc.mcDescription, 2], ['MC Amount (Origin)', `${fmtNum(mc.amtOrigin)} ${mc.currOrigin}`],
    ] },
    { title: 'Commodity Details', fields: [
      ['Commodity', mc.commodityCode], ['Commodity Description', mc.commodityDesc, 2],
    ] },
    { title: 'Shipment Details', fields: [
      ['Shipment Start', date(mc.shipStart)], ['Shipment End', date(mc.shipEnd)], ['Payment Terms', mc.paymentTerms],
      ['Payment Date', date(mc.paymentDate)], ['Port of Shipment', mc.portOfShipment], ['Port of Destination', mc.portOfDestination],
    ] },
    { title: 'FX Model Details', fields: [
      ['FX Model', [mc.fxModel, mc.modelDesc].filter(Boolean).join(' · ')],
      ['Entity String', mc.entities.join(' → ')], ['Currency String', mc.currChain.join(' / ')],
    ] },
    { title: 'Remarks', fields: [['FO Remarks', mc.foRemarks], ['MO Remarks', mc.moRemarks, 2]] },
  ]
  return <details className="mc-contract-review" open={open}>
    <summary>MC {mc.mcNumber} · {mc.mcDescription}</summary>
    <div className="mc-review-groups">
      {groups.map(group => <section className="mc-review-group" key={group.title} aria-label={group.title}>
        <h3>{group.title}</h3>
        <dl className="mc-review-fields">
          {group.fields.map(([label, value, span = 1]) => <div key={label} className={`mc-review-field mc-review-span-${span}`}>
            <dt>{label}</dt><dd>{value || '—'}</dd>
          </div>)}
        </dl>
      </section>)}
    </div>
  </details>
}
