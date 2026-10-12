import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { act as domAct } from 'react-dom/test-utils'
import { collection, getDocs, doc, onSnapshot, query, where } from 'firebase/firestore'
import Dashboard from './Dashboard'
import { redeemReward } from '../pointsDb'

// เส้นทางที่พนักงานทุกคนใช้: กด "แลกเลย!" → "ยืนยัน" → redeemReward (pointsDb) — ทดสอบการเดินสายของหน้าจอ (mock Firestore)
// ตรรกะหักแต้ม/ราคา/สต็อกจริงทดสอบที่ emulator-tests/run.mjs ด้วยโค้ดชุดเดียวกัน
const mockAuth = { profile: null, user: { email: 'alice@x' }, patchProfile: jest.fn() }
jest.mock('../firebase', () => ({ db: { fake: 'db' } }))
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), getDocs: jest.fn(), doc: jest.fn(), onSnapshot: jest.fn(), query: jest.fn(), where: jest.fn(),
}))
jest.mock('../pointsDb', () => ({ redeemReward: jest.fn() }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const act = React.act ?? domAct

const SHIRT = { name: 'เสื้อ', pointCost: 300, stock: 5, unlimited: false, type: 'normal' }
let container, root
// settings/redeem ที่หน้านี้ฟังอยู่ (onSnapshot): settingsData = ค่าที่ส่งให้ตอนเริ่มฟัง, settingsListeners = ตัวรับค่าใหม่ตอนแอดมินบันทึก
let settingsData, settingsListeners
const settingsSnap = (data) => ({ exists: () => !!data, data: () => data })
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  mockAuth.profile = { name: 'Alice', points: 1000 }
  // CRA resetMocks ล้าง implementation ทุกเทสต์ → ตั้งใหม่ที่นี่
  collection.mockImplementation((db, name) => ({ __name: name }))
  query.mockImplementation((c) => c)
  where.mockImplementation(() => ({}))
  doc.mockImplementation((db, name, id) => ({ __name: name, id }))
  settingsData = { open: true, enabled: false } // เปิดแลกตลอด (ไม่ขึ้นกับเวลาที่รันเทสต์)
  settingsListeners = []
  onSnapshot.mockImplementation((ref, onNext) => {
    if (ref.__name !== 'settings') return () => {}
    settingsListeners.push(onNext)
    onNext(settingsSnap(settingsData))
    return () => { settingsListeners = settingsListeners.filter((fn) => fn !== onNext) }
  })
  getDocs.mockImplementation(async (q) => ({
    docs: q.__name === 'rewards' ? [{ id: 'r1', data: () => SHIRT }] : [],
  }))
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  jest.useRealTimers()
})

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const render = async () => { await act(async () => { root.render(<Dashboard />) }); await flush() }
const text = () => container.textContent
const exact = (label) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === label)
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) }); await flush() }
const rewardLoads = () => getDocs.mock.calls.filter(([q]) => q.__name === 'rewards').length

test('แลกสำเร็จ: เรียก redeemReward(db, { email, name, reward, proofUrl }) แล้วอัปเดตแต้มบนหน้าจอด้วยค่าที่ได้กลับมา', async () => {
  redeemReward.mockResolvedValue({ newPoints: 700, txId: 'tx1' })
  await render()
  await click(exact('แลกเลย!'))
  expect(text()).toContain('ยืนยันการแลก?')
  await click(exact('ยืนยัน'))

  expect(redeemReward).toHaveBeenCalledTimes(1)
  const [db, args] = redeemReward.mock.calls[0]
  expect(db).toEqual({ fake: 'db' })
  expect(args).toMatchObject({ email: 'alice@x', name: 'Alice', proofUrl: null })
  expect(args.reward).toMatchObject({ id: 'r1', name: 'เสื้อ', pointCost: 300 })
  expect(mockAuth.patchProfile).toHaveBeenCalledWith({ points: 700 })
  expect(text()).toContain('แลก "เสื้อ" สำเร็จ!')
  expect(text()).not.toContain('ยืนยันการแลก?')
})

