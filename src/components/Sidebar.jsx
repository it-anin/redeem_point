import { useRef, useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

const NAV_EMPLOYEE = [
  { to: '/dashboard',     icon: <img src="/Home.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain', verticalAlign: 'middle' }} />, label: 'หน้าหลัก' },
  { to: '/announcements', icon: <img src="/Megaphone.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain', verticalAlign: 'middle' }} />, label: 'ประกาศ' },
  { to: '/history',       icon: <img src="/logocheck.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain', verticalAlign: 'middle' }} />, label: 'ประวัติการแลก' },
]

// ไอคอน sidebar admin ทั้งหมดใช้ iconplus.png
const MENU_ICON = <img src="/iconplus.png" alt="" style={{ width: 30, height: 30, objectFit: 'contain', verticalAlign: 'middle' }} />

const NAV_ADMIN = [
  { to: '/admin',              icon: MENU_ICON, label: 'Overview' },
  { to: '/admin/employees',    icon: MENU_ICON, label: 'พนักงาน' },
  { to: '/admin/rewards',      icon: MENU_ICON, label: 'จัดการรางวัล' },
  { to: '/admin/approvals',    icon: MENU_ICON, label: 'อนุมัติของรางวัล' },
  { to: '/admin/announcements', icon: MENU_ICON, label: 'จัดการประกาศ' },
  { to: '/admin/history',      icon: MENU_ICON, label: 'ประวัติทั้งหมด' },
]

function NavItems({ items, onClose }) {
  return items.map(({ to, icon, label }) => (
    <NavLink
      key={to}
      to={to}
      end={to === '/dashboard' || to === '/admin'}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
      onClick={onClose}
    >
      <span className="nav-icon">{icon}</span>
      {label}
    </NavLink>
  ))
}

function SidebarContent({ onClose, compact }) {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin'

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  // compact = แสดงแค่โลโก้ + ปุ่มออกจากระบบ (ใช้กับ drawer ของพนักงานบนมือถือ)
  if (compact) {
    return (
      <>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon" style={{ background: 'none', border: 'none' }}><img src="/iconsleep.png" alt="" style={{ width: 70, height: 70, objectFit: 'contain' }} /></div>
          <div className="speech-bubble" style={{ marginLeft: 6 }}>
            <div className="sidebar-logo-name">ZzZz</div>
            <div className="sidebar-logo-sub">ลาเยอะอดได้แต้มนะ </div>
          </div>
        </div>

        {profile && (
          <div style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', marginTop: 4 }}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{profile.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{profile.department}</div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>รหัสพนักงาน</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary-dark)' }}>{profile.code ?? '-'}</div>
          </div>
        )}

        <div style={{ marginTop: 12, background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 4 }}>
          <button className="nav-item" onClick={handleLogout} style={{ color: 'var(--text-muted)' }}>
            <span className="nav-icon">👋</span> ออกจากระบบ
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="sidebar-logo" style={{ justifyContent: 'center' }}>
        <div className="sidebar-logo-icon" style={{ background: 'none', border: 'none' }}><img src="/iconadmin.png" alt="" style={{ width: 100, height: 100, objectFit: 'contain' }} /></div>
        <div className="speech-bubble" style={{ marginLeft: 20, padding: '12px 16px' }}>
          <div className="sidebar-logo-name">Admin</div>
          <div className="sidebar-logo-sub">ดูแลระบบ</div>
        </div>
      </div>

      {isAdmin ? (
        <>
          <div className="nav-section-label">Admin</div>
          <NavItems items={NAV_ADMIN} onClose={onClose} />
          <div className="nav-section-label" style={{ marginTop: 8 }}>มุมมองพนักงาน</div>
          <NavItems items={[{ to: '/admin/preview', icon: MENU_ICON, label: 'พนักงาน (แสดงผล)' }]} onClose={onClose} />
        </>
      ) : (
        <>
          <div className="nav-section-label">เมนู</div>
          <NavItems items={NAV_EMPLOYEE} onClose={onClose} />
        </>
      )}

      <div style={{ marginTop: 'auto', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 4 }}>
        <button className="nav-item" onClick={handleLogout} style={{ color: 'var(--text-muted)' }}>
          <span className="nav-icon">👋</span> ออกจากระบบ
        </button>
      </div>
    </>
  )
}

export function Sidebar() {
  return (
    <div className="sidebar">
      <SidebarContent onClose={() => {}} />
    </div>
  )
}

export function MobileNav({ isOpen, onClose, compact }) {
  const overlayRef = useRef(null)

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  return (
    <>
      <div
        ref={overlayRef}
        className={`drawer-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />
      <div className={`drawer ${isOpen ? 'open' : ''}`}>
        <button className="drawer-close" onClick={onClose}>✕</button>
        <SidebarContent onClose={onClose} compact={compact} />
      </div>
    </>
  )
}

export function BottomNav() {
  const { profile, user } = useAuth()
  const location = useLocation()
  const previewEmployee = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === 'employee'
  const viewAsEmployee = previewEmployee || profile?.role !== 'admin'
  const items = viewAsEmployee ? NAV_EMPLOYEE : NAV_ADMIN.slice(0, 4)
  const [newCount, setNewCount] = useState(0)

  // นับจำนวนประกาศที่ยังไม่อ่าน (จำด้วย localStorage)
  useEffect(() => {
    if (!viewAsEmployee || !user?.email) return
    let active = true
    ;(async () => {
      try {
        const snap = await getDocs(collection(db, 'announcements'))
        const ids = snap.docs.map(d => d.id)
        const key = `announcementsSeen_${user.email}`
        let seen = []
        try { seen = JSON.parse(localStorage.getItem(key) || '[]') } catch { seen = [] }
        if (active) setNewCount(ids.filter(id => !seen.includes(id)).length)
      } catch { /* เงียบไว้ */ }
    })()
    return () => { active = false }
  }, [viewAsEmployee, user?.email, location.pathname])

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {items.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={previewEmployee ? `${to}?preview=employee` : to}
            end={to === '/dashboard' || to === '/admin'}
            className={({ isActive }) => `bn-item ${isActive ? 'active' : ''}`}
          >
            <span className="bn-icon" style={{ position: 'relative', display: 'inline-block' }}>
              {icon}
              {to === '/announcements' && newCount > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -10, minWidth: 17, height: 17, padding: '0px 4px', background: '#E05252', color: '#fff', fontSize: 8, fontWeight: 700, lineHeight: '14px', textAlign: 'center', borderRadius: 8, border: '2px solid var(--surface)' }}>
                  {newCount > 9 ? '9+' : newCount}
                </span>
              )}
            </span>
            <span className="bn-label">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
