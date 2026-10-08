import { useState, useMemo, useRef } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { parsePaste, parseDate, buildPlan, makeBatchId, listBatches, planRollback } from '../importHistory'
import { importOne, rollbackOne } from '../importHistoryDb'

// โมดัล "นำเข้าประวัติการแลกย้อนหลัง" (หน้า ประวัติทั้งหมด) — วางข้อมูลจาก Excel → พรีวิว/ตรวจยอด → นำเข้า (+ ย้อนการนำเข้าเป็นชุด)
// ตรรกะแยก/ตรวจข้อมูลอยู่ที่ src/importHistory.js, ส่วนเขียน Firestore อยู่ที่ src/importHistoryDb.js (ทั้งคู่มีเทสต์); ไฟล์นี้ทำเฉพาะ UI
// ⚠️ ประหยัดโควตา: ไม่โหลดคอลเลกชันใหม่เลย — อ่านต่อพนักงาน 1 คนใน transaction + รายชื่อรอผูกบัญชี 1 ครั้งตอนกดตรวจสอบครั้งแรก
//    แล้วส่งแถว/ยอดที่เปลี่ยนกลับให้หน้าแม่ (onChanged) อัปเดต state เอง

const SAMPLE = [
  'E001\tบัตรกำนัล 200 บาท\t1500\t200\t15/03/2024\t950',
  'E001\tเสื้อยืดบริษัท\t1500\t350\t02/06/2024\t950',
  'E002\t\t800\t0\t\t800',
].join('\n')

const labelStyle = { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }
const cell = { padding: '8px 12px', fontSize: 13, verticalAlign: 'top' }
const num = { ...cell, textAlign: 'right', whiteSpace: 'nowrap' }
const STATUS = {
  ok: { cls: 'badge-success', text: '✅ นำเข้า' },
  error: { cls: 'badge-danger', text: '❌ มีปัญหา' },
  skip: { cls: 'badge-warn', text: '⏭ ข้าม' },
}

const pad2 = (n) => String(n).padStart(2, '0')
const localDateStr = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const thDate = (d) => d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })

