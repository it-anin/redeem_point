import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { act as domAct } from 'react-dom/test-utils'
import { getDocs } from 'firebase/firestore'
import AdminApprovals from './AdminApprovals'
import { approveRedemption, rejectRedemption } from '../pointsDb'

// หน้านี้โหลดรายการครั้งเดียวแล้วค้างได้นาน → ถ้าแอดมินอีกคน/แท็บเก่าจัดการรายการไปแล้ว ฐานข้อมูลจะไม่ยอมทำซ้ำ (STALE/GONE)
// หน้าจอต้องแก้แถวให้ตรงความจริงและแจ้ง ไม่ใช่ทำท่าว่าสำเร็จ (ตรรกะฝั่งฐานข้อมูลทดสอบที่ emulator-tests/)
jest.mock('../firebase', () => ({ db: { fake: 'db' } }))
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), getDocs: jest.fn() }))
jest.mock('../pointsDb', () => ({ approveRedemption: jest.fn(), rejectRedemption: jest.fn() }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const act = React.act ?? domAct

const ts = (d) => ({ toMillis: () => new Date(2026, 9, d).getTime(), toDate: () => new Date(2026, 9, d) })
const ROWS = [
  { rewardId: 'r1', employeeId: 'a@x', employeeName: 'Alice', rewardName: 'เสื้อ', pointsUsed: 300, approval: 'รออนุมัติ', createdAt: ts(1) },
  { rewardId: 'r2', employeeId: 'b@x', employeeName: 'Bob', rewardName: 'แก้ว', pointsUsed: 200, approval: 'รออนุมัติ', createdAt: ts(2) },
]

let container, root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  window.confirm = jest.fn(() => true)
  getDocs.mockResolvedValue({ docs: ROWS.map((r, i) => ({ id: 'tx' + (i + 1), data: () => r })) }) // CRA resetMocks ล้าง implementation ทุกเทสต์
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const render = async () => { await act(async () => { root.render(<AdminApprovals />) }); await flush() }
const text = () => container.textContent
const button = (label, nth = 0) => [...container.querySelectorAll('button')].filter((b) => b.textContent.includes(label))[nth]
// ปุ่มกรองสถานะ ("รออนุมัติ (2)" มีคำว่า "อนุมัติ" ด้วย) ต้องเลือกด้วยข้อความตรงตัว ส่วนปุ่มของแถวเลือกด้วยไอคอน (✅ อนุมัติ / ↩️ ปฏิเสธ)
const exact = (label) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === label)
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) }); await flush() }

test('อนุมัติสำเร็จ: เรียก approveRedemption(db, id) และรายการออกจากคิวรออนุมัติ', async () => {
  await render()
  expect(text()).toContain('รออนุมัติ (2)')
  await click(button('✅ อนุมัติ', 0)) // แถวแรก = ใหม่สุด (Bob, tx2)
  expect(approveRedemption).toHaveBeenCalledWith({ fake: 'db' }, 'tx2')
  expect(text()).toContain('อนุมัติ "แก้ว" ของ Bob แล้ว')
  expect(text()).toContain('รออนุมัติ (1)')
})

test('ปฏิเสธสำเร็จ: เรียก rejectRedemption(db, id) หลังยืนยัน', async () => {
  await render()
  await click(button('↩️ ปฏิเสธ', 0)) // ปุ่มปฏิเสธของแถวแรก (Bob, tx2)
  expect(window.confirm).toHaveBeenCalledTimes(1)
  expect(rejectRedemption).toHaveBeenCalledWith({ fake: 'db' }, 'tx2')
  expect(text()).toContain('ปฏิเสธและคืนแต้มให้ Bob แล้ว')
})

test('หน้าค้าง: อีกคนปฏิเสธไปแล้ว (STALE) → แจ้ง และแก้แถวเป็น "ปฏิเสธ" ตามความจริง (ไม่ทำซ้ำ)', async () => {
  approveRedemption.mockRejectedValue(Object.assign(new Error('รายการนี้ถูกปฏิเสธไปแล้ว กรุณารีเฟรชหน้า'), { code: 'STALE', current: 'ปฏิเสธ' }))
  await render()
  await click(button('✅ อนุมัติ', 0))
  expect(text()).toContain('อนุมัติไม่สำเร็จ: รายการนี้ถูกปฏิเสธไปแล้ว')
  expect(text()).not.toContain('อนุมัติ "แก้ว" ของ Bob แล้ว')
  expect(text()).toContain('รออนุมัติ (1)') // แถวนั้นไม่ใช่ "รออนุมัติ" แล้ว
  await click(exact('ปฏิเสธ')) // ปุ่มกรอง "ปฏิเสธ" → เห็นแถวที่ถูกแก้สถานะ
  expect(text()).toContain('Bob')
})

test('หน้าค้าง: รายการถูกลบไปแล้ว (GONE) → เอาแถวออกจากหน้าจอ', async () => {
  rejectRedemption.mockRejectedValue(Object.assign(new Error('ไม่พบรายการนี้ (อาจถูกลบไปแล้ว) กรุณารีเฟรชหน้า'), { code: 'GONE' }))
  await render()
  await click(button('↩️ ปฏิเสธ', 0))
  expect(text()).toContain('ปฏิเสธไม่สำเร็จ: ไม่พบรายการนี้')
  expect(text()).toContain('รออนุมัติ (1)')
  expect(text()).not.toContain('Bob')
})
