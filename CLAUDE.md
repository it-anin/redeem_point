# Cream Rewards — ระบบสะสมแต้มแลกรางวัลพนักงาน

เว็บแอปสะสมแต้ม/แลกรางวัลของพนักงาน แบ่งผู้ใช้เป็น 2 บทบาท:
- **พนักงาน (employee)** → ใช้งานแบบ **มือถือ (mobile)** เสมอทุกขนาดจอ
- **แอดมิน/HR (admin)** → ใช้งานแบบ **เดสก์ท็อป (desktop)** มี sidebar

---

## Tech stack

- **React (Create React App / react-scripts)** — ไม่ใช่ Vite
- **React Router v6** — routing
- **Firebase** — Authentication (Google เท่านั้น) + Cloud Firestore
- **Cloudinary** — เก็บรูป/ไฟล์ (รูปหลักฐานการแลก, PDF ประกาศ) แบบ unsigned upload
- **pdf-lib** — เช็คจำนวนหน้า PDF ตอนแนบประกาศ
- ฟอนต์: **Nunito** (หลัก) + **Itim** (ข้อความน่ารัก/กล่องคำพูด) จาก Google Fonts

---

## การรัน / ตั้งค่า

```bash
npm install
npm start        # dev server ที่ http://localhost:3000
```

### ไฟล์ `.env` (ต้องมี — React อ่านตอน start เท่านั้น แก้แล้วต้อง restart)
```
REACT_APP_FIREBASE_API_KEY=...
REACT_APP_FIREBASE_AUTH_DOMAIN=anin-reward-point.web.app   # ⚠️ ต้องเป็นโดเมนที่ใช้งานจริง ไม่ใช่ *.firebaseapp.com (ดูหัวข้อ Error ท้ายไฟล์)
REACT_APP_FIREBASE_PROJECT_ID=...
REACT_APP_FIREBASE_STORAGE_BUCKET=...
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
REACT_APP_FIREBASE_APP_ID=...
REACT_APP_CLOUDINARY_CLOUD_NAME=...
REACT_APP_CLOUDINARY_UPLOAD_PRESET=...   # ต้องเป็น Unsigned preset
```

### สิ่งที่ต้องตั้งค่าฝั่ง Cloud
1. **Firebase Auth** → เปิด Google sign-in + ใส่ domain ใน Authorized domains
2. **Google Cloud OAuth client** → ต้องเพิ่ม redirect URI ของโดเมนจริงเอง (คนละที่กับข้อ 1!) ดูหัวข้อ **Error ที่เคยเจอ** ท้ายไฟล์
3. **Firestore Rules** → publish เนื้อหาจาก `firestore.rules`
4. **Cloudinary** → unsigned upload preset + เปิด "Allow delivery of PDF and ZIP files" (สำหรับ PDF ประกาศ)
5. **Bootstrap admin คนแรก** → สร้าง doc ใน `employees` ด้วยมือ (Document ID = อีเมล, role = `admin`)

### Deploy (Firebase Hosting)
- โปรเจกต์: `reward-point-2b56d` (เจ้าของ Console: mnswysk@gmail.com) — config ใน `firebase.json` + `.firebaserc`
- Hosting site = **`anin-reward-point`** → URL `https://anin-reward-point.web.app`
- `firebase.json` ผูก `firestore.rules` ไว้ → deploy เว็บ+rules พร้อมกัน, SPA rewrite ทุก path → `/index.html`
- คำสั่ง: `npm run build` → `firebase deploy --only "hosting,firestore:rules"` (PowerShell ต้องใส่ quote รอบ list)
- ⚠️ โดเมน site เพิ่มเติม (`anin-reward-point.web.app`) ต้องเพิ่มใน **Auth → Authorized domains** เอง ไม่งั้น Google login ไม่ผ่าน
- **Cache headers ใน `firebase.json`** — `**` (ทุก path → SPA rewrite เป็น index.html) ตั้ง `no-cache`, ส่วน `/static/**` (ชื่อไฟล์มี hash) ตั้ง `immutable` 1 ปี
  - เหตุผล: ค่า default ของ Firebase Hosting คือ `max-age=3600` ทำให้มือถือค้างบันเดิลเก่าได้ถึง 1 ชม. หลัง deploy (เคยทำให้ `authDomain` เก่าค้างจน debug หลงทาง)
  - ⚠️ Firebase จับคู่ header จาก **path ที่ร้องขอ** ไม่ใช่ไฟล์ปลายทาง → ตั้ง `source: "/index.html"` **ไม่มีผล** กับการเปิด `/` ต้องใช้ `**`
- **ตรวจผล deploy จริงได้ด้วย curl** (อย่าเดา):
  ```bash
  curl -s https://anin-reward-point.web.app/ | grep -o 'main\.[a-z0-9]*\.js'          # index.html ชี้บันเดิลไหน
  curl -s https://anin-reward-point.web.app/static/js/main.XXXX.js | grep -o 'authDomain:"[^"]*"'
  curl -s -I https://anin-reward-point.web.app/ | grep -i cache-control
  ```

---

## โครงสร้างไฟล์

```
public/                 # รูปไอคอน/โลโก้ (icon.png, Home.png, Megaphone.png, iconcheck.png ฯลฯ)
emulator-tests/         # เทสต์ Firestore emulator ด้วยโค้ดจริง + firestore.rules จริง (run.mjs) — `npm run test:emulator`; config = firebase.emulator.json (แยกจาก firebase.json ที่ใช้ deploy)
src/
  index.js, index.css   # entry + CSS+theme ทั้งหมด (ตัวแปรสี + คลาส utility)
  App.jsx               # router + guard (RequireAuth / RequireAdmin)
  firebase.js           # init firebase (auth, db)
  cloudinary.js         # uploadFileToCloudinary() — รูป/PDF
  announcementsCache.js # cache id ประกาศในหน่วยความจำ (อ่านครั้งเดียวต่อรอบเปิดแอป) — ใช้นับเลขแดงที่ BottomNav
  importHistory.js      # ตรรกะล้วนของ "📥 นำเข้าประวัติย้อนหลัง": แยกข้อความที่วาง / จับคู่พนักงาน / สร้างแผน + แถวประวัติ (ไม่แตะ Firebase) — มี importHistory.test.js
  importHistoryDb.js    # ส่วนเขียน Firestore ของเครื่องมือนำเข้า: importOne / rollbackOne (รับ db เป็นพารามิเตอร์)
  pointsLedger.js       # ตรรกะล้วน "แถวใน transactions แต่ละแบบมีผลต่อยอดอย่างไร" (isRedemption / isRejected / spentOf / netUsedOf / reconcile) — ทุกหน้าใช้นิยามเดียวกัน; มี pointsLedger.test.js
  pointsDb.js           # ทุก transaction ที่เปลี่ยนยอดแต้มผูกกับแถวประวัติ: redeemReward / approveRedemption / rejectRedemption / deleteHistoryRow / editHistoryRow (รับ db) — ทดสอบที่ emulator-tests/
  context/AuthContext.jsx
  components/
    Layout.jsx          # ตัวกำหนด desktop sidebar vs mobile (forceMobile)
    Sidebar.jsx         # Sidebar / MobileNav (drawer) / BottomNav
    ImportHistoryModal.jsx # โมดัลนำเข้าประวัติย้อนหลัง (เรียกจาก AdminHistory) — มี ImportHistoryModal.test.js
    ReconcilePanel.jsx  # แผง "🔎 ตรวจยอดแต้ม" ในหน้า ประวัติทั้งหมด (อ่านอย่างเดียว) — มี ReconcilePanel.test.js
  pages/
    Login.jsx
    Dashboard.jsx       # [mobile] หน้าหลักพนักงาน — แลกรางวัล
    Announcements.jsx   # [mobile] ประกาศ (ฝั่งพนักงาน)
    History.jsx         # [mobile] ประวัติการแลก (ฝั่งพนักงาน)
    Admin.jsx           # [desktop] ภาพรวม
    AdminEmployees.jsx  # [desktop] จัดการพนักงาน
    AdminRewards.jsx    # [desktop] จัดการรางวัล
    AdminApprovals.jsx  # [desktop] อนุมัติของรางวัล
    AdminAnnouncements.jsx # [desktop] จัดการประกาศ
    AdminHistory.jsx    # [desktop] ประวัติทั้งหมด + audit log
    MobilePreview.jsx   # [desktop] พรีวิวหน้าจอพนักงานในกรอบมือถือ
```

---

## ระบบล็อกอิน (AuthContext.jsx)

- **Google sign-in อย่างเดียว** — ใช้ **`signInWithRedirect`** (ไม่ใช่ `signInWithPopup`) + `getRedirectResult()` ตอน mount เพื่อดักerror ที่เด้งกลับมา
  - ⚠️ **ห้ามเปลี่ยนกลับเป็น popup** — popup ต้องใช้ `sessionStorage` ข้าม origin ซึ่ง iOS Safari (ITP) พาร์ทิชันทิ้ง → error `auth/missing-initial-state`
  - ใช้คู่กับ `authDomain` ที่เป็น **origin เดียวกับเว็บ** เท่านั้นถึงจะทำงาน (ดูหัวข้อ Error ท้ายไฟล์)
