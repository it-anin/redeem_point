// ตรรกะล้วน (ไม่แตะ Firebase) ของเครื่องมือ "นำเข้าประวัติการแลกย้อนหลัง" — แยกไว้ให้เทสต์ได้ (importHistory.test.js)
//
// ข้อมูลที่วาง (คั่นด้วย Tab, คัดลอกจาก Excel): พนักงาน | ชื่อรางวัล | คะแนนทั้งหมด | คะแนนที่ใช้แลก | วันที่ (ไม่บังคับ) | คงเหลือ (ไม่บังคับ แต่แนะนำ)
// "คงเหลือ" จากไฟล์เก่าใช้ "ตรวจ" เท่านั้น: ถ้าไม่เท่ากับ ทั้งหมด − ใช้แลกรวม (รายการแลกขาด/เกิน) จะข้ามคนนั้น ไม่ตั้งยอดผิดเงียบๆ
//
// กติกา: ยอดคงเหลือใหม่ของพนักงาน = คะแนนทั้งหมด (T) − ผลรวมที่ใช้แลก (ΣU) เป๊ะ (ทับยอดเดิม) โดยเขียนแถวใน transactions ให้ยอดสอดคล้องกับประวัติ:
//   • "ยอดยกมา"   pointsUsed = −T                  (ผลต่อยอด +T; doc ID คงที่ = ตัวกันนำเข้าซ้ำ)
//   • "ล้างยอดเดิม" pointsUsed = +ยอดปัจจุบัน        (เฉพาะเมื่อยอดปัจจุบัน ≠ 0 → ยอดสุดท้ายเท่ากับ T−ΣU ไม่ว่ายอดเดิมเป็นเท่าไร)
//   • "รายการแลก"  pointsUsed = +u แต่ละรายการ      (addedByAdmin → ขึ้นประวัติมือถือพนักงาน)
// เครื่องหมาย pointsUsed ตามข้อตกลงใน CLAUDE.md: บวก = ใช้แต้ม, ลบ = ได้รับ, ผลต่อยอด = −pointsUsed

export const OPENING_NAME = 'ยอดยกมาจากระบบเก่า'
export const CLEAR_NAME = 'ล้างยอดเดิมก่อนนำเข้าประวัติ'
// doc ID ของแถว "ยอดยกมา" — คงที่ต่อพนักงาน ใช้เป็นตัวกันนำเข้าซ้ำ (อ่านใน transaction: ถ้ามีแล้ว = ข้ามคนนั้น)
export const sentinelId = (email) => `imp_${email}`

const hasDigit = (s) => /[0-9๐-๙]/.test(s ?? '')
const toLatinDigits = (s) => String(s ?? '').replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

// ── อ่านค่าแต้ม ──
// { value } | { blank: true } | { error }
export function parsePoints(raw) {
  const t = toLatinDigits(raw).replace(/[,\s]/g, '')
  if (t === '') return { blank: true }
  if (!/^\d+(\.\d+)?$/.test(t)) return { error: `"${String(raw).trim()}" ไม่ใช่ตัวเลข (ต้องเป็นเลขบวก)` }
  const n = Number(t)
  if (!Number.isSafeInteger(n)) return { error: `"${String(raw).trim()}" ต้องเป็นจำนวนเต็ม` }
  return { value: n }
}

