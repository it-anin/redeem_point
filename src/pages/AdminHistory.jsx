import { useState, useEffect } from 'react'
import { collection, query, orderBy, getDocs, doc, runTransaction, addDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

export default function AdminHistory() {
  const { profile, user } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [logs, setLogs] = useState([])
  const [showLogs, setShowLogs] = useState(false)
  // Edit modal
  const [editTx, setEditTx] = useState(null)
  const [editEffect, setEditEffect] = useState(0) // ยอดที่กระทบพนักงาน (+ เพิ่ม / - ลด)
  const [editNote, setEditNote] = useState('')
  const [editReward, setEditReward] = useState('') // ชื่อรางวัลของรายการ
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  // Add modal (เพิ่มรายการแลกเอง)
  const [employees, setEmployees] = useState([])
  const [addModal, setAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ employeeId: '', rewardName: '', points: '' })

  useEffect(() => { fetchTx(); fetchLogs(); fetchEmployees() }, [])

  const fetchEmployees = async () => {
    const snap = await getDocs(collection(db, 'employees'))
    setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.role !== 'admin'))
  }

  const fetchTx = async () => {
    const q = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'))
    const snap = await getDocs(q)
    setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }

  const fetchLogs = async () => {
    try {
      const q = query(collection(db, 'auditLogs'), orderBy('at', 'desc'))
      const snap = await getDocs(q)
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { setLogs([]) }
  }

  // บันทึก log การแก้ไข/ลบ (เก็บถาวร แก้ไม่ได้)
  const writeLog = async (action, t, detail) => {
    try {
      await addDoc(collection(db, 'auditLogs'), {
        action,
        txId: t.id,
        employeeName: t.employeeName ?? '',
        rewardName: t.rewardName ?? '',
        detail,
        by: profile?.name || profile?.email || user?.email || 'admin',
        at: new Date(),
      })
    } catch { /* ไม่ให้ log ที่พลาดมาขัดการทำงานหลัก */ }
  }

  const openEdit = (t) => {
    setEditTx(t)
    setEditEffect(-(t.pointsUsed ?? 0)) // แปลงเป็นยอดที่กระทบพนักงาน
    setEditNote(t.note ?? '')
    setEditReward(t.rewardName ?? '')
  }

  const saveEdit = async () => {
    if (!editTx) return
    setSaving(true)
    try {
      const newEffect = Number(editEffect)
      const oldEffect = -(editTx.pointsUsed ?? 0)
      const delta = newEffect - oldEffect
      await runTransaction(db, async (tx) => {
        const txRef = doc(db, 'transactions', editTx.id)
        let empSnap = null
        const empRef = editTx.employeeId ? doc(db, 'employees', editTx.employeeId) : null
        if (empRef) empSnap = await tx.get(empRef)

        // ปรับยอดสะสมของพนักงานตามส่วนต่าง
        if (empRef && empSnap?.exists() && delta !== 0) {
          const newPts = Math.max(0, (empSnap.data().points ?? 0) + delta)
          tx.update(empRef, { points: newPts })
        }
        tx.update(txRef, {
          pointsUsed: -newEffect,
          note: editNote,
          rewardName: editReward,
          editedAt: new Date(),
        })
      })
      const rewardChanged = (editTx.rewardName ?? '') !== editReward
      await writeLog('แก้ไข', { ...editTx, rewardName: editReward },
        (rewardChanged ? `รางวัล "${editTx.rewardName ?? '-'}" → "${editReward}" · ` : '') +
        `แต้ม ${oldEffect.toLocaleString()} → ${newEffect.toLocaleString()}` +
        (delta !== 0 ? ` (ปรับยอดพนักงาน ${delta > 0 ? '+' : ''}${delta.toLocaleString()})` : '') +
        (editNote ? ` · โน้ต: ${editNote}` : ''))
      setEditTx(null)
      setMsg('แก้ไขรายการเรียบร้อย!')
      setTimeout(() => setMsg(''), 3000)
      fetchTx()
      fetchLogs()
    } catch (e) {
      setMsg('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteTx = async (t) => {
    const refund = t.pointsUsed ?? 0
    const confirmMsg =
      `ลบรายการนี้?\n${t.employeeName} · ${t.rewardName}\n` +
      (refund > 0 ? `• คืนแต้ม ${refund.toLocaleString()} ให้พนักงาน\n`
        : refund < 0 ? `• หักแต้ม ${Math.abs(refund).toLocaleString()} จากพนักงาน\n` : '') +
      (t.rewardId ? '• คืนสต็อกรางวัล +1' : '')
    if (!window.confirm(confirmMsg)) return
    try {
      await runTransaction(db, async (tx) => {
        const txRef = doc(db, 'transactions', t.id)
        const empRef = t.employeeId ? doc(db, 'employees', t.employeeId) : null
        const rwRef = t.rewardId ? doc(db, 'rewards', t.rewardId) : null
        const empSnap = empRef ? await tx.get(empRef) : null
        const rwSnap = rwRef ? await tx.get(rwRef) : null

        // คืนแต้มให้พนักงาน (ย้อนผลของรายการ)
        if (empRef && empSnap?.exists() && refund !== 0) {
          tx.update(empRef, { points: Math.max(0, (empSnap.data().points ?? 0) + refund) })
        }
        // คืนสต็อกรางวัล
        if (rwRef && rwSnap?.exists()) {
          tx.update(rwRef, { stock: (rwSnap.data().stock ?? 0) + 1 })
        }
        tx.delete(txRef)
      })
      await writeLog('ลบ', t,
        'ลบรายการ' +
        (refund > 0 ? ` · คืนแต้ม ${refund.toLocaleString()}` : refund < 0 ? ` · หักแต้ม ${Math.abs(refund).toLocaleString()}` : '') +
        (t.rewardId ? ' · คืนสต็อก +1' : ''))
      setMsg('ลบรายการและคืนแต้มเรียบร้อย!')
      setTimeout(() => setMsg(''), 3000)
      fetchTx()
      fetchLogs()
    } catch (e) {
      setMsg('เกิดข้อผิดพลาด: ' + e.message)
    }
  }

  // เพิ่มรายการแลกให้พนักงานเอง (admin) — หักแต้ม + สร้าง transaction แบบ atomic
  const saveAdd = async () => {
    const emp = employees.find(e => e.id === addForm.employeeId)
    const name = addForm.rewardName.trim()
    const pts = Number(addForm.points) || 0
    if (!emp) { setMsg('⚠️ กรุณาเลือกพนักงาน'); return }
    if (!name) { setMsg('⚠️ กรุณาใส่ชื่อรางวัล'); return }
    setSaving(true)
    try {
      const txRef = doc(collection(db, 'transactions'))
      await runTransaction(db, async (tx) => {
        const empRef = doc(db, 'employees', emp.id)
        const empSnap = await tx.get(empRef)
        if (pts !== 0 && empSnap.exists()) {
          tx.update(empRef, { points: Math.max(0, (empSnap.data().points ?? 0) - pts) })
        }
        tx.set(txRef, {
          employeeId: emp.id,
          employeeName: emp.name,
          rewardId: null,
          rewardName: name,
          pointsUsed: pts,            // บวก = ใช้แต้ม (หักจากพนักงาน)
          createdAt: new Date(),
          status: 'สำเร็จ',
          approval: 'อนุมัติแล้ว',     // admin เพิ่มเอง = อนุมัติเลย
          addedByAdmin: true,
        })
      })
      await writeLog('เพิ่ม', { id: txRef.id, employeeName: emp.name, rewardName: name },
        `เพิ่มรายการแลก "${name}" (${pts.toLocaleString()} แต้ม)`)
      setAddModal(false)
      setAddForm({ employeeId: '', rewardName: '', points: '' })
      setMsg('เพิ่มรายการเรียบร้อย!')
      setTimeout(() => setMsg(''), 3000)
      fetchTx(); fetchLogs()
    } catch (e) {
      setMsg('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const filtered = transactions.filter(t =>
    t.employeeName?.toLowerCase().includes(search.toLowerCase()) ||
    t.rewardName?.toLowerCase().includes(search.toLowerCase())
  )

  const totalPts = filtered.reduce((s, t) => s + (t.pointsUsed ?? 0), 0)
  const delta = Number(editEffect) - (-(editTx?.pointsUsed ?? 0))

  return (
    <>

      {msg && <div style={{ background: '#D1FAE5', color: '#065F46', padding: '12px 18px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontWeight: 700 }}>✅ {msg}</div>}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 300 }} placeholder="🔍 ค้นหาชื่อ / รางวัล..." value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
          พบ {filtered.length} รายการ · รวม {totalPts.toLocaleString()} แต้ม
        </div>
        <button className="btn-primary" style={{ marginLeft: 'auto', padding: '8px 16px', fontSize: 13 }} onClick={() => { setAddForm({ employeeId: '', rewardName: '', points: '' }); setAddModal(true) }}>
          ➕ เพิ่มรายการ
        </button>
        <button className="btn-primary" style={{ padding: '8px 16px', fontSize: 13 }} onClick={() => setShowLogs(v => !v)}>
          📋 บันทึกการแก้ไข ({logs.length})
        </button>
      </div>

      {/* Audit log */}
      {showLogs && (
        <div className="card" style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '2px solid var(--border)', fontWeight: 800, fontSize: 14 }}>📋 บันทึกการแก้ไข / ลบรายการ</div>
          {logs.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>ยังไม่มีบันทึก</div>
          ) : (
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {logs.map(l => {
                const isReset = l.action === 'reset_points'
                const actionLabel = isReset ? 'รีเซ็ตแต้ม' : l.action
                const badgeClass = (l.action === 'ลบ' || isReset) ? 'badge-danger' : 'badge-warn'
                const title = isReset
                  ? '♻️ รีเซ็ตแต้มทั้งระบบ'
                  : `${l.employeeName} · 🎁 ${l.rewardName}`
                return (
                <div key={l.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                  <span className={`badge ${badgeClass}`} style={{ flexShrink: 0 }}>{actionLabel}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{l.detail}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      โดย {l.by} · {l.at?.toDate?.()?.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) ?? ''}
                    </div>
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>กำลังโหลด...</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>พนักงาน</th>
                <th>รางวัล / รายละเอียด</th>
                <th style={{ textAlign: 'right' }}>เพิ่ม/ลดแต้ม</th>
                <th>วันที่</th>
                <th style={{ textAlign: 'center' }}>สถานะ</th>
                <th style={{ textAlign: 'center' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>ไม่พบรายการ</td></tr>
              ) : filtered.map(t => (
                <tr key={t.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{t.employeeName?.[0]}</div>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{t.employeeName}</span>
                    </div>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    🎁 {t.rewardId
                      ? `แลกแต้ม ${t.rewardName}`
                      : (t.rewardName === 'ปรับแต้มโดย Admin' ? 'เพิ่มแต้มโดย Admin' : t.rewardName)}
                    {t.note && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>📝 {t.note}</div>}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary-dark)' }}>
                    {t.pointsUsed > 0 ? `-${t.pointsUsed?.toLocaleString()}` : `+${Math.abs(t.pointsUsed ?? 0).toLocaleString()}`}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {t.createdAt?.toDate?.()?.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) ?? '-'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`badge ${t.status === 'สำเร็จ' ? 'badge-success' : t.status === 'เพิ่มแต้ม' ? 'badge-warn' : 'badge-success'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => openEdit(t)}>✏️ แก้ไข</button>
                      <button className="btn-danger" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => deleteTx(t)}>🗑️ ลบ</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editTx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(46,31,14,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className="card" style={{ maxWidth: 400, width: '100%', padding: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>✏️ แก้ไขรายการ</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>{editTx.employeeName}</div>

            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>ชื่อรางวัล (เปลี่ยนได้ถ้าของหมด/เปลี่ยนรายการ)</label>
            <input className="input" value={editReward} onChange={e => setEditReward(e.target.value)} style={{ marginBottom: 12 }} placeholder="เช่น บัตรกำนัล 200 บาท" />

            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>แต้ม (+ เพิ่มให้พนักงาน / - หักจากพนักงาน)</label>
            <input className="input" type="number" value={editEffect} onChange={e => setEditEffect(e.target.value)} style={{ marginBottom: 12 }} placeholder="เช่น 100 หรือ -50" />

            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>รายละเอียด</label>
            <input className="input" value={editNote} onChange={e => setEditNote(e.target.value)} style={{ marginBottom: 16 }} placeholder="เช่น แก้ไขยอดผิด / โบนัสพิเศษ" />

            {delta !== 0 && (
              <div style={{ background: delta > 0 ? '#D1FAE5' : '#FEE2E2', color: delta > 0 ? '#065F46' : '#991B1B', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13, fontWeight: 700 }}>
                {delta > 0 ? '➕' : '➖'} ยอดสะสมของพนักงานจะถูกปรับ {delta > 0 ? '+' : ''}{delta.toLocaleString()} แต้ม
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-danger" style={{ flex: 1 }} onClick={() => setEditTx(null)} disabled={saving}>ยกเลิก</button>
              <button className="btn-primary" style={{ flex: 1, padding: '10px' }} onClick={saveEdit} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add modal — เพิ่มรายการแลกให้พนักงานเอง */}
      {addModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(46,31,14,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className="card" style={{ maxWidth: 400, width: '100%', padding: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>➕ เพิ่มรายการแลก</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>บันทึกการแลกของรางวัลให้พนักงาน (หักแต้มให้อัตโนมัติ)</div>

            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>พนักงาน *</label>
            <select className="input" value={addForm.employeeId} onChange={e => setAddForm(f => ({ ...f, employeeId: e.target.value }))} style={{ marginBottom: 12 }}>
              <option value="" disabled>เลือกพนักงาน</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.name} ({e.department}) · {e.points?.toLocaleString() ?? 0} แต้ม</option>
              ))}
            </select>

            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>ชื่อรางวัล *</label>
            <input className="input" value={addForm.rewardName} onChange={e => setAddForm(f => ({ ...f, rewardName: e.target.value }))} style={{ marginBottom: 12 }} placeholder="เช่น บัตรกำนัล 200 บาท" />

            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>แต้มที่ใช้ (หักจากพนักงาน)</label>
            <input className="input" type="number" min={0} value={addForm.points} onChange={e => setAddForm(f => ({ ...f, points: e.target.value }))} style={{ marginBottom: 16 }} placeholder="เช่น 350 (ใส่ 0 ถ้าไม่หักแต้ม)" />

            {Number(addForm.points) > 0 && addForm.employeeId && (() => {
              const emp = employees.find(e => e.id === addForm.employeeId)
              const newPts = Math.max(0, (emp?.points ?? 0) - Number(addForm.points))
              return (
                <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13, fontWeight: 700 }}>
                  ➖ แต้มของ {emp?.name} จะเหลือ {newPts.toLocaleString()} แต้ม
                </div>
              )
            })()}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-danger" style={{ flex: 1 }} onClick={() => setAddModal(false)} disabled={saving}>ยกเลิก</button>
              <button className="btn-primary" style={{ flex: 1, padding: '10px' }} onClick={saveAdd} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'เพิ่มรายการ'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
