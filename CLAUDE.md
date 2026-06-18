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
REACT_APP_FIREBASE_AUTH_DOMAIN=...
REACT_APP_FIREBASE_PROJECT_ID=...
REACT_APP_FIREBASE_STORAGE_BUCKET=...
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
REACT_APP_FIREBASE_APP_ID=...
REACT_APP_CLOUDINARY_CLOUD_NAME=...
REACT_APP_CLOUDINARY_UPLOAD_PRESET=...   # ต้องเป็น Unsigned preset
```

### สิ่งที่ต้องตั้งค่าฝั่ง Cloud
1. **Firebase Auth** → เปิด Google sign-in + ใส่ domain ใน Authorized domains
2. **Firestore Rules** → publish เนื้อหาจาก `firestore.rules`
3. **Cloudinary** → unsigned upload preset + เปิด "Allow delivery of PDF and ZIP files" (สำหรับ PDF ประกาศ)
4. **Bootstrap admin คนแรก** → สร้าง doc ใน `employees` ด้วยมือ (Document ID = อีเมล, role = `admin`)

---

## โครงสร้างไฟล์

```
public/                 # รูปไอคอน/โลโก้ (icon.png, Home.png, Megaphone.png, iconcheck.png ฯลฯ)
src/
  index.js, index.css   # entry + CSS+theme ทั้งหมด (ตัวแปรสี + คลาส utility)
  App.jsx               # router + guard (RequireAuth / RequireAdmin)
  firebase.js           # init firebase (auth, db)
  cloudinary.js         # uploadFileToCloudinary() — รูป/PDF
  context/AuthContext.jsx
  components/
    Layout.jsx          # ตัวกำหนด desktop sidebar vs mobile (forceMobile)
    Sidebar.jsx         # Sidebar / MobileNav (drawer) / BottomNav
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

- **Google sign-in อย่างเดียว** (`signInWithPopup`)
- จับคู่พนักงานด้วย **อีเมล** → `employees/{อีเมล}`
- ถ้าล็อกอินแล้วยังไม่มี employee doc → เข้าสู่ขั้น **ผูกบัญชีครั้งแรก**: กรอก **รหัสพนักงาน** → ดึงข้อมูลจาก `pendingEmployees/{รหัส}` มาสร้าง `employees/{อีเมล}` แล้วลบ pending
- `profile.role === 'admin'` → เป็นแอดมิน
- `patchProfile()` — อัปเดตแต้มในหน้าจอทันทีหลังแลก (ไม่ต้อง refresh)
- **redirect หลัง login เป็นแบบ declarative** — `Login.jsx` ไม่เรียก `navigate()` เองหลัง popup (จะ race กับ `onAuthStateChanged` ที่ยัง `getDoc` profile ไม่เสร็จ → เด้งกลับ login ต้องกด 2 รอบ) แต่ใช้ `if (user) return <Navigate to="/" replace />` รอจน profile พร้อมแล้วค่อยพาเข้าหน้าหลัก
- **หน้า login มีตัวการ์ตูนเคลื่อนไหว** `iconmove.webp` (พื้นหลังโปร่งใส 160×160px) แทน emoji เดิม
- **ไม่มีปุ่ม "เข้าสู่ระบบด้วย Google" แล้ว** — กดที่ **รูป `loginmain.png`** (ครอบด้วย `<button>` เพื่อโฟกัส/กดด้วยคีย์บอร์ดได้) เพื่อเรียก `signInWithPopup`; ตอนกำลังโหลดรูปจางลง + ขึ้น "กำลังเข้าสู่ระบบ..."
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
| `transactions` | auto | employeeId(=อีเมล), employeeName, rewardId, rewardName, pointsUsed, status, approval, proofUrl, note, createdAt |
| `announcements` | auto | title, body, pdfUrl, pdfName, createdAt |
| `auditLogs` | auto | action, txId, employeeName, rewardName, detail, by, at (เก็บถาวร แก้/ลบไม่ได้) |
| `settings` | `redeem` | enabled, hour, minute, dateY/dateM/dateD (เวลา/วันเปิดให้แลก — admin ตั้งในหน้าจัดการรางวัล) |

