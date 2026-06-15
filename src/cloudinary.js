// อัปโหลดไฟล์ (รูป/PDF) ขึ้น Cloudinary แบบ unsigned แล้วคืน URL
export async function uploadFileToCloudinary(file) {
  const cloud = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME
  const preset = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET
  if (!cloud || !preset) throw new Error('ยังไม่ได้ตั้งค่า Cloudinary ใน .env')
  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', preset)
  // ใช้ auto เพื่อรองรับทั้งรูปภาพและ PDF
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/auto/upload`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error('อัปโหลดไฟล์ไม่สำเร็จ')
  const data = await res.json()
  return data.secure_url
}
