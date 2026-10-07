import { useState, useEffect, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, orderBy, getDocs, getCountFromServer, doc, runTransaction, addDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

// createdAt/at จาก Firestore เป็น Timestamp (มี toDate) แต่รายการที่เพิ่งบันทึกในหน้านี้เก็บเป็น Date ตรงๆ — รองรับทั้งสองแบบ
const toJsDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : null)

export default function AdminHistory() {
  const { profile, user } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [logs, setLogs] = useState([])
  const [logsLoaded, setLogsLoaded] = useState(false) // โหลด log ทั้งหมดตอนเปิดแผงครั้งแรกเท่านั้น (ประหยัดโควตาอ่านของ Firestore)
  const [logCount, setLogCount] = useState(null)      // จำนวน log — นับด้วย count query (~1 read) แทนการอ่านทุกแถว
  const [showLogs, setShowLogs] = useState(false)
  // Edit modal
  const [editTx, setEditTx] = useState(null)
  const [editEffect, setEditEffect] = useState(0) // ยอดที่กระทบพนักงาน (+ เพิ่ม / - ลด)
  const [editNote, setEditNote] = useState('')
  const [editReward, setEditReward] = useState('') // ชื่อรางวัลของรายการ
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [errMsg, setErrMsg] = useState('') // error ระดับหน้า (แบนเนอร์สีแดง) — msg เป็นสีเขียวใช้กับสำเร็จเท่านั้น
  // Add modal (บันทึกการแลกให้พนักงาน — หักแต้ม)
  const [allEmployees, setAllEmployees] = useState([]) // ทุกคนใน employees (รวม admin) — ไว้โชว์อีเมล/ยอดแต้มจริงที่หัวกลุ่ม
  const [addModal, setAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ employeeId: '', rewardName: '', points: '' })
  const [addErr, setAddErr] = useState('')
  // เก็บ key พนักงานที่ "เปิด" ดูรายการแลกอยู่ (คลิกชื่อเพื่อเปิด/ปิด)
  const [expanded, setExpanded] = useState(new Set())
  const toggleExpand = (key) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // ตัวเลือกใน dropdown "บันทึกการแลก" (ไม่เอา admin) + หาบัญชีจริงจาก employeeId ของแต่ละกลุ่ม
  const employees = allEmployees.filter(e => e.role !== 'admin')
  const empById = Object.fromEntries(allEmployees.map(e => [e.id, e]))

  // ⚠️ ประหยัดโควตาอ่านฟรีรายวันของ Firestore (Spark = 50,000 reads/วัน): ตอนเปิดหน้าโหลดแค่ ประวัติ + รายชื่อพนักงาน + "จำนวน" log
  // ส่วน log ทั้งหมดโหลดตอนเปิดแผงครั้งแรก และหลัง เพิ่ม/แก้/ลบ จะอัปเดตเฉพาะแถว/ยอดที่เปลี่ยนในหน้าจอ — ไม่โหลดทั้งคอลเลกชันใหม่
  useEffect(() => { fetchTx(); fetchEmployees(); fetchLogCount() }, [])

  const fetchEmployees = async () => {
    try {
      const snap = await getDocs(collection(db, 'employees'))
      setAllEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { setErrMsg('โหลดรายชื่อพนักงานไม่สำเร็จ: ' + e.message) }
  }

  const fetchTx = async () => {
    try {
      const q = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      setErrMsg('โหลดประวัติไม่สำเร็จ: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchLogCount = async () => {
    try {
      const snap = await getCountFromServer(collection(db, 'auditLogs'))
      setLogCount(snap.data().count)
    } catch { /* ไม่รู้จำนวนก็ไม่เป็นไร ปุ่มจะโชว์ … แทน */ }
  }

  const fetchLogs = async () => {
    try {
      const q = query(collection(db, 'auditLogs'), orderBy('at', 'desc'))
      const snap = await getDocs(q)
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLogCount(snap.size)
      setLogsLoaded(true)
    } catch { setLogs([]) }
  }

  const toggleLogs = () => {
    if (!showLogs && !logsLoaded) fetchLogs()
    setShowLogs(v => !v)
  }

  // บันทึก log การแก้ไข/ลบ (เก็บถาวร แก้ไม่ได้)
  const writeLog = async (action, t, detail) => {
    try {
      const entry = {
        action,
        txId: t.id,
        employeeName: t.employeeName ?? '',
        rewardName: t.rewardName ?? '',
        detail,
        by: profile?.name || profile?.email || user?.email || 'admin',
        at: new Date(),
      }
      const ref = await addDoc(collection(db, 'auditLogs'), entry)
      // ใส่ log ใหม่ในหน้าจอเลย ไม่ต้องโหลด log ทั้งหมดใหม่
      setLogs(prev => [{ id: ref.id, ...entry }, ...prev])
      setLogCount(c => (c === null ? null : c + 1))
    } catch { /* ไม่ให้ log ที่พลาดมาขัดการทำงานหลัก */ }
  }

  // ยอดแต้มจริงของพนักงานที่เพิ่งเปลี่ยน (ได้จากใน transaction) → อัปเดตหัวกลุ่ม/dropdown ทันที ไม่ต้องโหลดรายชื่อใหม่
  const patchBalance = (employeeId, points) =>
    setAllEmployees(prev => prev.map(e => (e.id === employeeId ? { ...e, points } : e)))

  const openEdit = (t) => {
    setEditTx(t)
    setEditEffect(-(t.pointsUsed ?? 0)) // แปลงเป็นยอดที่กระทบพนักงาน
    setEditNote(t.note ?? '')
    setEditReward(t.rewardName ?? '')
  }

  const saveEdit = async () => {
    if (!editTx) return
    setErrMsg('')
    setSaving(true)
    try {
      const newEffect = Number(editEffect)
      const oldEffect = -(editTx.pointsUsed ?? 0)
      const delta = newEffect - oldEffect
      let balance = null // ยอดแต้มจริงของพนักงานหลังบันทึก (null = ไม่เปลี่ยน)
      await runTransaction(db, async (tx) => {
        const txRef = doc(db, 'transactions', editTx.id)
        let empSnap = null
        const empRef = editTx.employeeId ? doc(db, 'employees', editTx.employeeId) : null
        if (empRef) empSnap = await tx.get(empRef)

        // ปรับยอดสะสมของพนักงานตามส่วนต่าง
        if (empRef && empSnap?.exists() && delta !== 0) {
          const newPts = Math.max(0, (empSnap.data().points ?? 0) + delta)
          tx.update(empRef, { points: newPts })
          balance = newPts
        }
        tx.update(txRef, {
          pointsUsed: -newEffect,
          note: editNote,
          rewardName: editReward,
          editedAt: new Date(),
        })
      })
      // อัปเดตแถวในหน้าจอเลย (ไม่โหลดประวัติ/พนักงานทั้งหมดใหม่)
      setTransactions(prev => prev.map(t => (t.id === editTx.id
        ? { ...t, pointsUsed: -newEffect, note: editNote, rewardName: editReward, editedAt: new Date() }
        : t)))
      if (balance !== null) patchBalance(editTx.employeeId, balance)
      const rewardChanged = (editTx.rewardName ?? '') !== editReward
      await writeLog('แก้ไข', { ...editTx, rewardName: editReward },
        (rewardChanged ? `รางวัล "${editTx.rewardName ?? '-'}" → "${editReward}" · ` : '') +
        `แต้ม ${oldEffect.toLocaleString()} → ${newEffect.toLocaleString()}` +
        (delta !== 0 ? ` (ปรับยอดพนักงาน ${delta > 0 ? '+' : ''}${delta.toLocaleString()})` : '') +
        (editNote ? ` · โน้ต: ${editNote}` : ''))
      setEditTx(null)
      setMsg('แก้ไขรายการเรียบร้อย!')
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      setErrMsg('แก้ไขไม่สำเร็จ: ' + e.message)
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
    setErrMsg('')
    try {
      let balance = null // ยอดแต้มจริงของพนักงานหลังย้อนผล (null = ไม่เปลี่ยน)
      await runTransaction(db, async (tx) => {
        const txRef = doc(db, 'transactions', t.id)
        const empRef = t.employeeId ? doc(db, 'employees', t.employeeId) : null
        const rwRef = t.rewardId ? doc(db, 'rewards', t.rewardId) : null
        const empSnap = empRef ? await tx.get(empRef) : null
        const rwSnap = rwRef ? await tx.get(rwRef) : null

        // คืนแต้มให้พนักงาน (ย้อนผลของรายการ)
        if (empRef && empSnap?.exists() && refund !== 0) {
          const newPts = Math.max(0, (empSnap.data().points ?? 0) + refund)
          tx.update(empRef, { points: newPts })
          balance = newPts
        }
        // คืนสต็อกรางวัล
        if (rwRef && rwSnap?.exists()) {
          tx.update(rwRef, { stock: (rwSnap.data().stock ?? 0) + 1 })
        }
        tx.delete(txRef)
      })
      // เอาแถวออกจากหน้าจอเลย (ไม่โหลดประวัติ/พนักงานทั้งหมดใหม่)
      setTransactions(prev => prev.filter(x => x.id !== t.id))
      if (balance !== null) patchBalance(t.employeeId, balance)
      await writeLog('ลบ', t,
        'ลบรายการ' +
        (refund > 0 ? ` · คืนแต้ม ${refund.toLocaleString()}` : refund < 0 ? ` · หักแต้ม ${Math.abs(refund).toLocaleString()}` : '') +
        (t.rewardId ? ' · คืนสต็อก +1' : ''))
      setMsg('ลบรายการและคืนแต้มเรียบร้อย!')
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      setErrMsg('ลบไม่สำเร็จ: ' + e.message)
    }
  }

  // บันทึกการแลกให้พนักงาน (admin) — "หัก" แต้มจริง (ไม่ต่ำกว่า 0) + สร้าง transaction แบบ atomic
  // ⚠️ ปุ่มนี้หักแต้มได้อย่างเดียว ไม่มีทางเพิ่มแต้ม — จะเพิ่มแต้มต้องไป พนักงาน → ✏️ แก้ไข → ปรับแต้ม
  const saveAdd = async () => {
    const emp = employees.find(e => e.id === addForm.employeeId)
    const name = addForm.rewardName.trim()
    const pts = Number(addForm.points) || 0
    if (!emp) { setAddErr('กรุณาเลือกพนักงาน'); return }
    if (!name) { setAddErr('กรุณาใส่ชื่อรางวัล'); return }
    // กันใส่ค่าติดลบ: เดิมจะกลายเป็น "เพิ่มแต้ม" แบบเงียบๆ แต่ประวัติยังขึ้นเป็นรายการแลก
    if (pts < 0) { setAddErr('ใส่แต้มเป็นเลขบวกเท่านั้น (ปุ่มนี้ใช้หักแต้ม) — ถ้าต้องการเพิ่มแต้ม ให้ไปที่ พนักงาน → ✏️ แก้ไข → ปรับแต้ม'); return }
    setAddErr('')
    setSaving(true)
    try {
      const txRef = doc(collection(db, 'transactions'))
      const newTx = {
        employeeId: emp.id,
        employeeName: emp.name,
        rewardId: null,
        rewardName: name,
        pointsUsed: pts,            // บวก = ใช้แต้ม (หักจากพนักงาน)
        createdAt: new Date(),
        status: 'สำเร็จ',
        approval: 'อนุมัติแล้ว',     // admin เพิ่มเอง = อนุมัติเลย
        addedByAdmin: true,
      }
      let balance = null // ยอดแต้มจริงของพนักงานหลังหัก (null = ไม่เปลี่ยน)
      await runTransaction(db, async (tx) => {
        const empRef = doc(db, 'employees', emp.id)
        const empSnap = await tx.get(empRef)
        if (pts !== 0 && empSnap.exists()) {
          balance = Math.max(0, (empSnap.data().points ?? 0) - pts)
          tx.update(empRef, { points: balance })
        }
        tx.set(txRef, newTx)
      })
      // ใส่แถวใหม่ + ยอดคงเหลือใหม่ในหน้าจอเลย (ไม่โหลดประวัติ/พนักงานทั้งหมดใหม่ — รายการใหม่สุดอยู่บนสุดตามลำดับเดิม)
      setTransactions(prev => [{ id: txRef.id, ...newTx }, ...prev])
      if (balance !== null) patchBalance(emp.id, balance)
      await writeLog('เพิ่ม', { id: txRef.id, employeeName: emp.name, rewardName: name },
        `เพิ่มรายการแลก "${name}" (${pts.toLocaleString()} แต้ม)`)
      setAddModal(false)
      setAddForm({ employeeId: '', rewardName: '', points: '' })
      setMsg(pts > 0 ? `บันทึกการแลกและหักแต้ม ${pts.toLocaleString()} แต้มเรียบร้อย!` : 'บันทึกรายการเรียบร้อย (ไม่หักแต้ม)')
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      setAddErr('บันทึกไม่สำเร็จ: ' + e.message) // โมดัลยังเปิดอยู่ → แสดง error ในโมดัลเลย (แบนเนอร์หน้าหลักถูกโมดัลบัง)
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

  // แยกประวัติเป็นกลุ่มตามพนักงานแต่ละคน (เรียงชื่อ ก-ฮ, รายการในกลุ่มยังเรียงล่าสุดก่อนตามเดิม)
  const grouped = Object.values(
    filtered.reduce((acc, t) => {
      const key = t.employeeId ?? t.employeeName ?? '-'
      if (!acc[key]) acc[key] = { key, employeeId: t.employeeId ?? null, employeeName: t.employeeName ?? '-', list: [] }
      acc[key].list.push(t)
      return acc
    }, {})
  )
    .map(g => ({
      ...g,
      // บัญชีจริงใน employees ที่แถวเหล่านี้ผูกอยู่ (undefined = ไม่พบ เช่นถูกลบ/เปลี่ยนอีเมลไปแล้ว) — เอายอดแต้มจริงมาโชว์คู่กับยอดตามประวัติ
      emp: g.employeeId ? empById[g.employeeId] : undefined,
      subtotal: g.list.reduce((s, t) => s + (t.pointsUsed ?? 0), 0),
      // แต้มที่ใช้ไปจากการแลกรางวัลจริง (มี rewardId) + รายการที่ admin บันทึกแทนให้ (addedByAdmin) ไม่รวมยอดที่ admin ปรับแต้มธรรมดา — ตรงกับ "แต้มที่ใช้ไป" ในหน้าประวัติของพนักงาน
      spent: g.list.filter(t => t.rewardId || t.addedByAdmin).reduce((s, t) => s + (t.pointsUsed ?? 0), 0),
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'th'))

  return (
    <>

      {msg && <div style={{ background: '#D1FAE5', color: '#065F46', padding: '12px 18px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontWeight: 700 }}>✅ {msg}</div>}
      {errMsg && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '12px 18px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontWeight: 700 }}>⚠️ {errMsg}</div>}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 300 }} placeholder="🔍 ค้นหาชื่อ / รางวัล..." value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
          พบ {filtered.length} รายการ · รวม {totalPts.toLocaleString()} แต้ม
        </div>
        <button className="btn-primary" title="บันทึกการแลกให้พนักงานและหักแต้ม — ไม่ใช่การเพิ่มแต้ม (เพิ่มแต้มที่เมนู พนักงาน)" style={{ marginLeft: 'auto', padding: '8px 16px', fontSize: 13 }} onClick={() => { setAddForm({ employeeId: '', rewardName: '', points: '' }); setAddErr(''); setAddModal(true) }}>
          🎁 บันทึกการแลก (หักแต้ม)
        </button>
        <button className="btn-primary" style={{ padding: '8px 16px', fontSize: 13 }} onClick={toggleLogs}>
          📋 บันทึกการแก้ไข ({logsLoaded ? logs.length : (logCount ?? '…')})
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
                      โดย {l.by} · {toJsDate(l.at)?.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) ?? ''}
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
                <th>รางวัล / รายละเอียด</th>
                <th style={{ textAlign: 'right' }}>เพิ่ม/ลดแต้ม</th>
                <th>วันที่</th>
                <th style={{ textAlign: 'center' }}>สถานะ</th>
                <th style={{ textAlign: 'center' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>ไม่พบรายการ</td></tr>
              ) : grouped.map(g => {
                const isOpen = expanded.has(g.key)
                return (
                <Fragment key={g.key}>
                  <tr onClick={() => toggleExpand(g.key)} style={{ cursor: 'pointer' }}>
                    <td colSpan={5} style={{ background: 'var(--bg)', padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', display: 'inline-block', width: 12 }}>▶</span>
                        <div className="avatar" style={{ width: 26, height: 26, fontSize: 11, flexShrink: 0 }}>{g.employeeName?.[0]}</div>
                        <span style={{ fontWeight: 800, color: 'var(--primary-dark)', fontSize: 13 }}>{g.employeeName}</span>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: 12 }}>({g.list.length} รายการ)</span>
                        {/* อีเมลของบัญชีที่แถวเหล่านี้ผูกอยู่ — ถ้าไม่พบใน employees แปลว่าพนักงานคนนี้เห็นประวัติ/แต้มชุดนี้ไม่ได้ */}
                        {g.employeeId && (g.emp
                          ? <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>{g.employeeId}</span>
                          : <span title="ไม่มีบัญชีนี้ในรายชื่อพนักงานแล้ว (ถูกลบ หรือเปลี่ยนอีเมล) — พนักงานจะไม่เห็นรายการเหล่านี้ที่มือถือ" style={{ color: '#991B1B', fontWeight: 700, fontSize: 11 }}>⚠️ ไม่พบบัญชี {g.employeeId}</span>)}
                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--primary-dark)' }}>
                            ⭐ แต้มที่ใช้ไป {g.spent.toLocaleString()}
                          </span>
                          <span title="ผลรวมจากแถวในประวัติเท่านั้น ไม่ใช่ยอดแต้มจริงของพนักงาน" style={{ fontWeight: 700, fontSize: 12, color: g.subtotal > 0 ? 'var(--text-muted)' : '#065F46' }}>
                            สุทธิตามประวัติ {g.subtotal > 0 ? `-${g.subtotal.toLocaleString()}` : `+${Math.abs(g.subtotal).toLocaleString()}`}
                          </span>
                          {g.emp && (
                            <span title="แต้มคงเหลือจริงของพนักงานตอนนี้ (employees.points) — ตัวเลขเดียวกับหน้า พนักงาน และบนมือถือ" style={{ fontWeight: 800, fontSize: 13, color: 'var(--primary-dark)', background: '#fff', border: '1.5px solid var(--border)', borderRadius: 999, padding: '2px 10px' }}>
                              💰 คงเหลือจริง {(g.emp.points ?? 0).toLocaleString()}
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {isOpen && g.list.map(t => (
                    <tr key={t.id}>
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
                        {toJsDate(t.createdAt)?.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) ?? '-'}
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
                </Fragment>
                )
              })}
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

      {/* Add modal — บันทึกการแลกให้พนักงาน (หักแต้ม) */}
      {addModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(46,31,14,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className="card" style={{ maxWidth: 400, width: '100%', padding: 28, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>🎁 บันทึกการแลกของรางวัล</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>บันทึกการแลกให้พนักงาน และ <b>หักแต้ม</b> ออกจากยอดของพนักงานให้อัตโนมัติ (หักแล้วไม่ต่ำกว่า 0)</div>

            <div style={{ background: '#FEF3C7', color: '#92400E', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 12, fontWeight: 700, lineHeight: 1.6 }}>
              💡 ต้องการ <u>เพิ่มแต้ม</u> ให้พนักงาน? ทำที่เมนู <b>พนักงาน → ✏️ แก้ไข → ปรับแต้ม</b> (ใส่เลขบวก){' '}
              <Link to="/admin/employees" style={{ color: 'inherit', textDecoration: 'underline' }}>ไปหน้าพนักงาน →</Link>
            </div>

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
            <input className="input" type="number" min={0} value={addForm.points} onChange={e => setAddForm(f => ({ ...f, points: e.target.value }))} style={{ marginBottom: 16 }} placeholder="เช่น 350 (ใส่ 0 = บันทึกเฉยๆ ไม่หักแต้ม)" />

            {Number(addForm.points) > 0 && addForm.employeeId && (() => {
              const emp = employees.find(e => e.id === addForm.employeeId)
              const newPts = Math.max(0, (emp?.points ?? 0) - Number(addForm.points))
              return (
                <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13, fontWeight: 700 }}>
                  ➖ แต้มของ {emp?.name} จะเหลือ {newPts.toLocaleString()} แต้ม
                </div>
              )
            })()}

            {addErr && (
              <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13, fontWeight: 700 }}>
                ⚠️ {addErr}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-danger" style={{ flex: 1 }} onClick={() => setAddModal(false)} disabled={saving}>ยกเลิก</button>
              <button className="btn-primary" style={{ flex: 1, padding: '10px' }} onClick={saveAdd} disabled={saving}>{saving ? 'กำลังบันทึก...' : (Number(addForm.points) > 0 ? 'บันทึกและหักแต้ม' : 'บันทึกรายการ')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