// ── อ่านวันที่ ── รองรับ d/m/yyyy, d-m-yyyy, d.m.yyyy, yyyy-mm-dd (ค.ศ. หรือ พ.ศ.) — ถือแบบไทย วัน/เดือน/ปี
// คืนเวลา 12:00 น. ตามเวลาเครื่อง (กันวันเลื่อนข้ามเขตเวลา)
// { value: Date } | { blank: true } | { error }
export function parseDate(raw, { now = new Date() } = {}) {
  const s = toLatinDigits(raw).trim()
  if (s === '') return { blank: true }
  const token = s.split(/[\sT]/)[0] // ตัดเวลาท้ายออก เช่น "15/03/2024 10:30" หรือ "2024-03-15T00:00:00"
  let y, m, d, mt
  if ((mt = token.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) { y = +mt[1]; m = +mt[2]; d = +mt[3] }
  else if ((mt = token.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) { d = +mt[1]; m = +mt[2]; y = +mt[3] }
  else return { error: `วันที่ "${String(raw).trim()}" อ่านไม่ได้ (ใช้ วัน/เดือน/ปี 4 หลัก เช่น 15/03/2024 หรือ 2024-03-15)` }
  if (y >= 2400) y -= 543 // พ.ศ. → ค.ศ.
  if (y < 2000) return { error: `วันที่ "${String(raw).trim()}" ปีผิดปกติ` }
  const date = new Date(y, m - 1, d, 12, 0, 0, 0)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return { error: `วันที่ "${String(raw).trim()}" ไม่มีอยู่จริง` }
  }
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  if (date.getTime() > endOfToday.getTime()) return { error: `วันที่ "${String(raw).trim()}" อยู่ในอนาคต` }
  return { value: date }
}

// ── แยกข้อความที่วาง เป็นแถว ──
// แถวแรกที่คอลัมน์ "คะแนน" ทั้งสองไม่มีตัวเลขเลย (เช่น "คะแนนทั้งหมด") ถือเป็นหัวตาราง → ข้าม (คืนข้อความไว้ให้ UI โชว์)
const looksLikeHeader = (c) => Boolean(c[2] || c[3]) && !hasDigit(c[2]) && !hasDigit(c[3])

function parseRow(cells, line, now) {
  const [employeeKey = '', rewardName = '', totalRaw = '', usedRaw = '', dateRaw = '', remainingRaw = ''] = cells
  const errors = []
  const t = parsePoints(totalRaw)
  const u = parsePoints(usedRaw)
  const dt = parseDate(dateRaw, { now })
  const rm = parsePoints(remainingRaw)
  if (!employeeKey) errors.push('ไม่มีรหัส/อีเมล/ชื่อพนักงาน')
  if (t.error) errors.push(`คะแนนทั้งหมด: ${t.error}`)
  if (u.error) errors.push(`คะแนนที่ใช้แลก: ${u.error}`)
  if (dt.error) {
    // ไฟล์ที่ไม่มีคอลัมน์วันที่ มักเอา "คงเหลือ" มาไว้คอลัมน์ที่ 5 — บอกทางแก้แทนที่จะแค่ว่าอ่านวันที่ไม่ได้
    errors.push(/^[\d,]+$/.test(String(dateRaw).trim())
      ? `วันที่: "${String(dateRaw).trim()}" เป็นตัวเลขล้วน — ถ้าเป็น "คงเหลือ" ให้ย้ายไปคอลัมน์ที่ 6 (คอลัมน์ที่ 5 คือวันที่ เว้นว่างได้)`
      : `วันที่: ${dt.error}`)
  }
  if (rm.error) errors.push(`คงเหลือ: ${rm.error}`)
  const used = u.value ?? 0
  if (!rewardName && used > 0) errors.push('มีคะแนนที่ใช้แลกแต่ไม่มีชื่อรางวัล')
  return { line, employeeKey, rewardName, total: t.value ?? null, used, date: dt.value ?? null, remaining: rm.value ?? null, errors }
}

export function parsePaste(text, { now = new Date() } = {}) {
  const rows = []
  let header = null
  let first = true
  String(text ?? '').split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return
    const cells = raw.split('\t').map((c) => c.trim())
    if (first) {
      first = false
      if (looksLikeHeader(cells)) { header = raw.trim(); return }
    }
    rows.push(parseRow(cells, i + 1, now))
  })
  return { rows, header }
}