test('แอดมินเพิ่งแก้ราคา (PRICE_CHANGED): ไม่หักแต้ม ปิดกล่องยืนยัน แจ้งข้อความ และโหลดรางวัลใหม่', async () => {
  redeemReward.mockRejectedValue(Object.assign(new Error('ราคารางวัลเพิ่งเปลี่ยน กรุณาดูราคาใหม่แล้วกดแลกอีกครั้ง'), { code: 'PRICE_CHANGED' }))
  await render()
  const before = rewardLoads()
  await click(exact('แลกเลย!'))
  await click(exact('ยืนยัน'))

  expect(mockAuth.patchProfile).not.toHaveBeenCalled()
  expect(text()).not.toContain('ยืนยันการแลก?')
  expect(text()).toContain('ราคารางวัลเพิ่งเปลี่ยน')
  expect(rewardLoads()).toBe(before + 1) // fetchRewards() ให้เห็นราคาล่าสุด
})

test('มีคนแลกตัดหน้า (ของหมดแล้ว): ปิดกล่องยืนยัน เด้ง popup "ไม่ทันจ้า" และไม่ขึ้นข้อความ error', async () => {
  redeemReward.mockRejectedValue(new Error('ของหมดแล้ว'))
  await render()
  await click(exact('แลกเลย!'))
  await click(exact('ยืนยัน'))

  expect(mockAuth.patchProfile).not.toHaveBeenCalled()
  expect(text()).toContain('ไม่ทันจ้า! มีคนตัดหน้า')
  expect(text()).not.toContain('⚠️')
})

test('error อื่น (เช่นแต้มไม่พอใน transaction): แสดงข้อความในกล่องยืนยัน ไม่ปิด และไม่อัปเดตแต้ม', async () => {
  redeemReward.mockRejectedValue(new Error('แต้มไม่พอ'))
  await render()
  await click(exact('แลกเลย!'))
  await click(exact('ยืนยัน'))

  expect(text()).toContain('ยืนยันการแลก?')
  expect(text()).toContain('⚠️ แต้มไม่พอ')
  expect(mockAuth.patchProfile).not.toHaveBeenCalled()
})

test('แต้มบนหน้าจอไม่พอ: กดแล้วเด้ง popup "แต้มไม่พอ!" และไม่เรียก redeemReward', async () => {
  mockAuth.profile = { name: 'Alice', points: 100 }
  await render()
  await click(exact('แต้มไม่พอ!'))
  expect(redeemReward).not.toHaveBeenCalled()
  expect(text()).not.toContain('ยืนยันการแลก?')
  expect(text()).toContain('แต้มไม่พอ!')
})

// ── ปุ่มเปลี่ยนตามเวลา / ตามที่แอดมินตั้ง โดยไม่ต้องรีเฟรช (ตรรกะเวลา: redeemWindow.test.js, useRedeemOpen.test.js) ──
const thai = (y, m, d, h = 0, mi = 0, s = 0, ms = 0) => Date.UTC(y, m - 1, d, h - 7, mi, s, ms)
const LOCK_15 = { open: true, enabled: true, hour: 15, minute: 0, dateY: 0, dateM: 0, dateD: 0 }
// แอดมินบันทึกค่าใหม่ลง settings/redeem → ตัวฟังของหน้านี้ได้รับค่า (เหมือน onSnapshot จริง)
const adminSets = (data) => act(async () => { settingsListeners.forEach((fn) => fn(settingsSnap(data))) })
// เทสต์ที่ใช้นาฬิกาปลอม: flush() แบบ setTimeout จริงใช้ไม่ได้ → ไล่ microtask แทน (mock ทั้งหมดเป็น promise ที่ resolve แล้ว)
const flushMicro = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve() }) }
const renderAt = async (nowMs, cfg) => {
  jest.useFakeTimers()
  jest.setSystemTime(nowMs)
  settingsData = cfg
  await act(async () => { root.render(<Dashboard />) })
  await flushMicro()
}
const advance = (ms) => act(() => { jest.advanceTimersByTime(ms) })

