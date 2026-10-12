// ตรรกะล้วนของ "ล็อกเวลาเปิดแลก" (settings/redeem: enabled / hour / minute / dateY / dateM / dateD):
//   isOpenAt      — ณ เวลานั้นเปิดให้แลกไหม
//   nextChangeAt  — สถานะจะ "เปลี่ยน" อีกทีเมื่อไร (ไว้ตั้ง timer ให้ปุ่มเปลี่ยนพอดีเวลา แทนการเช็คเป็นรอบๆ)
//
// ต้องตรงกับ isRedeemOpen() ใน firestore.rules: ฝั่ง server ตัดสินด้วยเวลาไทย (UTC+7 คงที่ ไม่มี DST) ไม่ใช่เขตเวลาของเครื่อง
// จึงคำนวณจาก epoch + 7 ชั่วโมงแล้วอ่านเป็น UTC เสมอ (มือถือที่ตั้งเขตเวลาผิดก็ยังตรงกับ server)
// master switch (cfg.open) ไม่อยู่ในไฟล์นี้ — หน้าจออ่านแยกต่างหาก
//
// ⚠️ nowMs ยังมาจากนาฬิกาเครื่อง: เครื่องที่นาฬิกาเพี้ยนจะเพี้ยนตาม (server ยังเป็นตัวตัดสินจริง)

const THAI_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

// "นาฬิกาผนังเวลาไทย" ของ epoch → อ่านด้วย getUTC*() เท่านั้น
const thaiWall = (ms) => new Date(ms + THAI_OFFSET_MS)

// เวลาเปิดนับจากเที่ยงคืนไทย (ms)
const openOffsetOf = (cfg) => ((cfg.hour || 0) * 60 + (cfg.minute || 0)) * MINUTE_MS

export function isOpenAt(cfg, nowMs = Date.now()) {
  if (!cfg?.enabled) return true // ไม่ล็อกเวลา = เปิดตามเวลาตลอด
  const t = thaiWall(nowMs)
  // ถ้ากำหนดวันเจาะจง → ต้องเป็นวันนั้น (เดือนใน Date เป็น 0-based จึง +1)
  if (cfg.dateY) {
    if (t.getUTCFullYear() !== cfg.dateY || t.getUTCMonth() + 1 !== cfg.dateM || t.getUTCDate() !== cfg.dateD) return false
  }
  return t.getUTCHours() * 60 + t.getUTCMinutes() >= (cfg.hour || 0) * 60 + (cfg.minute || 0)
}

// epoch ms ของจังหวะถัดไป (หลัง nowMs เท่านั้น) ที่ isOpenAt อาจเปลี่ยนค่า; null = ไม่เปลี่ยนอีกแล้ว
//   ล็อกรายวัน : ปิดตั้งแต่เที่ยงคืน → เปิดตอน hour:minute → ปิดอีกตอนสิ้นวัน (เที่ยงคืนไทย)
//   เจาะจงวัน  : ปิดจนถึง hour:minute ของวันนั้น → เปิดถึงสิ้นวันนั้น → ปิดตลอดไป
// (ล็อกรายวันที่ตั้ง 00:00 เปิดทั้งวัน — จังหวะเที่ยงคืนจึงไม่ได้เปลี่ยนค่า แต่ให้เช็คซ้ำได้ ไม่เสียหาย)
export function nextChangeAt(cfg, nowMs = Date.now()) {
  if (!cfg?.enabled) return null
  const t = nowMs + THAI_OFFSET_MS
  const dayStart = cfg.dateY
    ? Date.UTC(cfg.dateY, (cfg.dateM || 0) - 1, cfg.dateD || 0) // เที่ยงคืนไทยของวันที่ที่กำหนด
    : Math.floor(t / DAY_MS) * DAY_MS                            // เที่ยงคืนไทยของวันนี้
  const next = [dayStart + openOffsetOf(cfg), dayStart + DAY_MS].find((c) => c > t)
  return Number.isFinite(next) ? next - THAI_OFFSET_MS : null
}
