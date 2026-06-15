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
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { fetchTx(); fetchLogs() }, [])

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
          editedAt: new Date(),
        })
      })
      await writeLog('แก้ไข', editTx,
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

  const filtered = transactions.filter(t =>
    t.employeeName?.toLowerCase().includes(search.toLowerCase()) ||
    t.rewardName?.toLowerCase().includes(search.toLowerCase())
  )

  const totalPts = filtered.reduce((s, t) => s + (t.pointsUsed ?? 0), 0)
  const delta = Number(editEffect) - (-(editTx?.pointsUsed ?? 0))

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">📜 ประวัติทั้งหมด</div>
          <div className="page-sub">รายการแลกรางวัลของพนักงานทุกคน</div>
        </div>
      </div>

      {msg && <div style={{ background: '#D1FAE5', color: '#065F46', padding: '12px 18px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontWeight: 700 }}>✅ {msg}</div>}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 300 }} placeholder="🔍 ค้นหาชื่อ / รางวัล..." value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
          พบ {filtered.length} รายการ · รวม {totalPts.toLocaleString()} แต้ม
        </div>
        <button className="btn-primary" style={{ marginLeft: 'auto', padding: '8px 16px', fontSize: 13 }} onClick={() => setShowLogs(v => !v)}>
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
              {logs.map(l => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                  <span className={`badge ${l.action === 'ลบ' ? 'badge-danger' : 'badge-warn'}`} style={{ flexShrink: 0 }}>{l.action}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{l.employeeName} · 🎁 {l.rewardName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{l.detail}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      โดย {l.by} · {l.at?.toDate?.()?.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) ?? ''}
                    </div>
                  </div>
                </div>
              ))}
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
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>{editTx.employeeName} · 🎁 {editTx.rewardName}</div>

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
    </>
  )
}
