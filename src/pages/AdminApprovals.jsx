import { useState, useEffect } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { APPROVAL as STATUS } from '../pointsLedger'
import { approveRedemption, rejectRedemption } from '../pointsDb'

export default function AdminApprovals() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState(STATUS.PENDING)
  const [msg, setMsg] = useState('')
  const [errMsg, setErrMsg] = useState('') // error แสดงเป็นแบนเนอร์สีแดง (msg สีเขียวใช้กับสำเร็จเท่านั้น)

  useEffect(() => { fetchItems() }, [])

  // โหลดรายการทั้งหมดตอนเปิดหน้าครั้งเดียว — หลังอนุมัติ/ปฏิเสธอัปเดตเฉพาะแถวนั้นในหน้าจอ ไม่โหลดทั้งคอลเลกชันใหม่
  // (ประหยัดโควตาอ่านฟรีรายวันของ Firestore)
  const fetchItems = async () => {
    try {
      const snap = await getDocs(collection(db, 'transactions'))
      const toMs = (t) => t.createdAt?.toMillis?.() ?? (t.createdAt instanceof Date ? t.createdAt.getTime() : 0)
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(t => t.rewardId) // เฉพาะรายการที่พนักงานแลกของ
        .map(t => ({ ...t, approval: t.approval ?? STATUS.PENDING }))
        .sort((a, b) => toMs(b) - toMs(a))
      setItems(list)
    } catch (e) {
      setErrMsg('โหลดรายการไม่สำเร็จ: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const setApproval = (id, approval) =>
    setItems(prev => prev.map(x => (x.id === id ? { ...x, approval } : x)))

  // หน้านี้โหลดครั้งเดียวแล้วค้างได้นาน: ถ้ารายการถูกจัดการไปแล้ว (แอดมินอีกคน/แท็บเก่า) ฐานข้อมูลจะไม่ยอมทำซ้ำ (STALE/GONE)
  // → แก้แถวในหน้าจอให้ตรงกับความจริงแล้วแจ้ง (เดิมอนุมัติ/ปฏิเสธซ้ำได้ → คืนแต้มซ้ำ หรืออนุมัติทับแถวที่คืนแต้มไปแล้ว)
  const handleError = (e, t, action) => {
    if (e.code === 'STALE' && e.current) setApproval(t.id, e.current)
    if (e.code === 'GONE') setItems(prev => prev.filter(x => x.id !== t.id))
    setErrMsg(`${action}ไม่สำเร็จ: ${e.message}`)
  }

  const approve = async (t) => {
    setErrMsg('')
    try {
      await approveRedemption(db, t.id)
      setApproval(t.id, STATUS.APPROVED)
      setMsg(`อนุมัติ "${t.rewardName}" ของ ${t.employeeName} แล้ว`)
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      handleError(e, t, 'อนุมัติ')
    }
  }

  const reject = async (t) => {
    if (!window.confirm(`ปฏิเสธการแลก "${t.rewardName}" ของ ${t.employeeName}?\nจะคืนแต้ม ${t.pointsUsed?.toLocaleString()} และคืนสต็อก +1`)) return
    setErrMsg('')
    try {
      await rejectRedemption(db, t.id) // คืนแต้ม/สต็อกด้วยค่าล่าสุดในฐานข้อมูล และทำได้เฉพาะแถวที่ยัง "รออนุมัติ" จริง
      setApproval(t.id, STATUS.REJECTED)
      setMsg(`ปฏิเสธและคืนแต้มให้ ${t.employeeName} แล้ว`)
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      handleError(e, t, 'ปฏิเสธ')
    }
  }

  const filtered = filter === 'all' ? items : items.filter(t => t.approval === filter)
  const pendingCount = items.filter(t => t.approval === STATUS.PENDING).length

  const badgeClass = (s) =>
    s === STATUS.APPROVED ? 'badge-success' : s === STATUS.REJECTED ? 'badge-danger' : 'badge-warn'

  return (
    <>

      {msg && <div style={{ background: '#D1FAE5', color: '#065F46', padding: '12px 18px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontWeight: 700 }}>✅ {msg}</div>}
      {errMsg && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '12px 18px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontWeight: 700 }}>⚠️ {errMsg}</div>}

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { k: STATUS.PENDING, label: `รออนุมัติ (${pendingCount})` },
          { k: STATUS.APPROVED, label: 'อนุมัติแล้ว' },
          { k: STATUS.REJECTED, label: 'ปฏิเสธ' },
          { k: 'all', label: 'ทั้งหมด' },
        ].map(f => (
          <button key={f.k} className="btn-primary" style={{ opacity: filter === f.k ? 1 : 0.55, padding: '8px 16px', fontSize: 13 }} onClick={() => setFilter(f.k)}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>กำลังโหลด...</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>ไม่มีรายการ</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>พนักงาน</th>
                <th>รางวัล</th>
                <th style={{ textAlign: 'right' }}>แต้ม</th>
                <th>วันที่</th>
                <th style={{ textAlign: 'center' }}>สถานะ</th>
                <th style={{ textAlign: 'center' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{t.employeeName?.[0]}</div>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{t.employeeName}</span>
                    </div>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    🎁 {t.rewardName}
                    {t.proofUrl && (
                      <div style={{ marginTop: 6 }}>
                        <a href={t.proofUrl} target="_blank" rel="noreferrer">
                          <img src={t.proofUrl} alt="หลักฐาน" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 8, border: '1.5px solid var(--border)' }} />
                        </a>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>📎 แตะเพื่อดูหลักฐาน</div>
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary-dark)' }}>{t.pointsUsed?.toLocaleString()}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {t.createdAt?.toDate?.()?.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) ?? '-'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`badge ${badgeClass(t.approval)}`}>{t.approval}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {t.approval === STATUS.PENDING ? (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => approve(t)}>✅ อนุมัติ</button>
                        <button className="btn-danger" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => reject(t)}>↩️ ปฏิเสธ</button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
