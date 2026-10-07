import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { joinBlDocuments } from './api.ts'
import { buCommodity, buildTfStatusMaster } from './masters.ts'

describe('buildTfStatusMaster', () => {
  const master = buildTfStatusMaster([
    { ZtfStId: '01', ZtfStName: 'Uploaded - New', ZtfStType: '01' },
    { ZtfStId: '11', ZtfStName: 'TF Blocked - Partial', ZtfStType: '02' },
    { ZtfStId: '22', ZtfStName: 'Available to Use', ZtfStType: '03' },
    { ZtfStId: '21', ZtfStName: 'Awaiting details from BU', ZtfStType: '03' },
  ])

  it('offers only type 03 statuses for OGBS, in code order', () => {
    deepStrictEqual(master.ogbs, [
      { value: '21', label: '21 Awaiting details from BU' },
      { value: '22', label: '22 Available to Use' },
    ])
  })

  it('keeps the TF and blocked lists apart, and names every code', () => {
    deepStrictEqual(master.flow.map((o) => o.value), ['01'])
    deepStrictEqual(master.blocked.map((o) => o.value), ['11'])
    strictEqual(master.nameOf.get('22'), 'Available to Use')
  })
})

describe('buCommodity', () => {
  const master = [
    { ZcomId: 'C125', ZcomDesc: 'RICE', ZbuId: 'B02' },
    { ZcomId: 'C102', ZcomDesc: 'WHEAT', ZbuId: 'B01' },
    { ZcomId: 'C103', ZcomDesc: 'SOYABEAN', ZbuId: 'B01' },
  ]

  it("uses the trade flow's own commodity ID first", () => {
    strictEqual(buCommodity({ ZtrmComId: 'C103', ZbuId: 'B02' }, master), 'SOYABEAN')
  })

  it('falls back to the unit, but only when the unit has a single commodity', () => {
    strictEqual(buCommodity({ ZbuId: 'B02' }, master), 'RICE')
    strictEqual(buCommodity({ ZbuId: 'B01' }, master), '')
  })

  it('shows an unknown commodity ID as itself rather than blank', () => {
    strictEqual(buCommodity({ ZtrmComId: 'C999' }, master), 'C999')
  })
})

describe('joinBlDocuments', () => {
  it('lists each document under its BL with its type text', () => {
    const rows = joinBlDocuments(
      [{ ZblNo: '4000000001', ZtsfDmsCode: 'D1', ZstndDms: 'S1' }],
      [{ ZtsfDmsCode: 'D1', ZstndDms: 'S1', ZdmsCat: 'BL', ZdocType: 'PDF', ZdocName: 'bl-copy', ZdocExtn: 'pdf' }],
      [{ ZdmsCat: 'BL', ZdmsType: 'PDF', ZdmsDesc: 'Bill of Lading copy' }],
    )
    deepStrictEqual(rows, [
      {
        blNo: '4000000001',
        dmsCode: 'D1',
        standardDms: 'S1',
        name: 'bl-copy',
        extension: 'pdf',
        typeText: 'Bill of Lading copy',
        description: '',
      },
    ])
  })

  it('keeps a BL link whose document is missing, by its code', () => {
    const [row] = joinBlDocuments([{ ZblNo: '4000000002', ZtsfDmsCode: 'D9' }], [], [])
    strictEqual(row?.dmsCode, 'D9')
    strictEqual(row?.name, '')
  })
})
