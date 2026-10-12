// ตรวจว่าเครื่องที่เปิดเว็บอยู่เป็น "คอมพิวเตอร์ตั้งโต๊ะ/โน้ตบุ๊ก" หรือไม่ (ฟังก์ชันล้วน รับ env เพื่อเทสต์)
//
// ⚠️ เป็นการกันเชิง UX/นโยบายเท่านั้น ไม่ใช่เชิงความปลอดภัย — เว็บรู้ชนิดอุปกรณ์ได้แค่จากที่เบราว์เซอร์รายงานมา
// ผู้ใช้ปลอมได้ (F12 → Device toolbar / ส่วนขยายปลอม UA) และ Firestore Rules ก็มองไม่เห็นชนิดอุปกรณ์
//
// หลักการ: มีสัญญาณ "มือถือ/แท็บเล็ต" อย่างใดอย่างหนึ่ง = ผ่าน (ตั้งใจหละหลวมฝั่งผ่าน —
// บล็อกพนักงานที่ใช้มือถือจริงผิดพลาด แย่กว่าปล่อยให้คนที่จงใจปลอมตัวผ่านไป)
const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Windows Phone/i

export function isDesktopDevice(env = typeof window !== 'undefined' ? window : undefined) {
  if (!env) return false
  const nav = env.navigator || {}
  const ua = nav.userAgent || ''
  // jsdom/เบราว์เซอร์เก่าไม่มี matchMedia → ถือว่าไม่มีสัญญาณนั้น (ห้าม throw)
  const matches = (query) => typeof env.matchMedia === 'function' && !!env.matchMedia(query)?.matches

  // 1) UA / Client Hints บอกว่าเป็นมือถือ (Chromium มี userAgentData.mobile; Safari/Firefox ดูจาก UA)
  if (nav.userAgentData?.mobile === true || MOBILE_UA.test(ua)) return false
  // 2) iPadOS ที่ขอเว็บเวอร์ชันเดสก์ท็อป: UA เป็น Mac แต่มีหน้าจอทัช (Mac จริง maxTouchPoints = 0)
  if (/Macintosh/.test(ua) && nav.maxTouchPoints > 1) return false
  // 3) นิ้วเป็นอุปกรณ์ชี้หลัก — ครอบคลุมมือถือที่กด "ขอเว็บเวอร์ชันเดสก์ท็อป" (UA เป็น desktop แต่ยังเป็นทัช)
  //    โน้ตบุ๊กจอทัชที่ตัวชี้หลักเป็นเมาส์/ทัชแพดจะไม่ผ่านข้อนี้ → ถือเป็น PC
  if (matches('(pointer: coarse)') || matches('(hover: none)')) return false
  return true
}