- จับคู่พนักงานด้วย **อีเมล** → `employees/{อีเมล}`
- ถ้าล็อกอินแล้วยังไม่มี employee doc → เข้าสู่ขั้น **ผูกบัญชีครั้งแรก**: กรอก **รหัสพนักงาน** → ดึงข้อมูลจาก `pendingEmployees/{รหัส}` มาสร้าง `employees/{อีเมล}` แล้วลบ pending
- `profile.role === 'admin'` → เป็นแอดมิน
- `patchProfile()` — อัปเดตแต้มในหน้าจอทันทีหลังแลก (ไม่ต้อง refresh)
- **โปรไฟล์ realtime** — หลังผูกบัญชีแล้ว `AuthContext` ฟัง `employees/{อีเมล}` ด้วย `onSnapshot` (effect แยก keyed ที่ `user.email`) → admin เพิ่ม/หักแต้มให้ ชิปแต้มบนมือถือเปลี่ยนเองโดยไม่ต้องปิด-เปิดแอป (เดิมอ่านครั้งเดียวตอนล็อกอิน ทำให้เปิดแอปค้างไว้เห็นแต้มเก่า)
- **อ่านโปรไฟล์ไม่ได้** (เช่น โควตา Firestore หมด/เน็ตหลุด) → `AuthProvider` โชว์หน้า "ระบบขัดข้องชั่วคราว" + ปุ่มลองใหม่ (`LoadErrorScreen`) แทนหน้าขาว (เดิม `getDoc` พังแล้ว `setLoading(false)` ไม่ถูกเรียก → หน้าขาวทั้งแอป)
- **redirect หลัง login เป็นแบบ declarative** — `Login.jsx` ไม่เรียก `navigate()` เอง (จะ race กับ `onAuthStateChanged` ที่ยัง `getDoc` profile ไม่เสร็จ → เด้งกลับ login ต้องกด 2 รอบ) แต่ใช้ `if (user) return <Navigate to="/" replace />` รอจน profile พร้อมแล้วค่อยพาเข้าหน้าหลัก
- **หน้า login มีตัวการ์ตูนเคลื่อนไหว** `iconmove.webp` (พื้นหลังโปร่งใส 160×160px) แทน emoji เดิม
- **ไม่มีปุ่ม "เข้าสู่ระบบด้วย Google" แล้ว** — กดที่ **รูป `loginmain.png`** (ครอบด้วย `<button>` เพื่อโฟกัส/กดด้วยคีย์บอร์ดได้) เพื่อเรียก `signInWithRedirect`; ตอนกำลังโหลดรูปจางลง + ขึ้น "กำลังเข้าสู่ระบบ..."
- **ขั้นผูกบัญชีครั้งแรก** — ใช้รูป `linkcard.png` เป็นพื้น + **ช่องกรอกรหัสซ้อนทับบนรูป** (`position: absolute`, ปรับ `bottom`/`width`/`padding`/`fontSize` ให้ตรงช่องว่างในรูป); รหัสบังคับ **ตัวพิมพ์ใหญ่เสมอ** (`toUpperCase()` + `textTransform: uppercase`); **ไม่มีปุ่มยืนยัน** — กด Enter ในช่องเพื่อ submit (ขึ้น "กำลังผูกบัญชี..." ตอนโหลด) + ปุ่ม "← ใช้บัญชี Google อื่น"
- **iconmove.webp ซ้อนทับบนการ์ด** (marginBottom ติดลบ) ให้การ์ตูนนั่งบนการ์ด
- **ล็อกไม่ให้หน้า login เลื่อน** — `useEffect` ตั้ง `body.overflow = hidden` ตอนเข้าหน้า (คืนค่าเมื่อออก) + container `height: 100dvh; overflow: hidden`

---

## โครงสร้างข้อมูล Firestore

| Collection | Doc ID | ฟิลด์สำคัญ |
|------------|--------|-----------|
| `employees` | อีเมล | name, email, department, points, role(`admin`/`employee`), code, createdAt |
| `pendingEmployees` | รหัสพนักงาน | name, code, department, points, role, createdAt (รอผูกบัญชี) |
| `rewards` | auto | name, description, pointCost, stock, unlimited, type(`normal`/`special`), emoji, image, requireProof, createdAt |
| `transactions` | auto | employeeId(=อีเมล), employeeName, rewardId, rewardName, pointsUsed, status, approval, proofUrl, note, addedByAdmin(แถวที่ admin บันทึกการแลกให้), imported + importBatch(แถวที่นำเข้าจากระบบเก่า + id ชุดนำเข้า — ดู 📥 นำเข้าประวัติย้อนหลัง), editedAt, createdAt |
| `announcements` | auto | title, body, pdfUrl, pdfName, createdAt |
| `auditLogs` | auto | action(แก้ไข/ลบ/เพิ่ม/`reset_points`/`import_history`/`import_rollback`), txId, employeeName, rewardName, detail, by, at (เก็บถาวร แก้/ลบไม่ได้) |
| `settings` | `redeem` | open(เปิด/ปิดการแลก master), enabled(ล็อกเวลา), hour, minute, dateY/dateM/dateD (admin ตั้งในหน้าจัดการรางวัล) |

### ⚠️ ข้อตกลงเครื่องหมาย `pointsUsed` (สำคัญมาก)
- **แลกรางวัล** → `pointsUsed` เป็น **บวก** (ใช้แต้มไป)
- **admin เพิ่มแต้ม** → `pointsUsed` เป็น **ลบ** (ได้รับ)
- **admin หักแต้ม** → `pointsUsed` เป็น **บวก**
- ผลต่อยอดแต้มพนักงาน = `-pointsUsed` เสมอ — **ยกเว้นแถวที่ `approval: 'ปฏิเสธ'`**: คืนแต้ม+สต็อกไปแล้วตอนปฏิเสธ จึงไม่มีผลต่อยอดอีก (ลบ/แก้แถวนั้นต้องไม่คืน/ปรับซ้ำ, ไม่นับใน "แต้มที่ใช้ไป" และ "สุทธิตามประวัติ")
- **"รายการแลก"** = `(rewardId || addedByAdmin) && pointsUsed >= 0` — แถวที่มี `addedByAdmin` แต่ `pointsUsed < 0` **ไม่ใช่รายการแลก** แต่เป็นการ **เพิ่มแต้ม**: ปุ่ม "➕ เพิ่มรายการ" เวอร์ชันเก่า (commit `76d3628`, 19 มิ.ย. → ก่อน `03e7d83`, 7 ต.ค. 2026) ไม่บล็อกค่าติดลบ ใส่ −500 = เพิ่ม 500 (เขียน `employees.points` + แถวประวัติใน transaction เดียวกัน แต้มจึง**ใช้แลกได้จริง**) แต่แถวนั้นเดิมโผล่ที่มือถือเป็น "--500" และหัก "แต้มที่ใช้ไป" → แก้แล้ว
- นิยามเหล่านี้อยู่ที่ `pointsLedger.js` ที่เดียว (มือถือ/แอดมิน/ตรวจยอดใช้ร่วมกัน) — อย่าเขียนเงื่อนไขกรอง `rewardId || addedByAdmin` ซ้ำเองในหน้าใหม่

### 🔑 ยอดแต้มจริงอยู่ที่ `employees.points` — ใครเปลี่ยนได้บ้าง
`transactions` (ประวัติ) เป็นแค่ **log** — ยอดจริงเก็บแยกที่ `employees.points` ถ้าแถวประวัติกับยอดจริงไม่ตรงกัน ให้ไล่ดูตารางนี้ก่อน

| อยากทำอะไร | ทำที่ไหน | ผลต่อ `employees.points` |
|-----------|---------|--------------------------|
| **เพิ่มแต้ม** (หรือหักแบบปรับยอด) | admin → **พนักงาน → ✏️ แก้ไข → ปรับแต้ม** (+ เพิ่ม / − หัก) | `max(0, เดิม + delta)` + แถวประวัติ "เพิ่มแต้มโดย Admin" / "หักแต้มโดย Admin" (ไม่ลง `auditLogs`) — **ทางเดียวที่เพิ่มแต้มได้โดยตั้งใจ** |
| บันทึกการแลกให้พนักงาน | admin → ประวัติทั้งหมด → 🎁 บันทึกการแลก (หักแต้ม) | `max(0, เดิม − pts)` — **หักอย่างเดียว** เพิ่มไม่ได้ |
| **ย้ายประวัติ + ตั้งยอดจากระบบเก่า** (หลายคนพร้อมกัน) | admin → ประวัติทั้งหมด → 📥 นำเข้าประวัติย้อนหลัง | **ตั้ง `points` = คะแนนทั้งหมด − ใช้แลกรวม เป๊ะ (ทับยอดเดิม)** ต่อคนใน `runTransaction` + แถวประวัติ ยอดยกมา/ล้างยอดเดิม/รายการแลก — ใช้แทนการวน ปรับแต้ม → บันทึกการแลก ทีละรายการ |
| พนักงานแลกเอง | มือถือ → หน้าหลัก | หัก `pointCost` **ล่าสุดในฐานข้อมูล** (atomic ใน `runTransaction`; แอดมินเพิ่งแก้ราคา → ไม่หัก `PRICE_CHANGED`) — `pointsDb.redeemReward` |
| ปฏิเสธการแลก | admin → อนุมัติของรางวัล | คืนแต้ม (`pointsUsed` ล่าสุดในฐานข้อมูล) + คืนสต็อก — ทำได้เฉพาะแถวที่ยัง "รออนุมัติ" จริง (`rejectRedemption`; หน้าค้างกดซ้ำ → `STALE` ไม่คืนซ้ำ) |
| แก้ / ลบแถวประวัติ | admin → ประวัติทั้งหมด → ✏️ / 🗑️ | ปรับ/ย้อนตามส่วนต่างของ `pointsUsed` **ล่าสุดในฐานข้อมูล** (ไม่ต่ำกว่า 0) — แถวที่ปฏิเสธแล้วไม่ขยับยอด/สต็อก, ลบซ้ำ → `GONE` (`editHistoryRow` / `deleteHistoryRow`) |
| ตั้งแต้มเริ่มต้น | admin → พนักงาน → แถว "รอผูกบัญชี" | แก้ที่ `pendingEmployees` (ไม่มีแถวประวัติ) → คัดลอกเข้า `employees` ตอนผูกบัญชี |
| รีเซ็ตทั้งระบบ | admin → พนักงาน → ♻️ | 0 ทุกคน + ลบ `transactions` ทั้งหมด |
| เปลี่ยนอีเมล | admin → พนักงาน → 🔄 | ย้ายแต้มไป `pendingEmployees/{รหัส}` — ⚠️ `transactions` เดิมยังผูกอีเมลเก่า (`employeeId`) พนักงานจะไม่เห็นประวัติเดิมที่มือถือ (หน้าประวัติทั้งหมดจะขึ้น "⚠️ ไม่พบบัญชี …") |

