import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { act as domAct } from 'react-dom/test-utils'
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth'
import { AuthProvider } from './context/AuthContext'
import Dashboard from './pages/Dashboard'
import AdminEmployees from './pages/AdminEmployees'
import { resetStore, seed, read, list } from './testUtils/fakeFirestore'

// end-to-end ของ "แต้ม" ด้วยหน้าจอจริงทั้งสองฝั่งพร้อมกัน บนฐานข้อมูลเดียวกัน:
//   มือถือพนักงาน = AuthProvider จริง (onSnapshot แต้มสด) + Dashboard จริง + pointsDb จริง
//   หน้าแอดมิน   = AuthProvider จริง + AdminEmployees จริง (ปุ่ม ✏️ แก้ไข → ปรับแต้ม)
// ฐานข้อมูลเป็น Firestore จำลองในหน่วยความจำ (testUtils/fakeFirestore.js — ไม่ตรวจ rules; rules + SDK จริงทดสอบที่ emulator-tests/)
jest.mock('./firebase', () => ({ auth: {}, db: { fake: 'db' } }))
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(), getRedirectResult: jest.fn(), signInWithRedirect: jest.fn(), signOut: jest.fn(),
  GoogleAuthProvider: function GoogleAuthProvider() {},
}))
jest.mock('firebase/firestore', () => require('./testUtils/fakeFirestore'))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const act = React.act ?? domAct

const ALICE = 'alice@x'
const ADMIN = 'admin@x'
const mounts = []

beforeEach(() => {
  resetStore()
  seed(`employees/${ALICE}`, { name: 'Alice', email: ALICE, department: 'Sale Admin', code: 'E001', role: 'employee', points: 1000 })
  seed(`employees/${ADMIN}`, { name: 'Admin', email: ADMIN, department: 'HR&Admin', code: 'A001', role: 'admin', points: 0 })
  seed('rewards/r1', { name: 'เสื้อ', pointCost: 300, stock: 5, unlimited: false, type: 'normal' })
  seed('settings/redeem', { open: true, enabled: false }) // เปิดแลกตลอด (ไม่ขึ้นกับเวลาที่รันเทสต์)
})
afterEach(() => {
  mounts.splice(0).forEach((m) => { act(() => m.root.unmount()); m.container.remove() })
})

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
// เปิดหน้าจอหนึ่งใบ (ล็อกอินเป็น user ที่ระบุ) — เปิดซ้อนกันได้หลายใบ เหมือนแอดมินกับมือถือพนักงานเปิดพร้อมกัน
async function mount(email, ui) {
  getRedirectResult.mockResolvedValue(null)
  onAuthStateChanged.mockImplementation((auth, cb) => { Promise.resolve().then(() => cb({ email })); return () => {} })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const m = { container, root, text: () => container.textContent }
  mounts.push(m)
  await act(async () => { root.render(<AuthProvider>{ui}</AuthProvider>) })
  await flush()
  return m
}
const exact = (m, label) => [...m.container.querySelectorAll('button')].find((b) => b.textContent.trim() === label)
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) }); await flush() }
const setValue = async (el, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const chip = (phone) => phone.container.querySelector('.neon-glow').textContent // ตัวเลขแต้มคงเหลือบนชิปมือถือ
const dbPoints = () => read(`employees/${ALICE}`).points
const fmt = (n) => n.toLocaleString()

// แอดมิน: ✏️ แก้ไข (แถวของ name) → ใส่ "ปรับแต้ม" → 💾 บันทึก — ผ่านหน้า AdminEmployees จริง
async function adminAdjust(admin, name, delta) {
  const row = [...admin.container.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes(name) && [...tr.querySelectorAll('button')].some((b) => b.textContent.includes('แก้ไข')))
  await click([...row.querySelectorAll('button')].find((b) => b.textContent.includes('แก้ไข')))
  await setValue(admin.container.querySelector('input[type="number"]'), String(delta))
  await click(exact(admin, '💾 บันทึก'))
}
const redeemOnPhone = async (phone) => {
  await click(exact(phone, 'แลกเลย!'))
  await click(exact(phone, 'ยืนยัน'))
}

test('พนักงานกดแลก → แต้มคงเหลือบนมือถือลดลงทันที ตรงกับฐานข้อมูล (ไม่หักซ้ำ) และสต็อก/ประวัติถูกบันทึก', async () => {
  const phone = await mount(ALICE, <Dashboard />)
  expect(chip(phone)).toBe('1,000')

  await redeemOnPhone(phone)
  expect(chip(phone)).toBe('700')
  expect(phone.text()).toContain('แลก "เสื้อ" สำเร็จ!')

  await flush() // ให้ listener (onSnapshot) ส่งค่าจริงจากฐานข้อมูลมาทับอีกรอบ — ต้องยังเท่าเดิม ไม่หักซ้ำ/ไม่เด้งกลับ
  expect(chip(phone)).toBe('700')
  expect(dbPoints()).toBe(700)
  expect(read('rewards/r1').stock).toBe(4)
  const rows = list('transactions')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ employeeId: ALICE, rewardId: 'r1', rewardName: 'เสื้อ', pointsUsed: 300, approval: 'รออนุมัติ' })
})