// ── จับคู่พนักงาน: รหัส → อีเมล → ชื่อ (ไม่สนตัวพิมพ์เล็ก/ใหญ่/ช่องว่างซ้ำ) ──
function indexEmployees(employees) {
  const idx = { code: new Map(), email: new Map(), name: new Map() }
  const add = (map, key, emp) => {
    const k = norm(key)
    if (k) map.set(k, [...(map.get(k) ?? []), emp])
  }
  for (const e of employees) {
    add(idx.code, e.code, e)
    add(idx.email, e.email || e.id, e)
    add(idx.name, e.name, e)
  }
  return idx
}

function matchEmployee(key, idx) {
  const k = norm(key)
  for (const by of ['code', 'email', 'name']) {
    const hits = idx[by].get(k)
    if (hits) return hits.length === 1 ? { emp: hits[0], by } : { ambiguous: hits, by }
  }
  return null
}

const findPending = (key, pending) => {
  const k = norm(key)
  return pending.find((p) => norm(p.code ?? p.id) === k) ?? pending.find((p) => norm(p.name) === k) ?? null
}

const STATUS_RANK = { error: 0, ok: 1, skip: 2 }
const MAX_REDEMPTIONS_PER_PERSON = 400

// "คงเหลือ" ในไฟล์เก่าไม่ตรงกับ ทั้งหมด − ใช้แลกรวม → บอกว่ารายการแลกขาด/เกินเท่าไร (เจอบ่อยสุดคือรายการหายไปบางรายการ)
function remainingMismatch(total, used, remaining) {
  if (remaining > total) return `คงเหลือในไฟล์ ${fmt(remaining)} มากกว่าคะแนนทั้งหมด ${fmt(total)} — ข้อมูลไม่สอดคล้อง`
  const expectedUsed = total - remaining
  const diff = Math.abs(expectedUsed - used)
  const missing = used < expectedUsed
  return `คงเหลือในไฟล์ ${fmt(remaining)} ไม่ตรง: ทั้งหมด − คงเหลือ = ${fmt(total)} − ${fmt(remaining)} = ${fmt(expectedUsed)} ` +
    `แต่รายการแลกรวมได้ ${fmt(used)} (${missing ? 'รายการขาดไป' : 'รายการเกินมา'} ${fmt(diff)}) — ` +
    (missing ? 'ตรวจรายการที่หายไป หรือเพิ่มแถวชดเชย (เช่น "ใช้แลก (ไม่มีรายละเอียด)") ให้ครบ' : 'ตรวจว่ามีรายการซ้ำหรือแต้มผิดหรือไม่')
}

