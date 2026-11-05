import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { getRedirectResult, onAuthStateChanged, signOut } from 'firebase/auth'
import { getDoc } from 'firebase/firestore'
import { AuthProvider, useAuth } from './AuthContext'

jest.mock('../firebase', () => ({ auth: {}, db: {} }))
jest.mock('firebase/auth', () => ({
  GoogleAuthProvider: jest.fn(),
  getRedirectResult: jest.fn(),
  onAuthStateChanged: jest.fn(),
  signInWithRedirect: jest.fn(),
  signOut: jest.fn(),
}))
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  deleteDoc: jest.fn(),
}))

function AuthState() {
  const { user, pendingUser, profile } = useAuth()
  return <div>{user ? `เข้าแล้ว: ${profile.name}` : pendingUser ? 'รอผูกบัญชี' : 'เข้าสู่ระบบ'}</div>
}

describe('loading the employee profile', () => {
  let container
  let root
  let listener
  const firebaseUser = { email: 'employee@example.com' }

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    getRedirectResult.mockResolvedValue(null)
    onAuthStateChanged.mockImplementation((auth, callback) => {
      listener = callback
      Promise.resolve().then(() => callback(firebaseUser))
      return jest.fn()
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    jest.resetAllMocks()
  })

  it('shows an error on failure and loads the account when retry succeeds', async () => {
    getDoc.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
      exists: () => true, id: firebaseUser.email, data: () => ({ name: 'พนักงาน' }),
    })
    await act(async () => root.render(<AuthProvider><AuthState /></AuthProvider>))
    expect(container.querySelector('[role="alert"]').textContent).toContain('โหลดข้อมูลบัญชีไม่สำเร็จ')
    expect(container.textContent).not.toContain('รอผูกบัญชี')

    await act(async () => container.querySelector('button').click())
    expect(container.textContent).toContain('เข้าแล้ว: พนักงาน')
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(getDoc).toHaveBeenCalledTimes(2)
  })

  it('still directs an authenticated user with no profile to account linking', async () => {
    getDoc.mockResolvedValue({ exists: () => false })
    await act(async () => root.render(<AuthProvider><AuthState /></AuthProvider>))
    expect(container.textContent).toContain('รอผูกบัญชี')
  })

  it('does not restore a stale profile after the user signs out', async () => {
    let finishProfile
    getDoc.mockReturnValue(new Promise(resolve => { finishProfile = resolve }))
    await act(async () => root.render(<AuthProvider><AuthState /></AuthProvider>))
    await act(async () => listener(null))
    await act(async () => finishProfile({ exists: () => true, id: firebaseUser.email, data: () => ({ name: 'พนักงาน' }) }))
    expect(container.textContent).toContain('เข้าสู่ระบบ')
    expect(container.textContent).not.toContain('เข้าแล้ว')
  })

  it('offers a way to use a different account when loading fails', async () => {
    getDoc.mockRejectedValue(new Error('offline'))
    signOut.mockResolvedValue()
    await act(async () => root.render(<AuthProvider><AuthState /></AuthProvider>))
    await act(async () => container.querySelectorAll('button')[1].click())
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