### ⚠️ ข้อตกลงเครื่องหมาย `pointsUsed` (สำคัญมาก)
- **แลกรางวัล** → `pointsUsed` เป็น **บวก** (ใช้แต้มไป)
- **admin เพิ่มแต้ม** → `pointsUsed` เป็น **ลบ** (ได้รับ)
- **admin หักแต้ม** → `pointsUsed` เป็น **บวก**
- ผลต่อยอดแต้มพนักงาน = `-pointsUsed` เสมอ

### สถานะ `approval` (เฉพาะรายการแลกรางวัล)
`รออนุมัติ` → `อนุมัติแล้ว` / `ปฏิเสธ` (ปฏิเสธจะคืนแต้ม + คืนสต็อก)

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
- **ชิปแต้มคงเหลือ** — พื้นเป็นรูป `pointchip.png` (width 100%) + **ตัวเลขแต้มซ้อนทับ** (`position: absolute`, ปรับ `right`/`top`) มีแสงนีออน (`.neon-glow`) → **กดเพื่อดู popup "แต้มที่ได้รับเดือนนี้"** (jelly in/out)
- รางวัลแยก 2 กลุ่ม: **🌟 รางวัลพิเศษ** (badge pulse) / **🎁 รางวัลปกติ**
- การ์ดรางวัล (ฟอนต์ Itim ทั้งการ์ดรวมปุ่มแลก): รูป/emoji, ป้ายสต็อก (ขาว), ป้ายประเภท, รายละเอียด, ราคาแต้ม, ปุ่มแลก
  - แต้มไม่พอ → ปุ่ม "แต้มไม่พอ!" กดแล้วเด้ง popup "แต้มไม่พอ!" (รูป `iconcry.png`, ฟอนต์ Itim ทั้งการ์ดรวมปุ่ม)
  - **ยังไม่ถึงเวลาเปิดแลก** → ปุ่ม disable แสดง "⏰ เปิดแลก HH:MM น." (หรือ DD/MM HH:MM ถ้ากำหนดวัน) — อ่านค่าจาก `settings/redeem`, เช็คทุก 30 วิ เปิดเองตอนถึงเวลา
  - **มีคนแลกตัดหน้า (ของหมดพอดี)** → เด้ง popup "ไม่ทันจ้า! มีคนตัดหน้า" (รูป `iconlol.png`, modal-slideup) — ดักจาก error `'ของหมดแล้ว'` ใน transaction
  - รางวัล `requireProof` → ต้องแนบรูปหลักฐาน (Cloudinary) ก่อนยืนยัน
- แลกแล้ว → หักแต้ม + ลดสต็อก + สร้าง transaction (`approval: 'รออนุมัติ'`) **ใน `runTransaction` เดียว (atomic)** ด้วย `tx.set` — กันกรณีแต้มหายแต่ไม่มีประวัติ
- popup แจ้งเตือนเมื่อ admin อนุมัติ (จำด้วย localStorage `approvedSeen_<email>`)

### Announcements.jsx (ประกาศ)
- โลโก้ iconmegaphone.png + กล่องคำพูด, ฟอนต์ทั้งหน้าเป็น Itim
- แสดงประกาศ + ถ้ามี PDF (หน้าเดียว) แสดงเป็นรูป (Cloudinary `pg_1` render) + ลิงก์เปิดต้นฉบับ

### History.jsx (ประวัติการแลก)
- โลโก้ iconcheck.png + กล่องคำพูด
- แสดง **เฉพาะรายการที่แลกรางวัลเอง** (มี `rewardId`) ไม่รวม admin ปรับแต้ม
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
รายการล่าสุด + อันดับแต้มสะสม (กรอง admin ออก, โชว์ 5 คน) + สต็อกรางวัล (เอาการ์ดสถิติ stat-card ออกแล้ว)

> หน้า admin ทุกหน้า **เอาหัวข้อ (page-title/page-sub) ออกแล้ว** — หน้าที่มีปุ่ม (จัดการพนักงาน/รางวัล/ประกาศ) เก็บปุ่มไว้ชิดขวาด้วย `<div />` ว่างใน page-header

