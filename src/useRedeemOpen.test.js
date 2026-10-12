import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { act as domAct } from 'react-dom/test-utils'
import { useRedeemOpen } from './useRedeemOpen'

// ปุ่มแลกต้องเปลี่ยน "พอดีเวลา" โดยไม่ต้องรีเฟรช — ทดสอบด้วยนาฬิกาปลอม (ตรรกะคำนวณเวลาอยู่ที่ redeemWindow.test.js)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const act = React.act ?? domAct

const thai = (y, m, d, h = 0, mi = 0, s = 0, ms = 0) => Date.UTC(y, m - 1, d, h - 7, mi, s, ms)
const DAILY_15 = { enabled: true, hour: 15, minute: 0, dateY: 0, dateM: 0, dateD: 0 }

function Probe({ cfg }) {
  return <span>{useRedeemOpen(cfg) ? 'OPEN' : 'CLOSED'}</span>
}

let container, root
beforeEach(() => {
  jest.useFakeTimers()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  jest.useRealTimers()
})

const show = (cfg) => act(() => { root.render(<Probe cfg={cfg} />) })
const text = () => container.textContent
const advance = (ms) => act(() => { jest.advanceTimersByTime(ms) })

test('ถึง 15:00:00 ปุ่มเปลี่ยนทันที ไม่รอรอบเช็ค 30 วิ: ก่อนเวลา 1 ms ยังปิด, ถึงเวลาพอดีเปิดเลย', () => {
  jest.setSystemTime(thai(2026, 10, 12, 14, 59, 50))
  show(DAILY_15)
  expect(text()).toBe('CLOSED')

  advance(9999) // 14:59:59.999
  expect(text()).toBe('CLOSED')
  advance(1)    // 15:00:00.000
  expect(text()).toBe('OPEN')
})

test('เปิดหน้าทิ้งไว้ตั้งแต่เช้า: ข้ามหลายชั่วโมงแล้วยังเปลี่ยนเองพอดี 15:00', () => {
  jest.setSystemTime(thai(2026, 10, 12, 9, 0, 0))
  show(DAILY_15)
  expect(text()).toBe('CLOSED')

  advance(6 * 3600 * 1000 - 1) // 14:59:59.999
  expect(text()).toBe('CLOSED')
  advance(1)                   // 15:00:00.000
  expect(text()).toBe('OPEN')
})

test('สิ้นวัน: ล็อกรายวันปิดอีกครั้งตอนเที่ยงคืนไทย', () => {
  jest.setSystemTime(thai(2026, 10, 12, 23, 59, 50))
  show(DAILY_15)
  expect(text()).toBe('OPEN')

  advance(9999) // 23:59:59.999
  expect(text()).toBe('OPEN')
  advance(1)    // 00:00:00.000 ของวันใหม่
  expect(text()).toBe('CLOSED')
})

test('แอดมินแก้ค่า (cfg เปลี่ยน): เช็คใหม่ทันทีโดยไม่ต้องรอ timer — ปิดล็อก → เปิด; เลื่อนเวลา → ปุ่มเปลี่ยนตามเวลาใหม่', () => {
  jest.setSystemTime(thai(2026, 10, 12, 10, 0, 0))
  show(DAILY_15)
  expect(text()).toBe('CLOSED')

  show({ ...DAILY_15, enabled: false })
  expect(text()).toBe('OPEN')

  show({ ...DAILY_15, hour: 10, minute: 1 }) // เลื่อนมาเปิด 10:01
  expect(text()).toBe('CLOSED')
  advance(60 * 1000 - 1) // 10:00:59.999
  expect(text()).toBe('CLOSED')
  advance(1)             // 10:01:00.000
  expect(text()).toBe('OPEN')
})

test('มือถือหยุด timer ตอนล็อกจอ/พื้นหลัง: พอกลับมาที่หน้า (visibilitychange / focus / pageshow) เช็คใหม่ทันที', () => {
  for (const event of [['document', 'visibilitychange'], ['window', 'focus'], ['window', 'pageshow']]) {
    jest.setSystemTime(thai(2026, 10, 12, 14, 0, 0))
    show(DAILY_15)
    expect(text()).toBe('CLOSED')

    jest.setSystemTime(thai(2026, 10, 12, 15, 0, 5)) // เวลาผ่านไปแต่ timer ไม่ได้ทำงาน (เหมือนเครื่องหลับ)
    expect(text()).toBe('CLOSED')
    act(() => { (event[0] === 'document' ? document : window).dispatchEvent(new Event(event[1])) })
    expect(text()).toBe('OPEN')
    expect(jest.getTimerCount()).toBe(1) // เช็คใหม่แล้วต้องเหลือ timer เดียว (ของเก่าถูกเคลียร์) ไม่สะสมทุกครั้งที่ event เข้า

    act(() => root.unmount())
    root = createRoot(container)
  }
})

test('เครื่องหลับ/ปรับนาฬิกาโดยไม่มี event ใดๆ: ตื่นมาเช็คเวลาเครื่องใหม่เองไม่เกิน 30 วิ (ไม่ใช่รอ timer ที่ตั้งไว้ไกลๆ)', () => {
  jest.setSystemTime(thai(2026, 10, 12, 9, 0, 0))
  show(DAILY_15) // เวลาเปิดอยู่อีก 6 ชม. แต่ timer ต้องไม่ถูกตั้งไกลเกิน 30 วิ
  expect(text()).toBe('CLOSED')

  jest.setSystemTime(thai(2026, 10, 12, 15, 0, 5)) // นาฬิกาเครื่องกระโดดข้ามเวลาเปิด; timer นับต่อจากเดิม
  expect(text()).toBe('CLOSED')
  advance(30000)
  expect(text()).toBe('OPEN')
})

test('เวลาไม่มีผลต่อสถานะอีกแล้ว (ไม่ล็อกเวลา / เลยวันที่กำหนดแล้ว): ไม่ตั้ง timer ตื่นมาเช็คเปล่าๆ', () => {
  jest.setSystemTime(thai(2026, 10, 12, 10, 0, 0))
  show({ ...DAILY_15, enabled: false })
  expect(text()).toBe('OPEN')
  expect(jest.getTimerCount()).toBe(0)

  show({ ...DAILY_15, dateY: 2026, dateM: 10, dateD: 11 }) // เมื่อวาน
  expect(text()).toBe('CLOSED')
  expect(jest.getTimerCount()).toBe(0)

  show({ ...DAILY_15, dateY: 2026, dateM: 10, dateD: 13 }) // พรุ่งนี้ → ต้องมี timer ไปที่เวลาเปิด
  expect(text()).toBe('CLOSED')
  expect(jest.getTimerCount()).toBe(1)
})

test('ปิดหน้า (unmount): ล้าง timer และ listener หมด ไม่มีอะไรทำงานค้าง', () => {
  jest.setSystemTime(thai(2026, 10, 12, 10, 0, 0))
  show(DAILY_15)
  expect(jest.getTimerCount()).toBe(1)

  act(() => root.unmount())
  expect(jest.getTimerCount()).toBe(0)
  act(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')) })
  expect(jest.getTimerCount()).toBe(0) // ถ้า listener ยังค้าง จะตั้ง timer ใหม่
  root = createRoot(container) // afterEach จะ unmount อีกรอบ
})
