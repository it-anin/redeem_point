// ทดสอบส่วนที่เขียน "ยอดแต้ม" ด้วยโค้ดจริง (src/pointsDb.js, src/importHistoryDb.js) กับ Firestore emulator + firestore.rules จริงของโปรเจกต์
// ผ่าน client SDK เหมือนบนเว็บ — ไม่แตะ production (ใช้โปรเจกต์ demo-* ต่อ localhost เท่านั้น)
// รัน: npm run test:emulator   (ต้องมี Java + firebase-tools; ไม่รวมอยู่ใน `npm test`)
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, collection, getDocs, getDoc, doc, query, where } from 'firebase/firestore'

const src = (f) => new URL(`../src/${f}`, import.meta.url).href
const { importOne, rollbackOne } = await import(src('importHistoryDb.js'))
const { parsePaste, buildPlan, planRollback, makeBatchId, parseDate, sentinelId } = await import(src('importHistory.js'))
const { redeemReward, approveRedemption, rejectRedemption, deleteHistoryRow, editHistoryRow } = await import(src('pointsDb.js'))

const PROJECT = 'demo-anin-reward'
const FS_HOST = '127.0.0.1'
const FS_PORT = 8181
const AUTH_URL = 'http://127.0.0.1:9199'

let failures = 0
let checks = 0
const check = (name, cond, detail = '') => {
  checks++
  if (cond) console.log(`  PASS  ${name}`)
  else { failures++; console.log(`  FAIL  ${name} ${detail}`) }
}
const section = (t) => console.log(`\n== ${t}`)

// ── seed / ล้างข้อมูลผ่าน REST ของ emulator (ข้าม rules — rules ไม่ให้ client สร้าง admin คนแรกได้) ──
const toField = (v) =>
  v === null ? { nullValue: null }
    : v instanceof Date ? { timestampValue: v.toISOString() }
      : typeof v === 'boolean' ? { booleanValue: v }
        : typeof v === 'number' ? { integerValue: String(v) }
          : { stringValue: String(v) }