### AdminEmployees.jsx (จัดการพนักงาน)
- เพิ่มพนักงานด้วย **รหัสพนักงาน** (ไม่ต้องรู้อีเมล) → สร้าง `pendingEmployees/{รหัส}`; ช่อง "แผนก" เป็น **dropdown** (optgroup ตาม `DEPT_GROUPS`)
- ตารางรวม "เข้าระบบแล้ว" + "รอผูกบัญชี" — **แยกกลุ่มตามแผนก** (Sale / Warehouse / Office / อื่นๆ) มีแถวหัวกลุ่ม + จำนวนคน; เทียบแผนกแบบไม่สนตัวพิมพ์เล็ก/ใหญ่ (`groupOfDept`)
  - `DEPT_GROUPS` (module-level): **Sale** = Pharmarcist / Pharmarcist Assistant / Pharmarcist Mobile / Sale Admin · **Warehouse** = Outbound / Inbound / Inventory / Warehouse Manager / Packing · **Office** = IT Support / Accountant / Purchase / Procurement Manager / HR&Admin
- ปุ่มเดียว **✏️ แก้ไข** → modal (slide down เปิด/ปิด) แก้ **ชื่อ/แผนก/สิทธิ์** + **ปรับแต้ม** (ใส่ − เพื่อหัก, บันทึกประวัติ `transactions`); พนักงานรอผูกบัญชีแก้ "แต้มเริ่มต้น" ตรงๆ + **ลบพนักงาน**
- **♻️ รีเซ็ตแต้มทั้งระบบ** — ปุ่มสีแดง + modal ยืนยันต้องพิมพ์ `RESET` → ตั้ง `points: 0` ทุกคนใน `employees` + `pendingEmployees` (เขียนแบบ `writeBatch` ครั้งละ 400) เก็บประวัติ `transactions` ไว้ + บันทึก `auditLogs` (`action: reset_points`)
- ช่องค้นหา + หัวตาราง (`thead`) พื้นหลังขาว (inline เฉพาะหน้านี้)

### AdminRewards.jsx (จัดการรางวัล)
- เพิ่ม/แก้/ลบ รางวัล — ประเภท (ปกติ/พิเศษ), รูปจาก **URL** (รองรับแปลงลิงก์ Google Drive), ไม่จำกัดจำนวน, ต้องแนบหลักฐาน
- เรียงแยก 2 กลุ่ม (พิเศษ/ปกติ) เหมือนฝั่งมือถือ
- กด "แก้ไข" → เลื่อนขึ้นไปที่ฟอร์มอัตโนมัติ
- **การ์ด "⏰ เวลาเปิดให้พนักงานแลกรางวัล"** — ตั้งเปิด/ปิดล็อก + เวลา (HH:MM) + เฉพาะวันที่ (เว้นว่าง=ทุกวัน) → บันทึกลง `settings/redeem`; ทั้งหน้าพนักงานและ Firestore Rules อ่านค่านี้

### AdminApprovals.jsx (อนุมัติของรางวัล)
- รายการที่พนักงานแลกเข้ามา (มี `rewardId`) — กรองตามสถานะ
- ดูรูปหลักฐาน → **อนุมัติ** หรือ **ปฏิเสธ** (คืนแต้ม + คืนสต็อก)

### AdminAnnouncements.jsx (จัดการประกาศ)
- โพสต์/ลบประกาศ + แนบ **PDF หน้าเดียว** (เช็คด้วย pdf-lib → อัป Cloudinary)

### AdminHistory.jsx (ประวัติทั้งหมด)
- ทุกธุรกรรม — **แก้ไข** (ปรับยอดพนักงานตามส่วนต่าง) / **ลบ** (คืนแต้ม+สต็อก)
- ทุกการแก้/ลบบันทึกลง **auditLogs** (ดูได้ในปุ่ม "บันทึกการแก้ไข"); พาเนล log รองรับ `action: reset_points` (แสดง "♻️ รีเซ็ตแต้มทั้งระบบ" badge แดง)

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
- **`isRedeemOpen()`** — เปิดแลกตามเวลา/วันที่ใน `settings/redeem` โดยอิง **เวลาเซิร์ฟเวอร์** (`request.time`, UTC → ไทย +7 ชั่วโมง, ไม่มี DST) ปลอมไม่ได้; ถ้าไม่มี doc หรือ `enabled != true` = เปิดตลอด
