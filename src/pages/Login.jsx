import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { user, loginWithGoogle, linkWithCode, logout, pendingUser, authError } = useAuth()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState('')

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
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
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
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary-dark)' }}>ผูกบัญชีครั้งแรก</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  เข้าด้วย {pendingUser.email}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                  กรอกรหัสพนักงานที่ได้รับจากผู้ดูแลระบบ
                </div>
              </div>

              {message && (
                <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16, fontWeight: 600 }}>
                  ⚠️ {message}
                </div>
              )}

              <form onSubmit={handleLinkCode}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--text-muted)' }}>
                  รหัสพนักงาน
                </label>
                <input
                  className="input"
                  type="text"
                  placeholder="เช่น EMP001"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  required
                  autoFocus
                  style={{ marginBottom: 20 }}
                />
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ width: '100%', padding: '13px', fontSize: 15 }}
                  disabled={loading}
                >
                  {loading ? 'กำลังผูกบัญชี...' : '🔗 ยืนยันรหัสพนักงาน'}
                </button>
              </form>

              <button
                type="button"
                onClick={logout}
                style={{ width: '100%', marginTop: 12, padding: '10px', fontSize: 13, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}
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