const REST = `http://${FS_HOST}:${FS_PORT}`
async function seed(path, obj) {
  const r = await fetch(`${REST}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toField(v)])) }),
  })
  if (!r.ok) throw new Error(`seed ${path}: ${await r.text()}`)
}
const clearAll = () => fetch(`${REST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' })

async function client(name, email) {
  const app = initializeApp({ apiKey: 'fake-key', projectId: PROJECT, authDomain: 'localhost' }, name)
  const auth = getAuth(app)
  connectAuthEmulator(auth, AUTH_URL, { disableWarnings: true })
  await createUserWithEmailAndPassword(auth, email, 'password123')
  const db = getFirestore(app)
  connectFirestoreEmulator(db, FS_HOST, FS_PORT)
  return db
}

const ALICE = 'alice@anin.test'
const BOB = 'bob@anin.test'
const CAROL = 'carol@anin.test'
const DAVE = 'dave@anin.test'
const EVE = 'eve@anin.test'
const person = (name, code, points, role = 'employee') => ({ name, code, points, role })
const PEOPLE = {
  'admin@anin.test': person('Admin', 'A001', 0, 'admin'),
  [ALICE]: person('Alice', 'E001', 1000),
  [BOB]: person('Bob', 'E002', 300),
  [CAROL]: person('Carol', 'E003', 0),
  [DAVE]: person('Dave', 'E004', 0),
  [EVE]: person('Eve', 'E005', 0),
}
const R1 = { name: 'เสื้อ', pointCost: 300, stock: 5, unlimited: false }
const R2 = { name: 'ของไม่จำกัด', pointCost: 100, stock: null, unlimited: true } // AdminRewards เก็บ stock: null สำหรับรางวัลไม่จำกัด

async function reset() {
  await clearAll()
  for (const [email, p] of Object.entries(PEOPLE)) await seed(`employees/${encodeURIComponent(email)}`, { ...p, email })
  await seed('rewards/r1', R1)
  await seed('rewards/r2', R2)
}

const adminDb = await client('admin', 'admin@anin.test')
const aliceDb = await client('alice', ALICE)
const eveDb = await client('eve', EVE)

const pts = async (email) => (await getDoc(doc(adminDb, 'employees', email))).data().points
const stock = async (id) => (await getDoc(doc(adminDb, 'rewards', id))).data().stock
const txDoc = async (id) => { const s = await getDoc(doc(adminDb, 'transactions', id)); return s.exists() ? s.data() : null }
const allTx = async () => (await getDocs(collection(adminDb, 'transactions'))).docs.map((d) => ({ id: d.id, ...d.data() }))
const txOf = async (email) => (await getDocs(query(collection(adminDb, 'transactions'), where('employeeId', '==', email)))).docs.map((d) => ({ id: d.id, ...d.data() }))
const errOf = async (fn) => { try { await fn(); return null } catch (e) { return e } }
const redeem = async (rewardId = 'r1', cost = 300, name = 'เสื้อ') =>
  (await redeemReward(aliceDb, { email: ALICE, name: 'Alice', reward: { id: rewardId, name, pointCost: cost }, proofUrl: null })).txId

// ════════════════════════════════════════════════════════════════════════
section('A) แลกรางวัล (redeemReward)')
await reset()
let id = await redeem()
check('แลกปกติ: แต้ม 1000→700, สต็อก 5→4, แถวรออนุมัติบันทึกราคา 300', (await pts(ALICE)) === 700 && (await stock('r1')) === 4)
let row = await txDoc(id)
check('แถวประวัติ: pointsUsed 300, approval รออนุมัติ, rewardId r1, employeeId alice', row.pointsUsed === 300 && row.approval === 'รออนุมัติ' && row.rewardId === 'r1' && row.employeeId === ALICE)

await reset()
await seed('rewards/r1', { ...R1, pointCost: 500 }) // แอดมินขึ้นราคาระหว่างที่พนักงานเปิดหน้าค้าง (หน้าจอยังเห็น 300)
let e = await errOf(() => redeem('r1', 300))
check('ราคาเปลี่ยน (ฐานข้อมูล 500 / หน้าจอ 300) → PRICE_CHANGED และไม่เขียนอะไรเลย', e?.code === 'PRICE_CHANGED' && (await pts(ALICE)) === 1000 && (await stock('r1')) === 5 && (await allTx()).length === 0, `${e?.code}`)
id = await redeem('r1', 500)
check('แลกด้วยราคาใหม่ 500 ผ่าน และบันทึก pointsUsed 500', (await pts(ALICE)) === 500 && (await txDoc(id)).pointsUsed === 500)

await reset()
await seed(`employees/${encodeURIComponent(ALICE)}`, { ...PEOPLE[ALICE], email: ALICE, points: 100 })
e = await errOf(() => redeem())
check('แต้มไม่พอ → error "แต้มไม่พอ" ไม่เขียนอะไร', e?.message === 'แต้มไม่พอ' && (await pts(ALICE)) === 100 && (await allTx()).length === 0)

await reset()
await seed('rewards/r1', { ...R1, stock: 0 })
e = await errOf(() => redeem())
check('ของหมด → error "ของหมดแล้ว" (ข้อความที่หน้าจอพนักงานรอจับ) ไม่หักแต้ม', e?.message === 'ของหมดแล้ว' && (await pts(ALICE)) === 1000)

await reset()
id = await redeem('r2', 100, 'ของไม่จำกัด')
check('รางวัลไม่จำกัด: หักแต้มแต่ไม่แตะสต็อก (ยัง null)', (await pts(ALICE)) === 900 && (await stock('r2')) === null)

// ════════════════════════════════════════════════════════════════════════
section('B) อนุมัติ / ปฏิเสธ (approveRedemption / rejectRedemption)')
await reset()
id = await redeem()
let res = await rejectRedemption(adminDb, id)
check('ปฏิเสธ: คืนแต้ม 700→1000, คืนสต็อก 4→5, สถานะ ปฏิเสธ', (await pts(ALICE)) === 1000 && (await stock('r1')) === 5 && (await txDoc(id)).approval === 'ปฏิเสธ' && res.balance === 1000)
e = await errOf(() => rejectRedemption(adminDb, id))
check('ปฏิเสธซ้ำจากหน้าค้าง → STALE (current = ปฏิเสธ) และไม่คืนแต้ม/สต็อกซ้ำ  [เดิมได้ 1300/6]', e?.code === 'STALE' && e.current === 'ปฏิเสธ' && (await pts(ALICE)) === 1000 && (await stock('r1')) === 5, `${e?.code} ${await pts(ALICE)}`)
e = await errOf(() => approveRedemption(adminDb, id))
check('อนุมัติทับแถวที่ปฏิเสธไปแล้ว → STALE และแถวยังเป็น ปฏิเสธ', e?.code === 'STALE' && (await txDoc(id)).approval === 'ปฏิเสธ')

await reset()
id = await redeem()
await approveRedemption(adminDb, id)
check('อนุมัติ: สถานะ อนุมัติแล้ว แต้ม/สต็อกไม่เปลี่ยน', (await txDoc(id)).approval === 'อนุมัติแล้ว' && (await pts(ALICE)) === 700 && (await stock('r1')) === 4)
e = await errOf(() => approveRedemption(adminDb, id))
check('อนุมัติซ้ำ → STALE', e?.code === 'STALE' && e.current === 'อนุมัติแล้ว')
e = await errOf(() => rejectRedemption(adminDb, id))
check('ปฏิเสธแถวที่อนุมัติไปแล้ว (หน้าค้าง) → STALE และไม่คืนแต้ม', e?.code === 'STALE' && (await pts(ALICE)) === 700 && (await stock('r1')) === 4)

e = await errOf(() => approveRedemption(adminDb, 'no-such-id'))
check('แถวที่ไม่มีแล้ว → GONE', e?.code === 'GONE')

await reset()
id = await redeem()
await seed(`transactions/${id}`, { ...(await txDoc(id)), createdAt: new Date(), pointsUsed: 250 }) // แอดมินอีกคนแก้เป็น 250 ไปแล้ว (หน้าค้างยังเห็น 300)
await rejectRedemption(adminDb, id)
check('ปฏิเสธคืนแต้มตาม pointsUsed ล่าสุดในฐานข้อมูล (250) ไม่ใช่ค่าที่หน้าค้าง (300)', (await pts(ALICE)) === 700 + 250, String(await pts(ALICE)))

await reset()
id = await redeem('r2', 100, 'ของไม่จำกัด')
await rejectRedemption(adminDb, id)
check('ปฏิเสธรางวัลไม่จำกัด: คืนแต้ม แต่สต็อกยัง null (เดิมกลายเป็น 1)', (await pts(ALICE)) === 1000 && (await stock('r2')) === null)

// ════════════════════════════════════════════════════════════════════════
section('C) ลบ / แก้แถวในหน้า ประวัติทั้งหมด (deleteHistoryRow / editHistoryRow)')
await reset()
id = await redeem()
await rejectRedemption(adminDb, id)
res = await deleteHistoryRow(adminDb, id)
check('ลบแถวที่ปฏิเสธแล้ว: แต้ม/สต็อกคงเดิม (1000/5) แถวหาย  [เดิมได้ 1300/6]', res.rejected === true && res.refund === 0 && (await pts(ALICE)) === 1000 && (await stock('r1')) === 5 && (await txDoc(id)) === null, `${await pts(ALICE)}/${await stock('r1')}`)

await reset()
id = await redeem()
res = await deleteHistoryRow(adminDb, id)
check('ลบแถวรออนุมัติ: คืนแต้ม 700→1000 และคืนสต็อก 4→5', res.refund === 300 && res.restocked === true && (await pts(ALICE)) === 1000 && (await stock('r1')) === 5)
e = await errOf(() => deleteHistoryRow(adminDb, id))
check('ลบซ้ำจากหน้าค้าง → GONE และไม่คืนซ้ำ', e?.code === 'GONE' && (await pts(ALICE)) === 1000 && (await stock('r1')) === 5)

await reset()
await seed('transactions/legacy-add', { employeeId: ALICE, employeeName: 'Alice', rewardId: null, rewardName: 'โบนัส', pointsUsed: -500, addedByAdmin: true, approval: 'อนุมัติแล้ว', status: 'สำเร็จ', createdAt: new Date() })
res = await deleteHistoryRow(adminDb, 'legacy-add')
check('ลบแถวเพิ่มแต้ม (pointsUsed ติดลบ): หักแต้มที่เคยเพิ่มออก 1000→500, ไม่แตะสต็อก', res.refund === -500 && res.restocked === false && (await pts(ALICE)) === 500)

await reset()
id = await redeem('r2', 100, 'ของไม่จำกัด')
res = await deleteHistoryRow(adminDb, id)
check('ลบแถวรางวัลไม่จำกัด: คืนแต้มแต่ไม่แตะสต็อก', res.restocked === false && (await pts(ALICE)) === 1000 && (await stock('r2')) === null)

await reset()
id = await redeem()
await rejectRedemption(adminDb, id)
res = await editHistoryRow(adminDb, id, { effect: -100, rewardName: 'เสื้อ', note: 'แก้ตัวเลข' })
check('แก้แถวที่ปฏิเสธแล้ว: เก็บตัวเลขใหม่ (pointsUsed 100) แต่ยอดแต้มไม่ขยับ  [เดิมยอดเพี้ยน]', res.rejected === true && res.delta === 0 && res.balance === null && (await txDoc(id)).pointsUsed === 100 && (await pts(ALICE)) === 1000)

await reset()
await seed('transactions/admin-red', { employeeId: ALICE, employeeName: 'Alice', rewardId: null, rewardName: 'ของขวัญ', pointsUsed: 100, addedByAdmin: true, approval: 'อนุมัติแล้ว', status: 'สำเร็จ', createdAt: new Date() })
res = await editHistoryRow(adminDb, 'admin-red', { effect: -150, rewardName: 'ของขวัญ', note: '' })
check('แก้รายการแลกปกติ 100→150: หักเพิ่ม 50 (1000→950) pointsUsed = 150', res.delta === -50 && res.balance === 950 && (await txDoc('admin-red')).pointsUsed === 150 && (await pts(ALICE)) === 950)
res = await editHistoryRow(adminDb, 'admin-red', { effect: -120, rewardName: 'ของขวัญ', note: '' }) // แอดมินอีกคน (หน้าค้างที่ยังเห็น 100) แก้เป็น 120
check('แก้ซ้ำจากหน้าค้าง: ส่วนต่างคิดจากค่าล่าสุดในฐานข้อมูล (150→120 = +30) ไม่ใช่ค่าที่หน้าค้าง', res.oldEffect === -150 && res.delta === 30 && (await pts(ALICE)) === 980, `${res.delta} ${await pts(ALICE)}`)
e = await errOf(() => editHistoryRow(adminDb, 'admin-red', { effect: NaN, rewardName: 'x', note: '' }))
check('แก้ด้วยค่าที่ไม่ใช่ตัวเลข → ปฏิเสธก่อนเขียน', e?.message === 'แต้มต้องเป็นตัวเลข' && (await pts(ALICE)) === 980)
e = await errOf(() => editHistoryRow(adminDb, 'no-such-id', { effect: -1, rewardName: 'x', note: '' }))
check('แก้แถวที่ไม่มีแล้ว → GONE', e?.code === 'GONE')

// ════════════════════════════════════════════════════════════════════════
section('D) สิทธิ์: พนักงานทั่วไปทำการของแอดมินไม่ได้ และไม่มีอะไรถูกเขียน')
await reset()
id = await redeem()
const deniedAll = []
for (const [label, fn] of [
  ['approve', () => approveRedemption(eveDb, id)],
  ['reject', () => rejectRedemption(eveDb, id)],
  ['delete', () => deleteHistoryRow(eveDb, id)],
  ['edit', () => editHistoryRow(eveDb, id, { effect: -1, rewardName: 'x', note: '' })],
]) deniedAll.push([label, (await errOf(fn))?.code])
check('eve: approve/reject/delete/edit ถูกปฏิเสธทั้งหมด (permission-denied)', deniedAll.every(([, c]) => c === 'permission-denied'), JSON.stringify(deniedAll))
check('ข้อมูลไม่เปลี่ยน (แต้ม 700, สต็อก 4, แถวเดิม)', (await pts(ALICE)) === 700 && (await stock('r1')) === 4 && (await txDoc(id)).approval === 'รออนุมัติ')

// ════════════════════════════════════════════════════════════════════════
section('E) เครื่องมือนำเข้าประวัติ (importOne / rollbackOne)')
await reset()
const cutoff = parseDate('31/12/2025').value
const row6 = (...c) => c.join('\t')
const paste = [
  row6('E001', 'บัตรกำนัล', 1500, 200, '15/03/2024'),
  row6('E001', 'เสื้อ', 1500, 350, '02/06/2024'),
  row6('E001', 'แก้วน้ำ', 1500, 100),
  row6('E002', 'ของขวัญ', 2000, 500, '10/01/2025'),
  ...Array.from({ length: 60 }, (_, i) => row6('E003', `ของชิ้นที่ ${i + 1}`, 1000, 10)),
].join('\n')
const loadEmployees = async () => (await getDocs(collection(adminDb, 'employees'))).docs.map((d) => ({ id: d.id, ...d.data() }))
const planOf = async (text) => buildPlan({ rows: parsePaste(text).rows, employees: await loadEmployees(), pending: [], transactions: await allTx() })

await seed(`employees/${encodeURIComponent(ALICE)}`, { ...PEOPLE[ALICE], email: ALICE, points: 0 })
let plan = await planOf(paste)
check('พรีวิว: ok 3 คน ไม่มี error', plan.summary.ok === 3 && plan.summary.error === 0, JSON.stringify(plan.summary))
const batchId = makeBatchId()
await seed(`employees/${encodeURIComponent(BOB)}`, { ...PEOPLE[BOB], email: BOB, points: 450 }) // ยอด bob เปลี่ยนหลังทำพรีวิว → ต้องใช้ยอดที่อ่านใน transaction
for (const item of plan.items.filter((i) => i.status === 'ok')) {
  const err = await errOf(() => importOne(adminDb, item, batchId, cutoff))
  if (err) check(`importOne ${item.label}`, false, `${err.code} ${err.message}`)
}
let alice = await txOf(ALICE)
check('alice: ยอด 1500−650=850, 4 แถว, แถวยอดยกมา id คงที่ pointsUsed −1500 ไม่มี addedByAdmin', (await pts(ALICE)) === 850 && alice.length === 4 && alice.find((t) => t.id === sentinelId(ALICE))?.pointsUsed === -1500 && !alice.find((t) => t.id === sentinelId(ALICE)).addedByAdmin)
check('alice: รายการแลก 3 แถว addedByAdmin/อนุมัติแล้ว/rewardId null/imported และวันที่เป็น Timestamp ตรงปี', alice.filter((t) => t.addedByAdmin).length === 3 && alice.filter((t) => t.addedByAdmin).every((t) => t.approval === 'อนุมัติแล้ว' && t.rewardId === null && t.imported === true) && alice.find((t) => t.rewardName === 'บัตรกำนัล').createdAt.toDate().getFullYear() === 2024)
const bobRows = await txOf(BOB)
const clear = bobRows.find((t) => t.rewardName === 'ล้างยอดเดิมก่อนนำเข้าประวัติ')
check('bob: ยอดสุดท้าย 2000−500=1500 และแถวล้างยอดเดิมใช้ยอดจริงใน transaction (450 ไม่ใช่ 300)', (await pts(BOB)) === 1500 && clear?.pointsUsed === 450)
check('carol 60 รายการ (62 doc ใน transaction เดียว): ยอด 400, 61 แถว', (await pts(CAROL)) === 400 && (await txOf(CAROL)).length === 61)

plan = await planOf(paste)
check('นำเข้าซ้ำ: พรีวิวเป็น skip ทั้ง 3 คน', plan.summary.skip === 3 && plan.summary.ok === 0)
const forced = { ...plan.items.find((i) => i.label === 'Alice'), status: 'ok' }
const before = { p: await pts(ALICE), n: (await allTx()).length }
e = await errOf(() => importOne(adminDb, forced, makeBatchId(), cutoff))
check('บังคับนำเข้าซ้ำ (สองแอดมินกดพร้อมกัน) → ALREADY ไม่เปลี่ยนอะไร', e?.code === 'ALREADY' && (await pts(ALICE)) === before.p && (await allTx()).length === before.n)
e = await errOf(() => importOne(eveDb, forced, makeBatchId(), cutoff))
check('พนักงานทั่วไปนำเข้าไม่ได้ (permission-denied)', e?.code === 'permission-denied', `${e?.code}`)

// ย้อนชุด: alice แลกต่อหลังนำเข้า → ยอดไม่ตรงกับที่ชุดตั้งไว้ → ย้อนคนนี้ไม่ได้ (CHANGED) ส่วน bob/carol ย้อนได้
await redeem('r1', 300)
const groups = planRollback(await allTx(), batchId)
const outcome = {}
for (const g of groups) outcome[g.employeeId] = (await errOf(() => rollbackOne(adminDb, g)))?.code ?? 'ok'
check('ย้อนชุดหลังมีการแลกต่อ: alice = CHANGED (ไม่แตะ), bob/carol = ok', outcome[ALICE] === 'CHANGED' && outcome[BOB] === 'ok' && outcome[CAROL] === 'ok', JSON.stringify(outcome))
check('alice ไม่ถูกแตะ: ยอด 850−300=550 และแถวชุดยังอยู่ครบ + แถวที่แลกต่อ', (await pts(ALICE)) === 550 && (await txOf(ALICE)).length === 5)
check('bob กลับเป็น 450 (ยอดก่อนนำเข้าจริง) และ carol กลับเป็น 0 แถวของชุดหายหมด', (await pts(BOB)) === 450 && (await pts(CAROL)) === 0 && (await txOf(BOB)).length === 0 && (await txOf(CAROL)).length === 0)

// ย้อนชุดที่ไม่มีใครแตะยอดต่อ → กลับเท่าเดิมทุกคน และนำเข้าใหม่ได้
await reset()
await seed(`employees/${encodeURIComponent(ALICE)}`, { ...PEOPLE[ALICE], email: ALICE, points: 0 })
await seed(`employees/${encodeURIComponent(BOB)}`, { ...PEOPLE[BOB], email: BOB, points: 450 })
plan = await planOf(paste)
const batch2 = makeBatchId()
for (const item of plan.items.filter((i) => i.status === 'ok')) await importOne(adminDb, item, batch2, cutoff)
for (const g of planRollback(await allTx(), batch2)) await rollbackOne(adminDb, g)
check('ย้อนชุดที่ไม่มีใครแตะยอดต่อ: alice 0, bob 450, carol 0 และไม่เหลือแถว', (await pts(ALICE)) === 0 && (await pts(BOB)) === 450 && (await pts(CAROL)) === 0 && (await allTx()).length === 0)
plan = await planOf(paste)
check('หลังย้อน: นำเข้าใหม่ได้อีกครั้ง (พรีวิว ok 3 คน)', plan.summary.ok === 3)

// เพดานต่อคน: 400 รายการ = 402 doc ใน transaction เดียว
await reset()
const big = Array.from({ length: 400 }, (_, i) => row6('E004', `ของ ${i + 1}`, 5000, 5)).join('\n')
const bigPlan = await planOf(big)
const out = await importOne(adminDb, bigPlan.items[0], makeBatchId(), cutoff)
check('400 รายการในคนเดียว (402 doc ใน transaction เดียว) เขียนผ่าน rules จริง: 401 แถว ยอด 3000', out.rows.length === 401 && (await pts(DAVE)) === 3000)

console.log(`\n${failures === 0 ? `ALL PASSED (${checks} checks)` : `${failures} FAILED of ${checks} checks`}`)
process.exit(failures === 0 ? 0 : 1)
