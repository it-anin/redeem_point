import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { act as domAct } from 'react-dom/test-utils'
import { getDocs } from 'firebase/firestore'
import History from './History'

// regression: หน้าประวัติฝั่งมือถือต้องไม่แสดงแถว "เพิ่มแต้ม" ของปุ่มเพิ่มรายการเวอร์ชันเก่าเป็นรายการแลก (เคยโผล่ "--500" และหัก "แต้มที่ใช้ไป")
// และ "แต้มที่ใช้ไป" ต้องไม่รวมรายการที่ถูกปฏิเสธ (คืนแต้มให้แล้ว) — นิยามอยู่ที่ pointsLedger.js
jest.mock('../firebase', () => ({ db: {} }))
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { email: 'emp@x.com' } }) }))
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), query: jest.fn(), where: jest.fn(), getDocs: jest.fn() }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const act = React.act ?? domAct

const ts = (y, m, d) => ({ toDate: () => new Date(y, m - 1, d), toMillis: () => new Date(y, m - 1, d).getTime() })
const REDEEM = { rewardId: 'r1', rewardName: 'เสื้อ', pointsUsed: 400, approval: 'อนุมัติแล้ว', createdAt: ts(2026, 9, 1) }
const REJECTED = { rewardId: 'r2', rewardName: 'แก้วน้ำ', pointsUsed: 300, approval: 'ปฏิเสธ', createdAt: ts(2026, 9, 2) }
const LEGACY_ADD = { rewardId: null, addedByAdmin: true, rewardName: 'โบนัสเดือนสิงหาคม', pointsUsed: -500, approval: 'อนุมัติแล้ว', status: 'สำเร็จ', createdAt: ts(2026, 9, 3) }
const ADMIN_REDEEM = { rewardId: null, addedByAdmin: true, rewardName: 'ของขวัญที่ admin บันทึกให้', pointsUsed: 100, approval: 'อนุมัติแล้ว', createdAt: ts(2026, 9, 4) }
const ADJUST = { rewardId: null, rewardName: 'เพิ่มแต้มโดย Admin', pointsUsed: -200, status: 'เพิ่มแต้ม', createdAt: ts(2026, 9, 5) }

let container, root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const renderWith = async (rows) => {
  getDocs.mockResolvedValue({ docs: rows.map((r, i) => ({ id: 'd' + i, data: () => r })) }) // CRA resetMocks ล้าง implementation ทุกเทสต์
  await act(async () => { root.render(<History />) })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  return {
    total: container.querySelector('.stat-num')?.textContent,
    items: [...container.querySelectorAll('.hist-item')].map((el) => ({
      name: el.querySelector('.hist-name')?.textContent,
      pts: el.querySelector('.hist-pts')?.textContent,
      ptsStyle: el.querySelector('.hist-pts')?.getAttribute('style') ?? '',
      badge: el.querySelector('.badge')?.textContent,
    })),
  }
}

test('แถวเพิ่มแต้มของปุ่มเก่า (addedByAdmin + ติดลบ) ไม่โผล่เป็นรายการแลก และไม่หัก "แต้มที่ใช้ไป"', async () => {
  const { total, items } = await renderWith([REDEEM, REJECTED, LEGACY_ADD])
  expect(items.map((i) => i.name).sort()).toEqual(['เสื้อ', 'แก้วน้ำ'])
  expect(container.textContent).not.toContain('โบนัสเดือนสิงหาคม')
  expect(container.textContent).not.toContain('--')
  expect(total).toBe('400') // เดิมโชว์ 200 (400 + 300 − 500)
})

test('รายการที่ปฏิเสธยังโชว์ในรายการพร้อมป้าย แต้มถูกขีดฆ่า และไม่นับใน "แต้มที่ใช้ไป"', async () => {
  const { total, items } = await renderWith([REDEEM, REJECTED])
  const rejected = items.find((i) => i.name === 'แก้วน้ำ')
  expect(rejected).toMatchObject({ pts: '-300', badge: 'ปฏิเสธ' })
  expect(rejected.ptsStyle).toMatch(/line-through/)
  expect(items.find((i) => i.name === 'เสื้อ').ptsStyle).not.toMatch(/line-through/)
  expect(total).toBe('400')
})

test('admin บันทึกการแลกแทน (addedByAdmin, บวก) ยังแสดงและนับ; admin ปรับแต้มไม่แสดง', async () => {
  const { total, items } = await renderWith([REDEEM, ADMIN_REDEEM, ADJUST])
  expect(items.map((i) => i.name).sort()).toEqual(['ของขวัญที่ admin บันทึกให้', 'เสื้อ'])
  expect(total).toBe('500')
})

test('มีแต่แถวเพิ่มแต้ม → ขึ้น "ยังไม่มีประวัติ" และแต้มที่ใช้ไป 0', async () => {
  const { total, items } = await renderWith([LEGACY_ADD, ADJUST])
  expect(items).toEqual([])
  expect(container.textContent).toContain('ยังไม่มีประวัติ')
  expect(total).toBe('0')
})
