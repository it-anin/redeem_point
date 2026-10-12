import { useEffect, useState } from 'react'
import { isOpenAt, nextChangeAt } from './redeemWindow'

const MAX_WAIT_MS = 30000 // เพดานการรอ: ตื่นมาเช็คเวลาเครื่องใหม่อย่างน้อยทุก 30 วิ (กันเครื่องปรับนาฬิกา/timer ถูกชะลอ)

// เปิดให้แลกตามล็อกเวลาตอนนี้ไหม (ไม่รวม master switch cfg.open) — ปุ่มเปลี่ยน "พอดีเวลา" ไม่ต้องรีเฟรช:
//  • ตั้ง timer ไปที่จังหวะที่สถานะจะเปลี่ยนจริง (เวลาเปิด / สิ้นวัน) ไม่ใช่เช็คเป็นรอบๆ; ไกลเกิน 30 วิ → ตื่นมาเช็คใหม่ทุก 30 วิ
//  • timer ทำงานก่อนเวลาเล็กน้อยก็ไม่เป็นไร: เช็คแล้วยังไม่ถึงจะตั้งใหม่ตามเวลาที่เหลือ (≥ 1 ms เสมอ เพราะ next > now)
//  • เช็คใหม่ทันทีเมื่อ cfg เปลี่ยน (แอดมินแก้เวลา) และเมื่อกลับมาที่หน้านี้ — มือถือหยุด/ชะลอ timer ตอนล็อกจอหรืออยู่พื้นหลัง
export function useRedeemOpen(cfg) {
  const [open, setOpen] = useState(() => isOpenAt(cfg))

  useEffect(() => {
    let timer
    const sync = () => {
      clearTimeout(timer)
      const now = Date.now()
      setOpen(isOpenAt(cfg, now))
      const next = nextChangeAt(cfg, now)
      // next == null = เวลาไม่มีผลต่อสถานะอีกแล้ว (ไม่ล็อกเวลา / เลยวันที่กำหนดแล้ว) → ไม่ต้องตื่นมาเช็ค (cfg เปลี่ยน/กลับมาที่หน้า → เช็คใหม่เอง)
      if (next != null) timer = setTimeout(sync, Math.min(next - now, MAX_WAIT_MS))
    }
    const onVisible = () => { if (document.visibilityState === 'visible') sync() }

    sync()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', sync)
    window.addEventListener('pageshow', sync)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', sync)
      window.removeEventListener('pageshow', sync)
    }
  }, [cfg])

  return open
}
