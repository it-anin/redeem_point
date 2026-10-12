import { isOpenAt, nextChangeAt } from './redeemWindow'

// เวลาไทย (UTC+7) → epoch ms (Date.UTC รับชั่วโมงติดลบได้ = ย้อนไปวันก่อน)
const thai = (y, m, d, h = 0, mi = 0, s = 0, ms = 0) => Date.UTC(y, m - 1, d, h - 7, mi, s, ms)
const DAY = 24 * 60 * 60 * 1000

const DAILY_15 = { enabled: true, hour: 15, minute: 0, dateY: 0, dateM: 0, dateD: 0 }
const ON_DATE = { ...DAILY_15, dateY: 2026, dateM: 10, dateD: 12 }

describe('isOpenAt — ต้องตรงกับ isRedeemOpen() ใน firestore.rules (เวลาไทย)', () => {
  test('ไม่เปิดล็อกเวลา (enabled ≠ true) = เปิดตลอด', () => {
    expect(isOpenAt({ ...DAILY_15, enabled: false }, thai(2026, 10, 12, 3, 0))).toBe(true)
    expect(isOpenAt(undefined, thai(2026, 10, 12, 3, 0))).toBe(true)
  })

  test('ล็อกรายวัน 15:00: ปิดก่อน → เปิดพอดี 15:00:00.000 → เปิดถึงสิ้นวัน → ปิดอีกตอนเที่ยงคืน', () => {
    expect(isOpenAt(DAILY_15, thai(2026, 10, 12, 14, 59, 59, 999))).toBe(false)
    expect(isOpenAt(DAILY_15, thai(2026, 10, 12, 15, 0, 0, 0))).toBe(true)
    expect(isOpenAt(DAILY_15, thai(2026, 10, 12, 23, 59, 59, 999))).toBe(true)
    expect(isOpenAt(DAILY_15, thai(2026, 10, 13, 0, 0, 0, 0))).toBe(false)
  })

  test('ละเอียดระดับนาที: 15:30 → 15:29:59.999 ยังปิด, 15:30:00 เปิด', () => {
    const cfg = { ...DAILY_15, minute: 30 }
    expect(isOpenAt(cfg, thai(2026, 10, 12, 15, 29, 59, 999))).toBe(false)
    expect(isOpenAt(cfg, thai(2026, 10, 12, 15, 30, 0, 0))).toBe(true)
  })

  test('ใช้เวลาไทย ไม่ใช่เขตเวลาของเครื่อง: 15:00 ไทย = 08:00 UTC', () => {
    expect(isOpenAt(DAILY_15, Date.UTC(2026, 9, 12, 7, 59, 59, 999))).toBe(false)
    expect(isOpenAt(DAILY_15, Date.UTC(2026, 9, 12, 8, 0, 0, 0))).toBe(true)
  })

  test('เจาะจงวันที่: เปิดเฉพาะวันนั้นหลัง 15:00 (วันก่อน/วันหลัง/เดือนอื่น/ปีอื่น = ปิด)', () => {
    expect(isOpenAt(ON_DATE, thai(2026, 10, 11, 16, 0))).toBe(false)
    expect(isOpenAt(ON_DATE, thai(2026, 10, 12, 14, 59, 59, 999))).toBe(false)
    expect(isOpenAt(ON_DATE, thai(2026, 10, 12, 15, 0))).toBe(true)
    expect(isOpenAt(ON_DATE, thai(2026, 10, 12, 23, 59, 59, 999))).toBe(true)
    expect(isOpenAt(ON_DATE, thai(2026, 10, 13, 15, 0))).toBe(false)
    expect(isOpenAt(ON_DATE, thai(2026, 11, 12, 16, 0))).toBe(false)
    expect(isOpenAt(ON_DATE, thai(2027, 10, 12, 16, 0))).toBe(false)
  })

  test('ไม่ได้ตั้งชั่วโมง/นาที (ไม่มีฟิลด์) = นับเป็น 00:00 → เปิดทั้งวัน (เหมือน rules ที่ค่าเริ่ม 0)', () => {
    expect(isOpenAt({ enabled: true }, thai(2026, 10, 12, 0, 0, 0, 0))).toBe(true)
  })
})

