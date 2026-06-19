import { useState, useEffect, Fragment } from 'react'
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, setDoc, getDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

const EMPTY_FORM = { name: '', code: '', department: '', points: 0, role: 'employee' }

// หมวดแผนก — ใช้ทั้งจัดกลุ่มตารางและเป็นตัวเลือกใน dropdown ฟอร์ม
const DEPT_GROUPS = [
  { group: 'Sale',      depts: ['Pharmarcist', 'Pharmarcist Assistant', 'Pharmarcist Mobile', 'Sale Admin'] },
  { group: 'Warehouse', depts: ['Outbound', 'Inbound', 'Inventory', 'Warehouse Manager', 'Packing'] },
  { group: 'Office',    depts: ['IT Support', 'Accountant', 'Purchase', 'Procurement Manager', 'HR&Admin'] },
]
const GROUP_ORDER = [...DEPT_GROUPS.map(g => g.group), 'อื่นๆ']
// หาว่า department อยู่กลุ่มไหน (เทียบแบบไม่สนตัวพิมพ์เล็ก/ใหญ่ + ตัดช่องว่าง)
const groupOfDept = (dept) => {
  const d = (dept || '').trim().toLowerCase()
  const found = DEPT_GROUPS.find(g => g.depts.some(x => x.toLowerCase() === d))
  return found ? found.group : 'อื่นๆ'
}

