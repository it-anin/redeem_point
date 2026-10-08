import { useState, useMemo } from 'react'
import { reconcile } from '../pointsLedger'

// แผง "ตรวจยอดแต้ม" (หน้า ประวัติทั้งหมด) — เทียบ "💰 คงเหลือจริง" (employees.points) กับ "สุทธิตามประวัติ" ของทุกคน
// อ่านอย่างเดียว: คำนวณจาก employees + transactions ที่หน้าแม่โหลดไว้แล้ว → ไม่มีการอ่าน/เขียนฐานข้อมูลเพิ่ม (ประหยัดโควตา Spark)
// ตรรกะอยู่ที่ pointsLedger.reconcile (มีเทสต์) — ที่นี่ทำเฉพาะการแสดงผล

const cell = { padding: '8px 12px', fontSize: 13, verticalAlign: 'top' }
const num = { ...cell, textAlign: 'right', whiteSpace: 'nowrap' }
const signed = (n) => (n > 0 ? `+${n.toLocaleString()}` : n < 0 ? `-${Math.abs(n).toLocaleString()}` : '0')

// ข้อสังเกตต่อคน — บอกเฉพาะข้อเท็จจริงที่ตรวจเจอ ไม่ฟันธงว่าผิด (ผลต่าง ≠ 0 อาจเป็นแต้มเริ่มต้นที่ไม่มีแถวประวัติ)
function notes(p) {
  const out = []
  if (p.status === 'noHistory') out.push({ tone: 'muted', text: 'ไม่มีแถวประวัติเลย (แต้มเริ่มต้น?)' })
  if (p.legacyAdds.count > 0) out.push({ tone: 'info', text: `เพิ่มแต้มด้วยปุ่มเพิ่มรายการเวอร์ชันเก่า ${p.legacyAdds.count} แถว (+${p.legacyAdds.points.toLocaleString()})` })
  if (p.rejected > 0) out.push({ tone: 'muted', text: `มีรายการที่ปฏิเสธ ${p.rejected} (ไม่นับในประวัติ — คืนแต้มไปแล้ว)` })
  if (p.imported) out.push(p.diff === 0
    ? { tone: 'ok', text: 'นำเข้าจากระบบเก่า — ยอดตรงประวัติ' }
    : { tone: 'bad', text: 'นำเข้าจากระบบเก่าแล้ว แต่ยอดไม่ตรงประวัติ — น่าสงสัย (ควรผลต่าง = 0)' })
  if (p.status === 'diff' && p.diff > 0) out.push({ tone: 'warn', text: `ยอดจริงมากกว่าประวัติ ${p.diff.toLocaleString()} — แต้มเริ่มต้น/ปรับด้วยมือที่ไม่มีแถว หรือคืนแต้มซ้ำ` })
  if (p.status === 'diff' && p.diff < 0) out.push({ tone: 'warn', text: `ยอดจริงน้อยกว่าประวัติ ${Math.abs(p.diff).toLocaleString()} — หักแล้วติดเพดาน 0 หรือแถวประวัติเกินจริง` })
  return out
}
const TONE = { ok: '#065F46', info: '#1D4ED8', warn: '#92400E', bad: '#991B1B', muted: 'var(--text-muted)' }

export default function ReconcilePanel({ employees, transactions, onClose }) {
  const [onlyDiff, setOnlyDiff] = useState(true)
  const { people, orphans, summary } = useMemo(() => reconcile(employees, transactions), [employees, transactions])
  const shown = onlyDiff ? people.filter((p) => p.status === 'diff') : people

  return (
    <div className="card" style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '2px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>🔎 ตรวจยอดแต้ม</span>
        <span className="badge badge-success">✅ ตรง {summary.ok}</span>
        <span className={`badge ${summary.diff > 0 ? 'badge-danger' : 'badge-success'}`}>⚠️ ไม่ตรง {summary.diff}</span>
        <span className="badge badge-warn" title="ไม่มีแถวประวัติเลย — ปกติถ้าเป็นแต้มเริ่มต้นที่ตั้งตอนเพิ่มพนักงาน">⚪ ไม่มีประวัติ {summary.noHistory}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>จาก {summary.total} คน</span>
        <label style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> แสดงเฉพาะที่ไม่ตรง
        </label>
        <button className="btn-danger" style={{ padding: '4px 12px', fontSize: 12 }} onClick={onClose}>ปิด</button>
      </div>

      <div style={{ padding: '10px 18px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, borderBottom: '1px solid var(--border)' }}>
        เทียบ <b>💰 คงเหลือจริง</b> (ยอดที่แลกได้จริง) กับ <b>สุทธิตามประวัติ</b> (ไม่นับรายการที่ปฏิเสธ เพราะคืนแต้มไปแล้ว) ·
        ผลต่าง ≠ 0 <u>ไม่ได้แปลว่าผิดเสมอ</u> — แต้มเริ่มต้นตอนผูกบัญชีหรือที่ตั้งด้วยมือไม่มีแถวประวัติ · คนที่นำเข้าด้วยเครื่องมือนำเข้าควรผลต่าง = 0
      </div>

      {shown.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {onlyDiff ? '🎉 ไม่มีใครที่มีประวัติแล้วยอดไม่ตรง' : 'ไม่มีข้อมูล'}
        </div>
      ) : (
        <div style={{ maxHeight: 360, overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ ...cell, fontSize: 12 }}>พนักงาน</th>
                <th style={{ ...num, fontSize: 12 }}>💰 คงเหลือจริง</th>
                <th style={{ ...num, fontSize: 12 }}>สุทธิตามประวัติ</th>
                <th style={{ ...num, fontSize: 12 }}>ผลต่าง</th>
                <th style={{ ...cell, fontSize: 12 }}>ข้อสังเกต</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.employee.id}>
                  <td style={cell}>
                    <div style={{ fontWeight: 700 }}>{p.employee.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.employee.code ?? '-'} · {p.employee.id} · {p.count} แถว</div>
                  </td>
                  <td style={{ ...num, fontWeight: 800, color: 'var(--primary-dark)' }}>{p.balance.toLocaleString()}</td>
                  <td style={num}>{signed(p.ledger)}</td>
                  <td style={{ ...num, fontWeight: 800, color: p.diff === 0 ? '#065F46' : '#991B1B' }}>{signed(p.diff)}</td>
                  <td style={{ ...cell, fontSize: 12, lineHeight: 1.6 }}>
                    {notes(p).map((n, i) => <div key={i} style={{ color: TONE[n.tone], fontWeight: n.tone === 'muted' ? 600 : 700 }}>{n.text}</div>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {orphans.length > 0 && (
        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', fontSize: 12, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 800, color: '#991B1B' }}>⚠️ ประวัติของบัญชีที่ไม่พบใน employees แล้ว ({orphans.length} บัญชี) — พนักงานจะไม่เห็นรายการเหล่านี้ที่มือถือ</div>
          {orphans.map((o) => (
            <div key={o.employeeId} style={{ color: 'var(--text-muted)' }}>{o.name || '-'} · {o.employeeId} · {o.count} แถว · สุทธิ {signed(o.net)}</div>
          ))}
        </div>
      )}
    </div>
  )
}
