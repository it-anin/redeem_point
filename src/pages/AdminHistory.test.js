import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { act as domAct } from 'react-dom/test-utils'
import { collection, query, orderBy, getDocs, getCountFromServer, addDoc } from 'firebase/firestore'
import AdminHistory from './AdminHistory'
import { deleteHistoryRow, editHistoryRow } from '../pointsDb'

// หน้า ประวัติทั้งหมด (แอดมิน): สถิติหัวกลุ่ม/แถวที่ปฏิเสธ/ลบ-แก้ผ่าน pointsDb/แผงตรวจยอด — mock Firestore
// (ตรรกะเขียนยอดจริงทดสอบที่ emulator-tests/run.mjs)
jest.mock('../firebase', () => ({ db: { fake: 'db' } }))
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ profile: { name: 'Admin', email: 'admin@x' }, user: { email: 'admin@x' } }) }))
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), query: jest.fn(), orderBy: jest.fn(), getDocs: jest.fn(), getCountFromServer: jest.fn(), doc: jest.fn(), runTransaction: jest.fn(), addDoc: jest.fn(),
}))
jest.mock('../pointsDb', () => ({ deleteHistoryRow: jest.fn(), editHistoryRow: jest.fn() }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const act = React.act ?? domAct

const ts = (d) => ({ toDate: () => new Date(2026, 8, d), toMillis: () => new Date(2026, 8, d).getTime() })
const EMPLOYEES = [
  { id: 'alice@x', name: 'Alice', code: 'E001', role: 'employee', points: 600, department: 'Sale Admin' },
  { id: 'admin@x', name: 'Admin', role: 'admin', points: 0 },
]
const TX = [
  { id: 't-redeem', employeeId: 'alice@x', employeeName: 'Alice', rewardId: 'r1', rewardName: 'เสื้อ', pointsUsed: 400, approval: 'อนุมัติแล้ว', status: 'สำเร็จ', createdAt: ts(1) },
  { id: 't-rejected', employeeId: 'alice@x', employeeName: 'Alice', rewardId: 'r2', rewardName: 'แก้วน้ำ', pointsUsed: 300, approval: 'ปฏิเสธ', status: 'สำเร็จ', createdAt: ts(2) },
  { id: 't-legacy', employeeId: 'alice@x', employeeName: 'Alice', rewardId: null, addedByAdmin: true, rewardName: 'โบนัส', pointsUsed: -500, approval: 'อนุมัติแล้ว', status: 'สำเร็จ', createdAt: ts(3) },
]

let container, root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  window.confirm = jest.fn(() => true)
  // CRA resetMocks ล้าง implementation ทุกเทสต์ → ตั้งใหม่ที่นี่
  collection.mockImplementation((db, name) => ({ __name: name }))
  query.mockImplementation((c) => c)
  orderBy.mockImplementation(() => ({}))
  getDocs.mockImplementation(async (q) => ({
    docs: (q.__name === 'employees' ? EMPLOYEES : TX).map((r) => ({ id: r.id, data: () => { const { id, ...rest } = r; return rest } })),
  }))
  getCountFromServer.mockResolvedValue({ data: () => ({ count: 0 }) })
  addDoc.mockResolvedValue({ id: 'log1' })
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const render = async () => { await act(async () => { root.render(<AdminHistory />) }); await flush() }
const text = () => container.textContent
const button = (label) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(label))
// ปุ่ม "บันทึก" ของโมดัลแก้ไข ต้องตรงตัว (บนแถบเครื่องมือมี "🎁 บันทึกการแลก" ที่มีคำว่าบันทึกเหมือนกัน)
const exact = (label) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === label)
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) }); await flush() }
const expandAlice = () => click(container.querySelector('tbody tr'))
const rowOf = (name) => [...container.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes(name) && tr.querySelector('button'))

test('หัวกลุ่ม: แต้มที่ใช้ไป ไม่รวมแถวเพิ่มแต้มของปุ่มเก่า/แถวที่ปฏิเสธ · สุทธิตามประวัติ ไม่รวมแถวที่ปฏิเสธ', async () => {
  await render()
  const header = container.querySelector('tbody tr').textContent
  expect(header).toContain('แต้มที่ใช้ไป 400')      // เดิม 400 + 300 − 500 = 200
  expect(header).toContain('สุทธิตามประวัติ +100')   // −400 (แลก) +500 (เพิ่มแต้ม), แถวที่ปฏิเสธไม่นับ
  expect(header).toContain('คงเหลือจริง 600')
  expect(text()).toContain('พบ 3 รายการ · รวม -100 แต้ม') // ผลรวมหน้า ไม่นับแถวที่ปฏิเสธ
})

