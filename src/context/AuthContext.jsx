import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext(null)
const googleProvider = new GoogleAuthProvider()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)             // ผู้ใช้ที่ผูกบัญชีครบแล้ว
  const [pendingUser, setPendingUser] = useState(null) // ล็อกอิน Google แล้ว แต่ยังไม่ผูกรหัสพนักงาน
  const [profile, setProfile] = useState(null)       // Firestore employee doc
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')     // ข้อความแจ้งเตือนตอนล็อกอินไม่ผ่าน
  const [profileError, setProfileError] = useState('')
  const [profileAttempt, setProfileAttempt] = useState(0)

  useEffect(() => {
    // ตรวจผลลัพธ์ signInWithRedirect (เผื่อ redirect กลับมาแล้ว error เช่น ถูกยกเลิก/เน็ตหลุด)
    getRedirectResult(auth).catch(() => {
      setAuthError('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    })
  }, [])

  useEffect(() => {
    let active = true
    let currentRequest = 0
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      const request = ++currentRequest
      setLoading(true)
      setProfileError('')
      try {
        if (firebaseUser) {
          // จับคู่พนักงานด้วยอีเมล (doc id ของ employees = อีเมล)
          const snap = await getDoc(doc(db, 'employees', firebaseUser.email))
          if (!active || request !== currentRequest) return
          if (snap.exists()) {
            setUser(firebaseUser)
            setProfile({ id: snap.id, ...snap.data() })
            setPendingUser(null)
            setAuthError('')
          } else {
            // ยังไม่เคยผูกบัญชี → ให้ไปกรอกรหัสพนักงาน
            setUser(null)
            setProfile(null)
            setPendingUser(firebaseUser)
          }
        } else {
          setUser(null)
          setProfile(null)
          setPendingUser(null)
        }
      } catch {
        if (!active || request !== currentRequest) return
        setUser(null)
        setProfile(null)
        setPendingUser(null)
        setProfileError('โหลดข้อมูลบัญชีไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง')
      } finally {
        if (active && request === currentRequest) setLoading(false)
      }
    })
    return () => { active = false; unsub() }
  }, [profileAttempt])

  const loginWithGoogle = async () => {
    setAuthError('')
    // ใช้ redirect แทน popup — popup พึ่ง sessionStorage ข้าม origin (เว็บ ↔ accounts.google.com)
    // ซึ่งโดน iOS Safari (ITP) พาร์ทิชัน/บล็อกจนเกิด "missing initial state" error
    await signInWithRedirect(auth, googleProvider)
  }

  // ผูกบัญชี Google เข้ากับรหัสพนักงาน (ทำครั้งแรกครั้งเดียว)
  const linkWithCode = async (code) => {
    const fbUser = pendingUser
    if (!fbUser) throw new Error('ไม่พบเซสชันการล็อกอิน')

    const trimmed = String(code).trim()
    const pendRef = doc(db, 'pendingEmployees', trimmed)
    const pendSnap = await getDoc(pendRef)
    if (!pendSnap.exists()) throw new Error('รหัสพนักงานไม่ถูกต้อง หรือถูกใช้ไปแล้ว')

    const data = pendSnap.data()
    // สร้าง employees/{อีเมล} จากข้อมูลใน pending
    await setDoc(doc(db, 'employees', fbUser.email), {
      name: data.name ?? '',
      email: fbUser.email,
      department: data.department ?? '',
      points: Number(data.points ?? 0),
      role: data.role ?? 'employee',
      code: trimmed,
      createdAt: new Date(),
    })
    // ลบ pending (best-effort)
    try { await deleteDoc(pendRef) } catch { /* ไม่เป็นไรถ้าลบไม่ได้ */ }

    const snap = await getDoc(doc(db, 'employees', fbUser.email))
    setProfile({ id: snap.id, ...snap.data() })
    setUser(fbUser)
    setPendingUser(null)
    setAuthError('')
  }

  // อัปเดตข้อมูล profile ในหน่วยความจำทันที (เช่น หักแต้มหลังแลกรางวัล) โดยไม่ต้อง refresh
  const patchProfile = (patch) => setProfile(p => (p ? { ...p, ...patch } : p))

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, pendingUser, profile, loading, authError, loginWithGoogle, linkWithCode, logout, patchProfile }}>
      {!loading && (profileError ? (
        <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="card" role="alert" style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
            <p style={{ marginBottom: 16 }}>{profileError}</p>
            <button className="btn-primary" type="button" onClick={() => { setLoading(true); setProfileAttempt(attempt => attempt + 1) }}>
              ลองอีกครั้ง
            </button>
            <button type="button" onClick={() => logout().catch(() => setProfileError('ออกจากระบบไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง'))}
              style={{ display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: 'var(--primary-dark)', cursor: 'pointer' }}>
              ใช้บัญชี Google อื่น
            </button>
          </div>
        </div>
      ) : children)}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
