import { useState, useEffect } from 'react'
import { collection, getDocs, doc, runTransaction, addDoc, serverTimestamp, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

// อัปโหลดรูปขึ้น Cloudinary (unsigned) แล้วคืน URL
async function uploadToCloudinary(file) {
  const cloud = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME
  const preset = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET
  if (!cloud || !preset) throw new Error('ยังไม่ได้ตั้งค่า Cloudinary ใน .env')
  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', preset)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error('อัปโหลดรูปไม่สำเร็จ')
  const data = await res.json()
  return data.secure_url
}

export default function Dashboard() {
  const { profile, user, patchProfile } = useAuth()
  const [rewards, setRewards] = useState([])
  const [loadingRewards, setLoadingRewards] = useState(true)
  const [redeeming, setRedeeming] = useState(null) // reward being confirmed
  const [redeemClosing, setRedeemClosing] = useState(false)
  const [proofFile, setProofFile] = useState(null) // รูปหลักฐานแนบ
  const [uploading, setUploading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [pointsModal, setPointsModal] = useState(false)
  const [pointsClosing, setPointsClosing] = useState(false)
  const [notEnough, setNotEnough] = useState(false) // popup เมื่อแต้มไม่พอ
  const [notEnoughClosing, setNotEnoughClosing] = useState(false)
  const [received, setReceived] = useState([]) // แต้มที่ได้รับเดือนนี้ (HR เพิ่มให้)
  const [approvedModal, setApprovedModal] = useState(false)
  const [approvedList, setApprovedList] = useState([]) // รางวัลที่เพิ่งได้รับการอนุมัติ

  useEffect(() => {
    fetchRewards()
    fetchReceived()
    fetchApprovedNotifications()
  }, [])

  // แจ้งเตือนรางวัลที่ admin อนุมัติแล้ว (ที่ยังไม่เคยแจ้ง) — จำด้วย localStorage
  const fetchApprovedNotifications = async () => {
    const snap = await getDocs(query(collection(db, 'transactions'), where('employeeId', '==', user.email)))
    const approved = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t => t.rewardId && t.approval === 'อนุมัติแล้ว')
    const key = `approvedSeen_${user.email}`
    let seen = []
    try { seen = JSON.parse(localStorage.getItem(key) || '[]') } catch { seen = [] }
    const fresh = approved.filter(t => !seen.includes(t.id))
    if (fresh.length > 0) {
      setApprovedList(fresh)
      setApprovedModal(true)
      const all = Array.from(new Set([...seen, ...approved.map(t => t.id)]))
      localStorage.setItem(key, JSON.stringify(all))
    }
  }

  const fetchRewards = async () => {
    const snap = await getDocs(collection(db, 'rewards'))
    setRewards(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    setLoadingRewards(false)
  }

  // ดึงรายการแต้มที่ HR เพิ่มให้ในเดือนนี้ (pointsUsed < 0 = ได้รับ)
  const fetchReceived = async () => {
    const snap = await getDocs(query(collection(db, 'transactions'), where('employeeId', '==', user.email)))
    const now = new Date()
    const toDate = (t) => t.createdAt?.toDate?.() ?? (t.createdAt instanceof Date ? t.createdAt : null)
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(t => {
        const dt = toDate(t)
        return dt && dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth() && (t.pointsUsed ?? 0) < 0
      })
      .map(t => ({ id: t.id, date: toDate(t), points: -(t.pointsUsed ?? 0), note: t.rewardName }))
      .sort((a, b) => b.date - a.date)
    setReceived(list)
  }

  // ปิด popup แต้มไม่พอ พร้อมอนิเมชัน slide up out
  const closeNotEnough = () => {
    setNotEnoughClosing(true)
    setTimeout(() => { setNotEnough(false); setNotEnoughClosing(false) }, 280)
  }

  // ปิดกล่องยืนยันการแลกพร้อมอนิเมชัน slide up out
  const closeRedeem = () => {
    setRedeemClosing(true)
    setTimeout(() => { setRedeeming(null); setProofFile(null); setErrMsg(''); setRedeemClosing(false) }, 280)
  }

  // ปิด popup แต้มพร้อมอนิเมชัน jelly out
  const closePointsModal = () => {
    setPointsClosing(true)
    setTimeout(() => { setPointsModal(false); setPointsClosing(false) }, 480)
  }

  const handleRedeem = async (reward) => {
    setErrMsg('')
    if ((profile?.points ?? 0) < reward.pointCost) {
      setErrMsg(`แต้มไม่พอ! ต้องการ ${reward.pointCost} แต้ม (มี ${profile.points})`)
      return
    }
    setProofFile(null)
    setRedeeming(reward)
  }

  const confirmRedeem = async () => {
    const reward = redeeming
    if (reward.requireProof && !proofFile) {
      setErrMsg('กรุณาแนบรูปหลักฐานก่อนยืนยัน')
      return
    }
    setUploading(true)
    setErrMsg('')
    try {
      // อัปโหลดรูปหลักฐานก่อน (ถ้ารางวัลกำหนดให้แนบ)
      let proofUrl = null
      if (reward.requireProof && proofFile) {
        proofUrl = await uploadToCloudinary(proofFile)
      }

      let newPoints
      await runTransaction(db, async (tx) => {
        const empRef = doc(db, 'employees', user.email)
        const rwRef  = doc(db, 'rewards', reward.id)
        const empSnap = await tx.get(empRef)
        const rwSnap  = await tx.get(rwRef)

        if (!empSnap.exists()) throw new Error('ไม่พบข้อมูลพนักงาน')
        if (!rwSnap.exists())  throw new Error('ไม่พบรางวัล')

        const pts       = empSnap.data().points
        const stock     = rwSnap.data().stock
        const unlimited = rwSnap.data().unlimited

        if (pts < reward.pointCost)        throw new Error('แต้มไม่พอ')
        if (!unlimited && stock < 1)       throw new Error('ของหมดแล้ว')

        newPoints = pts - reward.pointCost
        tx.update(empRef, { points: newPoints })
        // รางวัลไม่จำกัด ไม่ต้องหักสต็อก
        if (!unlimited) tx.update(rwRef, { stock: stock - 1 })
      })

      // อัปเดตแต้มในหน้าจอทันที ไม่ต้อง refresh
      patchProfile({ points: newPoints })

      await addDoc(collection(db, 'transactions'), {
        employeeId:   user.email,
        employeeName: profile.name,
        rewardId:     reward.id,
        rewardName:   reward.name,
        pointsUsed:   reward.pointCost,
        createdAt:    serverTimestamp(),
        status:       'สำเร็จ',
        approval:     'รออนุมัติ',
        ...(proofUrl ? { proofUrl } : {}),
      })

      setRedeeming(null)
      setProofFile(null)
      setSuccessMsg(`แลก "${reward.name}" สำเร็จ! 🎉`)
      fetchRewards()
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (e) {
      setErrMsg(e.message)
    } finally {
      setUploading(false)
    }
  }

  const specialRewards = rewards.filter(r => r.type === 'special')
  const normalRewards  = rewards.filter(r => r.type !== 'special')

  const renderCard = (r) => (
    <div key={r.id} className="card" style={{ textAlign: 'center', position: 'relative' }}>
      {r.unlimited ? (
        <span className="badge" style={{ position: 'absolute', top: 12, right: 12, background: '#fff', color: 'var(--primary-dark)', border: '1px solid var(--border)' }}>♾️ ไม่จำกัด</span>
      ) : r.stock === 0 ? (
        <span className="badge badge-danger" style={{ position: 'absolute', top: 12, right: 12 }}>หมดแล้ว</span>
      ) : (
        <span className="badge" style={{ position: 'absolute', top: 12, right: 12, background: '#fff', color: r.stock <= 3 ? '#991B1B' : 'var(--primary-dark)', border: '1px solid var(--border)' }}>เหลือ {r.stock}</span>
      )}
      <div style={{ width: '100%', height: 140, borderRadius: 14, background: 'var(--bg)', border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56, marginBottom: 12, overflow: 'hidden' }}>
        {r.image
          ? <img src={r.image} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : (r.emoji ?? '🎁')}
      </div>
      {(() => {
        const idx = r.name?.indexOf('มูลค่า') ?? -1
        if (idx > 0) {
          return (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{r.name.slice(0, idx).trim()}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{r.name.slice(idx).trim()}</div>
            </div>
          )
        }
        return <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{r.name}</div>
      })()}
      {r.type === 'special' ? (
        <div style={{ marginBottom: 6 }}><span className="badge badge-warn badge-pulse">🌟 รางวัลพิเศษ</span></div>
      ) : (
        <div style={{ marginBottom: 6 }}><span className="badge" style={{ background: '#fff', color: 'var(--primary-dark)', border: '1px solid var(--border)' }}>🎁 รางวัลปกติ</span></div>
      )}
      {r.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{r.description}</div>}
      <div className="cost-pill">⭐ {r.pointCost?.toLocaleString()} แต้ม</div>
      {(() => {
        const outOfStock = !r.unlimited && r.stock === 0
        const canAfford = (profile?.points ?? 0) >= r.pointCost
        return (
          <button
            className="btn-primary"
            style={{ width: '100%', marginTop: 12, padding: '10px', opacity: (outOfStock || !canAfford) ? 0.55 : 1, cursor: outOfStock ? 'not-allowed' : 'pointer' }}
            disabled={outOfStock}
            onClick={() => { if (!canAfford) { setNotEnough(true); return } handleRedeem(r) }}
          >
            {outOfStock ? 'หมดแล้ว' : !canAfford ? 'แต้มไม่พอ!' : 'แลกเลย!'}
          </button>
        )
      })()}
    </div>
  )

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/icon.png" alt="" style={{ width: 100, height: 100, objectFit: 'contain', flexShrink: 0 }} />
            <div className="speech-bubble">ถ้าแต้มไม่พอ <br />ขยันทำงานก่อนน้า 🧡</div>
          </div>
        </div>
        <div
          className="neon-glow"
          onClick={() => setPointsModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', borderRadius: 40, padding: '12px 24px 12px 12px', width: '100%', cursor: 'pointer' }}
        >
          <div style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
            <div style={{ fontSize: 18, color: 'var(--text-muted)', fontWeight: 400, fontFamily: 'Itim, sans-serif' }}>แต้มคงเหลือทั้งหมด</div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary-dark)', lineHeight: 1.1, flexShrink: 0, marginRight: 10 }}>
            {profile?.points?.toLocaleString() ?? 0}
            <span style={{ fontSize: 18, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 20, fontFamily: 'Itim, sans-serif' }}>แต้ม</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div style={{ background: '#D1FAE5', color: '#065F46', padding: '12px 18px', borderRadius: 'var(--radius-sm)', marginBottom: 20, fontWeight: 700 }}>
          ✅ {successMsg}
        </div>
      )}
      {errMsg && (
        <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '12px 18px', borderRadius: 'var(--radius-sm)', marginBottom: 20, fontWeight: 700 }}>
          ⚠️ {errMsg}
        </div>
      )}

      {/* Rewards */}
      {loadingRewards ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>กำลังโหลด...</div>
      ) : (
        <>
          {specialRewards.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="card special-card" style={{ display: 'inline-block', marginBottom: 16, padding: '12px 24px', background: 'linear-gradient(135deg, #FFF3DA 0%, #FFFBF0 100%)' }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>
                  🌟 <span className="special-title">รางวัลพิเศษ</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                {specialRewards.map(renderCard)}
              </div>
            </div>
          )}

          <div>
            <div className="card normal-card" style={{ display: 'inline-block', marginBottom: 16, padding: '12px 24px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary-dark)' }}>🎁 รางวัลปกติ</div>
            </div>
            {normalRewards.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>ยังไม่มีรางวัล</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                {normalRewards.map(renderCard)}
              </div>
            )}
          </div>
        </>
      )}

      {/* แจ้งเตือนรางวัลที่อนุมัติแล้ว */}
      {approvedModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(46,31,14,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setApprovedModal(false)}>
          <div className="card" style={{ maxWidth: 340, width: '100%', textAlign: 'center', padding: 28 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>อนุมัติแล้ว!</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>รางวัลของคุณได้รับการอนุมัติแล้ว มารับได้เลย</div>
            <div style={{ textAlign: 'left', marginBottom: 20 }}>
              {approvedList.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>🎁</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{t.rewardName}</span>
                  <span className="badge badge-success">อนุมัติแล้ว</span>
                </div>
              ))}
            </div>
            <button className="btn-primary" style={{ width: '100%', padding: '11px' }} onClick={() => setApprovedModal(false)}>รับทราบ 🎁</button>
          </div>
        </div>
      )}

      {/* แต้มไม่พอ modal */}
      {notEnough && (
        <div className={`modal-overlay ${notEnoughClosing ? 'overlay-out' : ''}`} style={{ position: 'fixed', inset: 0, background: 'rgba(46,31,14,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={closeNotEnough}>
          <div className={`card ${notEnoughClosing ? 'modal-slideup-out' : 'modal-slideup'}`} style={{ maxWidth: 320, width: '100%', textAlign: 'center', padding: 28 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💪</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>แต้มไม่พอ!</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>ทำงานก่อนนะ 😊</div>
            <button className="btn-primary" style={{ width: '100%', padding: '11px' }} onClick={closeNotEnough}>เข้าใจแล้ว</button>
          </div>
        </div>
      )}

      {/* Points-received modal */}
      {pointsModal && (
        <div className={`modal-overlay ${pointsClosing ? 'overlay-out' : ''}`} style={{ position: 'fixed', inset: 0, background: 'rgba(46,31,14,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={closePointsModal}>
          <div className={`card ${pointsClosing ? 'modal-jelly-out' : 'modal-jelly'}`} style={{ maxWidth: 380, width: '100%', padding: 24, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>⭐ แต้มที่ได้รับเดือนนี้</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              รวม {received.reduce((s, r) => s + r.points, 0).toLocaleString()} แต้ม · {received.length} รายการ
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {received.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>เดือนนี้ยังไม่ได้รับแต้ม</div>
              ) : received.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div className="hist-icon">⭐</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{(r.note && r.note !== 'ปรับแต้มโดย Admin' && r.note !== 'เพิ่มแต้มโดย Admin') ? r.note : 'ได้รับแต้ม'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {r.date?.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--success)', flexShrink: 0 }}>+{r.points.toLocaleString()}</div>
                </div>
              ))}
            </div>

            <button className="btn-primary" style={{ width: '100%', marginTop: 16, padding: '11px' }} onClick={closePointsModal}>ปิด</button>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {redeeming && (
        <div className={`modal-overlay ${redeemClosing ? 'overlay-out' : ''}`} style={{ position: 'fixed', inset: 0, background: 'rgba(46,31,14,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className={`card ${redeemClosing ? 'modal-slideup-out' : 'modal-slideup'}`} style={{ maxWidth: 360, width: '100%', textAlign: 'center', padding: 28 }}>
            <div style={{ marginBottom: 12 }}><img src="/star-profile.png" alt="" style={{ width: 56, height: 56, objectFit: 'contain' }} /></div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>ยืนยันการแลก?</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>{redeeming.name}</div>
            <div className="cost-pill" style={{ marginBottom: 16 }}>⭐ {redeeming.pointCost?.toLocaleString()} แต้ม</div>

            {redeeming.requireProof && (
              <div style={{ textAlign: 'left', marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>📎 แนบรูปหลักฐาน (เช่น ใบเสร็จ) *</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setProofFile(e.target.files[0] || null)}
                  style={{ fontSize: 13, width: '100%' }}
                />
                {proofFile && (
                  <img src={URL.createObjectURL(proofFile)} alt="หลักฐาน" style={{ marginTop: 10, width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 12, border: '1.5px solid var(--border)' }} />
                )}
              </div>
            )}

            {errMsg && (
              <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 14, fontWeight: 600 }}>⚠️ {errMsg}</div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-danger" style={{ flex: 1 }} onClick={closeRedeem} disabled={uploading}>ยกเลิก</button>
              <button className="btn-primary" style={{ flex: 1, padding: '10px' }} onClick={confirmRedeem} disabled={uploading}>{uploading ? 'กำลังอัปโหลด...' : 'ยืนยัน'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