test('แอดมินเพิ่มแต้ม → มือถือที่เปิดค้างอยู่เห็นยอดใหม่ทันทีโดยไม่ต้องรีโหลด และกดแลกได้ (ก่อนเพิ่มแต้มไม่พอ)', async () => {
  seed(`employees/${ALICE}`, { ...read(`employees/${ALICE}`), points: 100 })
  const phone = await mount(ALICE, <Dashboard />)
  expect(chip(phone)).toBe('100')
  expect(exact(phone, 'แต้มไม่พอ!')).toBeTruthy()  // ราคา 300 > 100
  expect(exact(phone, 'แลกเลย!')).toBeUndefined()

  const admin = await mount(ADMIN, <AdminEmployees />)
  await adminAdjust(admin, 'Alice', 500)
  expect(admin.text()).toContain('บันทึกข้อมูล "Alice" เรียบร้อย!')
  expect(dbPoints()).toBe(600)

  // ฝั่งมือถือ: ไม่ได้ปิด-เปิดแอป
  expect(chip(phone)).toBe('600')
  expect(exact(phone, 'แต้มไม่พอ!')).toBeUndefined()
  expect(exact(phone, 'แลกเลย!')).toBeTruthy()

  await redeemOnPhone(phone)
  expect(chip(phone)).toBe('300')
  expect(dbPoints()).toBe(300)
  expect(read('rewards/r1').stock).toBe(4)

  // popup "แต้มที่ได้รับเดือนนี้" ของมือถือเห็นแต้มที่แอดมินเพิ่มให้
  await click(phone.container.querySelector('.neon-glow'))
  expect(phone.text()).toContain('แต้มที่ได้รับเดือนนี้')
  expect(phone.text()).toContain('+500')
  expect(phone.text()).toContain('ได้รับแต้ม')
})

test('แอดมินหักแต้ม → มือถือลดลงทันที และปุ่มแลกกลับเป็น "แต้มไม่พอ!"', async () => {
  const phone = await mount(ALICE, <Dashboard />)
  expect(exact(phone, 'แลกเลย!')).toBeTruthy()
  const admin = await mount(ADMIN, <AdminEmployees />)
  await adminAdjust(admin, 'Alice', -800)
  expect(dbPoints()).toBe(200)
  expect(chip(phone)).toBe('200')
  expect(exact(phone, 'แต้มไม่พอ!')).toBeTruthy()
  expect(exact(phone, 'แลกเลย!')).toBeUndefined()
})

test('ต่อเนื่องหลายครั้ง (แลก → แอดมินเพิ่ม → แลก → แอดมินหัก): ยอดบนมือถือตรงกับฐานข้อมูลทุกขั้น', async () => {
  const phone = await mount(ALICE, <Dashboard />)
  const admin = await mount(ADMIN, <AdminEmployees />)
  const expectInSync = (n) => { expect(dbPoints()).toBe(n); expect(chip(phone)).toBe(fmt(n)) }

  expectInSync(1000)
  await redeemOnPhone(phone);          expectInSync(700)
  await adminAdjust(admin, 'Alice', 500);  expectInSync(1200)
  await redeemOnPhone(phone);          expectInSync(900)
  await adminAdjust(admin, 'Alice', -400); expectInSync(500)
  expect(read('rewards/r1').stock).toBe(3)

  // ประวัติ: แลก 2 แถว (+300 ต่อแถว) + แอดมินปรับ 2 แถว → สุทธิตามประวัติ = −300 +500 −300 −400 = −500 ต่อยอดเริ่ม 1000 → 500
  const rows = list('transactions')
  expect(rows.filter((t) => t.rewardId)).toHaveLength(2)
  expect(rows.filter((t) => !t.rewardId).map((t) => t.pointsUsed).sort((a, b) => a - b)).toEqual([-500, 400])
  const ledger = rows.reduce((s, t) => s - t.pointsUsed, 0)
  expect(1000 + ledger).toBe(500)
})
