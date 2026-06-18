import { useState, useEffect } from 'react'
import { collection, query, orderBy, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { uploadFileToCloudinary } from '../cloudinary'
import { PDFDocument } from 'pdf-lib'

const EMPTY = { title: '', body: '' }

export default function AdminAnnouncements() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formClosing, setFormClosing] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [pdfFile, setPdfFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })

  useEffect(() => { fetchItems() }, [])

  const openForm = () => { setForm(EMPTY); setFormClosing(false); setShowForm(true) }
  // ปิดแบบหน่วง unmount ให้อนิเมชัน bounce-out เล่นจบก่อน (ตรงกับ 0.4s ใน CSS)
  const closeForm = () => {
    setFormClosing(true)
    setTimeout(() => { setShowForm(false); setFormClosing(false); setPdfFile(null) }, 280)
  }
  const toggleForm = () => { showForm ? closeForm() : openForm() }

  const fetchItems = async () => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'))
    const snap = await getDocs(q)
    setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg({ type: '', text: '' })
    try {
      let pdfUrl = null
      let pdfName = null
      if (pdfFile) {
        // บังคับให้เป็น PDF หน้าเดียว
        const bytes = await pdfFile.arrayBuffer()
        const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const pages = pdf.getPageCount()
        if (pages !== 1) throw new Error(`รองรับเฉพาะ PDF หน้าเดียว (ไฟล์นี้มี ${pages} หน้า)`)
        pdfUrl = await uploadFileToCloudinary(pdfFile)
        pdfName = pdfFile.name
      }
      await addDoc(collection(db, 'announcements'), {
        title: form.title,
        body: form.body,
        createdAt: new Date(),
        ...(pdfUrl ? { pdfUrl, pdfName } : {}),
      })
      setMsg({ type: 'success', text: `โพสต์ประกาศ "${form.title}" สำเร็จ!` })
      setForm(EMPTY)
      closeForm()
      fetchItems()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (a) => {
    if (!window.confirm(`ลบประกาศ "${a.title}" ใช่ไหม?`)) return
    await deleteDoc(doc(db, 'announcements', a.id))
    setMsg({ type: 'success', text: `ลบ "${a.title}" แล้ว` })
    fetchItems()
  }

  return (
    <>
      <div className="page-header">
        <div />
        <button className="btn-primary" onClick={toggleForm}>
          {showForm && !formClosing ? '✕ ปิด' : '+ เพิ่มประกาศ'}
        </button>
      </div>

      {msg.text && (
        <div style={{ background: msg.type === 'success' ? '#D1FAE5' : '#FEE2E2', color: msg.type === 'success' ? '#065F46' : '#991B1B', padding: '12px 18px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontWeight: 700 }}>
          {msg.type === 'success' ? '✅' : '⚠️'} {msg.text}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className={`card ${formClosing ? 'slidedown-out' : 'slidedown-in'}`} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>➕ เพิ่มประกาศใหม่</div>
          <form onSubmit={handleSave}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>หัวข้อ *</label>
              <input className="input" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="เช่น ปิดทำการวันหยุดนักขัตฤกษ์" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>เนื้อหา *</label>
              <textarea
                className="input"
                required
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder="รายละเอียดประกาศ..."
                rows={5}
                style={{ resize: 'vertical', fontFamily: 'Nunito, sans-serif' }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>📄 แนบไฟล์ PDF (หน้าเดียวเท่านั้น, ไม่บังคับ)</label>
              <input type="file" accept="application/pdf,.pdf" onChange={e => setPdfFile(e.target.files[0] || null)} style={{ fontSize: 13 }} />
              {pdfFile && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>เลือกแล้ว: {pdfFile.name}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn-danger" onClick={closeForm}>ยกเลิก</button>
              <button type="submit" className="btn-primary" disabled={saving} style={{ padding: '11px 28px' }}>
                {saving ? 'กำลังโพสต์...' : '💾 โพสต์ประกาศ'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>กำลังโหลด...</div>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📢</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>ยังไม่มีประกาศ</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>กดปุ่ม "เพิ่มประกาศ" เพื่อโพสต์</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map(a => (
            <div key={a.id} className="card">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{a.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                    {a.createdAt?.toDate?.()?.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) ?? ''}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{a.body}</div>
                  {a.pdfUrl && (
                    <a href={a.pdfUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, fontSize: 13, fontWeight: 700, color: 'var(--primary-dark)' }}>
                      📄 {a.pdfName || 'เอกสาร PDF'}
                    </a>
                  )}
                </div>
                <button className="btn-danger" style={{ flexShrink: 0 }} onClick={() => handleDelete(a)}>🗑️ ลบ</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
