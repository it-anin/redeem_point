import { useState, useEffect } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

export default function History() {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const q = query(
        collection(db, 'transactions'),
        where('employeeId', '==', user.email)
      )
      const snap = await getDocs(q)
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      // เรียงใหม่ล่าสุดก่อนฝั่ง client (เลี่ยงการต้องสร้าง composite index)
      const ms = (t) => t?.createdAt?.toMillis?.() ?? (t?.createdAt instanceof Date ? t.createdAt.getTime() : 0)
      rows.sort((a, b) => ms(b) - ms(a))
      setTransactions(rows)
      setLoading(false)
    }
    fetch()
  }, [user.email])

  // เฉพาะการแลกรางวัลเอง (มี rewardId) ไม่รวม admin ปรับแต้ม
  const redeemed = transactions.filter(t => t.rewardId)
  const totalSpent = redeemed.reduce((sum, t) => sum + (t.pointsUsed ?? 0), 0)

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/iconcheck.png" alt="" style={{ width: 100, height: 100, objectFit: 'contain', flexShrink: 0 }} />
          <div className="speech-bubble" style={{ padding: '5px 10px' }}>
            <img src="/texthistory.png" alt="" className="img-glow" style={{ maxWidth: 170, height: 'auto', objectFit: 'contain', display: 'block' }} />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="stats-grid" style={{ gridTemplateColumns: '1fr', maxWidth: 280, margin: '0 auto 24px' }}>
        <div className="stat-card shine-sweep" style={{ textAlign: 'center', background: 'radial-gradient(circle at 30% 20%, #FFF3DA, #FBD3B9)' }}>
          <div className="stat-emoji">⭐</div>
          <div className="stat-num">{totalSpent.toLocaleString()}</div>
          <div className="stat-label">แต้มที่ใช้ไป</div>
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>กำลังโหลด...</div>
      ) : redeemed.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎁</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>ยังไม่มีประวัติ</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>ลองแลกรางวัลดูได้เลย!</div>
        </div>
      ) : (
        <div className="hist-list">
          {redeemed.map(t => (
            <div key={t.id} className="hist-item">
              <div className="hist-icon">🎁</div>
              <div className="hist-info">
                <div className="hist-name">{t.rewardName}</div>
                <div className="hist-date">
                  {t.createdAt?.toDate?.()?.toLocaleDateString('th-TH', {
                    year: 'numeric', month: 'long', day: 'numeric'
                  }) ?? '-'}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <div className="hist-pts neg">-{t.pointsUsed?.toLocaleString()}</div>
                {t.approval
                  ? <span className={`badge ${t.approval === 'อนุมัติแล้ว' ? 'badge-success' : t.approval === 'ปฏิเสธ' ? 'badge-danger' : 'badge-warn'}`}>{t.approval}</span>
                  : <span className="badge badge-success">{t.status}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