// ── สร้างแผนนำเข้าต่อพนักงาน (ใช้ทำพรีวิว) ──
// rows: จาก parsePaste · employees: ทุกคนใน employees (รวม admin ไว้ตรวจ) · pending: pendingEmployees (ไว้บอกว่า "ยังไม่ผูกบัญชี")
// transactions: ที่โหลดอยู่ในหน้า (ไว้เช็คว่านำเข้าไปแล้ว/มีประวัติเดิม)
// คืน { items, summary } — item.status: 'ok' (นำเข้าได้) | 'error' (ติดปัญหา ข้าม) | 'skip' (ไม่มีอะไรต้องทำ/นำเข้าแล้ว)
export function buildPlan({ rows, employees = [], pending = [], transactions = [] }) {
  const idx = indexEmployees(employees)
  const txIds = new Set(transactions.map((t) => t.id))
  const legacyCount = new Map() // employeeId → จำนวนแถวประวัติเดิมที่ไม่ได้มาจากการนำเข้า
  for (const t of transactions) {
    if (t.employeeId && !t.imported) legacyCount.set(t.employeeId, (legacyCount.get(t.employeeId) ?? 0) + 1)
  }

  const groups = new Map()
  for (const r of rows) {
    let g
    if (!r.employeeKey) {
      g = { key: `blank:${r.line}`, employee: null, matchedBy: null, label: '(ไม่ระบุพนักงาน)', keyText: '', rows: [], errors: [] }
      groups.set(g.key, g)
    } else {
      const m = matchEmployee(r.employeeKey, idx)
      const key = m?.emp ? `emp:${m.emp.id}` : `raw:${norm(r.employeeKey)}`
      g = groups.get(key)
      if (!g) {
        g = { key, employee: m?.emp ?? null, matchedBy: m?.by ?? null, label: m?.emp?.name || r.employeeKey, keyText: r.employeeKey, rows: [], errors: [] }
        if (m?.emp?.role === 'admin') {
          g.errors.push('เป็นบัญชีแอดมิน — นำเข้าไม่ได้')
        } else if (m?.ambiguous) {
          g.errors.push(`พบพนักงาน ${m.ambiguous.length} คนที่ตรงกับ "${r.employeeKey}" (${m.ambiguous.map((e) => e.name).join(', ')}) — ใช้รหัสหรืออีเมลแทน`)
        } else if (!m) {
          const p = findPending(r.employeeKey, pending)
          g.errors.push(p
            ? `ยังไม่ผูกบัญชี (รหัส ${p.code ?? p.id}) — ให้พนักงานล็อกอินผูกบัญชีก่อน แล้วค่อยนำเข้า`
            : `ไม่พบพนักงาน "${r.employeeKey}" (ตรวจรหัส/อีเมล/ชื่อให้ตรงกับในระบบ)`)
        }
        groups.set(key, g)
      }
    }
    g.rows.push(r)
  }

  const items = [...groups.values()].map((g) => {
    const emp = g.employee && g.employee.role !== 'admin' ? g.employee : null
    const errors = [...g.errors]
    const warnings = []
    let info = ''
    for (const r of g.rows) r.errors.forEach((e) => errors.push(`แถว ${r.line}: ${e}`))

    // แถวที่มีชื่อรางวัล = รายการแลก; แถวที่ไม่มีชื่อรางวัลและใช้แลก 0 = แถวพก "คะแนนทั้งหมด" ของคนที่ไม่เคยแลก (ไม่สร้างประวัติ)
    const redemptions = g.rows
      .filter((r) => r.rewardName)
      .map((r) => ({ line: r.line, rewardName: r.rewardName, points: r.used, date: r.date }))
    const used = redemptions.reduce((s, r) => s + r.points, 0)
    // พนักงาน 1 คน = 1 transaction ของ Firestore (เขียนได้ไม่เกิน 500 doc) → กันไว้ที่ 400 รายการ
    if (redemptions.length > MAX_REDEMPTIONS_PER_PERSON) {
      errors.push(`มี ${fmt(redemptions.length)} รายการ เกินที่นำเข้าต่อคนได้ในครั้งเดียว (${MAX_REDEMPTIONS_PER_PERSON}) — แบ่งวางเป็นหลายชุด`)
    }

    let total = null
    let fileRemaining = null // "คงเหลือ" จากไฟล์เก่า (ถ้ามี) — ใช้ตรวจอย่างเดียว ไม่ใช่ค่าที่ตั้งให้พนักงาน
    if (emp) {
      const totals = [...new Set(g.rows.map((r) => r.total).filter((v) => v !== null))]
      if (totals.length === 0) errors.push('ไม่มี "คะแนนทั้งหมด" ในแถวของพนักงานคนนี้')
      else if (totals.length > 1) errors.push(`"คะแนนทั้งหมด" ไม่เท่ากันในแต่ละแถว (พบ ${totals.map(fmt).join(', ')})`)
      else total = totals[0]
      const rems = [...new Set(g.rows.map((r) => r.remaining).filter((v) => v !== null))]
      if (rems.length > 1) errors.push(`"คงเหลือ" ไม่เท่ากันในแต่ละแถว (พบ ${rems.map(fmt).join(', ')})`)
      else if (rems.length === 1) fileRemaining = rems[0]
      if (total !== null && used > total) errors.push(`ใช้แลกรวม ${fmt(used)} มากกว่าคะแนนทั้งหมด ${fmt(total)} — ข้อมูลไม่สอดคล้อง`)
      else if (total !== null && fileRemaining !== null && fileRemaining !== total - used) errors.push(remainingMismatch(total, used, fileRemaining))
    }

    const current = emp ? Math.max(0, Number(emp.points) || 0) : 0
    if (emp && errors.length === 0) {
      if (txIds.has(sentinelId(emp.id))) info = 'นำเข้าไปแล้ว (ข้าม) — ต้อง ↩️ ย้อนการนำเข้าก่อนจึงนำเข้าใหม่ได้'
      else if (total === 0 && redemptions.length === 0) info = 'คะแนนทั้งหมด 0 — ไม่มีอะไรให้นำเข้า'
      else {
        if (current !== 0) warnings.push(`ยอดปัจจุบัน ${fmt(current)} จะถูกล้าง แล้วตั้งเป็น ${fmt(total - used)}`)
        const legacy = legacyCount.get(emp.id) ?? 0
        if (legacy > 0) warnings.push(`มีประวัติเดิม ${legacy} รายการอยู่แล้ว — ตรวจว่าไม่ซ้ำกับที่นำเข้า`)
        redemptions.filter((r) => r.points === 0).forEach((r) => warnings.push(`แถว ${r.line}: "${r.rewardName}" ใช้แลก 0 แต้ม`))
      }
    }

    const status = errors.length > 0 ? 'error' : info ? 'skip' : 'ok'
    return {
      key: g.key, status, employee: emp, matchedBy: g.matchedBy, label: g.label, keyText: g.keyText,
      lines: g.rows.map((r) => r.line),
      total, used, remaining: total === null ? null : total - used, fileRemaining, current,
      redemptions, errors, warnings, info,
      ledgerRows: status === 'ok' ? 1 + (current !== 0 ? 1 : 0) + redemptions.length : 0,
    }
  })

  items.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || String(a.label).localeCompare(String(b.label), 'th'))

  const ok = items.filter((i) => i.status === 'ok')
  const summary = {
    ok: ok.length,
    error: items.filter((i) => i.status === 'error').length,
    skip: items.filter((i) => i.status === 'skip').length,
    rows: ok.reduce((s, i) => s + i.ledgerRows, 0),
    redemptions: ok.reduce((s, i) => s + i.redemptions.length, 0),
    checked: ok.filter((i) => i.fileRemaining !== null).length, // กี่คนที่เทียบกับ "คงเหลือ" ในไฟล์แล้วตรง (ที่เหลือไม่มีคอลัมน์นี้ให้เทียบ)
    carried: ok.reduce((s, i) => s + i.total, 0),
    used: ok.reduce((s, i) => s + i.used, 0),
  }
  return { items, summary }
}

