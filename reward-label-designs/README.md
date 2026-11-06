# Cream Rewards — ป้ายรางวัล 10 ชุด

เปิด **index.html** เพื่อเปรียบเทียบทั้งหมด หรือเปิดไฟล์ 01–10 เพื่อดูชุดที่ต้องการ

แต่ละชุดมี 2 ป้าย: **รางวัลพิเศษ** และ **รางวัลปกติ** รวม 20 ป้าย

- เข้ากับธีมครีม #FFF3EC / พีช #FBD3B9 / น้ำตาล #A85A2E และการ์ด Happy Doodle แบบที่ 20
- แต่ละชุดแตกต่างกันที่โครงสร้างและรูปทรง ไม่ใช่เพียงเปลี่ยนสี
- HTML แต่ละไฟล์มี CSS, JavaScript และ SVG ในตัว เปิดแยกได้โดยไม่ต้องใช้เซิร์ฟเวอร์
- ข้อความป้ายเป็นตัวอักษรจริง สามารถเปลี่ยนข้อความและสีใน HTML/CSS ได้
- ฟอนต์ Itim และ Nunito จาก Google Fonts หากไม่มีอินเทอร์เน็ตจะใช้ฟอนต์ระบบแทน
- ปรับพื้นหลังตัวอย่างเป็นครีมหรือขาวได้
- เปิด/ปิดประกายเคลื่อนไหวได้ และรองรับการตั้งค่า prefers-reduced-motion
- หน้าแยกมีตัวอย่างวางป้ายคู่กับการ์ด Happy Doodle แบบย่อ เพื่อเทียบสัดส่วน
- ตัวอย่างแยกจากเว็บจริง ยังไม่ได้เปลี่ยนป้ายใน React หรือ deploy

| ชุด | ไฟล์ | แนวคิด |
| --- | --- | --- |
| 01 | [01-peach-glow.html](01-peach-glow.html) | แคปซูลประกายพีช |
| 02 | [02-happy-doodle.html](02-happy-doodle.html) | ลายเส้นวันดี ๆ |
| 03 | [03-folded-ribbon.html](03-folded-ribbon.html) | ริบบิ้นพับปลาย |
| 04 | [04-little-ticket.html](04-little-ticket.html) | ตั๋วของขวัญ |
| 05 | [05-golden-medallion.html](05-golden-medallion.html) | เหรียญแห่งความสุข |
| 06 | [06-section-line.html](06-section-line.html) | หัวข้อกับเส้นสาย |
| 07 | [07-soft-stitch.html](07-soft-stitch.html) | ป้ายผ้าเย็บขอบ |
| 08 | [08-paper-flags.html](08-paper-flags.html) | กระดาษพับมุม |
| 09 | [09-sweet-bow.html](09-sweet-bow.html) | โบผูกของขวัญ |
| 10 | [10-butter-highlight.html](10-butter-highlight.html) | ไฮไลต์สีเนย |

สร้าง HTML ใหม่หลังแก้ไขต้นฉบับ:

```sh
node reward-label-designs/build.cjs
```
