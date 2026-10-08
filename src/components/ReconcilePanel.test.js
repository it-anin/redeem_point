import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { act as domAct } from 'react-dom/test-utils'
import ReconcilePanel from './ReconcilePanel'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const act = React.act ?? domAct

const emp = (id, name, points, extra = {}) => ({ id, name, points, role: 'employee', code: 'C-' + name, ...extra })
const EMPLOYEES = [
  emp('ok@x', 'ตรง', 100),
  emp('none@x', 'ไม่มีประวัติ', 500),
  emp('bad@x', 'ไม่ตรง', 900),
  emp('imp@x', 'นำเข้าแต่คลาด', 1000),
  emp('admin@x', 'แอดมิน', 0, { role: 'admin' }),
]
const TXS = [
  { id: '1', employeeId: 'ok@x', pointsUsed: -500 },
  { id: '2', employeeId: 'ok@x', pointsUsed: 400, rewardId: 'r' },
  // ไม่ตรง: เพิ่มด้วยปุ่มเก่า 500 + มีรายการที่ปฏิเสธ 1 → ledger = 500 แต่ยอดจริง 900
  { id: '3', employeeId: 'bad@x', addedByAdmin: true, pointsUsed: -500, rewardName: 'โบนัส' },
  { id: '4', employeeId: 'bad@x', rewardId: 'r', pointsUsed: 300, approval: 'ปฏิเสธ' },
  // นำเข้าแล้วแต่ยอดไม่ตรงประวัติ (ledger 800 ≠ 1000)
  { id: 'imp_imp@x', employeeId: 'imp@x', pointsUsed: -800, imported: true, rewardName: 'ยอดยกมาจากระบบเก่า' },
  // บัญชีที่ถูกลบไปแล้ว
  { id: '5', employeeId: 'gone@x', employeeName: 'คนที่ถูกลบ', pointsUsed: 100 },
]

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
const render = (props = {}) => act(async () => { root.render(<ReconcilePanel employees={EMPLOYEES} transactions={TXS} onClose={() => {}} {...props} />) })
const text = () => container.textContent

test('สรุปจำนวน และโชว์เฉพาะคนที่มีประวัติแต่ยอดไม่ตรง (ค่าเริ่มต้น); แอดมินไม่ถูกนับ', async () => {
  await render()
  expect(text()).toContain('✅ ตรง 1')
  expect(text()).toContain('⚠️ ไม่ตรง 2')
  expect(text()).toContain('⚪ ไม่มีประวัติ 1')
  expect(text()).toContain('จาก 4 คน')
  const rows = [...container.querySelectorAll('tbody tr')].map((tr) => tr.textContent)
  expect(rows).toHaveLength(2)
  expect(text()).toContain('ไม่ตรง')
  expect(text()).not.toContain('แอดมิน')
})

test('ข้อสังเกต: เพิ่มแต้มด้วยปุ่มเก่า (+แต้ม), มีรายการปฏิเสธ, นำเข้าแล้วแต่ยอดไม่ตรง', async () => {
  await render()
  expect(text()).toContain('เพิ่มแต้มด้วยปุ่มเพิ่มรายการเวอร์ชันเก่า 1 แถว (+500)')
  expect(text()).toContain('มีรายการที่ปฏิเสธ 1')
  expect(text()).toContain('นำเข้าจากระบบเก่าแล้ว แต่ยอดไม่ตรงประวัติ')
  expect(text()).toContain('ยอดจริงมากกว่าประวัติ 400') // 900 − 500
})

test('ผลต่าง: แสดงเครื่องหมาย และไม่นับรายการที่ปฏิเสธ', async () => {
  await render()
  const bad = [...container.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes('ไม่ตรง') && tr.textContent.includes('bad@x'))
  const cells = [...bad.querySelectorAll('td')].map((td) => td.textContent)
  expect(cells[1]).toBe('900')    // คงเหลือจริง
  expect(cells[2]).toBe('+500')   // สุทธิตามประวัติ (ปฏิเสธไม่นับ)
  expect(cells[3]).toBe('+400')   // ผลต่าง
})

test('ติ๊กออกเพื่อดูทุกคน และมีรายการบัญชีที่ไม่พบใน employees', async () => {
  await render()
  const checkbox = container.querySelector('input[type="checkbox"]')
  await act(async () => { checkbox.click() })
  expect(container.querySelectorAll('tbody tr')).toHaveLength(4)
  expect(text()).toContain('ไม่มีแถวประวัติเลย')
  expect(text()).toContain('ประวัติของบัญชีที่ไม่พบใน employees แล้ว (1 บัญชี)')
  expect(text()).toContain('คนที่ถูกลบ · gone@x · 1 แถว')
})

test('ทุกคนตรง → ขึ้นข้อความยินดี ไม่ใช่ตารางว่าง', async () => {
  await render({ employees: [emp('ok@x', 'ตรง', 100)], transactions: [{ id: '1', employeeId: 'ok@x', pointsUsed: -100 }] })
  expect(text()).toContain('ไม่มีใครที่มีประวัติแล้วยอดไม่ตรง')
})