⚠️ ทุกจุดที่หักใช้ `Math.max(0, …)` → ถ้ายอดไม่พอ **แถวประวัติบันทึกเต็มจำนวนแต่ยอดจริงลดแค่ถึง 0** (ประวัติกับยอดจริงจะเพี้ยนกัน) — ถ้า backfill ย้อนหลัง ให้ **ปรับแต้ม (เพิ่ม) ก่อน แล้วค่อยบันทึกการแลก**

### สถานะ `approval` (เฉพาะรายการแลกรางวัล)
`รออนุมัติ` → `อนุมัติแล้ว` / `ปฏิเสธ` (ปฏิเสธจะคืนแต้ม + คืนสต็อก) — เปลี่ยนสถานะได้ครั้งเดียวจาก `รออนุมัติ` (ตรวจใน transaction); รางวัลไม่จำกัด (`unlimited`, `stock: null`) ไม่แตะสต็อกทั้งตอนแลกและตอนคืน

### หลักการของ `pointsDb.js` (ห้ามถอยกลับ — เป็นต้นเหตุของบั๊กแต้มที่เคยเจอ)
1. ตัดสินใจจาก **ค่าล่าสุดในฐานข้อมูลที่อ่านใน transaction** ไม่ใช่แถวที่ค้างใน state ของหน้า (หน้าแอดมินโหลดครั้งเดียวแล้วค้างได้นาน เพื่อประหยัดโควตา) — เดิมใช้แถวที่ค้าง → ปฏิเสธซ้ำคืนแต้มซ้ำ, ลบซ้ำคืนซ้ำ, แลกด้วยราคาเก่า
2. แถว `ปฏิเสธ` ไม่มีผลต่อยอดอีก (ดูด้านบน) 3. รางวัลไม่จำกัดไม่แตะสต็อก 4. ยอดไม่ต่ำกว่า 0
5. error ที่มี `code` ให้หน้าจอแยกแยะ: `STALE` (+`.current` สถานะล่าสุด) / `GONE` / `PRICE_CHANGED` / `ALREADY` / `CHANGED` (นำเข้า) — หน้าจอแก้แถวให้ตรงความจริงแล้วแจ้ง ไม่ทำซ้ำ
6. การเปลี่ยนยอดแต้มแบบใหม่ → เพิ่มที่ไฟล์นี้ + เทสต์ที่ `emulator-tests/run.mjs` (ไม่เขียน transaction ยอดแต้มกระจายในหน้า)

---

## 📱 หน้า MOBILE (พนักงาน)

พนักงานถูกบังคับเป็น layout มือถือเสมอ (`forceMobile` ใน `Layout.jsx`) — ซ่อน sidebar เดสก์ท็อป, แสดง topbar (แบนเนอร์ `texttopbar.png` กดเปิด drawer) + bottom nav

### เมนูล่าง (BottomNav) — `NAV_EMPLOYEE`
1. **หน้าหลัก** (Home.png) → `/dashboard`
2. **ประกาศ** (Megaphone.png) → `/announcements` — มี **badge ตัวเลข** ประกาศที่ยังไม่อ่าน
3. **ประวัติการแลก** (logocheck.png) → `/history`

> กล่องคำพูด (speech bubble) ทั้ง 3 หน้า mobile ใช้ **รูปข้อความ** แทนตัวอักษร (PNG โปร่งใส + คลาส `.img-glow` เรืองนีออน): หน้าหลัก = `testtext.png`, ประกาศ = `textreward.png`, ประวัติ = `texthistory.png`

### Drawer (แฮมเบอร์เกอร์ / กด topbar)
แบบ compact: โลโก้ (iconsleep.png) + กล่องคำพูด + การ์ดข้อมูล (ชื่อ/แผนก/รหัสพนักงาน) + ปุ่มออกจากระบบ

### Dashboard.jsx (หน้าหลัก)
- ทักทาย + รูปโลโก้ + กล่องคำพูด (speech bubble)
- **ชิปแต้มคงเหลือ** — พื้นเป็นรูป `pointchip.png` (width 100%) + **ตัวเลขแต้มซ้อนทับ** (`position: absolute`, ปรับ `right`/`top`) มีแสงนีออน (`.neon-glow`) → **กดเพื่อดู popup "แต้มที่ได้รับเดือนนี้"** (jelly in/out; เฉพาะแถวที่ `pointsUsed < 0` ของเดือนปัจจุบัน และ **ไม่นับแถว `imported`** (ยอดยกมาจากระบบเก่าไม่ใช่แต้มที่เพิ่งได้รับ); ใช้ข้อมูลชุดเดียวกับที่โหลดตอนเปิดหน้า และโหลดใหม่เฉพาะตอน `profile.points` เปลี่ยนจริง ไม่ยิงคิวรีตอนกดชิป) ตัวเลขแต้มบนชิปมาจาก `profile.points` ซึ่งอัปเดตสดผ่าน `onSnapshot` ใน `AuthContext`
- รางวัลแยก 2 กลุ่ม: **🌟 รางวัลพิเศษ** (badge pulse) / **🎁 รางวัลปกติ**
- การ์ดรางวัล (ฟอนต์ Itim ทั้งการ์ดรวมปุ่มแลก): รูป/emoji, ป้ายสต็อก (ขาว), ป้ายประเภท, รายละเอียด, ราคาแต้ม, ปุ่มแลก
  - แต้มไม่พอ → ปุ่ม "แต้มไม่พอ!" กดแล้วเด้ง popup "แต้มไม่พอ!" (รูป `iconcry.png`, ฟอนต์ Itim ทั้งการ์ดรวมปุ่ม)
  - **admin ปิดการแลก** (`open: false`) → ปุ่ม disable แสดง "🔴 งดแลกชั่วคราว"
  - **ยังไม่ถึงเวลาเปิดแลก** → ปุ่ม disable แสดง "⏰ เปิดแลก HH:MM น." (หรือ DD/MM HH:MM ถ้ากำหนดวัน) — อ่านค่าจาก `settings/redeem`, เช็คทุก 30 วิ เปิดเองตอนถึงเวลา
  - **หมดแล้ว / มีคนแลกตัดหน้า** → ปุ่ม "หมดแล้ว" กดได้ (ไม่ disable) เด้ง popup "ไม่ทันจ้า! มีคนตัดหน้า" (รูป `iconlol.png`, modal-slideup) — ดักจาก error `'ของหมดแล้ว'` ใน transaction ด้วย
  - รางวัล `requireProof` → ต้องแนบรูปหลักฐาน (Cloudinary) ก่อนยืนยัน
- แลกแล้ว → หักแต้ม + ลดสต็อก + สร้าง transaction (`approval: 'รออนุมัติ'`) **ใน `runTransaction` เดียว (atomic)** ด้วย `tx.set` — กันกรณีแต้มหายแต่ไม่มีประวัติ (`pointsDb.redeemReward`; ก่อน commit `0fe6fed` 18 มิ.ย. 2026 ยังเขียนประวัติแยกหลัง transaction — แลกช่วง 15–18 มิ.ย. อาจมีแต้มหักแต่ไม่มีแถว)
  - **ราคาที่หักใช้ค่าล่าสุดในฐานข้อมูล** ไม่ใช่ราคาที่หน้าจอโหลดค้างไว้: แอดมินเพิ่งแก้ราคา → ไม่หักแต้ม ปิดกล่องยืนยัน แจ้งข้อความ + โหลดรางวัลใหม่ให้เห็นราคาล่าสุด (`PRICE_CHANGED`)
- popup แจ้งเตือนเมื่อ admin อนุมัติ (จำด้วย localStorage `approvedSeen_<email>`) — เช็คเฉพาะตอนเปิดหน้า; รายการของตัวเองดึง **ครั้งเดียว** (`loadMyTransactions`) ใช้ทำทั้ง popup นี้และ popup "แต้มที่ได้รับ" (เดิมยิงคิวรีเดียวกันสองรอบ)

### Announcements.jsx (ประกาศ)
- โลโก้ iconmegaphone.png + กล่องคำพูด, ฟอนต์ทั้งหน้าเป็น Itim
- แสดงประกาศ + ถ้ามี PDF (หน้าเดียว) แสดงเป็นรูป (Cloudinary `pg_1` render) + ลิงก์เปิดต้นฉบับ
- **เลขแดงประกาศใหม่** (BottomNav): อ่าน id ประกาศ **ครั้งเดียวต่อรอบเปิดแอป** ผ่าน `announcementsCache.js` เปลี่ยนหน้าแล้วคำนวณจาก cache + localStorage (ไม่ยิง Firestore ซ้ำ); หน้านี้อ่านรายการของตัวเองอยู่แล้วจึงส่ง id ต่อให้ cache (`setAnnouncementIds`) · ⚠️ ประกาศที่โพสต์ตอนพนักงานเปิดแอปค้างอยู่ เลขแดงจะขึ้นตอนเปิดแอปครั้งถัดไป

