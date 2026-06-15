import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Announcements from './pages/Announcements'
import History from './pages/History'
import Admin from './pages/Admin'
import AdminEmployees from './pages/AdminEmployees'
import AdminRewards from './pages/AdminRewards'
import AdminApprovals from './pages/AdminApprovals'
import AdminAnnouncements from './pages/AdminAnnouncements'
import AdminHistory from './pages/AdminHistory'
import MobilePreview from './pages/MobilePreview'
import './index.css'

// Guard: ต้องล็อกอินก่อน
function RequireAuth({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

// Guard: ต้องเป็น admin
function RequireAdmin({ children }) {
  const { profile } = useAuth()
  if (!profile) return null
  return profile.role === 'admin' ? children : <Navigate to="/dashboard" replace />
}

// Redirect หลัง login ตาม role
function HomeRedirect() {
  const { profile } = useAuth()
  if (!profile) return null
  return <Navigate to={profile.role === 'admin' ? '/admin' : '/dashboard'} replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Protected layout */}
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<HomeRedirect />} />

        {/* Employee */}
        <Route path="/dashboard"     element={<Dashboard />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/history"       element={<History />} />

        {/* Admin */}
        <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
        <Route path="/admin/employees" element={<RequireAdmin><AdminEmployees /></RequireAdmin>} />
        <Route path="/admin/rewards"   element={<RequireAdmin><AdminRewards /></RequireAdmin>} />
        <Route path="/admin/approvals" element={<RequireAdmin><AdminApprovals /></RequireAdmin>} />
        <Route path="/admin/announcements" element={<RequireAdmin><AdminAnnouncements /></RequireAdmin>} />
        <Route path="/admin/history"   element={<RequireAdmin><AdminHistory /></RequireAdmin>} />
        <Route path="/admin/preview"   element={<RequireAdmin><MobilePreview /></RequireAdmin>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
