import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext(null)
const googleProvider = new GoogleAuthProvider()

// แสดงแทนหน้าขาวเมื่ออ่านโปรไฟล์จาก Firestore ไม่ได้ (เช่นโควตาอ่านฟรีรายวันของ Firestore หมด / เน็ตหลุด)
function LoadErrorScreen() {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div className="card" style={{ maxWidth: 360, width: '100%', textAlign: 'center', padding: 28 }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>🛠️</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>ระบบขัดข้องชั่วคราว</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.7 }}>
          ตอนนี้โหลดข้อมูลไม่ได้ กรุณาลองใหม่อีกครั้งในอีกสักครู่ ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ
        </div>
        <button className="btn-primary" style={{ width: '100%', padding: '11px' }} onClick={() => window.location.reload()}>ลองใหม่</button>
      </div>
    </div>
  )
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)             // ผู้ใช้ที่ผูกบัญชีครบแล้ว
  const [pendingUser, setPendingUser] = useState(null) // ล็อกอิน Google แล้ว แต่ยังไม่ผูกรหัสพนักงาน
  const [profile, setProfile] = useState(null)       // Firestore employee doc
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')     // ข้อความแจ้งเตือนตอนล็อกอินไม่ผ่าน
  const [loadError, setLoadError] = useState(false)  // อ่านโปรไฟล์จาก Firestore ไม่ได้

  useEffect(() => {
    // ตรวจผลลัพธ์ signInWithRedirect (เผื่อ redirect กลับมาแล้ว error เช่น ถูกยกเลิก/เน็ตหลุด)
    getRedirectResult(auth).catch(() => {
      setAuthError('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    })
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // จับคู่พนักงานด้วยอีเมล (doc id ของ employees = อีเมล)
          const snap = await getDoc(doc(db, 'employees', firebaseUser.email))
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
        setLoadError(false)
      } catch (e) {
        // อ่านโปรไฟล์ไม่ได้ → แจ้งแทนการค้างหน้าขาว (เดิม getDoc พังแล้ว setLoading(false) ไม่ถูกเรียก → เห็นหน้าขาวตลอด)
        console.error('โหลดโปรไฟล์ไม่สำเร็จ', e)
        setLoadError(true)
      } finally {
        setLoading(false)
      }
    })
    return unsub
  }, [])

  // ฟัง employees/{อีเมล} แบบ realtime หลังผูกบัญชีแล้ว — admin เพิ่ม/หักแต้มให้ ชิปแต้มบนมือถือเปลี่ยนเอง
  // โดยไม่ต้องปิด-เปิดแอป (เดิมอ่านครั้งเดียวตอนล็อกอิน เปิดแอปค้างไว้จึงเห็นแต้มเก่า)
  useEffect(() => {
    if (!user?.email) return
    return onSnapshot(
      doc(db, 'employees', user.email),
      (snap) => { if (snap.exists()) setProfile({ id: snap.id, ...snap.data() }) },
      () => { /* อ่านไม่ได้ชั่วคราว (เน็ตหลุด ฯลฯ) → คงค่าเดิมไว้ */ }
    )
  }, [user?.email])

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
      {!loading && (loadError ? <LoadErrorScreen /> : children)}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