### History.jsx (ประวัติการแลก)
- โลโก้ iconcheck.png + กล่องคำพูด
- แสดงรายการที่ **แลกรางวัลเอง (มี `rewardId`)** + **รายการที่ admin บันทึกแทนให้ (`addedByAdmin`)** — ไม่รวมแค่ admin ปรับแต้มเฉยๆ (กรองด้วย `isRedemption` จาก `pointsLedger.js`)
  - ⚠️ เดิมกรองด้วย `t.rewardId` อย่างเดียว ทำให้รายการที่ admin กด "🎁 บันทึกการแลก" (ซึ่ง `rewardId: null`) **ไม่ขึ้นในมือถือ** — ต้องกรองด้วย `t.rewardId || t.addedByAdmin`
  - ⚠️ ต้องเป็น `pointsUsed >= 0` ด้วย: แถว "เพิ่มแต้ม" ที่ปุ่มเพิ่มรายการเวอร์ชันเก่าสร้าง (`addedByAdmin` แต่ติดลบ) **ไม่ขึ้นในหน้านี้** (เดิมโผล่เป็น "--500" และหักลด "แต้มที่ใช้ไป") — regression test: `pages/History.test.js`
  - รายการที่ **ปฏิเสธ** ยังโชว์พร้อมป้าย "ปฏิเสธ" และแต้มถูกขีดฆ่า แต่ **ไม่นับ** ใน "แต้มที่ใช้ไป" (คืนแต้มให้แล้ว)
  - แถว **"เพิ่มแต้มโดย Admin" / "หักแต้มโดย Admin"** (จากหน้า พนักงาน → ปรับแต้ม) **ไม่ขึ้นในหน้านี้โดยตั้งใจ** — พนักงานเห็นแต้มที่ได้รับใน popup ของชิปแต้มหน้าหลักแทน
  - ดึงด้วย `where('employeeId', '==', user.email)` → แถวที่ผูกกับอีเมลเก่า (หลังเปลี่ยนอีเมล) จะไม่ขึ้น
- การ์ด "แต้มที่ใช้ไป" + รายการพร้อม **สถานะอนุมัติ** (รออนุมัติ/อนุมัติแล้ว/ปฏิเสธ)

---

## 🖥️ หน้า DESKTOP (admin)

admin เห็น sidebar ซ้าย (เมนูเต็ม) — บนจอแคบจะกลายเป็น topbar+drawer

### เมนู sidebar — `NAV_ADMIN`
- 📊 Overview → `/admin`
- 👥 พนักงาน → `/admin/employees`
- 🎁 จัดการรางวัล → `/admin/rewards`
- ✅ อนุมัติของรางวัล → `/admin/approvals`
- 📢 จัดการประกาศ → `/admin/announcements`
- 📜 ประวัติทั้งหมด → `/admin/history`
- หมวด "มุมมองพนักงาน" → 📱 พนักงาน (แสดงผล) → `/admin/preview`

### Admin.jsx (ภาพรวม)
รายการล่าสุด + อันดับแต้มสะสม (กรอง admin ออก, โชว์ 10 คน) + สต็อกรางวัล (เอาการ์ดสถิติ stat-card ออกแล้ว)

> หน้า admin ทุกหน้า **เอาหัวข้อ (page-title/page-sub) ออกแล้ว** — หน้าที่มีปุ่ม (จัดการพนักงาน/รางวัล/ประกาศ) เก็บปุ่มไว้ชิดขวาด้วย `<div />` ว่างใน page-header

### AdminEmployees.jsx (จัดการพนักงาน)
- เพิ่มพนักงานด้วย **รหัสพนักงาน** (ไม่ต้องรู้อีเมล) → สร้าง `pendingEmployees/{รหัส}`; ช่อง "แผนก" เป็น **dropdown** (optgroup ตาม `DEPT_GROUPS`)
- ตารางรวม "เข้าระบบแล้ว" + "รอผูกบัญชี" — **แยกกลุ่มตามแผนก** (Sale / Warehouse / Office / อื่นๆ) มีแถวหัวกลุ่ม + จำนวนคน; เทียบแผนกแบบไม่สนตัวพิมพ์เล็ก/ใหญ่ (`groupOfDept`)
  - `DEPT_GROUPS` (module-level): **Sale** = Pharmarcist / Pharmarcist Assistant / Pharmarcist Mobile / Sale Admin · **Warehouse** = Outbound / Inbound / Inventory / Warehouse Manager / Packing · **Office** = IT Support / Accountant / Purchase / Procurement Manager / HR&Admin
- ปุ่มเดียว **✏️ แก้ไข** → modal (slide down เปิด/ปิด) แก้ **ชื่อ/แผนก/สิทธิ์** + **ปรับแต้ม** (ใส่ + เพื่อเพิ่ม / − เพื่อหัก, บันทึกประวัติ `transactions`) — **นี่คือที่เดียวที่ "เพิ่มแต้ม" ให้พนักงาน** (หน้า ประวัติทั้งหมด หักได้อย่างเดียว); พนักงานรอผูกบัญชีแก้ "แต้มเริ่มต้น" ตรงๆ + **ลบพนักงาน**
  - **ปรับแต้มเขียนด้วย `runTransaction`**: อ่านยอดล่าสุดจากฐานข้อมูลตอนบันทึก (ไม่ใช้เลขที่ค้างบนหน้าจอ) แล้วเขียน `points` + แถวประวัติ (`transactions`) พร้อมกัน → ไม่มีกรณียอดเปลี่ยนแต่ไม่มีแถวประวัติ; หักแล้วไม่ต่ำกว่า 0 (แถวประวัติยังบันทึกเต็มจำนวน)
  - หลังบันทึก **อัปเดตเฉพาะแถวนั้นในหน้าจอ** ไม่ `fetchAll()` ใหม่ (ประหยัดโควตาอ่าน — ดูหัวข้อโควตา Firestore); error แสดงในโมดัล (สีแดง) ถ้า transaction ล้มจะไม่มีอะไรถูกบันทึก; ส่วน เพิ่ม/ลบ/เปลี่ยนอีเมล/รีเซ็ต ยัง `fetchAll()` ใหม่เหมือนเดิม (ใช้ไม่บ่อย)
- **🔄 เปลี่ยนอีเมล** (เฉพาะคนที่เข้าระบบแล้ว) — ปลดอีเมลออกแต่คงรหัส/ข้อมูล/แต้ม → ย้ายกลับเป็น `pendingEmployees/{รหัสเดิม}` แล้วลบ `employees/{อีเมลเก่า}`; พนักงานล็อกอิน Gmail ใหม่ + กรอกรหัสเดิม → ผูกอีเมลใหม่
- **♻️ รีเซ็ตแต้มทั้งระบบ** — ปุ่มสีแดง + modal ยืนยันต้องพิมพ์ `RESET` → ตั้ง `points: 0` ทุกคนใน `employees` + `pendingEmployees` **และลบ `transactions` ทั้งหมด** (เริ่มนับใหม่, `writeBatch` ครั้งละ 400) + บันทึก `auditLogs` (`action: reset_points`)
- ช่องค้นหา + หัวตาราง (`thead`) พื้นหลังขาว (inline เฉพาะหน้านี้)

### AdminRewards.jsx (จัดการรางวัล)
- เพิ่ม/แก้/ลบ รางวัล — ประเภท (ปกติ/พิเศษ), รูปจาก **URL** (รองรับแปลงลิงก์ Google Drive), ไม่จำกัดจำนวน, ต้องแนบหลักฐาน
- เรียงแยก 2 กลุ่ม (พิเศษ/ปกติ) เหมือนฝั่งมือถือ
- กด "แก้ไข" → เลื่อนขึ้นไปที่ฟอร์มอัตโนมัติ
- **การ์ด "สถานะการแลกของรางวัล"** — ปุ่ม **เปิด/ปิดการแลกทันที** (master switch, field `open`) บันทึกลง `settings/redeem` เลย; ปิดแล้วพนักงานแลกไม่ได้ทันทีไม่ว่าถึงเวลาหรือไม่
- **การ์ด "⏰ เวลาเปิดให้พนักงานแลกรางวัล"** — ตั้งเปิด/ปิดล็อกเวลา + เวลา (HH:MM) + เฉพาะวันที่ (เว้นว่าง=ทุกวัน) → บันทึกลง `settings/redeem`; ทั้งหน้าพนักงานและ Firestore Rules อ่านค่านี้

### AdminApprovals.jsx (อนุมัติของรางวัล)
- รายการที่พนักงานแลกเข้ามา (มี `rewardId`) — กรองตามสถานะ
- ดูรูปหลักฐาน → **อนุมัติ** หรือ **ปฏิเสธ** (คืนแต้ม + คืนสต็อก) — ผ่าน `pointsDb.approveRedemption / rejectRedemption`
- โหลด `transactions` ตอนเปิดหน้าครั้งเดียว — อนุมัติ/ปฏิเสธอัปเดตเฉพาะแถวนั้นในหน้าจอ (ไม่โหลดทั้งคอลเลกชันใหม่); error แสดงแบนเนอร์แดง
- ⚠️ หน้านี้ค้างได้นาน จึงต้องตรวจสถานะล่าสุด **ใน transaction**: ทำได้เฉพาะแถวที่ยัง "รออนุมัติ" จริง — แอดมินอีกคน/แท็บเก่าจัดการไปแล้ว → `STALE` หน้าจอแก้สถานะแถวให้ตรงความจริงแล้วแจ้ง (`GONE` = แถวถูกลบ → เอาออกจากหน้าจอ); เดิมปฏิเสธซ้ำคืนแต้มซ้ำ และอนุมัติทับแถวที่ปฏิเสธ/คืนแต้มไปแล้วได้ — เทสต์: `pages/AdminApprovals.test.js` + `emulator-tests/run.mjs`

