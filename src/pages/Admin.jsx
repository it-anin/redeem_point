import { useState, useEffect } from 'react'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase'

export default function Admin() {
  const [employees, setEmployees] = useState([])
  const [rewards, setRewards] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAll = async () => {
      const [empSnap, rwSnap, txSnap] = await Promise.all([
        getDocs(collection(db, 'employees')),
        getDocs(collection(db, 'rewards')),
        getDocs(query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(8))),
      ])
      setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setRewards(rwSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setTransactions(txSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }
    fetchAll()
  }, [])

  const topEmployees = [...employees]
    .filter(e => e.role !== 'admin')
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    .slice(0, 10)

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>กำลังโหลด...</div>

  return (
    <>

      <div className="two-col">
        {/* Left: Recent transactions */}
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>🕐 รายการล่าสุด</div>
          <div className="hist-list">
            {transactions.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>ยังไม่มีรายการ</div>
            ) : transactions.map(t => (
              <div key={t.id} className="hist-item">
                <div className="hist-icon">🎁</div>
                <div className="hist-info">
                  <div className="hist-name">{t.employeeName} → {t.rewardName}</div>
                  <div className="hist-date">
                    {t.createdAt?.toDate?.()?.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) ?? '-'}
                  </div>
                </div>
                <div className="hist-pts neg">-{t.pointsUsed?.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Leaderboard + reward stock */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>🏆 อันดับแต้มสะสม</div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {topEmployees.map((emp, i) => (
                <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < topEmployees.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: 18, width: 28, textAlign: 'center' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`}
                  </div>
                  <div className="avatar">{emp.name?.[0] ?? '?'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{emp.department}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary-dark)' }}>{emp.points?.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>📦 สต็อกรางวัล</div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {rewards.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < rewards.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: 22 }}>{r.emoji ?? '🎁'}</div>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                  {r.unlimited ? (
                    <span className="badge badge-success">♾️ ไม่จำกัด</span>
                  ) : (
                    <span className={`badge ${r.stock > 5 ? 'badge-success' : r.stock > 0 ? 'badge-warn' : 'badge-danger'}`}>
                      {r.stock > 0 ? `เหลือ ${r.stock}` : 'หมด'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
