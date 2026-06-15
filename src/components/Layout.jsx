import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar, MobileNav, BottomNav } from './Sidebar'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { profile } = useAuth()
  const location = useLocation()
  // โหมดพรีวิวพนักงาน (ฝังใน iframe ของหน้า admin)
  const previewEmployee = new URLSearchParams(window.location.search).get('preview') === 'employee'
  // พนักงาน (ไม่ใช่ admin) หรือโหมดพรีวิว → ใช้หน้าจอแบบมือถือเสมอ
  const forceMobile = previewEmployee || profile?.role !== 'admin'

  return (
    <div className={`layout ${forceMobile ? 'layout--mobile' : ''}`}>
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Mobile topbar (กดที่แถบเพื่อเปิดเมนู) */}
      {forceMobile ? (
        <div className="mobile-topbar" style={{ padding: 0, position: 'relative', display: 'block', cursor: 'pointer' }} onClick={() => setDrawerOpen(true)}>
          <img src="/texttopbar.png" alt="แลกของรางวัล" style={{ width: '100%', display: 'block' }} />
        </div>
      ) : (
        <div className="mobile-topbar" style={{ cursor: 'pointer' }} onClick={() => setDrawerOpen(true)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/icon.png" alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary-dark)' }}>ระบบสะสมแต้มแลกรางวัล</span>
          </div>
        </div>
      )}

      {/* Mobile drawer */}
      <MobileNav isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} compact={forceMobile} />

      {/* Page content */}
      <main className="main">
        <div key={location.pathname} className="page-enter">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  )
}
