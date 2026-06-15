import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth'
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
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
      setLoading(false)
    })
    return unsub
  }, [])

  const loginWithGoogle = async () => {
    setAuthError('')
    await signInWithPopup(auth, googleProvider)
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
      {!loading && children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
