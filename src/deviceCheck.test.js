import { isDesktopDevice } from './deviceCheck'

// env ปลอม: UA + maxTouchPoints + ผลของ media query ที่ตั้งไว้ + (ทางเลือก) userAgentData.mobile ของ Chromium
const env = ({ ua, touch = 0, coarse = false, hoverNone = false, uaMobile, noMatchMedia = false }) => ({
  navigator: {
    userAgent: ua,
    maxTouchPoints: touch,
    ...(uaMobile === undefined ? {} : { userAgentData: { mobile: uaMobile } }),
  },
  ...(noMatchMedia ? {} : {
    matchMedia: (q) => ({ matches: (q === '(pointer: coarse)' && coarse) || (q === '(hover: none)' && hoverNone) }),
  }),
})

const UA = {
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  linuxChrome: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  androidWebView: 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36',
  lineIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/14.5.0',
  // แท็บเล็ต Android: มี "Android" แต่ไม่มี "Mobile"
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
}

describe('isDesktopDevice — เป็นคอมพิวเตอร์ (ควรถูกบล็อก)', () => {
  test.each([
    ['Windows Chrome + เมาส์', env({ ua: UA.winChrome, uaMobile: false })],
    ['Windows Edge', env({ ua: UA.winEdge, uaMobile: false })],
    ['Windows Firefox (ไม่มี userAgentData)', env({ ua: UA.winFirefox })],
    ['Mac Safari (maxTouchPoints = 0)', env({ ua: UA.macSafari })],
    ['Linux Chrome', env({ ua: UA.linuxChrome, uaMobile: false })],
    ['โน้ตบุ๊กจอทัช: ตัวชี้หลักยังเป็นเมาส์/ทัชแพด (UA Windows + maxTouchPoints 10 + pointer: fine)', env({ ua: UA.winChrome, uaMobile: false, touch: 10 })],
  ])('%s', (_name, e) => {
    expect(isDesktopDevice(e)).toBe(true)
  })

  test('ไม่มี matchMedia (เช่น jsdom/เบราว์เซอร์เก่า): ไม่ throw และยังตัดสินจาก UA ได้', () => {
    expect(isDesktopDevice(env({ ua: UA.winChrome, noMatchMedia: true }))).toBe(true)
  })
})

describe('isDesktopDevice — มือถือ/แท็บเล็ต (ต้องผ่าน)', () => {
  test.each([
    ['iPhone Safari', env({ ua: UA.iphoneSafari, touch: 5, coarse: true, hoverNone: true })],
    ['Android Chrome (userAgentData.mobile = true)', env({ ua: UA.androidChrome, uaMobile: true, touch: 5, coarse: true, hoverNone: true })],
    ['Android WebView', env({ ua: UA.androidWebView, touch: 5, coarse: true, hoverNone: true })],
    ['เบราว์เซอร์ในแอป LINE (iOS)', env({ ua: UA.lineIos, touch: 5, coarse: true, hoverNone: true })],
    ['แท็บเล็ต Android (UA มี Android ไม่มี Mobile)', env({ ua: UA.androidTablet, uaMobile: false, touch: 5, coarse: true, hoverNone: true })],
  ])('%s', (_name, e) => {
    expect(isDesktopDevice(e)).toBe(false)
  })

  test('iPad ที่ขอเว็บเวอร์ชันเดสก์ท็อป: UA เป็น Macintosh แต่ maxTouchPoints > 1 (แยกจากสัญญาณ pointer)', () => {
    expect(isDesktopDevice(env({ ua: UA.macSafari, touch: 5 }))).toBe(false)
  })

  test('มือถือที่กด "ขอเว็บเวอร์ชันเดสก์ท็อป" (UA เป็น Linux, userAgentData.mobile = false) ยังผ่านเพราะเป็นทัช', () => {
    expect(isDesktopDevice(env({ ua: UA.linuxChrome, uaMobile: false, touch: 5, coarse: true, hoverNone: true }))).toBe(false)
  })

  test('มีแค่ (hover: none) อย่างเดียว ก็ถือว่าไม่ใช่คอมพิวเตอร์', () => {
    expect(isDesktopDevice(env({ ua: UA.winChrome, uaMobile: false, hoverNone: true }))).toBe(false)
  })

  test('ไม่มี matchMedia แต่ UA เป็นมือถือ: ผ่าน', () => {
    expect(isDesktopDevice(env({ ua: UA.iphoneSafari, noMatchMedia: true }))).toBe(false)
  })
})

describe('isDesktopDevice — กรณีขอบ', () => {
  test('ไม่มี window (env = null): ไม่บล็อก', () => {
    expect(isDesktopDevice(null)).toBe(false)
  })

  test('ใช้ window จริงของ jsdom เป็นค่าเริ่มต้นได้โดยไม่ throw', () => {
    expect(() => isDesktopDevice()).not.toThrow()
  })
})
