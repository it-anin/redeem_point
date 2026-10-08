import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { act as domAct } from 'react-dom/test-utils'
import ImportHistoryModal from './ImportHistoryModal'
import { importOne, rollbackOne } from '../importHistoryDb'
import { getDocs } from 'firebase/firestore'

const act = React.act ?? domAct // React 18.3+ ย้าย act มาที่ react (ตัวใน react-dom/test-utils ขึ้น deprecation warning)

// ทดสอบการเดินสายของโมดัลด้วย jsdom (mock Firestore) — ตรรกะคำนวณทดสอบที่ importHistory.test.js, ส่วนเขียน Firestore จริงทดสอบกับ emulator
jest.mock('../firebase', () => ({ db: { fake: 'db' } }))
jest.mock('firebase/firestore', () => ({ collection: jest.fn((db, name) => ({ name })), getDocs: jest.fn(async () => ({ docs: [] })) }))
jest.mock('../importHistoryDb', () => ({ importOne: jest.fn(), rollbackOne: jest.fn() }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const EMPLOYEES = [
  { id: 'alice@x.com', email: 'alice@x.com', name: 'Alice', code: 'E001', role: 'employee', points: 0 },
  { id: 'bob@x.com', email: 'bob@x.com', name: 'Bob', code: 'E002', role: 'employee', points: 300 },
]
const row = (...cells) => cells.join('\t')

let container, root, onChanged, onClose
beforeEach(() => {
  jest.clearAllMocks()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  onChanged = jest.fn(async () => {})
  onClose = jest.fn()
  window.confirm = jest.fn(() => true)
  getDocs.mockResolvedValue({ docs: [] }) // รายชื่อรอผูกบัญชี (CRA resetMocks ล้าง implementation ในตัว mock ทุกเทสต์ ต้องตั้งใหม่)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const render = async (props = {}) => {
  await act(async () => {
    root.render(<ImportHistoryModal employees={EMPLOYEES} transactions={[]} onClose={onClose} onChanged={onChanged} {...props} />)
  })
}
const setValue = async (el, value) => {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text))
const click = async (el) => {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await flush()
}
const fill = async ({ cutoff = '2025-12-31', text }) => {
  if (cutoff) await setValue(container.querySelector('input[type="date"]'), cutoff)
  await setValue(container.querySelector('textarea'), text)
}
const text = () => container.textContent

test('ต้องเลือกวันตัดยอด และต้องมีตัวคั่น Tab ก่อนตรวจสอบ', async () => {
  await render()
  await fill({ cutoff: '', text: row('E001', 'ของ', 1500, 200) })
  await click(button('ตรวจสอบข้อมูล'))
  expect(text()).toContain('กรุณาเลือก "วันตัดยอด"')

  await fill({ text: 'E001 ของ 1500 200' }) // คั่นด้วยเว้นวรรค ไม่ใช่ Tab
  await click(button('ตรวจสอบข้อมูล'))
  expect(text()).toContain('ไม่พบตัวคั่น Tab')
  expect(button('นำเข้า').disabled).toBe(true)
})

test('พรีวิว: คนที่ผ่านนำเข้าได้ คนที่ไม่พบถูกข้าม และปุ่มนำเข้าโชว์จำนวน', async () => {
  await render()
  await fill({ text: [row('E001', 'บัตรกำนัล', 1500, 200, '15/03/2024'), row('E001', 'เสื้อ', 1500, 350), row('ZZZ', 'ของ', 100, 10)].join('\n') })
  await click(button('ตรวจสอบข้อมูล'))
  expect(text()).toContain('พร้อมนำเข้า 1 คน · 3 แถว') // ยอดยกมา + 2 รายการ
  expect(text()).toContain('มีปัญหา 1')
  expect(text()).toContain('ไม่พบพนักงาน "ZZZ"')
  expect(text()).toContain('0 → 950') // ยอดตอนนี้ → ใหม่ = 1500 − 550
  expect(button('📥 นำเข้า 1 คน (3 แถว)').disabled).toBe(false)
})

test('เทียบกับ "คงเหลือ" ในไฟล์: ตรง → ✓ และนับ 1/1; ไม่ตรง (รายการขาด) → ถูกข้ามพร้อมบอกว่าขาดเท่าไร', async () => {
  await render()
  await fill({ text: row('E001', 'ของ', 2290, 1970, '', 320) })
  await click(button('ตรวจสอบข้อมูล'))
  expect(text()).toContain('เทียบกับ "คงเหลือ" ในไฟล์แล้ว 1/1 คน')
  expect(text()).toContain('ตรงกับคงเหลือในไฟล์ (320)')
  expect(button('📥 นำเข้า 1 คน').disabled).toBe(false)

  await fill({ text: row('E001', 'ของ', 2290, 1870, '', 320) }) // รายการแลกรวมได้ 1870 ขาดไป 100
  await click(button('ตรวจสอบข้อมูล'))
  expect(text()).toContain('รายการขาดไป 100')
  expect(text()).toContain('มีปัญหา 1')
  expect(button('📥 นำเข้า').disabled).toBe(true)
})

test('ไม่มีคอลัมน์คงเหลือ → นำเข้าได้เหมือนเดิม แต่ป้ายเตือนว่ายังไม่ได้เทียบ (0/1)', async () => {
  await render()
  await fill({ text: row('E001', 'ของ', 2290, 1970) })
  await click(button('ตรวจสอบข้อมูล'))
  expect(text()).toContain('เทียบกับ "คงเหลือ" ในไฟล์แล้ว 0/1 คน')
  expect(button('📥 นำเข้า 1 คน').disabled).toBe(false)
})

test('แก้ข้อมูลหลังตรวจสอบ → พรีวิวเก่าหายและปุ่มนำเข้าถูกปิด (กันนำเข้าข้อมูลที่ไม่ได้ตรวจ)', async () => {
  await render()
  await fill({ text: row('E001', 'ของ', 1500, 200) })
  await click(button('ตรวจสอบข้อมูล'))
  expect(button('📥 นำเข้า 1 คน').disabled).toBe(false)
  await setValue(container.querySelector('textarea'), row('E001', 'ของ', 1500, 300))
  expect(text()).not.toContain('พร้อมนำเข้า')
  expect(button('📥 นำเข้า').disabled).toBe(true)
})

test('นำเข้า: เรียก importOne(db, item, batchId, cutoff) แล้วส่งแถว/ยอด/log ให้หน้าแม่ครั้งเดียว', async () => {
  importOne.mockResolvedValue({ points: 1300, rows: [{ id: 'imp_alice@x.com', pointsUsed: -1500 }, { id: 'r1', pointsUsed: 200 }] })
  await render()
  await fill({ text: row('E001', 'ของ', 1500, 200) })
  await click(button('ตรวจสอบข้อมูล'))
  await click(button('📥 นำเข้า 1 คน'))

  expect(window.confirm).toHaveBeenCalledTimes(1)
  expect(importOne).toHaveBeenCalledTimes(1)
  const [db, item, batchId, cutoff] = importOne.mock.calls[0]
  expect(db).toEqual({ fake: 'db' })
  expect(item).toMatchObject({ label: 'Alice', total: 1500, used: 200, status: 'ok' })
  expect(batchId).toMatch(/^imp-\d{14}-[0-9a-z]{4}$/)
  expect(cutoff).toEqual(new Date(2025, 11, 31, 12, 0, 0, 0))

  expect(onChanged).toHaveBeenCalledTimes(1)
  const payload = onChanged.mock.calls[0][0]
  expect(payload.addedRows).toHaveLength(2)
  expect(payload.balances).toEqual({ 'alice@x.com': 1300 })
  expect(payload.log.action).toBe('import_history')
  expect(payload.log.detail).toContain(batchId)
  expect(text()).toContain('นำเข้าสำเร็จ 1 คน · 2 แถว')
  expect(text()).not.toContain('พร้อมนำเข้า') // พรีวิวถูกล้าง ต้องตรวจสอบใหม่
})

test('คนที่นำเข้าไม่สำเร็จไม่กระทบคนอื่น: แสดงรายชื่อที่พลาด และไม่เขียน log ถ้าไม่มีใครสำเร็จ', async () => {
  importOne.mockRejectedValue(new Error('permission-denied'))
  await render()
  await fill({ text: [row('E001', 'ของ', 1500, 200), row('E002', 'ของ', 1000, 100)].join('\n') })
  await click(button('ตรวจสอบข้อมูล'))
  await click(button('📥 นำเข้า 2 คน'))

  expect(importOne).toHaveBeenCalledTimes(2)
  expect(onChanged).not.toHaveBeenCalled()
  expect(text()).toContain('ไม่สำเร็จ 2 คน')
  expect(text()).toContain('Alice: permission-denied')
  expect(button('📥 นำเข้า').disabled).toBe(true) // ต้องตรวจสอบใหม่ก่อนลองอีกครั้ง
})

test('ยกเลิกที่หน้าต่างยืนยัน = ไม่เขียนอะไรเลย', async () => {
  window.confirm = jest.fn(() => false)
  await render()
  await fill({ text: row('E001', 'ของ', 1500, 200) })
  await click(button('ตรวจสอบข้อมูล'))
  await click(button('📥 นำเข้า 1 คน'))
  expect(importOne).not.toHaveBeenCalled()
  expect(onChanged).not.toHaveBeenCalled()
})

test('ย้อนการนำเข้าทั้งชุด: rollbackOne ต่อพนักงาน แล้วส่ง removedIds/ยอด/log ให้หน้าแม่', async () => {
  rollbackOne.mockResolvedValueOnce(0).mockResolvedValueOnce(450)
  const batch = 'imp-20261007153005-ab12'
  const transactions = [
    { id: 'imp_alice@x.com', employeeId: 'alice@x.com', employeeName: 'Alice', importBatch: batch, pointsUsed: -1500 },
    { id: 't1', employeeId: 'alice@x.com', employeeName: 'Alice', importBatch: batch, pointsUsed: 200 },
    { id: 'imp_bob@x.com', employeeId: 'bob@x.com', employeeName: 'Bob', importBatch: batch, pointsUsed: -1000 },
    { id: 'other', employeeId: 'bob@x.com', employeeName: 'Bob', pointsUsed: 50 }, // ไม่ใช่แถวนำเข้า ต้องไม่ถูกแตะ
  ]
  await render({ transactions })
  expect(text()).toContain('ชุดที่นำเข้าแล้ว (1)')
  expect(text()).toContain('2 คน · 3 แถว')
  await click(button('↩️ ย้อนชุดนี้'))

  expect(rollbackOne).toHaveBeenCalledTimes(2)
  expect(rollbackOne.mock.calls.map(([, g]) => [g.employeeId, g.ids, g.delta, g.expected])).toEqual([
    ['alice@x.com', ['imp_alice@x.com', 't1'], -1300, 1300],
    ['bob@x.com', ['imp_bob@x.com'], -1000, 1000],
  ])
  const payload = onChanged.mock.calls[0][0]
  expect(payload.removedIds.sort()).toEqual(['imp_alice@x.com', 'imp_bob@x.com', 't1'])
  expect(payload.balances).toEqual({ 'alice@x.com': 0, 'bob@x.com': 450 })
  expect(payload.log.action).toBe('import_rollback')
  expect(text()).toContain('ย้อนการนำเข้าเรียบร้อย')
})

test('พนักงานที่ยังรอผูกบัญชีถูกข้ามพร้อมบอกเหตุผล (อ่าน pendingEmployees สำเร็จ ไม่ขึ้นข้อความว่าอ่านไม่ได้)', async () => {
  getDocs.mockResolvedValue({ docs: [{ id: 'E099', data: () => ({ name: 'ใหม่ ยังไม่ผูก' }) }] })
  await render()
  await fill({ text: row('E099', 'ของ', 1000, 100) })
  await click(button('ตรวจสอบข้อมูล'))
  expect(text()).toContain('ยังไม่ผูกบัญชี (รหัส E099)')
  expect(text()).not.toContain('อ่านรายชื่อ "รอผูกบัญชี" ไม่ได้')
  expect(button('📥 นำเข้า').disabled).toBe(true)
})

test('อ่านรายชื่อรอผูกบัญชีไม่ได้ → ตรวจต่อได้ แต่เตือนว่า "ไม่พบ" อาจเป็นคนที่ยังไม่ผูกบัญชี', async () => {
  getDocs.mockRejectedValue(new Error('quota'))
  await render()
  await fill({ text: row('E099', 'ของ', 1000, 100) })
  await click(button('ตรวจสอบข้อมูล'))
  expect(text()).toContain('ไม่พบพนักงาน "E099"')
  expect(text()).toContain('อ่านรายชื่อ "รอผูกบัญชี" ไม่ได้')
})

test('ย้อนชุดแต่ยอดเปลี่ยนหลังนำเข้า (CHANGED): ข้ามคนนั้นพร้อมเหตุผล ไม่ลบแถว ไม่เขียน log', async () => {
  rollbackOne.mockRejectedValue(Object.assign(new Error('ยอดตอนนี้ 220 ไม่ตรงกับยอดหลังนำเข้า 320 (มีการแลก/ปรับแต้มหลังนำเข้า) — ข้ามคนนี้'), { code: 'CHANGED' }))
  const batch = 'imp-20261007153005-ab12'
  const transactions = [
    { id: 'imp_alice@x.com', employeeId: 'alice@x.com', employeeName: 'Alice', importBatch: batch, pointsUsed: -2290 },
    { id: 't1', employeeId: 'alice@x.com', employeeName: 'Alice', importBatch: batch, pointsUsed: 1970 },
  ]
  await render({ transactions })
  await click(button('↩️ ย้อนชุดนี้'))
  expect(rollbackOne).toHaveBeenCalledTimes(1)
  expect(onChanged).not.toHaveBeenCalled()
  expect(text()).toContain('ไม่สำเร็จ 1 คน')
  expect(text()).toContain('Alice: ยอดตอนนี้ 220 ไม่ตรงกับยอดหลังนำเข้า 320')
})