test('แถวที่ปฏิเสธ: ป้าย "ปฏิเสธ" และตัวเลขขีดฆ่า; แถวเพิ่มแต้มของปุ่มเก่าแสดงเป็น +500', async () => {
  await render()
  await expandAlice()
  const rejected = rowOf('แก้วน้ำ')
  expect(rejected.textContent).toContain('ปฏิเสธ')
  expect(rejected.querySelectorAll('td')[1].getAttribute('style')).toMatch(/line-through/)
  expect(rowOf('โบนัส').textContent).toContain('+500')
})

test('ลบแถวที่ปฏิเสธ: ยืนยันด้วยข้อความ "ไม่คืนซ้ำ" แล้วเรียก deleteHistoryRow และเอาแถวออก (ไม่ขยับยอดบนหน้าจอ)', async () => {
  deleteHistoryRow.mockResolvedValue({ balance: null, refund: 0, restocked: false, rejected: true, row: {} })
  await render()
  await expandAlice()
  await click([...rowOf('แก้วน้ำ').querySelectorAll('button')].find((b) => b.textContent.includes('ลบ')))
  expect(window.confirm.mock.calls[0][0]).toContain('ลบแถวอย่างเดียว ไม่คืนซ้ำ')
  expect(deleteHistoryRow).toHaveBeenCalledWith({ fake: 'db' }, 't-rejected')
  expect(text()).toContain('ลบรายการเรียบร้อย (ปฏิเสธไปแล้ว จึงไม่คืนแต้มซ้ำ)')
  expect(rowOf('แก้วน้ำ')).toBeUndefined()
  expect(container.querySelector('tbody tr').textContent).toContain('คงเหลือจริง 600')
})

test('ลบแถวปกติ: คืนแต้มตามที่ฐานข้อมูลส่งกลับ และยอดบนหัวกลุ่มเปลี่ยนตาม', async () => {
  deleteHistoryRow.mockResolvedValue({ balance: 1000, refund: 400, restocked: true, rejected: false, row: {} })
  await render()
  await expandAlice()
  await click([...rowOf('เสื้อ').querySelectorAll('button')].find((b) => b.textContent.includes('ลบ')))
  expect(window.confirm.mock.calls[0][0]).toContain('คืนแต้ม 400')
  expect(text()).toContain('ลบรายการและคืนแต้มเรียบร้อย!')
  expect(container.querySelector('tbody tr').textContent).toContain('คงเหลือจริง 1,000')
})

test('ลบซ้ำจากหน้าค้าง (GONE): เอาแถวออกจากหน้าจอและแจ้ง ไม่ขยับยอด', async () => {
  deleteHistoryRow.mockRejectedValue(Object.assign(new Error('ไม่พบรายการนี้ (อาจถูกลบไปแล้ว) กรุณารีเฟรชหน้า'), { code: 'GONE' }))
  await render()
  await expandAlice()
  await click([...rowOf('เสื้อ').querySelectorAll('button')].find((b) => b.textContent.includes('ลบ')))
  expect(text()).toContain('ลบไม่สำเร็จ: ไม่พบรายการนี้')
  expect(rowOf('เสื้อ')).toBeUndefined()
  expect(container.querySelector('tbody tr').textContent).toContain('คงเหลือจริง 600')
})

test('แก้แถวที่ปฏิเสธ: โมดัลแจ้งว่าไม่กระทบยอด และบันทึกผ่าน editHistoryRow ด้วยค่าที่แก้', async () => {
  editHistoryRow.mockResolvedValue({ balance: null, delta: 0, oldEffect: -300, rejected: true })
  await render()
  await expandAlice()
  await click([...rowOf('แก้วน้ำ').querySelectorAll('button')].find((b) => b.textContent.includes('แก้ไข')))
  expect(text()).toContain('ถูกปฏิเสธแล้ว')
  expect(text()).toContain('ไม่กระทบยอดแต้ม')
  expect(text()).not.toContain('ยอดสะสมของพนักงานจะถูกปรับ')
  await click(exact('บันทึก'))
  expect(editHistoryRow).toHaveBeenCalledWith({ fake: 'db' }, 't-rejected', { effect: -300, rewardName: 'แก้วน้ำ', note: '' })
  expect(text()).toContain('แก้ไขรายการเรียบร้อย!')
})

test('🔎 ตรวจยอดแต้ม: เปิดแผงแล้วเห็นสรุป และคนที่มีประวัติแต่ยอดไม่ตรง (600 ≠ ประวัติ +100)', async () => {
  await render()
  await click(button('🔎 ตรวจยอดแต้ม'))
  const panelText = text()
  expect(panelText).toContain('⚠️ ไม่ตรง 1')
  expect(panelText).toContain('+500') // ผลต่าง
  expect(panelText).toContain('เพิ่มแต้มด้วยปุ่มเพิ่มรายการเวอร์ชันเก่า 1 แถว (+500)')
  expect(panelText).toContain('มีรายการที่ปฏิเสธ 1')
})