### AdminAnnouncements.jsx (จัดการประกาศ)
- โพสต์/ลบประกาศ + แนบ **PDF หน้าเดียว** (เช็คด้วย pdf-lib → อัป Cloudinary)

### AdminHistory.jsx (ประวัติทั้งหมด)
- **จัดกลุ่มตามพนักงานแต่ละคน** (ไม่ใช่ลิสต์เรียงเวลารวมแล้ว) — เรียงชื่อ ก-ฮ (`localeCompare(…, 'th')`), รายการในกลุ่มยังเรียงล่าสุดก่อน; ตารางไม่มีคอลัมน์ "พนักงาน" แล้ว (ชื่ออยู่บนแถวหัวกลุ่ม)
- **แถวหัวกลุ่มคลิกเปิด/ปิดได้** (`expanded` = `Set` ของ key พนักงาน) — ค่าเริ่มต้น **ปิดทั้งหมด**, มีลูกศร `▶` หมุน 90° ตอนเปิด
- แถวหัวกลุ่มโชว์ **อีเมล** (= `employeeId` ที่แถวเหล่านั้นผูกอยู่) + 3 ยอด:
  - **⭐ แต้มที่ใช้ไป** — เฉพาะ `rewardId || addedByAdmin` (ให้ตรงกับหน้า History ฝั่งพนักงาน)
  - **สุทธิตามประวัติ** — ผลรวม `pointsUsed` ทุกแถวในกลุ่ม (รวมแถว admin ปรับแต้ม) เป็นแค่ **log**
  - **💰 คงเหลือจริง** — `employees.points` ตอนนี้ (ตัวเลขเดียวกับหน้า พนักงาน และบนมือถือ); หลัง เพิ่ม/แก้/ลบ อัปเดตยอดนี้ในหน้าจอจากค่าที่ได้ใน transaction (ไม่โหลดรายชื่อใหม่)
  - ⚠️ "สุทธิตามประวัติ" กับ "คงเหลือจริง" ไม่จำเป็นต้องเท่ากัน (แต้มเริ่มต้น, แก้/ลบย้อนหลัง, หักแล้วติด clamp ที่ 0, รีเซ็ต)
  - ถ้าขึ้น **"⚠️ ไม่พบบัญชี <อีเมล>"** = แถวเหล่านั้นผูกกับ `employeeId` ที่ไม่มีใน `employees` แล้ว (ถูกลบ/เปลี่ยนอีเมล) → พนักงานจะไม่เห็นรายการเหล่านั้นที่มือถือ
- **🎁 บันทึกการแลก (หักแต้ม)** (ปุ่มบนสุด เดิมชื่อ "➕ เพิ่มรายการ"; เลือกจาก `employees` ที่ผูกบัญชีแล้ว ไม่เอา admin)
  - **หักแต้มจริง** `Math.max(0, points − pts)` + สร้าง transaction ใน `runTransaction` เดียว (`rewardId: null`, `addedByAdmin: true`, `status: 'สำเร็จ'`, `approval: 'อนุมัติแล้ว'`) — ยอดไม่พอ → แถวยังบันทึกเต็มจำนวนแต่ยอดจริงลดแค่ถึง 0
  - ใส่ `0` = บันทึกเฉยๆ ไม่หักแต้ม; **ค่าติดลบถูกบล็อก** (เดิมใส่ลบแล้วกลายเป็นเพิ่มแต้มแบบเงียบๆ ทั้งที่ประวัติขึ้นเป็นรายการแลก)
  - **ปุ่มนี้ไม่มีทางเพิ่มแต้ม** — โมดัลมีกล่องเตือน + ลิงก์ไปหน้า พนักงาน; error ขึ้นในโมดัล (สีแดง) ไม่ใช่แบนเนอร์เขียวหน้าหลัก
  - ❗ เอกสารเดิมเขียนว่าปุ่มนี้เป็น `recordOnly` (ไม่หักแต้ม) — **ไม่เคยมีในโค้ดทุก commit**
- **📥 นำเข้าประวัติย้อนหลัง** (`components/ImportHistoryModal.jsx` + `importHistory.js` / `importHistoryDb.js`) — ไว้ย้ายจากระบบเก่า: เลือก **วันตัดยอด** (บังคับ) → วางจาก Excel (คั่น Tab) `พนักงาน | ชื่อรางวัล | คะแนนทั้งหมด | คะแนนที่ใช้แลก | วันที่ (ไม่บังคับ) | คงเหลือ (ไม่บังคับ แต่แนะนำ)` → 🔍 ตรวจสอบ (พรีวิวต่อคน) → นำเข้า
  - **"คะแนนทั้งหมด" = คะแนนสะสมที่เคยได้ทั้งหมด (ก่อนหักที่แลก)** ค่าเดียวต่อคน (ต้องเท่ากันทุกแถวของคนนั้น) → ตั้ง `employees.points` = **คะแนนทั้งหมด − ใช้แลกรวม เป๊ะ ทับยอดเดิม** (ยอดเดิมใช้ค่าที่อ่านใน transaction ไม่ใช่เลขในพรีวิว); ใช้แลกรวม > คะแนนทั้งหมด = ข้อมูลไม่สอดคล้อง ข้ามคนนั้น
  - **คอลัมน์ "คงเหลือ" (ที่ 6) ใช้ตรวจเท่านั้น ไม่ใช่ค่าที่ตั้ง**: ถ้าใส่ และ ≠ ทั้งหมด − ใช้แลกรวม → ข้ามคนนั้นพร้อมบอกว่า "รายการขาดไป/เกินมา" เท่าไร (เจอบ่อยสุดคือรายการแลกหายบางรายการ → ตั้งยอดผิดเงียบๆ ถ้าไม่มีการตรวจนี้); ค่าต้องเท่ากันทุกแถวของคนนั้น หรือใส่แถวเดียวก็พอ; ไม่ใส่ = ไม่ตรวจ (ป้ายสรุปในพรีวิวบอก "เทียบแล้ว N/M คน"). แก้ที่ข้อมูลเสมอ — เพิ่มแถวชดเชย เช่น "ใช้แลก (ไม่มีรายละเอียด)" ให้ครบ; ไฟล์ที่ไม่มีคอลัมน์วันที่ให้เว้นคอลัมน์ที่ 5 ไว้ว่าง (ถ้าเอา "คงเหลือ" ไปไว้คอลัมน์ที่ 5 ระบบจะแจ้งให้ย้าย)
  - แถวที่เขียนต่อคน (`runTransaction` เดียว, ทุกแถวติด `imported: true` + `importBatch`): **ยอดยกมาจากระบบเก่า** `pointsUsed = −T` (doc ID คงที่ `imp_<อีเมล>` = ตัวกันนำเข้าซ้ำ; ไม่มี `addedByAdmin` → ไม่ขึ้นประวัติมือถือ ไม่นับ "แต้มที่ใช้ไป") · **ล้างยอดเดิมก่อนนำเข้า** `+ยอดเดิม` (เฉพาะเมื่อยอดเดิม ≠ 0) · **รายการแลก** `pointsUsed = +u`, `addedByAdmin: true`, `approval: 'อนุมัติแล้ว'`, `rewardId: null`, `createdAt` = วันที่ของแถว (ว่าง = วันตัดยอด) → หัวกลุ่ม "สุทธิตามประวัติ" = "คงเหลือจริง" ตรวจด้วยตาได้
  - จับคู่พนักงานด้วย รหัส → อีเมล → ชื่อ (เฉพาะที่ **ผูกบัญชีแล้ว** เพราะประวัติผูกอีเมล — "รอผูกบัญชี"/แอดมิน/ชื่อซ้ำ/ไม่พบ = ข้ามพร้อมเหตุผลในพรีวิว; อ่าน `pendingEmployees` 1 ครั้งตอนกดตรวจสอบครั้งแรก) · คนที่ไม่เคยแลก = แถวเดียว เว้นชื่อรางวัล + ใช้แลก 0 · วันที่รองรับ วัน/เดือน/ปี ทั้ง ค.ศ./พ.ศ. · ต่อคนไม่เกิน 400 รายการ
  - นำเข้าทีละคน: ล้มคนหนึ่งไม่กระทบคนอื่น และรันซ้ำปลอดภัย (คนที่นำเข้าแล้วถูกข้าม); **↩️ ย้อนชุดนี้** (ส่วน "ชุดที่นำเข้าแล้ว" ในโมดัล) ลบแถวของชุด + คืนยอด (`+Σ pointsUsed` ไม่ต่ำกว่า 0); ทั้งสองลง `auditLogs` (`import_history` / `import_rollback`)
  - **ย้อนชุดต้องยอดยังเท่ากับที่ชุดนั้นตั้งไว้** (`planRollback.expected` = ผลของแถวยอดยกมา + รายการแลกของชุด; คำนวณจากแถวปัจจุบันของชุด จึงตามไปเมื่อแถวถูกแก้/ลบทีหลัง): ถ้าหลังนำเข้ามีการแลก/ปรับแต้มต่อ → ข้ามคนนั้นพร้อมเหตุผล (`CHANGED`) ไม่แตะอะไร ให้จัดการด้วยมือ (ย้อนอัตโนมัติจะทำให้ยอดผิด/ติดเพดาน 0)
  - ⚠️ **วันตัดยอดควรเป็นวันในอดีต** (เช่นวันสุดท้ายของระบบเก่า) ไม่งั้นแถวที่นำเข้าจะกอง "รายการล่าสุด" หน้า Overview; หน้า ประวัติทั้งหมด อ่านทุกแถวตอนเปิด จึงหนักขึ้นตามจำนวนแถวที่นำเข้า
  - ทดสอบ: ตรรกะ + หน้าจอโมดัล (mock Firestore) ด้วย `npm test`; ส่วนเขียน Firestore (`importHistoryDb.js`) ทดสอบกับ Firestore emulator + `firestore.rules` จริงที่ `emulator-tests/run.mjs` (หัวข้อ "การทดสอบ" ด้านล่าง)