export default function ImportHistoryModal({ employees, transactions, onClose, onChanged }) {
  const [cutoffStr, setCutoffStr] = useState('')
  const [text, setText] = useState('')
  const [plan, setPlan] = useState(null)       // { items, summary, header, cutoff, pendingFailed }
  const [checkErr, setCheckErr] = useState('')
  const [checking, setChecking] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState(null)   // ผลการนำเข้าครั้งล่าสุด
  const [rollingBack, setRollingBack] = useState('')
  const [batchMsg, setBatchMsg] = useState(null) // { text, error }
  const pendingRef = useRef(null)              // pendingEmployees — อ่านครั้งเดียวตอนกดตรวจสอบครั้งแรก

  const busy = checking || running || Boolean(rollingBack)
  const batches = useMemo(() => listBatches(transactions), [transactions])

  const edit = (setter) => (e) => { setter(e.target.value); setPlan(null) } // แก้ข้อมูล/วันตัดยอด → พรีวิวเก่าใช้ไม่ได้แล้ว

  const check = async () => {
    setCheckErr('')
    setResult(null)
    const cut = parseDate(cutoffStr)
    if (cut.blank) { setCheckErr('กรุณาเลือก "วันตัดยอด" ก่อน'); return }
    if (cut.error) { setCheckErr('วันตัดยอด: ' + cut.error); return }
    if (!text.trim()) { setCheckErr('กรุณาวางข้อมูลก่อน'); return }
    if (!text.includes('\t')) { setCheckErr('ไม่พบตัวคั่น Tab — ให้คัดลอกจาก Excel / Google Sheets แล้ววางตรงๆ (ไม่ใช่พิมพ์เอง)'); return }
    setChecking(true)
    try {
      let pendingFailed = false
      if (!pendingRef.current) {
        try {
          const snap = await getDocs(collection(db, 'pendingEmployees'))
          pendingRef.current = snap.docs.map((d) => ({ id: d.id, code: d.id, ...d.data() }))
        } catch { pendingFailed = true } // แค่ไว้บอกว่า "ยังไม่ผูกบัญชี" — อ่านไม่ได้ก็ตรวจต่อได้ (ข้อความจะเป็น "ไม่พบพนักงาน")
      }
      const { rows, header } = parsePaste(text)
      const built = buildPlan({ rows, employees, pending: pendingRef.current ?? [], transactions })
      setPlan({ ...built, header, cutoff: cut.value, pendingFailed })
    } catch (e) {
      setCheckErr('ตรวจสอบไม่สำเร็จ: ' + e.message)
    } finally {
      setChecking(false)
    }
  }

  const run = async () => {
    if (!plan || plan.summary.ok === 0) return
    const todo = plan.items.filter((i) => i.status === 'ok')
    if (!window.confirm(
      `นำเข้า ${todo.length} คน (${plan.summary.rows} แถวในประวัติ)\n` +
      `• ตั้งยอดคงเหลือของแต่ละคน = คะแนนทั้งหมด − ที่ใช้แลก (ทับยอดเดิม)\n` +
      (plan.summary.error > 0 ? `• ข้าม ${plan.summary.error} คนที่มีปัญหา\n` : '') +
      `\nยืนยัน?`
    )) return

    const batchId = makeBatchId()
    setRunning(true)
    setResult(null)
    setCheckErr('')
    setProgress({ done: 0, total: todo.length })
    const addedRows = []
    const balances = {}
    const failed = []
    const already = []
    let people = 0
    try {
      // ทีละคน (ไม่ขนาน): แต่ละคนเป็น transaction เดียว คนที่พลาดไม่กระทบคนอื่น; รันซ้ำปลอดภัยเพราะแถวยอดยกมาเป็นตัวกันซ้ำ
      for (const item of todo) {
        try {
          const out = await importOne(db, item, batchId, plan.cutoff)
          out.rows.forEach((r) => addedRows.push(r))
          balances[item.employee.id] = out.points
          people++
        } catch (e) {
          if (e.code === 'ALREADY') already.push(item.label)
          else failed.push({ label: item.label, message: e.message })
        }
        setProgress((p) => ({ ...p, done: p.done + 1 }))
      }
      if (people > 0) {
        await onChanged({
          addedRows,
          balances,
          log: {
            action: 'import_history',
            detail: `นำเข้าประวัติย้อนหลัง ${people} คน / ${addedRows.length} แถว (ชุด ${batchId}) · วันตัดยอด ${thDate(plan.cutoff)}` +
              (failed.length ? ` · ไม่สำเร็จ ${failed.length} คน` : ''),
          },
        })
      }
      setResult({ batchId, people, rows: addedRows.length, failed, already })
      setPlan(null) // ยอด/สถานะเปลี่ยนแล้ว → ให้กดตรวจสอบใหม่ (คนที่นำเข้าแล้วจะขึ้น "ข้าม", คนที่พลาดจะกลับมาเป็น "นำเข้า")
    } catch (e) {
      setCheckErr(`เกิดข้อผิดพลาดระหว่างนำเข้า: ${e.message} — รีเฟรชหน้า (F5) เพื่อดูผลที่บันทึกไปแล้ว`)
    } finally {
      setRunning(false)
    }
  }

  const rollback = async (b) => {
    const when = b.date ? b.date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : b.batchId
    if (!window.confirm(
      `ย้อนการนำเข้าชุด ${when}?\n` +
      `• ลบ ${b.rows} แถว ของ ${b.employees} คน\n` +
      `• คืนยอดแต้มของแต่ละคนกลับ (ไม่ต่ำกว่า 0)\n` +
      `• คนที่ยอดเปลี่ยนหลังนำเข้า (มีการแลก/ปรับแต้มต่อ) จะถูกข้ามและแจ้งให้ — ย้อนอัตโนมัติจะทำให้ยอดผิด\n\nยืนยัน?`
    )) return
    setRollingBack(b.batchId)
    setBatchMsg(null)
    const removedIds = []
    const balances = {}
    const failed = []
    try {
      for (const g of planRollback(transactions, b.batchId)) {
        try {
          const balance = await rollbackOne(db, g)
          removedIds.push(...g.ids)
          if (balance !== null) balances[g.employeeId] = balance
        } catch (e) {
          failed.push(`${g.employeeName || g.employeeId}: ${e.message}`)
        }
      }
      if (removedIds.length > 0) {
        await onChanged({
          removedIds,
          balances,
          log: { action: 'import_rollback', detail: `ย้อนการนำเข้าชุด ${b.batchId} · ลบ ${removedIds.length} แถว` + (failed.length ? ` · ไม่สำเร็จ ${failed.length} คน` : '') },
        })
      }
      setBatchMsg(failed.length
        ? { error: true, text: `ย้อนได้ ${removedIds.length} แถว แต่ไม่สำเร็จ ${failed.length} คน — ${failed.join(' · ')}` }
        : { error: false, text: `ย้อนการนำเข้าเรียบร้อย (ลบ ${removedIds.length} แถว คืนยอดแต้มแล้ว)` })
      setPlan(null)
    } catch (e) {
      setBatchMsg({ error: true, text: `เกิดข้อผิดพลาดระหว่างย้อน: ${e.message} — รีเฟรชหน้า (F5) เพื่อดูผลที่ทำไปแล้ว` })
    } finally {
      setRollingBack('')
    }
  }

  const s = plan?.summary
  const resultColor = !result ? null : result.failed.length === 0 ? ['#D1FAE5', '#065F46'] : result.people === 0 ? ['#FEE2E2', '#991B1B'] : ['#FEF3C7', '#92400E']

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(46,31,14,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div className="card" style={{ maxWidth: 1040, width: '100%', padding: 28, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>📥 นำเข้าประวัติการแลกย้อนหลัง (จากระบบเก่า)</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          ตั้งยอดคงเหลือ + ใส่ประวัติการแลกให้พนักงานหลายคนในครั้งเดียว — ตรวจพรีวิวก่อน ยังไม่บันทึกอะไรจนกว่าจะกดนำเข้า
        </div>

        <div style={{ background: '#FEF3C7', color: '#92400E', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 12, fontWeight: 600, lineHeight: 1.8 }}>
          วางจาก Excel / Google Sheets เรียงคอลัมน์: <b>พนักงาน | ชื่อรางวัล | คะแนนทั้งหมด | คะแนนที่ใช้แลก | วันที่ (ไม่บังคับ) | คงเหลือ (ไม่บังคับ แต่แนะนำ)</b><br />
          • พนักงาน = รหัส / อีเมล / ชื่อ (ต้อง <b>ผูกบัญชีแล้ว</b>) · คะแนนทั้งหมด = คะแนนสะสมที่เคยได้ทั้งหมด (ก่อนหักที่แลก) · ทั้งหมด/คงเหลือ ใส่ซ้ำทุกแถวของคนนั้นได้ (ต้องเท่ากัน)<br />
          • คนที่ไม่เคยแลก: ใส่แถวเดียว เว้นชื่อรางวัล และใช้แลก = 0 · วันที่แบบ วัน/เดือน/ปี (ค.ศ. หรือ พ.ศ.) ว่าง = ใช้วันตัดยอด (ไม่มีคอลัมน์วันที่ก็เว้นคอลัมน์ที่ 5 ไว้ว่าง)<br />
          • ระบบจะตั้งยอดคงเหลือ = <b>คะแนนทั้งหมด − ใช้แลกรวม</b> <u>ทับยอดเดิม</u> (ถ้ายอดเดิมไม่ใช่ 0 จะมีแถว "ล้างยอดเดิม" ให้เห็นในประวัติ)<br />
          • ถ้าใส่ <b>คงเหลือ</b> จากไฟล์เก่า ระบบจะเทียบกับ ทั้งหมด − ใช้แลกรวม <u>ถ้าไม่ตรงจะข้ามคนนั้น</u> (มักเพราะรายการแลกขาด/เกิน) จะได้ไม่ตั้งยอดผิดเงียบๆ
        </div>

        <label style={labelStyle}>วันตัดยอด * (วันสุดท้ายของระบบเก่า — เป็นวันที่ของแถวยอดยกมา และของรายการที่ไม่มีวันที่)</label>
        <input className="input" type="date" max={localDateStr()} value={cutoffStr} onChange={edit(setCutoffStr)} disabled={busy} style={{ marginBottom: 6, maxWidth: 220 }} />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
          ควรเป็นวันในอดีต — ไม่งั้นแถวที่นำเข้าจะไปกองใน "รายการล่าสุด" ของหน้า Overview
        </div>

        <label style={labelStyle}>ข้อมูล (วางที่นี่)</label>
        <textarea
          className="input"
          rows={8}
          value={text}
          onChange={edit(setText)}
          disabled={busy}
          placeholder={SAMPLE}
          spellCheck={false}
          style={{ fontFamily: 'Consolas, monospace', fontSize: 12, whiteSpace: 'pre', overflow: 'auto', resize: 'vertical', marginBottom: 12 }}
        />

        {checkErr && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 12, fontSize: 13, fontWeight: 700 }}>⚠️ {checkErr}</div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={check} disabled={busy}>{checking ? 'กำลังตรวจสอบ...' : '🔍 ตรวจสอบข้อมูล'}</button>
          <button className="btn-primary" style={{ background: 'var(--surface)' }} onClick={() => { setText(''); setPlan(null); setCheckErr(''); setResult(null) }} disabled={busy || !text}>ล้างข้อมูล</button>
        </div>

        {result && (
          <div style={{ background: resultColor[0], color: resultColor[1], padding: '12px 16px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13, fontWeight: 700, lineHeight: 1.7 }}>
            {result.people > 0 && <div>✅ นำเข้าสำเร็จ {result.people} คน · {result.rows} แถว <span style={{ fontWeight: 600 }}>(ชุด {result.batchId})</span></div>}
            {result.already.length > 0 && <div>⏭ ข้าม {result.already.length} คนที่นำเข้าไปแล้ว: {result.already.join(', ')}</div>}
            {result.failed.length > 0 && (
              <div>
                ⚠️ ไม่สำเร็จ {result.failed.length} คน (ไม่มีอะไรถูกบันทึกของคนเหล่านี้ — กด "ตรวจสอบข้อมูล" แล้วนำเข้าซ้ำได้เลย คนที่สำเร็จแล้วจะถูกข้ามเอง):
                {result.failed.map((f, i) => <div key={i} style={{ fontWeight: 600 }}>• {f.label}: {f.message}</div>)}
              </div>
            )}
          </div>
        )}

        {plan && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <span className="badge badge-success">✅ พร้อมนำเข้า {s.ok} คน · {s.rows} แถว</span>
              {s.error > 0 && <span className="badge badge-danger">❌ มีปัญหา {s.error} (จะถูกข้าม)</span>}
              {s.skip > 0 && <span className="badge badge-warn">⏭ ข้าม {s.skip}</span>}
              {s.ok > 0 && (
                <span className={`badge ${s.checked === s.ok ? 'badge-success' : 'badge-warn'}`} title='เทียบ "ทั้งหมด − ใช้แลกรวม" กับคอลัมน์ คงเหลือ ในไฟล์เก่า (คนที่ไม่ตรงถูกข้ามไปแล้ว)'>
                  {s.checked === s.ok ? '✓' : '⚠️'} เทียบกับ "คงเหลือ" ในไฟล์แล้ว {s.checked}/{s.ok} คน
                </span>
              )}
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                ยกยอดรวม {s.carried.toLocaleString()} · ใช้แลกรวม {s.used.toLocaleString()} ({s.redemptions} รายการ) · ยอดคงเหลือรวมหลังนำเข้า {(s.carried - s.used).toLocaleString()}
              </span>
            </div>
            {plan.header && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>ข้ามแถวหัวตาราง: {plan.header.replace(/\t/g, ' | ')}</div>}
            {plan.pendingFailed && <div style={{ fontSize: 11, color: '#92400E', marginBottom: 8 }}>อ่านรายชื่อ "รอผูกบัญชี" ไม่ได้ — ที่ขึ้นว่า "ไม่พบพนักงาน" อาจเป็นคนที่ยังไม่ได้ผูกบัญชี</div>}

            {plan.items.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>ไม่พบข้อมูลที่อ่านได้</div>
            ) : (
              <div className="table-wrap" style={{ maxHeight: 380, overflow: 'auto', marginBottom: 16 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ ...cell, fontSize: 12 }}>สถานะ</th>
                      <th style={{ ...cell, fontSize: 12 }}>พนักงาน</th>
                      <th style={{ ...cell, fontSize: 12 }}>รายการแลก</th>
                      <th style={{ ...num, fontSize: 12 }}>คะแนนทั้งหมด</th>
                      <th style={{ ...num, fontSize: 12 }}>ใช้แลกรวม</th>
                      <th style={{ ...num, fontSize: 12 }}>ยอดตอนนี้ → ใหม่</th>
                      <th style={{ ...cell, fontSize: 12 }}>หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.items.map((it) => {
                      const st = STATUS[it.status]
                      const bal = !it.employee ? '-' : it.status === 'ok' ? `${it.current.toLocaleString()} → ${it.remaining.toLocaleString()}` : it.current.toLocaleString()
                      return (
                        <tr key={it.key}>
                          <td style={cell}><span className={`badge ${st.cls}`} style={{ whiteSpace: 'nowrap' }}>{st.text}</span></td>
                          <td style={cell}>
                            <div style={{ fontWeight: 700 }}>{it.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {it.employee ? `${it.employee.code ?? '-'} · ${it.employee.email ?? it.employee.id}` : it.keyText}
                              {it.matchedBy && ` (ตรง${{ code: 'รหัส', email: 'อีเมล', name: 'ชื่อ' }[it.matchedBy]})`}
                            </div>
                          </td>
                          <td style={cell}>
                            {it.redemptions.length === 0 ? <span style={{ color: 'var(--text-muted)' }}>—</span> : (
                              <details>
                                <summary style={{ cursor: 'pointer' }}>{it.redemptions.length} รายการ</summary>
                                <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.7 }}>
                                  {it.redemptions.map((r, i) => (
                                    <div key={i}>🎁 {r.rewardName} · {r.points.toLocaleString()} แต้ม · {r.date ? thDate(r.date) : 'วันตัดยอด'}</div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </td>
                          <td style={num}>{it.total === null ? '-' : it.total.toLocaleString()}</td>
                          <td style={num}>{it.used.toLocaleString()}</td>
                          <td style={{ ...num, fontWeight: it.status === 'ok' ? 800 : 600, color: it.status === 'ok' ? 'var(--primary-dark)' : 'var(--text-muted)' }}>{bal}</td>
                          <td style={{ ...cell, fontSize: 12, lineHeight: 1.6 }}>
                            {it.errors.map((m, i) => <div key={`e${i}`} style={{ color: '#991B1B', fontWeight: 700 }}>❌ {m}</div>)}
                            {it.warnings.map((m, i) => <div key={`w${i}`} style={{ color: '#92400E', fontWeight: 600 }}>⚠️ {m}</div>)}
                            {it.status === 'ok' && it.fileRemaining !== null && <div style={{ color: '#065F46', fontWeight: 600 }}>✓ ตรงกับคงเหลือในไฟล์ ({it.fileRemaining.toLocaleString()})</div>}
                            {it.info && <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{it.info}</div>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <details style={{ marginBottom: 16 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>📦 ชุดที่นำเข้าแล้ว ({batches.length}) — ย้อนกลับได้</summary>
          <div style={{ marginTop: 8 }}>
            {batchMsg && (
              <div style={{ background: batchMsg.error ? '#FEE2E2' : '#D1FAE5', color: batchMsg.error ? '#991B1B' : '#065F46', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 8, fontSize: 13, fontWeight: 700 }}>
                {batchMsg.error ? '⚠️' : '✅'} {batchMsg.text}
              </div>
            )}
            {batches.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>ยังไม่มีการนำเข้า</div>
            ) : batches.map((b) => (
              <div key={b.batchId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>{b.date ? b.date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : b.batchId}</span>
                <span style={{ color: 'var(--text-muted)' }}>{b.employees} คน · {b.rows} แถว</span>
                <button className="btn-danger" style={{ marginLeft: 'auto', padding: '6px 12px', fontSize: 12 }} onClick={() => rollback(b)} disabled={busy}>
                  {rollingBack === b.batchId ? 'กำลังย้อน...' : '↩️ ย้อนชุดนี้'}
                </button>
              </div>
            ))}
          </div>
        </details>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn-danger" style={{ flex: '0 0 auto', padding: '10px 24px' }} onClick={onClose} disabled={busy}>ปิด</button>
          {running && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-dark)' }}>กำลังนำเข้า {progress.done}/{progress.total} คน... (อย่าปิดหน้านี้)</span>}
          <button className="btn-primary" style={{ marginLeft: 'auto', padding: '10px 24px' }} onClick={run} disabled={busy || !plan || plan.summary.ok === 0}>
            {running ? 'กำลังนำเข้า...' : plan && s.ok > 0 ? `📥 นำเข้า ${s.ok} คน (${s.rows} แถว)` : '📥 นำเข้า'}
          </button>
        </div>
      </div>
    </div>
  )
}
