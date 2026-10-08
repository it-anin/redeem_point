// Firestore จำลองในหน่วยความจำ — ไว้เทสต์ที่ต้องรัน "หลายหน้าจอจริงพร้อมกัน" (เช่น หน้าแอดมิน + มือถือพนักงาน) บนฐานข้อมูลเดียวกัน
// ใช้กับ jest.mock('firebase/firestore', () => require('./testUtils/fakeFirestore'))
//
// ⚠️ ไม่ใช่ของจริง: รองรับเฉพาะที่แอปใช้ (doc / collection / getDoc / getDocs / setDoc / updateDoc / deleteDoc / addDoc / runTransaction /
// onSnapshot / query + where '==' / orderBy / limit) และ "ไม่ตรวจ Security Rules" — rules + SDK จริงทดสอบที่ emulator-tests/run.mjs
// ที่เลียนแบบให้เหมือนของจริงเพราะมีผลต่อความถูกต้องของเทสต์: transaction เขียนทีเดียวตอนท้ายแบบ all-or-nothing (throw = ไม่มีอะไรถูกเขียน),
// listener ถูกแจ้ง "หลัง commit" เท่านั้น และได้ค่าปัจจุบันครั้งแรกแบบ async เหมือน SDK

const store = new Map()     // path → data
const listeners = new Map() // path → Set<fn>
let autoId = 0

const clone = (v) =>
  v instanceof Date ? new Date(v.getTime())
    : Array.isArray(v) ? v.map(clone)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]))
        : v

// ── เครื่องมือสำหรับเทสต์ ──
export const resetStore = () => { store.clear(); listeners.clear(); autoId = 0 }
export const seed = (path, data) => { store.set(path, clone(data)) }
export const read = (path) => (store.has(path) ? clone(store.get(path)) : undefined)
export const list = (col) => [...store.keys()].filter((p) => p.startsWith(col + '/')).map((p) => ({ id: p.slice(col.length + 1), ...clone(store.get(p)) }))

// ── อ้างอิงเอกสาร ──
const makeDoc = (col, id) => ({ __type: 'doc', col, id, path: `${col}/${id}` })
export const collection = (db, name) => ({ __type: 'col', name })
export const doc = (a, b, c) => (a && a.__type === 'col' ? makeDoc(a.name, `auto${++autoId}`) : makeDoc(b, c)) // doc(collectionRef) = id อัตโนมัติ
const snapOf = (ref) => ({
  id: ref.id,
  ref,
  exists: () => store.has(ref.path),
  data: () => (store.has(ref.path) ? clone(store.get(ref.path)) : undefined),
})

// ── query ──
export const where = (field, op, value) => ({ __type: 'where', field, op, value })
export const orderBy = () => ({ __type: 'orderBy' })
export const limit = () => ({ __type: 'limit' })
export const query = (col, ...cs) => ({ __type: 'query', name: col.name, wheres: cs.filter((c) => c.__type === 'where') })
export const getDocs = async (q) => {
  const wheres = q.wheres ?? []
  const docs = list(q.name)
    .filter((d) => wheres.every((w) => w.op === '==' && d[w.field] === w.value))
    .map((d) => snapOf(makeDoc(q.name, d.id)))
  return { docs, size: docs.length, empty: docs.length === 0 }
}
export const getCountFromServer = async (q) => ({ data: () => ({ count: (q.__type === 'query' || q.__type === 'col') ? list(q.name).length : 0 }) })
export const getDoc = async (ref) => snapOf(ref)

// ── เขียน / แจ้ง listener ──
const notify = (path) => { for (const fn of [...(listeners.get(path) ?? [])]) fn() }
export const setDoc = async (ref, data, opts) => {
  store.set(ref.path, opts?.merge ? { ...(store.get(ref.path) ?? {}), ...clone(data) } : clone(data))
  notify(ref.path)
}
export const updateDoc = async (ref, patch) => {
  if (!store.has(ref.path)) throw Object.assign(new Error('No document to update'), { code: 'not-found' })
  store.set(ref.path, { ...store.get(ref.path), ...clone(patch) })
  notify(ref.path)
}
export const deleteDoc = async (ref) => { store.delete(ref.path); notify(ref.path) }
export const addDoc = async (colRef, data) => { const ref = doc(colRef); await setDoc(ref, data); return ref }

// all-or-nothing: เขียนลงสำเนาก่อน ถ้าผ่านทั้งหมดค่อยแทนที่ของจริงแล้วแจ้ง listener (fn throw / update เอกสารที่ไม่มี = ไม่มีอะไรเปลี่ยน)
const applyWrites = (writes) => {
  const draft = new Map(store)
  for (const w of writes) {
    if (w.op === 'set') draft.set(w.ref.path, clone(w.data))
    else if (w.op === 'update') {
      if (!draft.has(w.ref.path)) throw Object.assign(new Error('No document to update'), { code: 'not-found' })
      draft.set(w.ref.path, { ...draft.get(w.ref.path), ...clone(w.data) })
    } else if (w.op === 'delete') draft.delete(w.ref.path)
  }
  store.clear()
  for (const [k, v] of draft) store.set(k, v)
  new Set(writes.map((w) => w.ref.path)).forEach(notify)
}
export const runTransaction = async (db, fn) => {
  const writes = []
  const tx = {
    get: async (ref) => snapOf(ref),
    set: (ref, data) => { writes.push({ op: 'set', ref, data }); return tx },
    update: (ref, data) => { writes.push({ op: 'update', ref, data }); return tx },
    delete: (ref) => { writes.push({ op: 'delete', ref }); return tx },
  }
  const result = await fn(tx)
  applyWrites(writes)
  return result
}
export const writeBatch = () => {
  const writes = []
  return {
    set(ref, data) { writes.push({ op: 'set', ref, data }) },
    update(ref, data) { writes.push({ op: 'update', ref, data }) },
    delete(ref) { writes.push({ op: 'delete', ref }) },
    async commit() { applyWrites(writes) },
  }
}

export const onSnapshot = (ref, onNext) => {
  const fn = () => onNext(snapOf(ref))
  if (!listeners.has(ref.path)) listeners.set(ref.path, new Set())
  listeners.get(ref.path).add(fn)
  Promise.resolve().then(fn) // ค่าปัจจุบันครั้งแรกแบบ async เหมือน SDK
  return () => listeners.get(ref.path)?.delete(fn)
}
