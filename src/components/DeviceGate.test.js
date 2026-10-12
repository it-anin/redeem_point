import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { act as domAct } from 'react-dom/test-utils'
import DeviceGate from './DeviceGate'
import { isDesktopDevice } from '../deviceCheck'

// ด่านบล็อกพนักงานบนคอมพิวเตอร์ — ทดสอบการเดินสาย (mock useAuth + isDesktopDevice)
// ตรรกะตรวจอุปกรณ์ทดสอบที่ deviceCheck.test.js
const mockAuth = { profile: null, logout: jest.fn() }
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('../deviceCheck', () => ({ isDesktopDevice: jest.fn() }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const act = React.act ?? domAct

let container, root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  // CRA resetMocks ล้าง implementation ทุกเทสต์ → ตั้งใหม่ที่นี่
  isDesktopDevice.mockReturnValue(true)
  mockAuth.profile = { name: 'Alice', role: 'employee' }
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  window.history.pushState({}, '', '/')
  delete navigator.clipboard // เทสต์คัดลอกลิงก์ตั้งไว้เอง (jsdom ไม่มี clipboard มาให้)
})

const render = () => act(async () => { root.render(<DeviceGate><div>APP-CONTENT</div></DeviceGate>) })
const text = () => container.textContent
const button = (label) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(label))
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

test('พนักงาน + คอมพิวเตอร์: เห็นหน้าบล็อกแทนแอป', async () => {
  await render()
  expect(text()).toContain('ใช้งานผ่านมือถือเท่านั้น')
  expect(text()).not.toContain('APP-CONTENT')
})

test('หน้าบล็อกมีปุ่มออกจากระบบ (ให้สลับไปใช้บัญชีแอดมินได้) และกดแล้วเรียก logout', async () => {
  await render()
  await click(button('ออกจากระบบ'))
  expect(mockAuth.logout).toHaveBeenCalledTimes(1)
})

test('พนักงาน + มือถือ: เข้าแอปได้', async () => {
  isDesktopDevice.mockReturnValue(false)
  await render()
  expect(text()).toContain('APP-CONTENT')
  expect(text()).not.toContain('ใช้งานผ่านมือถือเท่านั้น')
})

test('แอดมิน + คอมพิวเตอร์: เข้าแอปได้ (แอดมินใช้ desktop ตามปกติ รวมถึงใน iframe พรีวิว)', async () => {
  mockAuth.profile = { name: 'HR', role: 'admin' }
  await render()
  expect(text()).toContain('APP-CONTENT')
})

test('พนักงานเติม ?preview=employee บนคอม: ยังถูกบล็อก (พารามิเตอร์นี้ไม่ใช่ทางลัด)', async () => {
  window.history.pushState({}, '', '/dashboard?preview=employee')
  await render()
  expect(text()).toContain('ใช้งานผ่านมือถือเท่านั้น')
  expect(text()).not.toContain('APP-CONTENT')
})

test('โปรไฟล์ไม่มีฟิลด์ role: นับเป็นพนักงาน (เหมือน forceMobile ใน Layout) → ถูกบล็อกบนคอม', async () => {
  mockAuth.profile = { name: 'NoRole' }
  await render()
  expect(text()).toContain('ใช้งานผ่านมือถือเท่านั้น')
})

test('ยังไม่มีโปรไฟล์ (profile = null): ไม่บล็อก', async () => {
  mockAuth.profile = null
  await render()
  expect(text()).toContain('APP-CONTENT')
})

test('ปุ่มคัดลอกลิงก์: คัดลอก origin ปัจจุบันแล้วขึ้น "คัดลอกแล้ว"', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  await render()
  await click(button('คัดลอกลิงก์'))
  expect(writeText).toHaveBeenCalledWith(window.location.origin)
  expect(text()).toContain('คัดลอกแล้ว')
})

test('คัดลอกไม่ได้ (ไม่มี clipboard): ไม่พัง และข้อความยังเป็น "คัดลอกลิงก์"', async () => {
  await render()
  await click(button('คัดลอกลิงก์'))
  expect(text()).toContain('คัดลอกลิงก์')
  expect(text()).not.toContain('คัดลอกแล้ว')
})
