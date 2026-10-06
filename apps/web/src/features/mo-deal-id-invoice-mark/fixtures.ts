/**
 * Test fixtures only — imported by the *.test.ts files, never by the screen. The legacy
 * page's makeRow() rows; enrichRow (logic.ts) fills in the derived columns.
 */
import type { DealRow } from './types.ts'

type SeedRow = Omit<DealRow, 'status' | 'statusDesc' | 'modelDesc' | 'manualMarked' | 'earliestStart' | 'daysShip' | 'daysEnd' | 'daysStart'>

function makeRow(id: string, desc: string, mc: string, commodity: string, ds: string, de: string, origin: string, model: string, region: string, amount: number, ss: string, se: string): SeedRow {
  return { dealId: id, dealDesc: desc, mcRef: mc, commodity, dealStart: ds, dealEnd: de, origin, model, region, amount, shipStart: ss, shipEnd: se, trader: '', mcDesc: '', mcDate: '', entityString: '', currencyString: '' }
}

const SEED: SeedRow[] = [
  makeRow('3000167', 'OSIPL edible oils Q4 hedge', 'MC100067', 'Edible Oils', '10-09-2026', '30-06-2027', 'OSIPL', 'DSX', 'APAC', 6284779.05, '01-10-2026', '31-01-2027'),
  makeRow('3000166', 'DMCC cocoa shipment cover', 'MC100066', 'Cocoa', '18-09-2026', '31-03-2027', 'DMCC', 'LCP', 'MEA', 1000000.0, '22-09-2026', '31-12-2026'),
  makeRow('3000165', 'DMCC coffee shipment cover', 'MC100065', 'Coffee', '15-09-2026', '28-02-2027', 'DMCC', 'LCP', 'MEA', 980392.16, '20-09-2026', '30-11-2026'),
  makeRow('3000164', 'OGA cotton export hedge', 'MC100064', 'Cotton', '01-09-2026', '31-05-2027', 'OGA', 'LCP', 'MEA', 1000000.0, '12-10-2026', '31-12-2026'),
  makeRow('3000163', 'OGA cocoa utilisation', 'MC100063', 'Cocoa', '22-08-2026', '31-03-2027', 'OGA', 'LCP', 'MEA', 909090.91, '25-09-2026', '30-12-2026'),
  makeRow('3000162', 'DMCC grains structured cover', 'MC100062', 'Grains', '14-09-2026', '31-12-2027', 'DMCC', 'CCDSX', 'MEA', 7317187.5, '30-11-2026', '31-05-2027'),
  makeRow('3000161', 'SEDA cocoa shipment hedge', 'MC100061', 'Cocoa', '05-09-2026', '30-09-2027', 'SEDA', 'DSX', 'EUR', 4854368.93, '30-09-2026', '31-03-2027'),
  makeRow('3000160', 'DMCC coffee forward cover', 'MC100060', 'Coffee', '25-08-2026', '30-06-2027', 'DMCC', 'DSX', 'MEA', 1000000.0, '18-09-2026', '31-12-2026'),
  makeRow('3000159', 'PAN cashew shipment cover', 'MC100059', 'Cashew', '11-09-2026', '31-08-2027', 'PAN', 'FWD', 'APAC', 4200000.0, '08-10-2026', '28-02-2027'),
  makeRow('3000158', 'OGA almonds seasonal hedge', 'MC100058', 'Almonds', '20-09-2026', '31-07-2027', 'OGA', 'MIXED', 'MEA', 2750000.0, '15-10-2026', '31-03-2027'),
  makeRow('3000157', 'OSIPL grains procurement hedge', 'MC100057', 'Grains', '12-09-2026', '30-09-2027', 'OSIPL', 'DSX', 'APAC', 5850000.0, '01-11-2026', '30-04-2027'),
  makeRow('3000156', 'SEDA cotton contract hedge', 'MC100056', 'Cotton', '07-09-2026', '31-05-2027', 'SEDA', 'LCP', 'EUR', 1750000.0, '18-10-2026', '28-02-2027'),
  makeRow('3000155', 'DMCC sugar shipment cover', 'MC100055', 'Sugar', '17-08-2026', '31-03-2027', 'DMCC', 'FWD', 'MEA', 3125000.0, '26-09-2026', '31-12-2026'),
  makeRow('3000154', 'OGA rice export hedge', 'MC100054', 'Rice', '03-09-2026', '30-06-2027', 'OGA', 'LCP', 'MEA', 2240000.0, '04-10-2026', '31-01-2027'),
  makeRow('3000153', 'PAN coffee procurement', 'MC100053', 'Coffee', '19-09-2026', '30-11-2027', 'PAN', 'CCDSX', 'APAC', 6960000.0, '12-12-2026', '30-06-2027'),
  makeRow('3000152', 'SEDA cocoa export cover', 'MC100052', 'Cocoa', '04-09-2026', '31-08-2027', 'SEDA', 'DSX', 'EUR', 3895000.0, '28-09-2026', '31-03-2027'),
  makeRow('3000151', 'OSIPL sunflower oil hedge', 'MC100051', 'Edible Oils', '27-08-2026', '31-05-2027', 'OSIPL', 'MIXED', 'APAC', 5120000.0, '20-09-2026', '28-02-2027'),
  makeRow('3000150', 'OGA sesame export hedge', 'MC100050', 'Sesame', '09-09-2026', '31-10-2027', 'OGA', 'FWD', 'MEA', 1480000.0, '19-11-2026', '30-04-2027'),
  makeRow('3000149', 'DMCC pulses shipment hedge', 'MC100049', 'Pulses', '14-08-2026', '31-03-2027', 'DMCC', 'LCP', 'MEA', 2450000.0, '15-09-2026', '31-12-2026'),
  makeRow('3000148', 'PAN spices shipment cover', 'MC100048', 'Spices', '01-09-2026', '31-07-2027', 'PAN', 'DSX', 'APAC', 1980000.0, '05-10-2026', '31-03-2027'),
  makeRow('3000147', 'SEDA coffee seasonal hedge', 'MC100047', 'Coffee', '23-09-2026', '30-09-2027', 'SEDA', 'CCDSX', 'EUR', 3640000.0, '22-12-2026', '30-06-2027'),
  makeRow('3000146', 'OGA wheat export cover', 'MC100046', 'Wheat', '06-09-2026', '31-05-2027', 'OGA', 'DSX', 'MEA', 4310000.0, '29-09-2026', '31-03-2027'),
  makeRow('3000145', 'OSIPL rice procurement hedge', 'MC100045', 'Rice', '16-09-2026', '31-12-2027', 'OSIPL', 'LCP', 'APAC', 5880000.0, '10-12-2026', '30-06-2027'),
  makeRow('3000144', 'DMCC cotton shipment cover', 'MC100044', 'Cotton', '13-08-2026', '31-03-2027', 'DMCC', 'FWD', 'MEA', 2050000.0, '11-09-2026', '31-12-2026'),
  makeRow('3000143', 'SEDA cashew export hedge', 'MC100043', 'Cashew', '10-09-2026', '31-08-2027', 'SEDA', 'DSX', 'EUR', 3290000.0, '09-10-2026', '31-03-2027'),
  makeRow('3000142', 'PAN cocoa structured cover', 'MC100042', 'Cocoa', '24-08-2026', '30-06-2027', 'PAN', 'MIXED', 'APAC', 4475000.0, '24-09-2026', '31-12-2026'),
  makeRow('3000141', 'OGA coffee Q1 hedge', 'MC100041', 'Coffee', '18-09-2026', '31-12-2027', 'OGA', 'LCP', 'MEA', 2250000.0, '02-01-2027', '30-06-2027'),
  makeRow('3000140', 'OSIPL wheat shipment hedge', 'MC100040', 'Wheat', '02-09-2026', '31-07-2027', 'OSIPL', 'CCDSX', 'APAC', 6140000.0, '17-10-2026', '31-03-2027'),
  makeRow('3000139', 'DMCC sugar procurement cover', 'MC100039', 'Sugar', '01-08-2026', '28-02-2027', 'DMCC', 'DSX', 'MEA', 1825000.0, '05-09-2026', '30-11-2026'),
]

export function buildInitialData(): SeedRow[] {
  return SEED.map((r) => ({ ...r }))
}
