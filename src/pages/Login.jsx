import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { user, loginWithGoogle, linkWithCode, logout, pendingUser, authError } = useAuth()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState('')

  // ล็อกไม่ให้หน้า login เลื่อนขึ้น/ลง (คืนค่าเดิมเมื่อออกจากหน้า)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleGoogleLogin = async () => {
    setError('')
    setLoading(true)
    try {
      await loginWithGoogle()
      // ไม่ navigate เอง — รอ AuthContext โหลด profile เสร็จแล้วค่อย redirect (ดู Navigate ด้านล่าง)
    } catch (err) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        setError('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLinkCode = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await linkWithCode(code)
      // linkWithCode เซ็ต user ให้แล้ว → Navigate ด้านล่างจะพาไปหน้าหลักเอง
    } catch (err) {
      setError(err?.message || 'ผูกบัญชีไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  // ล็อกอิน + ผูกบัญชีครบแล้ว → ออกจากหน้า login ไปหน้าหลัก (ตาม role)
  if (user) return <Navigate to="/" replace />

  const message = error || authError

  return (
    <div style={{
      height: '100dvh',
      overflow: 'hidden',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo (marginBottom ติดลบ = การ์ตูนเลื่อนลงไปซ้อนบนการ์ด ยิ่งลบมาก = ลงมาก) */}
        <div style={{ textAlign: 'center', marginBottom: -25, position: 'relative', zIndex: 1 }}>
          {/* iconmove.webp = พื้นหลังโปร่งใส (สร้างจาก iconmove.gif) วางทับชื่อเดิมเพื่อเปลี่ยนภาพ */}
          <img
            src="/iconmove.webp"
            alt=""
            style={{ width: 160, height: 160, objectFit: 'contain', margin: '0 auto', display: 'block' }}
          />
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 16 }}>
          {pendingUser ? (
            /* ── ขั้นที่ 2: ผูกบัญชีด้วยรหัสพนักงาน ── */
            <>
              <form onSubmit={handleLinkCode}>
                {/* รูป linkcard เป็นพื้น + ช่องกรอกรหัสซ้อนทับลงบนรูป */}
                <div style={{ position: 'relative', width: '100%', maxWidth: 300, margin: '0 auto 12px' }}>
                  <img
                    src="/linkcard.png"
                    alt="ผูกบัญชีครั้งแรก — กรอกรหัสพนักงาน"
                    style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 16 }}
                  />
                  {/* ปรับ bottom / width ให้ช่องตรงกับตำแหน่งช่องว่างในรูป */}
                  <input
                    className="input"
                    type="text"
                    placeholder="รหัสพนักงาน"
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase())}
                    required
                    autoFocus
                    style={{
                      position: 'absolute',
                      left: '53%',
                      bottom: '7%',
                      transform: 'translateX(-50%)',
                      width: '62%',          // ← ความกว้างช่องใส่รหัสพนักงาน
                      padding: '5px',       // ← ความสูงช่อง (เพิ่มเลข = สูงขึ้น)
                      fontSize: 13,          // ← ขนาดตัวอักษร
                      textAlign: 'center',
                      textTransform: 'uppercase',
                      background: 'rgba(255,255,255,0.96)',
                    }}
                  />
                </div>

                {message && (
                  <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16, fontWeight: 600 }}>
                    ⚠️ {message}
                  </div>
                )}

                {/* ไม่มีปุ่มยืนยันแล้ว — กด Enter ในช่องรหัสเพื่อยืนยัน */}
                {loading && (
                  <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
                    กำลังผูกบัญชี...
                  </div>
                )}
              </form>

              <button
                type="button"
                onClick={logout}
                style={{ width: '100%', marginTop: 0, padding: '1px', fontSize: 13, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}
              >
                ← ใช้บัญชี Google อื่น
              </button>
            </>
          ) : (
            /* ── ขั้นที่ 1: ล็อกอินด้วย Google ── */
            <>
              {message && (
                <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16, fontWeight: 600 }}>
                  ⚠️ {message}
                </div>
              )}

              {/* กดที่รูป loginmain เพื่อเข้าสู่ระบบด้วย Google */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: 0, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
              >
                <img
                  src="/loginmain.png"
                  alt="เข้าสู่ระบบด้วยบัญชี Google ของคุณ"
                  style={{ width: '100%', maxWidth: 368, height: 'auto', display: 'block', margin: '0 auto', borderRadius: 18 }}
                />
              </button>
              {loading && (
                <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 12, fontWeight: 600 }}>
                  กำลังเข้าสู่ระบบ...
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