- **🔎 ตรวจยอดแต้ม** (`components/ReconcilePanel.jsx`, อ่านอย่างเดียว — คำนวณจาก `transactions` + `employees` ที่หน้าโหลดไว้แล้ว **ไม่มี read/write เพิ่ม**): เทียบ "💰 คงเหลือจริง" กับ "สุทธิตามประวัติ" (ไม่นับรายการที่ปฏิเสธ) ของทุกคน → แยก ✅ ตรง / ⚠️ ไม่ตรง / ⚪ ไม่มีประวัติเลย (ปกติถ้ามีแต้มเริ่มต้น); ค่าเริ่มต้นโชว์เฉพาะ "ไม่ตรง" เรียงผลต่างมากไปน้อย พร้อมข้อสังเกตต่อคน (เพิ่มแต้มด้วยปุ่มเก่า N แถว (+แต้ม), มีรายการปฏิเสธ, นำเข้าแล้วแต่ยอดไม่ตรง) + รายการประวัติของบัญชีที่ไม่พบใน `employees`
  - ⚠️ ผลต่าง ≠ 0 **ไม่ได้แปลว่าผิดเสมอ** (แต้มเริ่มต้นตอนผูกบัญชี/ที่ตั้งด้วยมือไม่มีแถวประวัติ; หักติด clamp 0) — คนที่นำเข้าด้วยเครื่องมือนำเข้าควรผลต่าง = 0
- **✏️ แก้ไข** — แก้ **ชื่อรางวัล + แต้ม + รายละเอียด**; ถ้าแก้แต้มจะปรับยอดจริงของพนักงานตามส่วนต่าง (`Math.max(0, …)`) โดยคิดจาก **ค่าล่าสุดในฐานข้อมูล** (`pointsDb.editHistoryRow`)
  - แถวที่ **ปฏิเสธแล้ว** แก้ตัวเลขได้แต่ **ไม่ขยับยอด** (โมดัลมีกล่องแจ้ง) · แถวที่ปฏิเสธในตารางมีป้าย "ปฏิเสธ" + ตัวเลขขีดฆ่า
  - ⚠️ ต่างจากเจตนาเดิม: commit `76d3628` ตั้งใจให้แก้ได้แค่ชื่อ/รายละเอียด **ไม่กระทบแต้ม** (กัน admin แอบปรับแต้มผ่านหน้านี้) แต่ `saveEdit` ยังปรับแต้มอยู่ — ถ้าจะล็อกให้ตรงเจตนาเดิมต้องแก้ `editHistoryRow`
- **🗑️ ลบ** — ย้อนผลของแถวนั้นกลับเข้ายอดจริงเสมอ (`points + pointsUsed`, ไม่ต่ำกว่า 0: แถวแลก/หัก = คืนแต้ม, แถวเพิ่มแต้ม = หักออก) + คืนสต็อก +1 เฉพาะแถวที่มี `rewardId` (ไม่รวมรางวัลไม่จำกัด); ⚠️ คืนเต็ม `pointsUsed` แม้ตอนบันทึกเคยติด clamp (`pointsDb.deleteHistoryRow`)
  - **แถวที่ปฏิเสธแล้ว: ลบแถวอย่างเดียว ไม่คืนแต้ม/สต็อกซ้ำ** (คืนไปแล้วตอนปฏิเสธ — เดิมคืนซ้ำ ยอดเกิน) · ลบซ้ำจากหน้าค้าง → `GONE` ไม่คืนซ้ำ
- "สุทธิตามประวัติ" / "แต้มที่ใช้ไป" ที่หัวกลุ่ม และตัวเลข "รวม N แต้ม" ข้างช่องค้นหา ใช้ `netUsedOf` / `spentOf` (ไม่นับแถวที่ปฏิเสธ; "แต้มที่ใช้ไป" ไม่นับแถวเพิ่มแต้มของปุ่มเก่า)
- ทุกการแก้/เพิ่ม/ลบบันทึกลง **auditLogs** (ปุ่ม "บันทึกการแก้ไข"); พาเนล log รองรับ `action: reset_points` (badge "♻️ รีเซ็ตแต้มทั้งระบบ") และ `import_history` / `import_rollback` (badge "นำเข้าประวัติ" / "ย้อนการนำเข้า"); แถวที่นำเข้าในตารางมีป้าย "· นำเข้า" ต่อท้ายชื่อรางวัล
- **ประหยัดโควตาอ่าน** (ห้ามกลับไปใช้ `fetchTx(); fetchLogs(); fetchEmployees()` ทั้งชุดหลังทุกรายการ — เคยทำให้โควตา Firestore หมดทั้งแอป):
  - ตอนเปิดหน้าโหลด `transactions` + `employees` + **จำนวน** log (`getCountFromServer` ≈ 1 read); `auditLogs` ทั้งหมดโหลดตอนเปิดแผงครั้งแรกเท่านั้น
  - หลัง เพิ่ม/แก้/ลบ: เพิ่ม/แก้/ลบแถวใน state, อัปเดตยอดพนักงานจากค่าใน transaction (`patchBalance`), เติม log ใหม่เข้า state เอง → อ่านเพิ่มแค่ ~1 doc (พนักงานใน transaction)
  - ถ้าสงสัยว่าข้อมูลหน้าจอเก่า (เช่นมีแอดมินอีกคนแก้) ให้รีเฟรชหน้า (F5)
  - แถวที่เพิ่งเพิ่มเก็บ `createdAt` เป็น `Date` (ไม่ใช่ Timestamp) จึงอ่านวันที่ผ่าน `toJsDate()` ที่รองรับทั้งสองแบบ
  - error: แบนเนอร์แดง (หน้า) / กล่องแดงในโมดัล (เพิ่ม) — โหลดไม่สำเร็จจะไม่ค้าง "กำลังโหลด..."

### MobilePreview.jsx (พนักงาน (แสดงผล))
แสดงหน้าพนักงานในกรอบมือถือ (iframe + `?preview=employee` บังคับ layout/เมนูแบบพนักงาน)

---

## ข้อตกลง UI / สไตล์ (index.css)

- **ธีมสี Peach & Coral** — กำหนดที่ `:root` (`--bg`, `--primary`, `--primary-dark`, `--border` ฯลฯ) แก้ที่เดียวเปลี่ยนทั้งแอป
- **ฟอนต์**: Nunito (หลักฝั่งพนักงาน) + **Itim** (กล่องคำพูด, drawer พนักงาน, ข้อความน่ารัก) + **Sarabun** (หน้า admin) — import บรรทัดบนสุดของ index.css
  - **หน้า admin ใช้ Sarabun** — scope ที่ `.layout:not(.layout--mobile) .main` (รวมปุ่ม/ฟอร์ม/ตาราง) และ `.sidebar` + `.sidebar .speech-bubble`; ฝั่งพนักงาน (มี `.layout--mobile`) ยังเป็น Nunito/Itim
- **sidebar admin**: โลโก้ `iconadmin.png` (100×100) + speech bubble "Admin / ดูแลระบบ" (จัดกึ่งกลาง); **ไม่มีการ์ด avatar**; กว้าง `--sidebar-w: 320px`; ไอคอนเมนูทุกอันใช้ `iconplus.png` (ตัวแปร `MENU_ICON`); สีพื้นตอนเลือกเมนู = `.sidebar .nav-item.active { background: #FBEBE7 }` (เฉพาะ admin); avatar ในตารางจัดการพนักงานใช้ `star-profile.png`
- **`.speech-bubble`** — กล่องคำพูดพื้นขาว หางชี้ซ้าย ฟอนต์ Itim (ใช้ Dashboard/Announcements/History/Sidebar)
- **`.card`, `.btn-primary`, `.badge`, `.cost-pill`, `.stat-card`** — คลาส utility ใช้ร่วมทุกหน้า (แก้คลาส = กระทบทุกที่; อยากแยกใช้ inline style)
- **`forceMobile`** = ไม่ใช่ admin หรือ `?preview=employee` → บังคับ layout มือถือ
- **topbar กดทั้งแถบเพื่อเปิด drawer** (ไม่มีปุ่มแฮมเบอร์เกอร์แล้ว); พนักงานเห็นแบนเนอร์ `texttopbar.png`, admin เห็นไอคอน+ชื่อ
- ตัด tap-highlight สีฟ้าตอนแตะ + focus outline ออกแล้ว (`* { -webkit-tap-highlight-color: transparent }`)

