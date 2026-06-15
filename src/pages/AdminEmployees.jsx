import { useState, useEffect } from 'react'
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, setDoc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'

const EMPTY_FORM = { name: '', code: '', department: '', points: 0, role: 'employee' }

export default function AdminEmployees() {
  const [employees, setEmployees] = useState([]) // เข้าระบบแล้ว (employees/{email})
  const [pending, setPending] = useState([])     // รอผูกบัญชี (pendingEmployees/{code})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  // Points adjustment modal
  const [ptModal, setPtModal] = useState(null) // { emp, delta }
  const [ptDelta, setPtDelta] = useState(0)
  const [ptNote, setPtNote] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    const [empSnap, pendSnap] = await Promise.all([
      getDocs(collection(db, 'employees')),
      getDocs(collection(db, 'pendingEmployees')),
    ])
    setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    setPending(pendSnap.docs.map(d => ({ id: d.id, code: d.id, ...d.data() })))
    setLoading(false)
  }

  const handleAddEmployee = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErrMsg('')
    try {
      const code = form.code.trim()
      if (!code) throw new Error('กรุณากรอกรหัสพนักงาน')
      // กันรหัสซ้ำ
      const exists = await getDoc(doc(db, 'pendingEmployees', code))
      if (exists.exists()) throw new Error(`รหัส "${code}" ถูกใช้ไปแล้ว`)
      // สร้างไว้รอพนักงานล็อกอิน Google แล้วใส่รหัสเพื่อผูกบัญชี (doc id = รหัสพนักงาน)
      await setDoc(doc(db, 'pendingEmployees', code), {
        name: form.name,
        code,
        department: form.department,
        points: Number(form.points),
        role: form.role,
        createdAt: new Date(),
      })
      setSuccessMsg(`เพิ่มพนักงาน "${form.name}" (รหัส ${code}) สำเร็จ! แจ้งรหัสนี้ให้พนักงานเพื่อเข้าระบบ`)
      setForm(EMPTY_FORM)
      setShowForm(false)
      fetchAll()
    } catch (err) {
      setErrMsg(err.message)
    } finally {
      setSaving(false)
    }
  }

  const deletePending = async (p) => {
    if (!window.confirm(`ลบพนักงานที่รอผูกบัญชี "${p.name}" (รหัส ${p.code})?`)) return
    await deleteDoc(doc(db, 'pendingEmployees', p.code))
    setSuccessMsg(`ลบรหัส ${p.code} แล้ว`)
    setTimeout(() => setSuccessMsg(''), 3000)
    fetchAll()
  }

  const deleteEmployee = async (emp) => {
    if (!window.confirm(`ลบพนักงาน "${emp.name}" ออกจากระบบ?\nข้อมูลและแต้มจะถูกลบถาวร`)) return
    await deleteDoc(doc(db, 'employees', emp.id))
    setSuccessMsg(`ลบพนักงาน "${emp.name}" แล้ว`)
    setTimeout(() => setSuccessMsg(''), 3000)
    fetchAll()
  }

  const adjustPoints = async () => {
    const add = Number(ptDelta)
    if (!ptModal || add <= 0) return // เพิ่มแต้มอย่างเดียว
    const ref = doc(db, 'employees', ptModal.id)
    const newPts = (ptModal.points ?? 0) + add
    await updateDoc(ref, { points: newPts })
    // บันทึกประวัติทุกครั้ง (เพื่อให้การ์ด "แต้มที่ได้รับเดือนนี้" นับได้ครบ)
    await addDoc(collection(db, 'transactions'), {
      employeeId: ptModal.id,
      employeeName: ptModal.name,
      rewardName: ptNote || 'เพิ่มแต้มโดย Admin',
      rewardId: null,
      pointsUsed: -add,
      createdAt: new Date(),
      status: 'เพิ่มแต้ม',
    })
    setPtModal(null)
    setPtDelta(0)
    setPtNote('')
    fetchAll()
    setSuccessMsg(`เพิ่มแต้มให้ "${ptModal.name}" เรียบร้อย!`)
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  // รวมพนักงานที่เข้าระบบแล้ว + ที่รอผูกบัญชี
  const rows = [
    ...employees.map(e => ({ ...e, pending: false, key: e.id })),
    ...pending.map(p => ({ ...p, pending: true, key: `pending-${p.id}` })),
  ].filter(r =>
    r.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.department?.toLowerCase().includes(search.toLowerCase()) ||
    r.code?.toLowerCase?.().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">👥 จัดการพนักงาน</div>
          <div className="page-sub">เพิ่มพนักงาน (กำหนดรหัส) และปรับแต้ม</div>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? '✕ ปิด' : '+ เพิ่มพนักงาน'}
        </button>
      </div>

      {successMsg && <div style={{ background: '#D1FAE5', color: '#065F46', padding: '12px 18px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontWeight: 700 }}>✅ {successMsg}</div>}
      {errMsg && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '12px 18px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontWeight: 700 }}>⚠️ {errMsg}</div>}

      {/* Add form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>➕ เพิ่มพนักงานใหม่</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            กำหนดรหัสพนักงานแล้วแจ้งให้พนักงาน พนักงานจะล็อกอิน Google แล้วกรอกรหัสนี้เพื่อเข้าระบบครั้งแรก
          </div>
          <form onSubmit={handleAddEmployee}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>ชื่อ-นามสกุล *</label>
                <input className="input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="สมชาย ใจดี" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>รหัสพนักงาน *</label>
                <input className="input" required value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="เช่น EMP001" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>แผนก *</label>
                <input className="input" required value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="Sales" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>แต้มเริ่มต้น</label>
                <input className="input" type="number" min={0} value={form.points} onChange={e => setForm(f => ({ ...f, points: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>สิทธิ์</label>
                <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="employee">พนักงาน</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={saving} style={{ padding: '11px 28px' }}>
              {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
            </button>
          </form>
        </div>
      )}

      {/* Search */}
      <input className="input" style={{ maxWidth: 320, marginBottom: 16 }} placeholder="🔍 ค้นหาชื่อ / แผนก / รหัส..." value={search} onChange={e => setSearch(e.target.value)} />

      {/* Table */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>กำลังโหลด...</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ชื่อ</th>
                <th>รหัส</th>
                <th>แผนก</th>
                <th>สถานะ</th>
                <th>สิทธิ์</th>
                <th style={{ textAlign: 'right' }}>แต้ม</th>
                <th style={{ textAlign: 'center' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(emp => (
                <tr key={emp.key}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{emp.name?.[0]}</div>
                      <div>
                        <div style={{ fontWeight: 700 }}>{emp.name}</div>
                        {!emp.pending && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{emp.email}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{emp.code ?? '-'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{emp.department}</td>
                  <td>
                    {emp.pending
                      ? <span className="badge badge-warn">รอผูกบัญชี</span>
                      : <span className="badge badge-success">เข้าระบบแล้ว</span>}
                  </td>
                  <td>
                    <span className={`badge ${emp.role === 'admin' ? 'badge-warn' : 'badge-success'}`}>
                      {emp.role === 'admin' ? 'Admin' : 'พนักงาน'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary-dark)' }}>
                    {emp.points?.toLocaleString() ?? 0}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {emp.pending ? (
                      <button
                        className="btn-danger"
                        style={{ padding: '6px 14px', fontSize: 12 }}
                        onClick={() => deletePending(emp)}
                      >
                        🗑 ลบ
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button
                          className="btn-primary"
                          style={{ padding: '6px 12px', fontSize: 12 }}
                          onClick={() => { setPtModal(emp); setPtDelta(0); setPtNote('') }}
                        >
                          ⭐ เพิ่มแต้ม
                        </button>
                        <button
                          className="btn-danger"
                          style={{ padding: '6px 12px', fontSize: 12 }}
                          onClick={() => deleteEmployee(emp)}
                        >
                          🗑 ลบ
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Adjust points modal */}
      {ptModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(46,31,14,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className="card" style={{ maxWidth: 380, width: '100%', padding: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>⭐ เพิ่มแต้ม</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>{ptModal.name}</div>

            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>แต้มปัจจุบัน</label>
            <input className="input" type="text" value={(ptModal.points ?? 0).toLocaleString()} readOnly disabled style={{ marginBottom: 12, background: 'var(--bg)', fontWeight: 800, color: 'var(--primary-dark)' }} />

            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>จำนวนแต้มที่เพิ่ม</label>
            <input className="input" type="number" min={1} value={ptDelta} onChange={e => setPtDelta(e.target.value)} style={{ marginBottom: 12 }} placeholder="เช่น 100" />
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>หมายเหตุ</label>
            <input className="input" value={ptNote} onChange={e => setPtNote(e.target.value)} style={{ marginBottom: 20 }} placeholder="เช่น โบนัสเดือนมิถุนายน" />
            {Number(ptDelta) > 0 && (
              <div style={{ background: '#D1FAE5', color: '#065F46', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13, fontWeight: 700 }}>
                ➕ แต้มใหม่จะเป็น: {((ptModal.points ?? 0) + Number(ptDelta)).toLocaleString()} แต้ม
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-danger" style={{ flex: 1 }} onClick={() => setPtModal(null)}>ยกเลิก</button>
              <button className="btn-primary" style={{ flex: 1, padding: '10px' }} onClick={adjustPoints}>บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
