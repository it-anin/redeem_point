import { collection, getDocs } from 'firebase/firestore'
import { db } from './firebase'

// เก็บ id ประกาศไว้ในหน่วยความจำ "ครั้งเดียวต่อรอบเปิดแอป" (หน่วยความจำหายเมื่อรีเฟรช/เปิดแอปใหม่)
// แถบเมนูล่างใช้นับเลขแดงประกาศใหม่ — เดิมอ่านประกาศทั้งหมดจาก Firestore ทุกครั้งที่เปลี่ยนหน้า
// ซึ่งกินโควตาอ่านฟรีรายวัน (Spark = 50,000 reads/วัน) ของทั้งโปรเจกต์
let ids = null      // string[] | null
let inflight = null // Promise ที่กำลังดึงอยู่ — กันยิงซ้ำตอนเปลี่ยนหน้าเร็วๆ

export function getAnnouncementIds() {
  if (ids) return Promise.resolve(ids)
  if (!inflight) {
    inflight = getDocs(collection(db, 'announcements'))
      .then(snap => { ids = snap.docs.map(d => d.id); return ids })
      .finally(() => { inflight = null }) // ถ้าพลาด รอบหน้าจะลองใหม่ (ไม่จำค่าผิดไว้)
  }
  return inflight
}

// หน้าประกาศโหลดรายการล่าสุดอยู่แล้ว → ส่งต่อมาให้เลขแดงใช้ร่วมกัน (ไม่ต้องอ่านซ้ำ)
export function setAnnouncementIds(next) {
  ids = next
}