test('แอดมินกด "ปิดการแลก" ขณะที่หน้านี้เปิดค้าง: ปุ่มเปลี่ยนเป็น "🔴 งดแลกชั่วคราว" เอง แล้ว "เปิดให้แลก" → กลับเป็น "แลกเลย!" (ไม่โหลดรางวัลใหม่)', async () => {
  await render()
  const loadsBefore = rewardLoads()
  expect(exact('แลกเลย!').disabled).toBe(false)

  await adminSets({ open: false, enabled: false })
  expect(exact('🔴 งดแลกชั่วคราว').disabled).toBe(true)
  expect(exact('แลกเลย!')).toBeUndefined()

  await adminSets({ open: true, enabled: false })
  expect(exact('แลกเลย!').disabled).toBe(false)
  expect(rewardLoads()).toBe(loadsBefore) // ปุ่มเปลี่ยนจากค่าสดอย่างเดียว ไม่ได้ยิงคิวรีรางวัลซ้ำ
})

test('ฟังการตั้งค่าตลอดที่อยู่ในหน้านี้ และเลิกฟังเมื่อออกจากหน้า (ไม่ทิ้ง listener ค้าง)', async () => {
  await render()
  expect(settingsListeners).toHaveLength(1)
  act(() => root.unmount())
  expect(settingsListeners).toHaveLength(0)
  root = createRoot(container) // afterEach จะ unmount อีกรอบ
})

test('แอดมินเลื่อนเวลาเปิดแลก / ปิดล็อกเวลา ขณะที่หน้านี้เปิดค้าง: ป้ายบนปุ่มเปลี่ยนตามทันที', async () => {
  await renderAt(thai(2026, 10, 12, 10, 0), LOCK_15)
  expect(exact('⏰ เปิดแลก 15:00 น.').disabled).toBe(true)

  await adminSets({ ...LOCK_15, hour: 16, minute: 30 })
  expect(exact('⏰ เปิดแลก 16:30 น.').disabled).toBe(true)
  expect(exact('⏰ เปิดแลก 15:00 น.')).toBeUndefined()

  await adminSets({ ...LOCK_15, enabled: false })
  expect(exact('แลกเลย!').disabled).toBe(false)
})

test('ถึงเวลาเปิดแลกพอดี: ปุ่มเปลี่ยนจาก "⏰ เปิดแลก 15:00 น." เป็น "แลกเลย!" เองทันที (ไม่รอรอบเช็ค 30 วิ ไม่ต้องรีเฟรช) แล้วกดแลกต่อได้', async () => {
  await renderAt(thai(2026, 10, 12, 14, 59, 50), LOCK_15)
  expect(exact('⏰ เปิดแลก 15:00 น.').disabled).toBe(true)

  await advance(9999) // 14:59:59.999
  expect(exact('⏰ เปิดแลก 15:00 น.').disabled).toBe(true)
  await advance(1)    // 15:00:00.000
  expect(exact('แลกเลย!').disabled).toBe(false)
  expect(rewardLoads()).toBe(1) // โหลดรางวัลแค่ตอนเปิดหน้า — ไม่ได้รีเฟรช

  await act(async () => { exact('แลกเลย!').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await flushMicro()
  expect(text()).toContain('ยืนยันการแลก?')
})

test('ล็อกเวลาใช้เวลาไทย (UTC+7) เหมือน Firestore Rules: 08:00 UTC = 15:00 น. เปิดพอดี', async () => {
  await renderAt(Date.UTC(2026, 9, 12, 7, 59, 59, 0), LOCK_15)
  expect(exact('⏰ เปิดแลก 15:00 น.').disabled).toBe(true)
  await advance(1000) // 08:00:00.000 UTC
  expect(exact('แลกเลย!').disabled).toBe(false)
})