// ── แถวที่จะเขียนให้พนักงาน 1 คน ──
// current = ยอดแต้มจริงที่อ่านได้ "ใน transaction" · cutoff = วันตัดยอด (Date 12:00 น. จาก parseDate)
// คืน { points: ยอดคงเหลือใหม่, rows: [{ id: docId|null(auto), data }] } — แถวแรกเป็น "ยอดยกมา" (sentinel) เสมอ
export function buildLedger(item, { current, batchId, cutoff }) {
  const emp = item.employee
  const T = item.total
  const cur = Math.max(0, Number(current) || 0)
  const base = cutoff.getTime()
  const common = { employeeId: emp.id, employeeName: emp.name ?? '', rewardId: null, imported: true, importBatch: batchId }
  const rows = []
  let seq = 0 // เรียงลำดับแถวในวันเดียวกัน (บวกมิลลิวินาที) ให้ยอดยกมามาก่อนรายการแลกที่ไม่มีวันที่

  rows.push({
    id: sentinelId(emp.id),
    data: { ...common, rewardName: OPENING_NAME, note: `คะแนนสะสมทั้งหมดจากระบบเก่า ${fmt(T)} แต้ม`, pointsUsed: 0 - T, createdAt: new Date(base + seq++), status: 'เพิ่มแต้ม' },
  })
  if (cur !== 0) {
    rows.push({
      id: null,
      data: { ...common, rewardName: CLEAR_NAME, note: `ยอดเดิมในระบบ ${fmt(cur)} แต้ม — ตั้งใหม่ให้ตรงระบบเก่า`, pointsUsed: cur, createdAt: new Date(base + seq++), status: 'หักแต้ม' },
    })
  }
  item.redemptions.forEach((r, i) => {
    rows.push({
      id: null,
      data: {
        ...common, rewardName: r.rewardName, pointsUsed: r.points,
        createdAt: new Date(r.date ? r.date.getTime() + i : base + seq++),
        status: 'สำเร็จ', approval: 'อนุมัติแล้ว', addedByAdmin: true,
      },
    })
  })
  return { points: T - item.used, rows }
}

