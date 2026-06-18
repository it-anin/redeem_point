import { useState, useEffect } from 'react'
import { collection, query, orderBy, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

export default function Announcements() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      try {
        const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'))
        const snap = await getDocs(q)
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setItems(list)
        // บันทึกว่าอ่านประกาศทั้งหมดแล้ว (เคลียร์ badge)
        if (user?.email) {
          localStorage.setItem(`announcementsSeen_${user.email}`, JSON.stringify(list.map(a => a.id)))
        }
      } catch {
        setItems([])
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [user?.email])

  return (
    <div style={{ fontFamily: 'Itim, sans-serif' }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/iconmegaphone.png" alt="" style={{ width: 100, height: 100, objectFit: 'contain', flexShrink: 0 }} />
          <div className="speech-bubble" style={{ padding: '5px 10px' }}>
            <img src="/textreward.png" alt="" className="img-glow" style={{ maxWidth: 170, height: 'auto', objectFit: 'contain', display: 'block' }} />
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>กำลังโหลด...</div>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📢</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>ยังไม่มีประกาศ</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>เมื่อมีประกาศใหม่จะแสดงที่นี่</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map(a => (
            <div key={a.id} className="card">
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{a.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                {a.createdAt?.toDate?.()?.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) ?? ''}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{a.body}</div>
              {a.pdfUrl && (
                <div style={{ marginTop: 12 }}>
                  <a href={a.pdfUrl} target="_blank" rel="noreferrer">
                    <img
                      src={a.pdfUrl.replace('/upload/', '/upload/pg_1,w_1200,q_auto/').replace(/\.pdf$/i, '.jpg')}
                      alt={a.pdfName || 'เอกสาร'}
                      style={{ width: '100%', borderRadius: 12, border: '1.5px solid var(--border)', display: 'block' }}
                    />
                  </a>
                  <a href={a.pdfUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8, fontSize: 13, fontWeight: 700, color: 'var(--primary-dark)' }}>
                    📄 เปิด PDF ต้นฉบับ
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
