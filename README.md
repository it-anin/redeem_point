# 🥚 Cream Rewards — ระบบสะสมแต้มพนักงาน

React + Firebase · Cream Theme · Mobile Responsive

---

## 📁 โครงสร้างไฟล์

```
src/
├── context/
│   └── AuthContext.jsx       ← จัดการ login state
├── components/
│   ├── Layout.jsx            ← wrapper ทุกหน้า
│   └── Sidebar.jsx           ← sidebar + mobile drawer + bottom nav
├── pages/
│   ├── Login.jsx             ← หน้า login
│   ├── Dashboard.jsx         ← พนักงาน: แลกแต้ม
│   ├── History.jsx           ← พนักงาน: ประวัติ
│   ├── Admin.jsx             ← admin: overview
│   ├── AdminEmployees.jsx    ← admin: จัดการพนักงาน
│   ├── AdminRewards.jsx      ← admin: จัดการรางวัล
│   └── AdminHistory.jsx      ← admin: ประวัติทั้งหมด
├── firebase.js               ← Firebase config
├── theme.js                  ← color tokens
├── index.css                 ← global styles
├── App.jsx                   ← routing
└── index.js                  ← entry point
```

---

## 🚀 ขั้นตอน Setup

### 1. สร้าง Firebase Project

1. ไปที่ https://console.firebase.google.com
2. คลิก **Create Project** → ตั้งชื่อ "cream-rewards"
3. เปิดใช้ **Authentication** → Sign-in method → **Email/Password**
4. เปิดใช้ **Firestore Database** → Production mode → Region: `asia-southeast1`
5. เปิดใช้ **Storage** → Production mode

### 2. ได้ Firebase Config

1. Project Settings → Web App → Register App
2. คัดลอก config object

### 3. ติดตั้งโปรเจกต์

```bash
# Clone หรือ copy โปรเจกต์นี้
cd rewards-app

# ติดตั้ง dependencies
npm install

# สร้างไฟล์ .env
cp .env.example .env
```

### 4. ใส่ Firebase Config ใน .env

```env
REACT_APP_FIREBASE_API_KEY=AIzaSy...
REACT_APP_FIREBASE_AUTH_DOMAIN=cream-rewards.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=cream-rewards
REACT_APP_FIREBASE_STORAGE_BUCKET=cream-rewards.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=123456789
REACT_APP_FIREBASE_APP_ID=1:123:web:abc
```

### 5. ตั้ง Firestore Security Rules

คัดลอก `firestore.rules` ไปวางใน Firestore → Rules tab

### 6. สร้าง Admin คนแรก

ใน Firebase Console → Authentication → Add User:
- Email: `admin@company.com`
- Password: ตั้งเอง

จากนั้นใน Firestore → employees collection → Add Document:
- Document ID: UID ของ admin ที่เพิ่งสร้าง
- Fields:
  ```
  name: "Admin"
  email: "admin@company.com"
  department: "Management"
  points: 0
  role: "admin"
  uid: "<UID จาก Authentication>"
  ```

### 7. รัน Dev Server

```bash
npm start
```

เปิด http://localhost:3000 → login ด้วย admin

### 8. Deploy บน Firebase Hosting (ฟรี)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
npm run build
firebase deploy
```

---

## 🗂️ โครงสร้าง Firestore

### `employees/{uid}`
```
name: string
email: string
department: string
points: number
role: "employee" | "admin"
uid: string
createdAt: timestamp
```

### `rewards/{id}`
```
name: string
description: string
pointCost: number
stock: number
emoji: string
image: string (URL จาก Storage)
createdAt: timestamp
updatedAt: timestamp
```

### `transactions/{id}`
```
employeeId: string
employeeName: string
rewardId: string | null
rewardName: string
pointsUsed: number
status: "สำเร็จ" | "เพิ่มแต้ม" | "หักแต้ม"
createdAt: timestamp
```

---

## 🎯 Features

### ฝั่งพนักงาน
- ✅ Login ด้วย Email/Password
- ✅ ดูแต้มสะสมปัจจุบัน
- ✅ เลือกและแลกรางวัล (มี confirm dialog)
- ✅ ดูประวัติการแลกของตัวเอง
- ✅ Mobile Responsive + Bottom Navigation

### ฝั่ง Admin
- ✅ Overview dashboard (stats + leaderboard + recent transactions)
- ✅ เพิ่ม/ลบพนักงาน (สร้าง Firebase Auth อัตโนมัติ)
- ✅ ปรับแต้มพนักงาน (+/-) พร้อมบันทึกหมายเหตุ
- ✅ เพิ่ม/แก้ไข/ลบรางวัล พร้อมอัปโหลดรูป
- ✅ ดูประวัติการแลกทุกคน + ค้นหา
- ✅ Firestore Security Rules ป้องกันการเข้าถึงที่ไม่ได้รับอนุญาต

---

## 🎨 Theme: Cream

```css
--bg: #FFFBF2          /* พื้นหลัง ครีมสว่าง */
--surface: #FFFFFF     /* การ์ด */
--primary: #F0D9B5     /* ปุ่ม/Active ครีม */
--primary-dark: #8C6A3A /* ตัวอักษรบนปุ่ม น้ำตาลเข้ม */
--border: #D4B896      /* ขอบ น้ำตาลอ่อน */
```
