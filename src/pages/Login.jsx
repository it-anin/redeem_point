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
            style={{ width: 160, height: 160, objectFit: 'contain', margin: '0 auto 14px', display: 'block' }}
          />
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary-dark)' }}>ระบบสะสมแต้มแลกรางวัล</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>ระบบสะสมแต้มพนักงาน</div>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 28 }}>
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
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary-dark)' }}>เข้าสู่ระบบ</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>ใช้บัญชี Google ของคุณ</div>
              </div>

              {message && (
                <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16, fontWeight: 600 }}>
                  ⚠️ {message}
                </div>
              )}

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '13px',
                  fontSize: 15,
                  fontWeight: 700,
                  background: '#fff',
                  color: '#3c4043',
                  border: '1.5px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  opacity: loading ? 0.7 : 1,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วย Google'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
