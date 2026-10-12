import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { act as domAct } from 'react-dom/test-utils'
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth'
import { AuthProvider } from './context/AuthContext'
import Dashboard from './pages/Dashboard'
import AdminRewards from './pages/AdminRewards'
import { resetStore, seed, read } from './testUtils/fakeFirestore'

// end-to-end ของ "แอดมินตั้งเวลา/สวิตช์เปิด-ปิดการแลก → ปุ่มบนมือถือที่เปิดค้างอยู่เปลี่ยนตามเอง ไม่ต้องรีเฟรช"
// หน้าจอจริงทั้งสองฝั่งบนฐานข้อมูลเดียวกัน: AdminRewards จริง (ตัวเขียน settings/redeem) + Dashboard จริง + useRedeemOpen จริง (ตัวอ่าน)
// ฐานข้อมูลเป็น Firestore จำลอง (testUtils/fakeFirestore.js — ไม่ตรวจ rules; rules ทดสอบที่ emulator-tests/)
jest.mock('./firebase', () => ({ auth: {}, db: { fake: 'db' } }))
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(), getRedirectResult: jest.fn(), signInWithRedirect: jest.fn(), signOut: jest.fn(),
  GoogleAuthProvider: function GoogleAuthProvider() {},
}))
jest.mock('firebase/firestore', () => require('./testUtils/fakeFirestore'))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const act = React.act ?? domAct

const ALICE = 'alice@x'
const thai = (y, m, d, h = 0, mi = 0, s = 0, ms = 0) => Date.UTC(y, m - 1, d, h - 7, mi, s, ms)
const mounts = []

beforeEach(() => {
  resetStore()
  seed(`employees/${ALICE}`, { name: 'Alice', email: ALICE, department: 'Sale Admin', code: 'E001', role: 'employee', points: 1000 })
  seed('rewards/r1', { name: 'เสื้อ', pointCost: 300, stock: 5, unlimited: false, type: 'normal' })
  seed('settings/redeem', { open: true, enabled: false }) // เริ่มต้น: เปิดแลกตลอด ไม่ล็อกเวลา
})
afterEach(() => {
  mounts.splice(0).forEach((m) => { act(() => m.root.unmount()); m.container.remove() })
  jest.useRealTimers()
})

// ไล่ microtask (ใช้ได้ทั้งนาฬิกาจริงและนาฬิกาปลอม — setTimeout จริงใช้ไม่ได้ตอนใช้นาฬิกาปลอม)
const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve() }) }
async function mount(ui) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const m = { container, root }
  mounts.push(m)
  await act(async () => { root.render(ui) })
  await flush()
  return m
}
// มือถือพนักงาน: AuthProvider จริง (ล็อกอินเป็น Alice) + Dashboard จริง
const mountPhone = () => {
  getRedirectResult.mockResolvedValue(null)
  onAuthStateChanged.mockImplementation((auth, cb) => { Promise.resolve().then(() => cb({ email: ALICE })); return () => {} })
  return mount(<AuthProvider><Dashboard /></AuthProvider>)
}
const mountAdmin = () => mount(<AdminRewards />)

const exact = (m, label) => [...m.container.querySelectorAll('button')].find((b) => b.textContent.trim() === label)
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) }); await flush() }
const advance = async (ms) => { await act(async () => { jest.advanceTimersByTime(ms) }) }
const setValue = async (el, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const lockCheckbox = (m) => [...m.container.querySelectorAll('label')].find((l) => l.textContent.includes('เปิดใช้การล็อกเวลา')).querySelector('input')

test('แอดมินกด "ปิดการแลก" → มือถือที่เปิดค้างเปลี่ยนเป็น "🔴 งดแลกชั่วคราว" เอง; กด "เปิดให้แลก" → กลับเป็น "แลกเลย!" (ไม่รีเฟรช)', async () => {
  const phone = await mountPhone()
  const admin = await mountAdmin()
  expect(exact(phone, 'แลกเลย!').disabled).toBe(false)

  await click(exact(admin, '🔴 ปิดการแลก'))
  expect(read('settings/redeem').open).toBe(false)
  expect(exact(phone, '🔴 งดแลกชั่วคราว').disabled).toBe(true)
  expect(exact(phone, 'แลกเลย!')).toBeUndefined()

  await click(exact(admin, '🟢 เปิดให้แลก'))
  expect(read('settings/redeem').open).toBe(true)
  expect(exact(phone, 'แลกเลย!').disabled).toBe(false)
})

test('แอดมินตั้งล็อกเวลา 15:00 → มือถือขึ้น "⏰ เปิดแลก 15:00 น." เอง → ถึง 15:00 ปุ่มเปลี่ยนพอดี → แอดมินเลื่อนเป็น 16:30 → มือถือล็อกอีกครั้งทันที', async () => {
  jest.useFakeTimers()
  jest.setSystemTime(thai(2026, 10, 12, 14, 59, 50))
  const phone = await mountPhone()
  const admin = await mountAdmin()
  expect(exact(phone, 'แลกเลย!').disabled).toBe(false) // ยังไม่ล็อกเวลา

  // แอดมินเปิดใช้การล็อกเวลา (ค่าเริ่มต้นของหน้าแอดมิน = 15:00) แล้วบันทึก
  await click(lockCheckbox(admin))
  await click(exact(admin, '💾 บันทึกเวลา'))
  expect(read('settings/redeem')).toMatchObject({ enabled: true, hour: 15, minute: 0, dateY: 0 })
  expect(exact(phone, '⏰ เปิดแลก 15:00 น.').disabled).toBe(true)

  await advance(9999) // 14:59:59.999
  expect(exact(phone, '⏰ เปิดแลก 15:00 น.').disabled).toBe(true)
  await advance(1)    // 15:00:00.000
  expect(exact(phone, 'แลกเลย!').disabled).toBe(false)

  // แอดมินเลื่อนเวลาเป็น 16:30 → มือถือกลับไปล็อกทันที
  await setValue(admin.container.querySelector('input[type="time"]'), '16:30')
  await click(exact(admin, '💾 บันทึกเวลา'))
  expect(read('settings/redeem')).toMatchObject({ hour: 16, minute: 30 })
  expect(exact(phone, '⏰ เปิดแลก 16:30 น.').disabled).toBe(true)

  // และถึง 16:30 เปิดเองอีกครั้ง
  await advance(90 * 60 * 1000 - 1) // 16:29:59.999
  expect(exact(phone, '⏰ เปิดแลก 16:30 น.').disabled).toBe(true)
  await advance(1)                  // 16:30:00.000
  expect(exact(phone, 'แลกเลย!').disabled).toBe(false)
})
