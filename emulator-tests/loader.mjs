// ให้ Node อ่านไฟล์ src/*.js ที่ import แบบไม่ใส่นามสกุล (สไตล์ CRA/webpack) ได้
export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.(c|m)?js$|\.json$/.test(specifier)) {
    try { return await nextResolve(specifier + '.js', context) } catch { /* ลองแบบเดิมต่อ */ }
  }
  return nextResolve(specifier, context)
}