describe('nextChangeAt — จังหวะถัดไปที่สถานะอาจเปลี่ยน (ใช้ตั้ง timer)', () => {
  test('ไม่เปิดล็อกเวลา → ไม่เปลี่ยนอีก (null)', () => {
    expect(nextChangeAt({ ...DAILY_15, enabled: false }, thai(2026, 10, 12, 10, 0))).toBeNull()
    expect(nextChangeAt(undefined, thai(2026, 10, 12, 10, 0))).toBeNull()
  })

  test('ล็อกรายวัน: ก่อนเวลาเปิด → เวลาเปิดวันนี้; หลังเปิด → เที่ยงคืนไทย; ได้ค่า "หลัง" now เสมอ (ไม่ใช่ตอนนี้)', () => {
    expect(nextChangeAt(DAILY_15, thai(2026, 10, 12, 10, 0))).toBe(thai(2026, 10, 12, 15, 0))
    expect(nextChangeAt(DAILY_15, thai(2026, 10, 12, 14, 59, 59, 999))).toBe(thai(2026, 10, 12, 15, 0, 0, 0))
    expect(nextChangeAt(DAILY_15, thai(2026, 10, 12, 15, 0, 0, 0))).toBe(thai(2026, 10, 13, 0, 0))
    expect(nextChangeAt(DAILY_15, thai(2026, 10, 12, 23, 59, 59, 999))).toBe(thai(2026, 10, 13, 0, 0))
    expect(nextChangeAt(DAILY_15, thai(2026, 10, 13, 0, 0, 0, 0))).toBe(thai(2026, 10, 13, 15, 0))
  })

  test('ละเอียดระดับนาที: ตั้ง 15:30 → จังหวะถัดไปจาก 15:00 คือ 15:30', () => {
    expect(nextChangeAt({ ...DAILY_15, minute: 30 }, thai(2026, 10, 12, 15, 0))).toBe(thai(2026, 10, 12, 15, 30))
  })

  test('เจาะจงวันที่: ก่อนวัน → เวลาเปิดของวันนั้น; วันนั้นก่อนเปิด → เวลาเปิด; เปิดอยู่ → สิ้นวันนั้น; หลังวันนั้น → null', () => {
    expect(nextChangeAt(ON_DATE, thai(2026, 10, 5, 10, 0))).toBe(thai(2026, 10, 12, 15, 0))
    expect(nextChangeAt(ON_DATE, thai(2026, 10, 12, 10, 0))).toBe(thai(2026, 10, 12, 15, 0))
    expect(nextChangeAt(ON_DATE, thai(2026, 10, 12, 16, 0))).toBe(thai(2026, 10, 13, 0, 0))
    expect(nextChangeAt(ON_DATE, thai(2026, 10, 13, 10, 0))).toBeNull()
  })

  // หัวใจของ "ปุ่มเปลี่ยนเป๊ะ": ถ้ามีการเปลี่ยนสถานะ "ก่อน" จังหวะที่คำนวณไว้ ปุ่มจะเปลี่ยนช้า (timer ตั้งไว้ไกลเกินไป)
  test('คุณสมบัติ: สถานะคงเดิมตลอดช่วง [now, next) และเปลี่ยนจริงที่ next (สุ่ม 3000 ชุด แบบกำหนดผลได้)', () => {
    let seed = 20261012
    const rnd = (n) => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed % n }
    for (let i = 0; i < 3000; i++) {
      const cfg = {
        enabled: true, hour: 1 + rnd(23), minute: rnd(60), // เริ่มที่ 01:00 เพื่อตัดเคส 00:00 (เปิดทั้งวัน ไม่มีการเปลี่ยนสถานะตอนเที่ยงคืน)
        ...(rnd(2) ? { dateY: 2026, dateM: 10, dateD: 1 + rnd(28) } : { dateY: 0, dateM: 0, dateD: 0 }),
      }
      const now = thai(2026, 10, 1 + rnd(28), rnd(24), rnd(60), rnd(60), rnd(1000))
      const before = isOpenAt(cfg, now)
      const next = nextChangeAt(cfg, now)
      if (next == null) {
        expect(isOpenAt(cfg, now + 40 * DAY)).toBe(before) // ไม่เปลี่ยนอีกเลย (เช่น เลยวันที่กำหนดแล้ว)
        continue
      }
      expect(next).toBeGreaterThan(now)
      expect(isOpenAt(cfg, now + Math.floor((next - now) / 2))).toBe(before)
      expect(isOpenAt(cfg, next - 1)).toBe(before)
      expect(isOpenAt(cfg, next)).toBe(!before)
    }
  })
})