export default function AdminEmployees() {
  const { profile } = useAuth()
  const [employees, setEmployees] = useState([]) // เข้าระบบแล้ว (employees/{email})
  const [pending, setPending] = useState([])     // รอผูกบัญชี (pendingEmployees/{code})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formClosing, setFormClosing] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  // โมดัลแก้ไขพนักงาน (รวม แก้ข้อมูล + ปรับแต้ม ในที่เดียว)
  const [editModal, setEditModal] = useState(null) // พนักงานที่กำลังแก้ไข (มี .pending)
  const [editClosing, setEditClosing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', department: '', role: 'employee', points: 0 })
  const [editDelta, setEditDelta] = useState(0)
  const [editNote, setEditNote] = useState('')
  const [search, setSearch] = useState('')
  // โมดัลรีเซ็ตแต้มทั้งระบบ (ต้องพิมพ์ RESET ยืนยัน)
  const [resetModal, setResetModal] = useState(false)
  const [resetText, setResetText] = useState('')
  const [resetting, setResetting] = useState(false)

  useEffect(() => { fetchAll() }, [])

  const openForm = () => { setFormClosing(false); setShowForm(true) }
  // ปิดแบบหน่วง unmount ให้ slide down (ออก) เล่นจบก่อน (ตรงกับ 0.28s ใน CSS)
  const closeForm = () => {
    setFormClosing(true)
    setTimeout(() => { setShowForm(false); setFormClosing(false) }, 280)
  }
  const toggleForm = () => { showForm ? closeForm() : openForm() }

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
      closeForm()
      fetchAll()
    } catch (err) {
      setErrMsg(err.message)
    } finally {
      setSaving(false)
    }
  }

  // เปิดโมดัลแก้ไข (เติมค่าเดิมลงฟอร์ม)
  const openEdit = (emp) => {
    setEditModal(emp)
    setEditForm({ name: emp.name || '', department: emp.department || '', role: emp.role || 'employee', points: emp.points ?? 0 })
    setEditDelta(0)
    setEditNote('')
    setEditClosing(false)
  }
  // ปิดแบบหน่วง unmount ให้ slide down (ออก) เล่นจบก่อน (ตรงกับ 0.28s ใน CSS)
  const closeEdit = () => {
    setEditClosing(true)
    setTimeout(() => { setEditModal(null); setEditClosing(false) }, 280)
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

  // ยกเลิกผูกบัญชี: ปลดอีเมลออก แต่คงรหัส+ข้อมูล+แต้มเดิม (ย้ายกลับเป็น pendingEmployees ด้วยรหัสเดิม)
  // → พนักงานล็อกอิน Gmail ใหม่ + กรอกรหัสเดิม เพื่อผูกกับอีเมลใหม่
  const unlinkEmployee = async (emp) => {
    if (!emp.code) {
      setErrMsg(`"${emp.name}" ไม่มีรหัสพนักงาน ยกเลิกผูกบัญชีไม่ได้ (กด ✏️ แก้ไข เพิ่มรหัสก่อน)`)
      setTimeout(() => setErrMsg(''), 4000)
      return
    }
    if (!window.confirm(
      `ยกเลิกผูกบัญชีของ "${emp.name}"?\n\n` +
      `• ปลดอีเมล ${emp.id} ออก\n` +
      `• คงรหัส ${emp.code} + แต้ม ${emp.points?.toLocaleString() ?? 0} + ข้อมูลเดิมไว้\n` +
      `• พนักงานล็อกอินด้วย Gmail ใหม่ แล้วกรอกรหัส ${emp.code} เพื่อผูกใหม่`
    )) return
    try {
      await setDoc(doc(db, 'pendingEmployees', emp.code), {
        name: emp.name ?? '',
        code: emp.code,
        department: emp.department ?? '',
        points: Number(emp.points ?? 0),
        role: emp.role ?? 'employee',
        createdAt: new Date(),
      })
      await deleteDoc(doc(db, 'employees', emp.id))
      setSuccessMsg(`ยกเลิกผูกบัญชี "${emp.name}" แล้ว — ให้ล็อกอิน Gmail ใหม่ + กรอกรหัส ${emp.code}`)
      setTimeout(() => setSuccessMsg(''), 5000)
      fetchAll()
    } catch (err) {
      setErrMsg('ยกเลิกผูกบัญชีไม่สำเร็จ: ' + err.message)
    }
  }

  // รีเซ็ตแต้มทุกคนเป็น 0 (รวม pendingEmployees) + ลบประวัติ transactions ทั้งหมด → เริ่มนับใหม่
  const resetAllPoints = async () => {
    setResetting(true)
    setErrMsg('')
    try {
      const [empSnap, pendSnap, txSnap] = await Promise.all([
        getDocs(collection(db, 'employees')),
        getDocs(collection(db, 'pendingEmployees')),
        getDocs(collection(db, 'transactions')),
      ])
      // ตั้งแต้ม = 0 ให้ทุกคน
      const refs = [
        ...empSnap.docs.map(d => doc(db, 'employees', d.id)),
        ...pendSnap.docs.map(d => doc(db, 'pendingEmployees', d.id)),
      ]
      for (let i = 0; i < refs.length; i += 400) {
        const batch = writeBatch(db)
        refs.slice(i, i + 400).forEach(ref => batch.update(ref, { points: 0 }))
        await batch.commit()
      }
      // ลบประวัติ transactions ทั้งหมด (เริ่มนับใหม่)
      for (let i = 0; i < txSnap.docs.length; i += 400) {
        const batch = writeBatch(db)
        txSnap.docs.slice(i, i + 400).forEach(d => batch.delete(doc(db, 'transactions', d.id)))
        await batch.commit()
      }
      // บันทึก audit log (best-effort)
      try {
        await addDoc(collection(db, 'auditLogs'), {
          action: 'reset_points',
          detail: `รีเซ็ตแต้มเป็น 0 (${empSnap.size} พนักงาน + ${pendSnap.size} รอผูกบัญชี) + ลบประวัติ ${txSnap.size} รายการ`,
          by: profile?.email || profile?.name || 'admin',
          at: new Date(),
        })
      } catch { /* ไม่เป็นไรถ้าเขียน log ไม่ได้ */ }
      setResetModal(false)
      setResetText('')
      fetchAll()
      setSuccessMsg(`รีเซ็ตแต้ม + ล้างประวัติเรียบร้อย (แต้ม 0 ทุกคน, ลบ ${txSnap.size} รายการ)`)
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err) {
      setErrMsg('รีเซ็ตไม่สำเร็จ: ' + err.message)
    } finally {
      setResetting(false)
    }
  }

  // บันทึกการแก้ไข: ชื่อ/แผนก/สิทธิ์ + ปรับแต้ม (พร้อมบันทึกประวัติ) ในครั้งเดียว
  const saveEdit = async () => {
    if (!editModal) return
    const emp = editModal
    const name = editForm.name.trim()
    if (!name) { setErrMsg('กรุณากรอกชื่อ'); return }
    try {
      if (emp.pending) {
        // รอผูกบัญชี → แก้ฟิลด์ + แต้มเริ่มต้นได้โดยตรง (ยังไม่มีประวัติธุรกรรม)
        await updateDoc(doc(db, 'pendingEmployees', emp.code), {
          name, department: editForm.department, role: editForm.role, points: Number(editForm.points) || 0,
        })
      } else {
        const delta = Number(editDelta) || 0
        const updates = { name, department: editForm.department, role: editForm.role }
        if (delta !== 0) updates.points = Math.max(0, (emp.points ?? 0) + delta)
        await updateDoc(doc(db, 'employees', emp.id), updates)
        if (delta !== 0) {
          // pointsUsed: เพิ่ม=ลบ, หัก=บวก → = -delta ; ผลต่อยอด = -pointsUsed
          await addDoc(collection(db, 'transactions'), {
            employeeId: emp.id,
            employeeName: name,
            rewardName: editNote || (delta > 0 ? 'เพิ่มแต้มโดย Admin' : 'หักแต้มโดย Admin'),
            rewardId: null,
            pointsUsed: -delta,
            createdAt: new Date(),
            status: delta > 0 ? 'เพิ่มแต้ม' : 'หักแต้ม',
          })
        }
      }
      closeEdit()
      fetchAll()
      setSuccessMsg(`บันทึกข้อมูล "${name}" เรียบร้อย!`)
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err) {
      setErrMsg(err.message)
    }
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

  // จัดกลุ่มแถวตามหมวดแผนก (Sale / Warehouse / Office / อื่นๆ) ตัดกลุ่มที่ว่างทิ้ง
  const grouped = GROUP_ORDER
    .map(group => ({ group, list: rows.filter(r => groupOfDept(r.department) === group) }))
    .filter(g => g.list.length > 0)

  return (
    <>
      <div className="page-header">
        <div />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-danger" onClick={() => { setResetText(''); setResetModal(true) }}>
            ♻️ รีเซ็ตแต้มทั้งระบบ
          </button>
          <button className="btn-primary" onClick={toggleForm}>
            {showForm && !formClosing ? '✕ ปิด' : '+ เพิ่มพนักงาน'}
          </button>
        </div>
      </div>

      {successMsg && <div style={{ background: '#D1FAE5', color: '#065F46', padding: '12px 18px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontWeight: 700 }}>✅ {successMsg}</div>}
      {errMsg && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '12px 18px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontWeight: 700 }}>⚠️ {errMsg}</div>}

      {/* Add form */}
      {showForm && (
        <div className={`card ${formClosing ? 'slidedown-out' : 'slidedown-in'}`} style={{ marginBottom: 24 }}>
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
                <select className="input" required value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                  <option value="" disabled>เลือกแผนก</option>
                  {DEPT_GROUPS.map(g => (
                    <optgroup key={g.group} label={g.group}>
                      {g.depts.map(d => <option key={d} value={d}>{d}</option>)}
                    </optgroup>
                  ))}
                </select>
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
      <input className="input" style={{ maxWidth: 320, marginBottom: 16, background: '#fff' }} placeholder="🔍 ค้นหาชื่อ / แผนก / รหัส..." value={search} onChange={e => setSearch(e.target.value)} />

      {/* Table */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>กำลังโหลด...</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead style={{ background: '#fff' }}>
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
              {grouped.map(({ group, list }) => (
                <Fragment key={group}>
                  <tr>
                    <td colSpan={7} style={{ background: 'var(--bg)', fontWeight: 800, color: 'var(--primary-dark)', fontSize: 13 }}>
                      {group} <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>({list.length})</span>
                    </td>
                  </tr>
                  {list.map(emp => (
                <tr key={emp.key}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img src="/star-profile.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} />
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
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button
                        className="btn-primary"
                        style={{ padding: '6px 14px', fontSize: 12 }}
                        onClick={() => openEdit(emp)}
                      >
                        ✏️ แก้ไข
                      </button>
                      {!emp.pending && (
                        <button
                          className="btn-primary"
                          style={{ padding: '6px 12px', fontSize: 12, background: 'var(--surface)', color: 'var(--primary-dark)', border: '1.5px solid var(--border)' }}
                          onClick={() => unlinkEmployee(emp)}
                        >
                          🔄 เปลี่ยนอีเมล
                        </button>
                      )}
                      <button
                        className="btn-danger"
                        style={{ padding: '6px 12px', fontSize: 12 }}
                        onClick={() => emp.pending ? deletePending(emp) : deleteEmployee(emp)}
                      >
                        🗑 ลบ
                      </button>
                    </div>
                  </td>
                </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reset all points modal — ต้องพิมพ์ RESET ยืนยัน */}
      {resetModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(46,31,14,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className="card slidedown-in" style={{ maxWidth: 420, width: '100%', padding: 28 }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8, color: '#991B1B' }}>⚠️ รีเซ็ตแต้มทั้งระบบ</div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, marginBottom: 8 }}>
              จะตั้งแต้มของ <b>พนักงานทุกคน</b> (รวมที่รอผูกบัญชี) ให้เป็น <b>0</b> และ <b>ลบประวัติการทำรายการทั้งหมด</b> (เริ่มนับใหม่)
            </div>
            <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
              ❗ การกระทำนี้กู้คืนไม่ได้ — ประวัติทุกหน้า (รายการล่าสุด/ประวัติ/แต้มที่ได้รับ) จะหายหมด
            </div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              พิมพ์ <b>RESET</b> เพื่อยืนยัน
            </label>
            <input className="input" value={resetText} onChange={e => setResetText(e.target.value)} placeholder="RESET" autoFocus style={{ marginBottom: 20, background: '#fff' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" style={{ flex: 1 }} onClick={() => { setResetModal(false); setResetText('') }} disabled={resetting}>ยกเลิก</button>
              <button className="btn-danger" style={{ flex: 1, padding: '10px' }} onClick={resetAllPoints} disabled={resetText !== 'RESET' || resetting}>
                {resetting ? 'กำลังรีเซ็ต...' : '♻️ ยืนยันรีเซ็ต'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit employee modal — ข้อมูล + ปรับแต้ม (slide down เปิด/ปิด) */}
      {editModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(46,31,14,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className={`card ${editClosing ? 'slidedown-out' : 'slidedown-in'}`} style={{ maxWidth: 420, width: '100%', padding: 28, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>✏️ แก้ไขพนักงาน</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              {editModal.name}{editModal.code ? ` · รหัส ${editModal.code}` : ''}
            </div>

            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>ชื่อ-นามสกุล *</label>
            <input className="input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ marginBottom: 12 }} placeholder="สมชาย ใจดี" />

            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>แผนก</label>
            <select className="input" value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))} style={{ marginBottom: 12 }}>
              <option value="" disabled>เลือกแผนก</option>
              {DEPT_GROUPS.map(g => (
                <optgroup key={g.group} label={g.group}>
                  {g.depts.map(d => <option key={d} value={d}>{d}</option>)}
                </optgroup>
              ))}
            </select>

            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>สิทธิ์</label>
            <select className="input" value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} style={{ marginBottom: 16 }}>
              <option value="employee">พนักงาน</option>
              <option value="admin">Admin</option>
            </select>

            <div style={{ borderTop: '1.5px solid var(--border)', margin: '4px 0 16px' }} />

            {editModal.pending ? (
              <>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>แต้มเริ่มต้น</label>
                <input className="input" type="number" min={0} value={editForm.points} onChange={e => setEditForm(f => ({ ...f, points: e.target.value }))} style={{ marginBottom: 20 }} />
              </>
            ) : (
              <>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>แต้มปัจจุบัน</label>
                <input className="input" type="text" value={(editModal.points ?? 0).toLocaleString()} readOnly disabled style={{ marginBottom: 12, background: 'var(--bg)', fontWeight: 800, color: 'var(--primary-dark)' }} />

                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>ปรับแต้ม (ใส่ − เพื่อหัก)</label>
                <input className="input" type="number" value={editDelta} onChange={e => setEditDelta(e.target.value)} style={{ marginBottom: 12 }} placeholder="เช่น 100 หรือ -50" />

                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>หมายเหตุ</label>
                <input className="input" value={editNote} onChange={e => setEditNote(e.target.value)} style={{ marginBottom: 16 }} placeholder="เช่น โบนัสเดือนมิถุนายน" />

                {Number(editDelta) !== 0 && !isNaN(Number(editDelta)) && (
                  <div style={{ background: Number(editDelta) > 0 ? '#D1FAE5' : '#FEE2E2', color: Number(editDelta) > 0 ? '#065F46' : '#991B1B', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13, fontWeight: 700 }}>
                    {Number(editDelta) > 0 ? '➕' : '➖'} แต้มใหม่จะเป็น: {Math.max(0, (editModal.points ?? 0) + Number(editDelta)).toLocaleString()} แต้ม
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-danger" style={{ flex: 1 }} onClick={closeEdit}>ยกเลิก</button>
              <button className="btn-primary" style={{ flex: 1, padding: '10px' }} onClick={saveEdit}>💾 บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