### รูปภาพใน `public/` (อ้างด้วย path `/ชื่อไฟล์` — เปลี่ยนรูปทับชื่อเดิมได้โดยไม่ต้องแก้โค้ด + hard refresh)
`icon.png` (โลโก้หัว Dashboard/topbar admin), `texttopbar.png` (แบนเนอร์ topbar พนักงาน), `Home.png` / `Megaphone.png` (ไอคอน bottom nav), `iconsleep.png` (โลโก้ drawer), `iconmegaphone.png` (หัวหน้าประกาศ), `iconcheck.png` (หัวหน้าประวัติ), `star-profile.png`, `iconadmin.png` (โลโก้ sidebar admin), `iconmove.webp` (การ์ตูนเคลื่อนไหวหน้า login — สร้างจาก `iconmove.gif` ลบพื้นหลังด้วย flood fill จากขอบให้โปร่งใส), `loginmain.png` (รูปกดเข้าสู่ระบบหน้า login), `linkcard.png` (พื้นขั้นผูกบัญชี — ช่องรหัสซ้อนทับ), `logocheck.png` (ไอคอนประวัติใน bottom nav), `iconplus.png` (ไอคอนเมนู sidebar admin), `iconcry.png` (รูปใน popup "แต้มไม่พอ!"), `iconlol.png` (รูปใน popup "ไม่ทันจ้า! มีคนตัดหน้า"), `testtext.png` / `textreward.png` / `texthistory.png` (รูปข้อความในกล่องคำพูดหน้าหลัก/ประกาศ/ประวัติ), `pointchip.png` (พื้นชิปแต้มคงเหลือ — ตัวเลขซ้อนทับ)

### อนิเมชัน (index.css)
- **`.special-card`** — การ์ดรางวัลพิเศษ แสงกวาดขอบ (conic-gradient + `@property --angle`)
- **`.neon-glow`** — ชิปแต้มเรืองนีออนชมพูฟุ้ง (กระพริบ, box-shadow)
- **`.img-glow`** — แสงเรืองรอบ **รูปข้อความ** (PNG โปร่งใส) ด้วย `filter: drop-shadow` เรืองตามรูปทรงตัวอักษร (ใช้กับ speech bubble รูป mobile)
- **`.shine-sweep`** — แสงขาวกวาดผ่านการ์ด (การ์ด "แต้มที่ใช้ไป" + gradient เรเดียลทอง)
- **popup** — เปิด/ปิดมีอนิเมชัน ใช้รูปแบบ **closing-state** (หน่วง unmount ด้วย setTimeout ให้อนิเมชันเล่นจบ):
  - popup แต้มที่ได้รับ = jelly in / jelly out (`.modal-jelly` / `.modal-jelly-out`)
  - ยืนยันการแลก + แต้มไม่พอ = slide up in/out (`.modal-slideup` / `.modal-slideup-out`, ขอบหนา 4px, ฟอนต์ Itim ทั้งการ์ดรวมปุ่ม)
  - overlay จางเข้า/ออก (`.modal-overlay` / `.overlay-out`)
  - ฟอร์ม/โมดัลหน้า admin (เพิ่มประกาศ, เพิ่ม/แก้ไขพนักงาน) = **slide down** เข้า/ออก (`.slidedown-in` 0.5s / `.slidedown-out` 0.28s) + closing-state หน่วง 280ms
- **เปลี่ยนหน้า (route transition)** — `.page-enter` (Slide Left) ที่ wrapper ของ `<Outlet>` ใน Layout โดยใส่ `key={location.pathname}` ให้ remount เล่นอนิเมชันใหม่; `.main` ตั้ง `overflow-x: clip` กันเนื้อหาสไลด์ล้น
- **drawer (มือถือ)** — สไลด์ด้วย `transform: translateX()` (ไม่ใช่ `right`) + `will-change: transform` เพื่อให้ลื่นบน GPU ไม่ทำ reflow (กันกระตุกบนมือถืออ่อน)

### แจ้งเตือน / localStorage (ฝั่งพนักงาน)
- **Badge ประกาศใหม่** — ที่ไอคอน 📢 ใน bottom nav แสดงจำนวนประกาศที่ยังไม่อ่าน (เกิน 9 = "9+"); เคลียร์เมื่อเข้าหน้าประกาศ
- คีย์ localStorage (ต่อเครื่อง/เบราว์เซอร์):
  - `announcementsSeen_<email>` — id ประกาศที่อ่านแล้ว (คุม badge)
  - `approvedSeen_<email>` — รายการแลกที่แจ้งเตือน "อนุมัติแล้ว" ไปแล้ว (กัน popup เด้งซ้ำ)

---

## Firestore Rules (สรุป)
- `employees` — อ่านได้เฉพาะของตัวเอง(อีเมล)/admin; พนักงานสร้าง doc ตัวเองตอนผูกบัญชี (ดึง role/points จาก pending); พนักงานลดแต้มตัวเองได้เฉพาะตอนแลก **และต้องผ่าน `isRedeemOpen()`**; admin แก้/ลบได้ทุกเวลา
- `rewards` — อ่านได้ทุกคน(ล็อกอิน); admin สร้าง/ลบ; ลดสต็อกทีละ 1 ได้ตอนแลก **และต้องผ่าน `isRedeemOpen()`**
- `transactions` — อ่าน/สร้างได้ทุกคน(ล็อกอิน); แก้/ลบเฉพาะ admin
- `pendingEmployees` — อ่านได้(ล็อกอิน); admin สร้าง/แก้; ลบได้โดย admin หรือผู้ที่ผูกบัญชีด้วยรหัสนั้น
- `announcements` — อ่านได้ทุกคน; เขียนเฉพาะ admin
- `auditLogs` — admin อ่าน/สร้าง; แก้/ลบไม่ได้ (immutable)
- `settings` — อ่านได้ทุกคน(ล็อกอิน); เขียนเฉพาะ admin
- helper `isAdmin()` = doc `employees/{อีเมล}` มี role == 'admin'
- **`isRedeemOpen()`** — เปิดแลกตาม `settings/redeem`: ต้อง `open != false` (master switch) **และ** (ไม่ล็อกเวลา หรือ ผ่านวัน/เวลา) โดยอิง **เวลาเซิร์ฟเวอร์** (`request.time`, UTC → ไทย +7 ชั่วโมง, ไม่มี DST) ปลอมไม่ได้; ถ้าไม่มี doc = เปิดตลอด

---

## ⚠️ โควตา Firestore (แผนฟรี Spark) — เคยทำให้ทั้งแอปใช้ไม่ได้

- **Spark = อ่าน 50,000 / เขียน 20,000 / ลบ 20,000 ครั้งต่อวัน ต่อ "ทั้งโปรเจกต์"** (รวมพนักงานทุกคน + แอดมิน) รีเซ็ต **เที่ยงคืนเวลา Pacific = 14:00 น. เวลาไทย** (ช่วงเวลาออมแสงสหรัฐฯ; หลังสิ้นสุด 1 พ.ย. = 15:00 น.)
- เกินแล้วทุกการอ่าน/เขียนล้มด้วย `resource-exhausted` ข้อความ **"Quota exceeded."** — **ทั้งหน้าแอดมินและมือถือพนักงาน** จนกว่าจะรีเซ็ต หรืออัปเกรดเป็น **Blaze** (โควตาฟรีเท่าเดิม จ่ายเฉพาะส่วนเกิน — ตั้ง Budget alert ด้วย) ดูยอดใช้ที่ Firebase Console → Firestore → แท็บ **Usage**
- นับ: 1 doc ที่คืนจาก query = 1 read (ไม่ใช่นับจำนวนครั้งที่เรียก) · `getCountFromServer` ≈ 1 read ต่อ 1,000 doc · `get()`/`exists()` ใน Firestore Rules นับเป็น read ด้วย
- **เคยหมดเพราะ**: หน้า ประวัติทั้งหมดโหลด `transactions` + `auditLogs` (+ `employees`) **ทั้งคอลเลกชันใหม่หลังทุกรายการที่ลง/แก้/ลบ** (~340–500 reads ต่อครั้ง × ~190 ครั้งในวันเดียว) + แถบเมนูล่างมือถืออ่านประกาศทั้งหมด **ทุกครั้งที่เปลี่ยนหน้า** + หน้าหลักยิงคิวรีประวัติเดียวกัน 2 ชุด
- **กติกา (ห้ามย้อนกลับ)**:
  - อย่าโหลดทั้งคอลเลกชันซ้ำหลัง action — ใช้ค่าที่ได้จากใน `runTransaction` แล้วอัปเดต state เฉพาะแถว/ยอดที่เปลี่ยน (AdminHistory / AdminEmployees / AdminApprovals ทำแบบนี้แล้ว)
  - โหลดของหนักตอนจำเป็นเท่านั้น (เช่น `auditLogs` โหลดตอนเปิดแผงครั้งแรก, จำนวน log ใช้ `getCountFromServer`)
  - ข้อมูลที่ใช้ร่วมกันทั้งรอบเปิดแอปใช้ cache ในหน่วยความจำ (`announcementsCache.js`); คิวรีเดียวกันในหน้าเดียวให้ยิงครั้งเดียว (`loadMyTransactions` ใน Dashboard)
  - UI ต้องไม่ค้างเงียบเมื่อโควตาหมด: `AuthProvider` โชว์ "ระบบขัดข้องชั่วคราว" ถ้าอ่านโปรไฟล์ไม่ได้ · หน้า admin โชว์แบนเนอร์ error **สีแดง** (สีเขียว ✅ ใช้กับสำเร็จเท่านั้น)
