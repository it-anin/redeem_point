import { useState } from 'react'

const TABS = [
  { path: '/dashboard',     label: '🏠 หน้าหลัก' },
  { path: '/announcements', label: '📢 ประกาศ' },
  { path: '/history',       label: '📜 ประวัติการแลก' },
]

export default function MobilePreview() {
  const [path, setPath] = useState('/dashboard')

  return (
    <>

      {/* แท็บเลือกหน้า */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.path}
            className="btn-primary"
            style={{ opacity: path === t.path ? 1 : 0.55, padding: '9px 16px', fontSize: 13 }}
            onClick={() => setPath(t.path)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* กรอบมือถือ */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{
          width: 390,
          maxWidth: '100%',
          height: 844,
          maxHeight: '80vh',
          background: 'var(--primary-dark)',
          borderRadius: 40,
          padding: 5,
          boxShadow: '0 12px 32px rgba(168, 90, 46, 0.3)',
          flexShrink: 0,
        }}>
          <iframe
            key={path}
            title="ตัวอย่างมือถือ"
            src={`${path}?preview=employee`}
            style={{ width: '100%', height: '100%', border: 'none', borderRadius: 36, background: '#fff', display: 'block' }}
          />
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 14 }}>
        💡 เป็นการแสดงผลจริงของแอปในขนาดมือถือ
      </div>
    </>
  )
}
