import { useState, useEffect } from 'react'
import { collection, getDocs, doc, updateDoc, runTransaction } from 'firebase/firestore'
import { db } from '../firebase'

const STATUS = { PENDING: 'รออนุมัติ', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ปฏิเสธ' }

export default function AdminApprovals() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState(STATUS.PENDING)
  const [msg, setMsg] = useState('')

  useEffect(() => { fetchItems() }, [])

  const fetchItems = async () => {
    const snap = await getDocs(collection(db, 'transactions'))
    const toMs = (t) => t.createdAt?.toMillis?.() ?? (t.createdAt instanceof Date ? t.createdAt.getTime() : 0)
    const list = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t => t.rewardId) // เฉพาะรายการที่พนักงานแลกของ
      .map(t => ({ ...t, approval: t.approval ?? STATUS.PENDING }))
      .sort((a, b) => toMs(b) - toMs(a))
    setItems(list)
    setLoading(false)
  }

  const approve = async (t) => {
    await updateDoc(doc(db, 'transactions', t.id), { approval: STATUS.APPROVED })
    setMsg(`อนุมัติ "${t.rewardName}" ของ ${t.employeeName} แล้ว`)
    setTimeout(() => setMsg(''), 3000)
    fetchItems()
  }

  const reject = async (t) => {
    if (!window.confirm(`ปฏิเสธการแลก "${t.rewardName}" ของ ${t.employeeName}?\nจะคืนแต้ม ${t.pointsUsed?.toLocaleString()} และคืนสต็อก +1`)) return
    try {
      await runTransaction(db, async (tx) => {
        const txRef = doc(db, 'transactions', t.id)
        const empRef = t.employeeId ? doc(db, 'employees', t.employeeId) : null
        const rwRef = t.rewardId ? doc(db, 'rewards', t.rewardId) : null
        const empSnap = empRef ? await tx.get(empRef) : null
        const rwSnap = rwRef ? await tx.get(rwRef) : null
        if (empRef && empSnap?.exists()) {
          tx.update(empRef, { points: Math.max(0, (empSnap.data().points ?? 0) + (t.pointsUsed ?? 0)) })
        }
        if (rwRef && rwSnap?.exists()) {
          tx.update(rwRef, { stock: (rwSnap.data().stock ?? 0) + 1 })
        }
        tx.update(txRef, { approval: STATUS.REJECTED })
      })
      setMsg(`ปฏิเสธและคืนแต้มให้ ${t.employeeName} แล้ว`)
      setTimeout(() => setMsg(''), 3000)
      fetchItems()
    } catch (e) {
      setMsg('เกิดข้อผิดพลาด: ' + e.message)
    }
  }

  const filtered = filter === 'all' ? items : items.filter(t => t.approval === filter)
  const pendingCount = items.filter(t => t.approval === STATUS.PENDING).length

  const badgeClass = (s) =>
    s === STATUS.APPROVED ? 'badge-success' : s === STATUS.REJECTED ? 'badge-danger' : 'badge-warn'

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">✅ อนุมัติของรางวัล</div>
          <div className="page-sub">รายการที่พนักงานกดแลกของเข้ามา {pendingCount > 0 && `· รออนุมัติ ${pendingCount} รายการ`}</div>
        </div>
      </div>

      {msg && <div style={{ background: '#D1FAE5', color: '#065F46', padding: '12px 18px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontWeight: 700 }}>✅ {msg}</div>}

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