- **ย้ายประวัติ/ยอดจากระบบเก่า** ให้ใช้ **📥 นำเข้าประวัติย้อนหลัง** (อ่านต่อคน ~2 reads + เขียนตามจำนวนแถว ไม่ต้องเปิดหน้าซ้ำ และไม่โหลดคอลเลกชันใหม่หลังนำเข้า) แทนการทำมือ
- **ลงข้อมูลจำนวนมาก (backfill) แบบทำมือ** (เช่นเพิ่มแต้มรายคน) ให้ทำเป็นช่วง ไม่สลับหน้าไปมาทีละคน: เพิ่มแต้มให้ทุกคนที่หน้า พนักงานก่อน → แล้วลงรายการแลกทั้งหมดที่หน้า ประวัติทั้งหมด (การเปิดแต่ละหน้าอ่านทั้งรายชื่อ/ประวัติ ~200–500 reads) และ **เพิ่มก่อนหักเสมอ** (หักไม่ต่ำกว่า 0)

---

## ✅ การทดสอบ

- `npm test` (Jest, ไม่ต้องมีอะไรเพิ่ม): `importHistory.test.js` (ตรรกะนำเข้า) · `pointsLedger.test.js` (นิยามผลต่อยอด + ตรวจยอด) · `components/ImportHistoryModal.test.js` · `components/ReconcilePanel.test.js` · `pages/History.test.js` · `pages/AdminApprovals.test.js` (หน้าจอเดินสายถูก — mock Firestore)
  - ⚠️ CRA ตั้ง `resetMocks` → implementation ใน `jest.fn(...)` ของ mock ถูกล้างก่อนทุกเทสต์ ต้องตั้งค่าคืน (`mockResolvedValue`) ใน `beforeEach`/ในเทสต์
- `npm run test:emulator` (`emulator-tests/run.mjs`): เรียก **โค้ดจริง** (`pointsDb.js`, `importHistoryDb.js`) กับ Firestore emulator + `firestore.rules` จริง ผ่าน client SDK เหมือนบนเว็บ — ใช้โปรเจกต์ `demo-anin-reward` ต่อ localhost เท่านั้น แตะ production ไม่ได้; ต้องมี Java + firebase-tools; ไม่รวมใน `npm test`
  - ครอบคลุม: แลก (ราคาเปลี่ยน/แต้มไม่พอ/ของหมด/ไม่จำกัด), อนุมัติ/ปฏิเสธ (กดซ้ำ/หน้าค้าง/แถวถูกลบ), ลบ/แก้แถว (แถวที่ปฏิเสธ/ลบซ้ำ/ส่วนต่างจากค่าล่าสุด), สิทธิ์ (พนักงานทำการของแอดมินไม่ได้), นำเข้า/ย้อนชุด (ซ้ำ/ยอดเปลี่ยนหลังนำเข้า/400 รายการต่อคน)
  - config = `firebase.emulator.json` ที่ราก (CLI ไม่ยอมให้ config ชี้ rules ออกนอกโฟลเดอร์ของมัน จึงวางที่รากแยกจาก `firebase.json` ที่ใช้ deploy); log อยู่ที่ `firebase-debug.log` / `firestore-debug.log` (ถูก gitignore)
  - ถ้า `npm run` หา `firebase` ไม่เจอ (เจอในเชลล์ cmd ของบางเครื่อง) ให้รันคำสั่งเดียวกันตรงๆ: `firebase emulators:exec --only auth,firestore --project demo-anin-reward --config firebase.emulator.json "node --no-warnings --import ./emulator-tests/register.mjs ./emulator-tests/run.mjs"`
  - ⚠️ ถ้าเห็นคำเตือน "rules file … does not exist" แปลว่า emulator เปิดให้เขียนได้ทุกอย่าง เทสต์สิทธิ์จะ fail — ตรวจ path ใน `firebase.emulator.json`

---

## ⚠️ ข้อควรระวังที่ยังไม่ได้แก้ (รู้แล้ว ยังไม่ได้ทำ)

- **Rules ไม่บังคับราคารางวัล**: `employees` (พนักงานลดแต้มตัวเองได้เท่าไรก็ได้ ≤ เดิม), `rewards` (ลดสต็อกทีละ 1) และ `transactions` (สร้างได้ทุกคน) ไม่ผูกกันเลย → พนักงานที่ใช้ devtools แลกของราคา 300 โดยหักแค่ 1 แต้มได้ (เคยทดสอบแล้ว) และสร้างแถวประวัติปลอมได้ — แก้ได้ด้วย `getAfter()` ผูกเอกสารทั้ง 3 ใน transaction เดียว (ต้องทดสอบกับ emulator ละเอียด เพราะกระทบการแลกจริง)
- **`pendingEmployees` อ่านได้ทุกคนที่ล็อกอิน** และรหัสเดาง่าย (เช่น SRC-SA-PHAS-00xx) → คนอื่นผูกบัญชีทับตัวตน+แต้มของคนที่ยังไม่ผูกได้
- **โควตาอ่าน**: หน้า ประวัติทั้งหมด (+ `employees`) และ อนุมัติของรางวัล อ่าน `transactions` **ทั้งคอลเลกชัน** ทุกครั้งที่เปิด → ยิ่งนำเข้าประวัติมาก ยิ่งหนัก (Spark 50,000 reads/วัน ทั้งโปรเจกต์ — ดูเลข "พบ N รายการ" ในหน้า ประวัติทั้งหมด); ทางลด: โหลดรายคนตอนกางกลุ่ม / อนุมัติโหลดเฉพาะ "รออนุมัติ" / อัปเกรด Blaze + ตั้ง Budget alert

---

## 🚨 Error ที่เคยเจอ (login Google บน iOS) — ไล่แก้ตามลำดับนี้

โจทย์เดียวกันแต่ error เปลี่ยนไปเรื่อยๆ ตามที่แก้ทีละชั้น ถ้าเจอซ้ำให้ไล่ตามนี้

### 1. `auth/missing-initial-state` — "Unable to process request due to missing initial state"
- **อาการ**: iOS กด login แล้วเด้งหน้าขาวขึ้นข้อความนี้ (URL ที่แสดง = ค่า `authDomain` ที่ client ใช้อยู่ ใช้ debug ได้)
- **สาเหตุ**: OAuth handshake ต้องใช้ `sessionStorage` — ถ้า `authDomain` เป็นคนละ origin กับเว็บ (เช่นเว็บอยู่ `anin-reward-point.web.app` แต่ `authDomain` เป็น `reward-point-2b56d.firebaseapp.com`) iOS Safari (ITP) จะพาร์ทิชัน storage ทิ้ง
- **แก้**: (ก) เปลี่ยนเป็น `signInWithRedirect` **และ** (ข) ตั้ง `REACT_APP_FIREBASE_AUTH_DOMAIN` = โดเมนเว็บจริง → **ต้องทำทั้งคู่** ทำอย่างเดียวไม่พอ

### 2. ยัง error เดิมหลังแก้แล้ว = **cache**
- **เช็คก่อนสรุป**: ถ้า URL ในหน้า error ยังเป็นโดเมนเก่า ทั้งที่ `grep` ในบันเดิลที่ deploy แล้วไม่เจอสตริงนั้นเลย → แปลว่า **เครื่องรันไฟล์เก่าค้าง** ไม่ใช่โค้ดผิด
- **แก้**: ตั้ง cache headers ใน `firebase.json` (ดูหัวข้อ Deploy) + ให้ผู้ใช้ล้าง cache หรือเปิดด้วย `?v=2`
- **บทเรียน**: ตรวจของจริงด้วย `curl` ก่อนเดา — เทียบ 3 อย่าง: index.html ชี้บันเดิลไหน / บันเดิลนั้นมีค่าอะไร / cache-control เป็นอะไร

### 3. `Error 400: redirect_uri_mismatch`
- **อาการ**: ไปถึงหน้า Google ได้แล้ว (แปลว่าข้อ 1-2 ผ่านแล้ว) แต่ Google ปฏิเสธ
- **สาเหตุ**: **Firebase Authorized domains กับ Google Cloud OAuth redirect URIs เป็นคนละที่กัน** โดเมน default ถูกลงทะเบียนอัตโนมัติ แต่ hosting site เสริมต้องเพิ่มเอง
- **แก้**: [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials?project=reward-point-2b56d) → OAuth 2.0 Client IDs → Web client → เพิ่ม
  - **Authorized redirect URIs** = `https://anin-reward-point.web.app/__/auth/handler` ← ตัวที่แก้ error
  - **Authorized JavaScript origins** = `https://anin-reward-point.web.app` (โดเมนล้วน)
  - ⚠️ อย่าลบของเดิม, รอ ~5 นาทีให้ Google propagate (อาจนานถึงหลักชั่วโมง — รอก่อน อย่าแก้ค่าซ้ำไปมา)
- **`Invalid Origin: URIs must not contain a path`** = ใส่ผิดช่อง — เอา URI ที่มี `/__/auth/handler` ไปใส่ในช่อง JavaScript origins (ซึ่งห้ามมี path) ต้องใส่ในช่อง redirect URIs

### เช็กลิสต์ไล่ปัญหา login (ทำได้เองด้วย CLI)
```bash
curl -s https://anin-reward-point.web.app/ | grep -o 'main\.[a-z0-9]*\.js'   # บันเดิลที่เสิร์ฟจริง
curl -s .../static/js/main.XXXX.js | grep -o 'authDomain:"[^"]*"'            # authDomain ที่ใช้จริง
curl -s https://anin-reward-point.web.app/__/auth/handler | head -c 200      # ต้องเป็น fireauth.oauthhelper ไม่ใช่ index.html
curl -s -o /dev/null -w "%{http_code}" https://reward-point-2b56d.web.app/   # มีสำเนาเก่าค้างที่ default site ไหม (404 = ไม่มี)
```
ส่วนที่ **ตรวจผ่าน CLI ไม่ได้** ต้องเปิด Console ดูเอง: Firebase Authorized domains, Google Cloud OAuth client
