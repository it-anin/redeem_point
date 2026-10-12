import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { isDesktopDevice } from '../deviceCheck'

// แสดงแทนแอปเมื่อ "พนักงาน" เปิดบนคอมพิวเตอร์ (แอดมินไม่โดน) — ดู deviceCheck.js เรื่องข้อจำกัด (เลี่ยงได้ด้วย DevTools)
function DesktopBlockedScreen({ onLogout }) {
  const [copied, setCopied] = useState(false)
  const url = window.location.origin

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      /* คัดลอกไม่ได้ (เบราว์เซอร์ไม่อนุญาต) → ผู้ใช้ยังเลือกคัดลอกลิงก์จากกล่องข้อความเองได้ */
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)', fontFamily: 'Itim, sans-serif' }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', textAlign: 'center', padding: 28 }}>
        <img src="/iconmove.webp" alt="" style={{ width: 140, height: 140, objectFit: 'contain', display: 'block', margin: '0 auto 8px' }} />
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>📱 ใช้งานผ่านมือถือเท่านั้นนะ</div>
        <div style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7 }}>
          ระบบสะสมแต้มแลกรางวัลเปิดให้พนักงานใช้ผ่านมือถือเท่านั้น<br />
          กรุณาเปิดลิงก์นี้ในมือถือ แล้วเข้าสู่ระบบด้วยบัญชี Google เดิม
        </div>
        <div style={{ wordBreak: 'break-all', fontSize: 14, fontWeight: 800, color: 'var(--primary-dark)', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 12 }}>
          {url}
        </div>
        <button className="btn-primary" style={{ width: '100%', padding: '11px', fontFamily: 'Itim, sans-serif' }} onClick={copyLink}>
          {copied ? 'คัดลอกแล้ว ✅' : '📋 คัดลอกลิงก์'}
        </button>
        <button
          type="button"
          onClick={onLogout}
          style={{ width: '100%', marginTop: 10, padding: '4px', fontSize: 13, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontFamily: 'Itim, sans-serif' }}
        >
          ออกจากระบบ / ใช้บัญชี Google อื่น
        </button>
      </div>
    </div>
  )
}

// ครอบ <Layout /> ใน App.jsx (หลัง RequireAuth) — บล็อกพนักงาน (role ≠ admin) ที่เปิดบนคอมพิวเตอร์
// - ตัดสินหลังล็อกอิน เพราะก่อนหน้านั้นยังไม่รู้ role (บล็อกที่หน้า login จะล็อกแอดมินออกด้วย)
// - แอดมินผ่านเสมอ รวมถึงใน iframe พรีวิว; ไม่ดู ?preview=employee (พนักงานเติมพารามิเตอร์เลี่ยงไม่ได้)
// - อยู่ก่อน Layout → คนที่ถูกบล็อกไม่โหลด BottomNav/Dashboard จึงไม่ยิงคิวรีเพิ่ม (โควตา Spark)
export default function DeviceGate({ children }) {
  const { profile, logout } = useAuth()
  // ประเมินครั้งเดียวตอน mount — กันสถานะกะพริบเมื่อ profile อัปเดตสดจาก onSnapshot
  const [desktop] = useState(() => isDesktopDevice())

  if (profile && profile.role !== 'admin' && desktop) return <DesktopBlockedScreen onLogout={logout} />
  return children
}
