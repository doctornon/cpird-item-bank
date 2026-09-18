// อัปโหลดรูปประกอบข้อสอบไปยัง bucket question-images
// ข้อจำกัดที่นี่ตั้งให้ตรงกับที่ bucket บังคับไว้ เพื่อให้ผู้ใช้เห็นข้อความที่เข้าใจได้
// แทนที่จะได้ error ดิบจาก storage หลังรออัปโหลดจนจบ

export const MAX_BYTES = 5 * 1024 * 1024;
export const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function checkImageFile(file) {
  if (!file) return "ไม่พบไฟล์";
  if (!ALLOWED.includes(file.type)) return "รองรับเฉพาะไฟล์ JPEG, PNG และ WebP";
  if (file.size > MAX_BYTES) return `ไฟล์ใหญ่เกิน ${Math.round(MAX_BYTES / 1024 / 1024)} MB`;
  return "";
}

// คืน url สาธารณะเมื่อสำเร็จ หรือโยนข้อผิดพลาดพร้อมข้อความภาษาไทย
export async function uploadQuestionImage(sb, file, prefix = "items") {
  const problem = checkImageFile(file);
  if (problem) throw new Error(problem);
  const ext = EXT[file.type] || "png";
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from("question-images").upload(path, file, { contentType: file.type });
  if (error) throw new Error("อัปโหลดรูปไม่สำเร็จ: " + error.message);
  return sb.storage.from("question-images").getPublicUrl(path).data.publicUrl;
}
