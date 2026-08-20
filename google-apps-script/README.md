# วิธี Deploy Google Apps Script (Pichayapa ทำเอง ~5 นาที)

ไม่ต้องส่ง password/API key ให้ใครเลย — สคริปต์นี้ทำงานอยู่ใน Google account ของคุณเอง

## ขั้นตอน

1. เปิด Google Sheet ที่จะใช้เก็บข้อมูลใบเสร็จ (ชีตที่มีคอลัมน์ Date, Tax Invoice NO., Vendor Name, รายละเอียดบิล, Tax ID, Sub total, Vat 7%, Total, ประเภทการชำระเงิน อยู่แล้ว)
2. ถ้ายังไม่มีคอลัมน์ **ผู้ส่ง** และ **Drive Link** ให้เพิ่ม 2 คอลัมน์นี้ต่อจากคอลัมน์ "ประเภทการชำระเงิน" (แถวหัวตารางแถวแรกต้องมี 11 คอลัมน์ตามลำดับ: Date, Tax Invoice NO., Vendor Name, รายละเอียดบิล, Tax ID, Sub total, Vat 7%, Total, ประเภทการชำระเงิน, ผู้ส่ง, Drive Link)
3. เมนู **Extensions > Apps Script**
4. ลบโค้ดตัวอย่างที่มีอยู่ทั้งหมดในไฟล์ `Code.gs` แล้ว copy โค้ดทั้งหมดจากไฟล์ `Code.gs` ในโฟลเดอร์นี้ไปวางแทน
5. กด **Save** (ไอคอนแผ่นดิสก์ หรือ Ctrl+S)
6. กด **Deploy > New deployment**
7. ที่ "Select type" กดไอคอนเฟือง (⚙️) เลือก **Web app**
8. ตั้งค่า:
   - Description: `gm-receipts` (หรืออะไรก็ได้)
   - Execute as: **Me**
   - Who has access: **Anyone**
9. กด **Deploy**
10. Google จะขอ authorize สิทธิ์ (เข้าถึง Sheet + Drive ของตัวเอง) — กด **Authorize access** แล้วเลือกบัญชี Google ของคุณ ถ้ามีหน้าเตือน "Google hasn't verified this app" ให้กด **Advanced > Go to gm-receipts (unsafe)** ได้เลย (เป็นสคริปต์ของตัวเองไม่ใช่แอปแปลกปลอม)
11. หลัง Deploy สำเร็จ จะได้ **Web app URL** (ขึ้นต้นด้วย `https://script.google.com/macros/s/.../exec`) — **ก็อป URL นี้ส่งกลับมาให้ Neo** เพื่อตั้งค่าเชื่อมต่อในระบบ

## ถ้าต้องแก้โค้ดสคริปต์ในอนาคต

แก้ใน Apps Script editor แล้วกด **Deploy > Manage deployments > แก้ไข (ไอคอนดินสอ) > Version: New version > Deploy** — URL เดิมจะยังใช้ได้เหมือนเดิม ไม่ต้องส่ง URL ใหม่มาอีก
