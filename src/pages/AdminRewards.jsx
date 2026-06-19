import { useState, useEffect, useRef } from 'react'
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

const EMPTY = { name: '', description: '', pointCost: '', stock: '', type: 'normal', image: '', unlimited: false, requireProof: false }

// ไอคอนตามประเภทรางวัล (ใช้แสดงเมื่อไม่มีรูป)
const typeEmoji = (type) => (type === 'special' ? '🌟' : '🎁')

// แปลงลิงก์แชร์ Google Drive ให้เป็นลิงก์ฝังรูปได้โดยตรง (ลิงก์เว็บอื่นใช้ตามเดิม)
function toDirectImageUrl(url) {
  const u = (url ?? '').trim()
  if (!u) return null
  const m = u.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || u.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000` : u
}

export default function AdminRewards() {
  const [rewards, setRewards] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null) // reward being edited
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const formRef = useRef(null)
  // ตั้งเวลาเปิดให้พนักงานแลก (เก็บใน settings/redeem)
  const [redeemCfg, setRedeemCfg] = useState({ open: true, enabled: true, hour: 15, minute: 0, dateY: 0, dateM: 0, dateD: 0 })
  const [savingCfg, setSavingCfg] = useState(false)

  const scrollToForm = () => {
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  useEffect(() => { fetchRewards(); fetchRedeemCfg() }, [])

  const fetchRewards = async () => {
    const snap = await getDocs(collection(db, 'rewards'))
    setRewards(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }

  const fetchRedeemCfg = async () => {
    try {
      const snap = await getDoc(doc(db, 'settings', 'redeem'))
      if (snap.exists()) setRedeemCfg(c => ({ ...c, ...snap.data() }))
    } catch { /* ใช้ค่า default */ }
  }

  const saveRedeemCfg = async () => {
    setSavingCfg(true)
    setMsg({ type: '', text: '' })
    try {
      await setDoc(doc(db, 'settings', 'redeem'), {
        open: redeemCfg.open !== false,
        enabled: !!redeemCfg.enabled,
        hour: Number(redeemCfg.hour) || 0,
        minute: Number(redeemCfg.minute) || 0,
        dateY: Number(redeemCfg.dateY) || 0,
        dateM: Number(redeemCfg.dateM) || 0,
        dateD: Number(redeemCfg.dateD) || 0,
        updatedAt: new Date(),
      }, { merge: true })
      setMsg({ type: 'success', text: 'บันทึกเวลาเปิดแลกเรียบร้อย!' })
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setSavingCfg(false)
    }
  }

  // ปุ่มเปิด/ปิดการแลกทันที (master switch) — บันทึกเข้า Firestore เลย
  const toggleRedeemOpen = async () => {
    const newOpen = !(redeemCfg.open !== false) // สลับสถานะปัจจุบัน
    setRedeemCfg(c => ({ ...c, open: newOpen }))
    setSavingCfg(true)
    setMsg({ type: '', text: '' })
    try {
      await setDoc(doc(db, 'settings', 'redeem'), { open: newOpen, updatedAt: new Date() }, { merge: true })
      setMsg({ type: 'success', text: newOpen ? 'เปิดให้พนักงานแลกของรางวัลแล้ว' : 'ปิดการแลกของรางวัลแล้ว (พนักงานแลกไม่ได้)' })
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
      setRedeemCfg(c => ({ ...c, open: !newOpen })) // ย้อนกลับถ้าบันทึกพลาด
    } finally {
      setSavingCfg(false)
    }
  }

  const openAdd = () => { setEditing(null); setForm(EMPTY); setShowForm(true); scrollToForm() }
  const openEdit = (r) => { setEditing(r); setForm({ name: r.name, description: r.description ?? '', pointCost: r.pointCost, stock: r.stock ?? '', type: r.type ?? 'normal', image: r.image ?? '', unlimited: r.unlimited ?? false, requireProof: r.requireProof ?? false }); setShowForm(true); scrollToForm() }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg({ type: '', text: '' })
    try {
      const imageUrl = toDirectImageUrl(form.image)
      const data = {
        name: form.name,
        description: form.description,
        pointCost: Number(form.pointCost),
        stock: form.unlimited ? null : Number(form.stock),
        unlimited: !!form.unlimited,
        requireProof: !!form.requireProof,
        type: form.type,
        emoji: typeEmoji(form.type), // ตั้งไอคอนอัตโนมัติตามประเภท
        image: imageUrl,
        updatedAt: new Date(),
      }
      if (editing) {
        await updateDoc(doc(db, 'rewards', editing.id), data)
        setMsg({ type: 'success', text: `แก้ไข "${form.name}" สำเร็จ!` })
      } else {
        await addDoc(collection(db, 'rewards'), { ...data, createdAt: new Date() })
        setMsg({ type: 'success', text: `เพิ่มรางวัล "${form.name}" สำเร็จ!` })
      }
      setShowForm(false)
      fetchRewards()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (r) => {
    if (!window.confirm(`ลบรางวัล "${r.name}" ใช่ไหม?`)) return
    await deleteDoc(doc(db, 'rewards', r.id))
    setMsg({ type: 'success', text: `ลบ "${r.name}" แล้ว` })
    fetchRewards()
  }

  const specialRewards = rewards.filter(r => r.type === 'special')
  const normalRewards  = rewards.filter(r => r.type !== 'special')

  const renderCard = (r) => (
    <div key={r.id} className="card" style={{ textAlign: 'center', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 12, right: 12 }}>
        {r.unlimited ? (
          <span className="badge" style={{ background: '#fff', color: 'var(--primary-dark)', border: '1px solid var(--border)' }}>♾️ ไม่จำกัด</span>
        ) : r.stock === 0 ? (
          <span className="badge badge-danger">หมดแล้ว</span>
        ) : (
          <span className="badge" style={{ background: '#fff', color: r.stock <= 3 ? '#991B1B' : 'var(--primary-dark)', border: '1px solid var(--border)' }}>เหลือ {r.stock}</span>
        )}
      </div>
      <div style={{ width: '100%', height: 140, borderRadius: 14, background: 'var(--bg)', border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56, marginBottom: 12, overflow: 'hidden' }}>
        {r.image
          ? <img src={r.image} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : (r.emoji ?? '🎁')}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{r.name}</div>
      <div style={{ marginBottom: 8 }}>
        {r.type === 'special' ? (
          <span className="badge badge-warn badge-pulse">🌟 รางวัลพิเศษ</span>
        ) : (
          <span className="badge" style={{ background: '#fff', color: 'var(--primary-dark)', border: '1px solid var(--border)' }}>🎁 รางวัลปกติ</span>
        )}
      </div>
      {r.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{r.description}</div>}
      <div className="cost-pill" style={{ marginBottom: 14 }}>⭐ {r.pointCost?.toLocaleString()} แต้ม</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" style={{ flex: 1, padding: '8px', fontSize: 13 }} onClick={() => openEdit(r)}>✏️ แก้ไข</button>
        <button className="btn-danger" style={{ flex: 1 }} onClick={() => handleDelete(r)}>🗑️ ลบ</button>
      </div>
    </div>
  )

  return (
    <>
      <div className="page-header">
        <div />
        <button className="btn-primary" onClick={openAdd}>+ เพิ่มรางวัล</button>
      </div>

      {msg.text && (
        <div style={{ background: msg.type === 'success' ? '#D1FAE5' : '#FEE2E2', color: msg.type === 'success' ? '#065F46' : '#991B1B', padding: '12px 18px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontWeight: 700 }}>
          {msg.type === 'success' ? '✅' : '⚠️'} {msg.text}
        </div>
      )}

      {/* เปิด/ปิดการแลกทันที (master switch) */}
      <div className="card" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>
            สถานะการแลกของรางวัล: {redeemCfg.open !== false
              ? <span style={{ color: '#059669' }}>🟢 เปิดอยู่</span>
              : <span style={{ color: '#DC2626' }}>🔴 ปิดอยู่</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            ปิดแล้วพนักงานจะแลกไม่ได้ทันที ไม่ว่าจะถึงเวลาเปิดหรือไม่
          </div>
        </div>
        <button
          className={redeemCfg.open !== false ? 'btn-danger' : 'btn-primary'}
          style={{ padding: '11px 24px', fontSize: 14, fontWeight: 800 }}
          onClick={toggleRedeemOpen}
          disabled={savingCfg}
        >
          {redeemCfg.open !== false ? '🔴 ปิดการแลก' : '🟢 เปิดให้แลก'}
        </button>
      </div>

      {/* ตั้งเวลาเปิดให้พนักงานแลกรางวัล */}
      <div className="card" style={{ marginBottom: 24, opacity: redeemCfg.open !== false ? 1 : 0.55 }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>⏰ เวลาเปิดให้พนักงานแลกรางวัล</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          ก่อนถึงเวลานี้ ปุ่ม "แลกเลย!" ของพนักงานจะกดไม่ได้ (บังคับทั้งฝั่งแอปและเซิร์ฟเวอร์) — อิงเวลาประเทศไทย
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!redeemCfg.enabled} onChange={e => setRedeemCfg(c => ({ ...c, enabled: e.target.checked }))} />
            เปิดใช้การล็อกเวลา
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>เปิดแลกเวลา</span>
            <input
              type="time"
              className="input"
              style={{ width: 140, opacity: redeemCfg.enabled ? 1 : 0.5 }}
              disabled={!redeemCfg.enabled}
              value={`${String(redeemCfg.hour ?? 0).padStart(2, '0')}:${String(redeemCfg.minute ?? 0).padStart(2, '0')}`}
              onChange={e => {
                const [h, m] = e.target.value.split(':').map(Number)
                setRedeemCfg(c => ({ ...c, hour: h || 0, minute: m || 0 }))
              }}
            />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>น.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>เฉพาะวันที่</span>
            <input
              type="date"
              className="input"
              style={{ width: 170, opacity: redeemCfg.enabled ? 1 : 0.5 }}
              disabled={!redeemCfg.enabled}
              value={redeemCfg.dateY ? `${redeemCfg.dateY}-${String(redeemCfg.dateM).padStart(2, '0')}-${String(redeemCfg.dateD).padStart(2, '0')}` : ''}
              onChange={e => {
                if (!e.target.value) { setRedeemCfg(c => ({ ...c, dateY: 0, dateM: 0, dateD: 0 })); return }
                const [y, m, d] = e.target.value.split('-').map(Number)
                setRedeemCfg(c => ({ ...c, dateY: y, dateM: m, dateD: d }))
              }}
            />
            {redeemCfg.dateY ? (
              <button type="button" className="btn-danger" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setRedeemCfg(c => ({ ...c, dateY: 0, dateM: 0, dateD: 0 }))}>ล้าง</button>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>(เว้นว่าง = ทุกวัน)</span>
            )}
          </div>
          <button className="btn-primary" style={{ padding: '9px 20px', fontSize: 13 }} onClick={saveRedeemCfg} disabled={savingCfg}>
            {savingCfg ? 'กำลังบันทึก...' : '💾 บันทึกเวลา'}
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
          สถานะ: {redeemCfg.enabled
            ? `🔒 ล็อก — เปิดแลก ${redeemCfg.dateY ? `เฉพาะวันที่ ${String(redeemCfg.dateD).padStart(2, '0')}/${String(redeemCfg.dateM).padStart(2, '0')}/${redeemCfg.dateY} ` : '(ทุกวัน) '}ตั้งแต่ ${String(redeemCfg.hour ?? 0).padStart(2, '0')}:${String(redeemCfg.minute ?? 0).padStart(2, '0')} น.`
            : '🔓 ปิดล็อก — พนักงานแลกได้ทุกเวลา'}
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div ref={formRef} className="card" style={{ marginBottom: 24, scrollMarginTop: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>
            {editing ? '✏️ แก้ไขรางวัล' : '➕ เพิ่มรางวัลใหม่'}
          </div>
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>ชื่อรางวัล *</label>
                <input className="input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="กาแฟบัตร 100 บาท" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>ประเภทรางวัล</label>
                <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="normal">🎁 รางวัลปกติ</option>
                  <option value="special">🌟 รางวัลพิเศษ</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>แต้มที่ใช้แลก *</label>
                <input className="input" type="number" min={1} required value={form.pointCost} onChange={e => setForm(f => ({ ...f, pointCost: e.target.value }))} placeholder="500" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>จำนวนในคลัง {form.unlimited ? '' : '*'}</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  required={!form.unlimited}
                  disabled={form.unlimited}
                  value={form.unlimited ? '' : form.stock}
                  onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                  placeholder={form.unlimited ? 'ไม่จำกัด' : '10'}
                  style={form.unlimited ? { background: 'var(--bg)', color: 'var(--text-muted)' } : undefined}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginTop: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.unlimited} onChange={e => setForm(f => ({ ...f, unlimited: e.target.checked }))} />
                  ♾️ ไม่จำกัดจำนวน (แลกได้ไม่จำกัด)
                </label>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>รายละเอียด</label>
                <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="รายละเอียดรางวัล..." />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.requireProof} onChange={e => setForm(f => ({ ...f, requireProof: e.target.checked }))} />
                  📎 ต้องแนบรูปหลักฐานตอนแลก (เช่น ใบเสร็จ)
                </label>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>ลิงก์รูปภาพ (URL, ไม่บังคับ)</label>
                <input
                  className="input"
                  type="url"
                  value={form.image}
                  onChange={e => setForm(f => ({ ...f, image: e.target.value }))}
                  placeholder="วางลิงก์รูป เช่น https://i.ibb.co/xxxx/reward.png"
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  💡 ใช้ลิงก์ direct จากเว็บฝากรูปใดก็ได้ (ImgBB, Cloudinary, Imgur ฯลฯ) — ถ้าวางลิงก์แชร์ Google Drive ระบบจะแปลงให้อัตโนมัติ
                </div>
                {toDirectImageUrl(form.image) && (
                  <img
                    src={toDirectImageUrl(form.image)}
                    alt="ตัวอย่าง"
                    style={{ marginTop: 10, width: 72, height: 72, objectFit: 'cover', borderRadius: 12, border: '1.5px solid var(--border)' }}
                    onError={e => { e.currentTarget.style.display = 'none' }}
                    onLoad={e => { e.currentTarget.style.display = 'block' }}
                  />
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn-danger" onClick={() => setShowForm(false)}>ยกเลิก</button>
              <button type="submit" className="btn-primary" disabled={saving} style={{ padding: '11px 28px' }}>
                {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rewards grid */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>กำลังโหลด...</div>
      ) : (
        <>
          {specialRewards.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>🌟 รางวัลพิเศษ</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                {specialRewards.map(renderCard)}
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>🎁 รางวัลปกติ</div>
            {normalRewards.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>ยังไม่มีรางวัล</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                {normalRewards.map(renderCard)}
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
