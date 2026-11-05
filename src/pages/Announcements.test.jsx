import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { getDocs } from 'firebase/firestore'
import Announcements from './Announcements'

jest.mock('../firebase', () => ({ db: {} }))
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { email: 'employee@example.com' } }) }))
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), query: jest.fn(), orderBy: jest.fn(), getDocs: jest.fn(),
}))

describe('employee announcements', () => {
  let container
  let root

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    jest.resetAllMocks()
  })

  it('shows multiple announcements, navigates between them, and retains PDF links', async () => {
    getDocs.mockResolvedValue({ docs: [
      { id: 'new', data: () => ({ title: 'ประกาศล่าสุด', body: 'เนื้อหาแรก', pdfUrl: 'https://example.com/upload/test.pdf', pdfName: 'test.pdf' }) },
      { id: 'old', data: () => ({ title: 'ประกาศก่อนหน้า', body: 'เนื้อหาสอง' }) },
    ] })
    await act(async () => root.render(<Announcements />))

    const list = container.querySelector('.announcements-list')
    expect(list.querySelectorAll('article')).toHaveLength(2)
    expect(list.textContent).toContain('ประกาศล่าสุด')
    expect(list.textContent).toContain('ประกาศก่อนหน้า')
    expect(list.querySelector('a').getAttribute('href')).toBe('https://example.com/upload/test.pdf')
    expect(container.textContent).toContain('ประกาศ 1 / 2')

    list.scrollTo = jest.fn()
    list.getBoundingClientRect = () => ({ left: 0 })
    list.children[0].getBoundingClientRect = () => ({ left: -300 })
    list.children[1].getBoundingClientRect = () => ({ left: 0 })
    await act(async () => list.dispatchEvent(new Event('scroll', { bubbles: true })))
    expect(container.textContent).toContain('ประกาศ 2 / 2')
    expect(container.querySelector('[aria-label="ประกาศถัดไป"]').disabled).toBe(true)

    await act(async () => container.querySelector('[aria-label="ประกาศก่อนหน้า"]').click())
    expect(list.scrollTo).toHaveBeenCalledWith({ left: -300, behavior: 'smooth' })
    expect(container.textContent).toContain('ประกาศ 1 / 2')
  })

  it('shows a single announcement without unnecessary navigation controls', async () => {
    getDocs.mockResolvedValue({ docs: [{ id: 'only', data: () => ({ title: 'ประกาศเดียว', body: 'รายละเอียด' }) }] })
    await act(async () => root.render(<Announcements />))
    expect(container.textContent).toContain('ประกาศเดียว')
    expect(container.querySelector('.announcements-navigation')).toBeNull()
  })
})
