// ตารางสอบและการนับถอยหลัง แยกจากการแสดงผลเพื่อให้ทดสอบได้โดยไม่ต้องเรนเดอร์
// เวลาทั้งหมดผูก offset +07:00 ไว้ในตัว จึงนับถูกแม้เครื่องผู้ใช้ตั้งเขตเวลาอื่น

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function timeLeft(targetIso, now = Date.now()) {
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) return null;
  const total = target - now;
  const abs = Math.abs(total);
  return {
    total,
    past: total <= 0,
    days: Math.floor(abs / DAY),
    hours: Math.floor((abs % DAY) / HOUR),
    minutes: Math.floor((abs % HOUR) / MINUTE),
    seconds: Math.floor((abs % MINUTE) / 1000),
  };
}

// รอบที่เริ่มไปแล้วยังแสดงต่ออีกช่วงหนึ่ง เพื่อไม่ให้การ์ดหายไปกลางวันสอบ
export const KEEP_AFTER_START = 12 * HOUR;

export function upcomingExams(schedule, now = Date.now()) {
  return schedule
    .filter((e) => new Date(e.at).getTime() + KEEP_AFTER_START > now)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

// profiles.year_level เก็บเป็น Y4 / Y5 / Y6 / Cert — แปลงเป็นตัวเลขชั้นปี
// ผู้ที่ไม่ใช่ชั้นปี (Cert) หรือยังไม่ได้บันทึกชั้นปี คืน null แล้วจะเห็นทุกรอบ
export function yearNumber(level) {
  if (typeof level === "number") return Number.isFinite(level) ? level : null;
  const m = /^Y(\d)$/.exec(String(level ?? "").trim());
  return m ? Number(m[1]) : null;
}

// รอบที่ผู้สอบคนนี้เกี่ยวข้อง — ไม่ระบุชั้นปีไว้ถือว่าเกี่ยวกับทุกคน
export function examsForStudent(schedule, year, now = Date.now()) {
  const n = yearNumber(year);
  return upcomingExams(schedule, now).filter((e) => !e.years?.length || n == null || e.years.includes(n));
}

const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const TH_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

// จัดรูปแบบตามเวลาไทยเสมอ ไม่ขึ้นกับเขตเวลาของเครื่องผู้ใช้
export function thaiDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const bangkok = new Date(d.getTime() + 7 * HOUR);
  const day = TH_DAYS[bangkok.getUTCDay()];
  const hh = String(bangkok.getUTCHours()).padStart(2, "0");
  const mm = String(bangkok.getUTCMinutes()).padStart(2, "0");
  return `วัน${day}ที่ ${bangkok.getUTCDate()} ${TH_MONTHS[bangkok.getUTCMonth()]} ${bangkok.getUTCFullYear() + 543} เวลา ${hh}.${mm} น.`;
}

// ข้อความสั้นสำหรับผู้ใช้โปรแกรมอ่านหน้าจอ ละเอียดระดับนาทีก็พอ ไม่ต้องอ่านวินาทีทุกวินาที
export function countdownLabel(left) {
  if (!left) return "";
  if (left.past) return "ถึงเวลาสอบแล้ว";
  if (left.days > 0) return `เหลืออีก ${left.days} วัน ${left.hours} ชั่วโมง`;
  if (left.hours > 0) return `เหลืออีก ${left.hours} ชั่วโมง ${left.minutes} นาที`;
  return `เหลืออีก ${left.minutes} นาที`;
}

// ใกล้สอบแล้วให้การ์ดเน้นขึ้น
export function urgency(left) {
  if (!left || left.past) return "now";
  if (left.days < 1) return "today";
  if (left.days < 7) return "soon";
  return "far";
}
