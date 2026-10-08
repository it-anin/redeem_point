import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { act as domAct } from 'react-dom/test-utils'
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore'
import Dashboard from './Dashboard'
import { redeemReward } from '../pointsDb'

// เส้นทางที่พนักงานทุกคนใช้: กด "แลกเลย!" → "ยืนยัน" → redeemReward (pointsDb) — ทดสอบการเดินสายของหน้าจอ (mock Firestore)
// ตรรกะหักแต้ม/ราคา/สต็อกจริงทดสอบที่ emulator-tests/run.mjs ด้วยโค้ดชุดเดียวกัน
const mockAuth = { profile: null, user: { email: 'alice@x' }, patchProfile: jest.fn() }
jest.mock('../firebase', () => ({ db: { fake: 'db' } }))
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), getDocs: jest.fn(), doc: jest.fn(), getDoc: jest.fn(), query: jest.fn(), where: jest.fn(),
}))
jest.mock('../pointsDb', () => ({ redeemReward: jest.fn() }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const act = React.act ?? domAct

const SHIRT = { name: 'เสื้อ', pointCost: 300, stock: 5, unlimited: false, type: 'normal' }
let container, root
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
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ open: true, enabled: false }) }) // เปิดแลกตลอด (ไม่ขึ้นกับเวลาที่รันเทสต์)
  getDocs.mockImplementation(async (q) => ({
    docs: q.__name === 'rewards' ? [{ id: 'r1', data: () => SHIRT }] : [],
  }))
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
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