// ── ชุดที่นำเข้าแล้ว + ย้อนการนำเข้า ──
export function makeBatchId(now = new Date(), rand = Math.random()) {
  const p = (n) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  return `imp-${stamp}-${Math.floor(rand * 36 ** 4).toString(36).padStart(4, '0')}`
}

// วัน-เวลาที่นำเข้า (อ่านจาก batchId) — ไม่ใช่ id รูปแบบนี้ = null
export function batchDate(batchId) {
  const m = /^imp-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(batchId ?? '')
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null
}

export function listBatches(transactions) {
  const map = new Map()
  for (const t of transactions) {
    if (!t.importBatch) continue
    const b = map.get(t.importBatch) ?? { batchId: t.importBatch, rows: 0, people: new Set() }
    b.rows++
    b.people.add(t.employeeId)
    map.set(t.importBatch, b)
  }
  return [...map.values()]
    .map((b) => ({ batchId: b.batchId, rows: b.rows, employees: b.people.size, date: batchDate(b.batchId) }))
    .sort((a, b) => b.batchId.localeCompare(a.batchId))
}

// แถวของชุดนั้นแยกตามพนักงาน + ส่วนต่างที่ต้องคืนยอด (delta = Σ pointsUsed ของแถวชุดนั้น; ผลต่อยอด = −pointsUsed จึงย้อนด้วย +delta แบบเดียวกับลบแถวใน AdminHistory)
// expected = ยอดที่ "ควรเป็นตอนนี้" ถ้าหลังนำเข้าไม่มีใครแตะยอดอีก = ผลของแถวยอดยกมา + รายการแลกของชุด (แถว "ล้างยอดเดิม" แค่ทำยอดเดิมเป็น 0 ก่อนนำเข้า จึงไม่นับ)
//   คำนวณจากแถวปัจจุบันของชุด (ไม่ใช่ค่าที่เก็บไว้ตอนนำเข้า) จึงใช้ได้กับชุดที่นำเข้าไปแล้ว และตามไปเมื่อแอดมินแก้/ลบแถวของชุดทีหลัง (ยอดกับแถวขยับคู่กัน)
//   rollbackOne ใช้เทียบกับยอดจริง: ไม่เท่ากัน = มีการแลก/ปรับแต้มหลังนำเข้า → ย้อนไม่ได้ (กันยอดผิด/ติดเพดาน 0)
export function planRollback(transactions, batchId) {
  const byEmp = new Map()
  for (const t of transactions) {
    if (t.importBatch !== batchId) continue
    const g = byEmp.get(t.employeeId) ?? { employeeId: t.employeeId, employeeName: t.employeeName ?? '', ids: [], delta: 0, expected: 0 }
    g.ids.push(t.id)
    g.delta += t.pointsUsed ?? 0
    if (!(t.rewardName === CLEAR_NAME && !t.addedByAdmin)) g.expected -= t.pointsUsed ?? 0
    byEmp.set(t.employeeId, g)
  }
  return [...byEmp.values()]
}
