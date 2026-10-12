import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { act as domAct } from 'react-dom/test-utils'
import Login from './Login'
import { isDesktopDevice } from '../deviceCheck'

// ข้อความเตือนใต้การ์ดหน้า login เมื่อเปิดบนคอมพิวเตอร์ — ไม่ปิดปุ่มล็อกอิน เพราะแอดมินต้องล็อกอินบน desktop
// (การบล็อกพนักงานจริงอยู่ที่ DeviceGate หลังรู้ role — ทดสอบที่ components/DeviceGate.test.js)
const mockAuth = { user: null, pendingUser: null, authError: '', loginWithGoogle: jest.fn(), linkWithCode: jest.fn(), logout: jest.fn() }
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('../deviceCheck', () => ({ isDesktopDevice: jest.fn() }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const act = React.act ?? domAct

const NOTICE = 'พนักงานกรุณาเปิดผ่านมือถือ'
let container, root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  // CRA resetMocks ล้าง implementation ทุกเทสต์ → ตั้งใหม่ที่นี่
  isDesktopDevice.mockReturnValue(true)
  mockAuth.pendingUser = null
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = () => act(async () => { root.render(<Login />) })
const text = () => container.textContent

test('เปิดบนคอมพิวเตอร์: ขึ้นข้อความเตือนพนักงาน และปุ่มล็อกอินยังกดได้ (แอดมินต้องใช้)', async () => {
  await render()
  expect(text()).toContain(NOTICE)
  expect(text()).toContain('แอดมินเข้าสู่ระบบได้ตามปกติ')
  expect(container.querySelector('button').disabled).toBe(false)
})

test('เปิดบนมือถือ: ไม่ขึ้นข้อความเตือน', async () => {
  isDesktopDevice.mockReturnValue(false)
  await render()
  expect(text()).not.toContain(NOTICE)
})

test('ขั้นผูกบัญชีครั้งแรก (pendingUser) บนคอม: ไม่ขึ้นข้อความเตือน (ยังไม่รู้ role)', async () => {
  mockAuth.pendingUser = { email: 'new@x' }
  await render()
  expect(text()).not.toContain(NOTICE)
})
