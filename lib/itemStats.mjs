// ตีความสถิติรายข้อที่ exam_compute_item_stats คำนวณไว้
// การคำนวณอยู่ในฐานข้อมูลที่เดียว ไฟล์นี้ถือเฉพาะเกณฑ์ตัดสินและถ้อยคำ จึงทดสอบได้โดยไม่ต้องต่อฐานข้อมูล

// เกณฑ์ตามแนวปฏิบัติ classical test theory ที่ใช้กับข้อสอบเลือกตอบแบบ ศรว.
export const P_TOO_HARD = 0.3;
export const P_TOO_EASY = 0.85;
export const D_WEAK = 0.2;
export const RPB_WEAK = 0.2;
export const OMIT_HIGH = 0.1;
// ต่ำกว่านี้กลุ่มตัวอย่างน้อยเกินกว่าจะสรุปอำนาจจำแนก ให้แสดงค่าแต่เตือนว่ายังสรุปไม่ได้
export const MIN_N = 30;

const num = (v) => (v == null || v === "" ? null : Number(v));

// ระดับความรุนแรง: stop = ควรถอนหรือแก้ก่อนใช้ซ้ำ, warn = ควรทบทวน, info = บันทึกไว้เฉยๆ
const FLAGS = {
  miskeyed: { severity: "stop", label: "อำนาจจำแนกติดลบ — ตรวจเฉลยว่าคีย์ผิดหรือไม่" },
  negative_rpb: { severity: "stop", label: "สหสัมพันธ์กับคะแนนรวมติดลบ — คนเก่งตอบผิดมากกว่าคนอ่อน" },
  too_hard: { severity: "warn", label: "ยากเกินไป" },
  too_easy: { severity: "warn", label: "ง่ายเกินไป" },
  low_discrimination: { severity: "warn", label: "อำนาจจำแนกต่ำ" },
  low_rpb: { severity: "warn", label: "สัมพันธ์กับคะแนนรวมน้อย" },
  dead_distractor: { severity: "info", label: "มีตัวลวงที่ไม่มีใครเลือก" },
  high_omit: { severity: "info", label: "มีผู้ไม่ตอบมาก" },
};

const flag = (code, detail) => ({ code, detail, ...FLAGS[code] });

// ตัวลวงที่ไม่มีใครเลือกแปลว่าข้อนั้นเหลือตัวเลือกจริงน้อยกว่าที่ออกแบบไว้
export function deadDistractors(distractors) {
  const options = distractors?.options;
  if (!Array.isArray(options)) return [];
  return options.filter((o) => !o.correct && Number(o.n || 0) === 0).map((o) => o.label);
}

export function omitRate(distractors, n) {
  const omitted = num(distractors?.omitted);
  if (omitted == null || !n) return null;
  return omitted / n;
}

// รับหนึ่งแถวจาก bank_item_stats แล้วคืนคำตัดสินพร้อมเหตุผล
export function classifyItem(stat) {
  const n = num(stat?.n) ?? 0;
  const p = num(stat?.p_value);
  const d = num(stat?.discrimination);
  const rpb = num(stat?.point_biserial);
  const flags = [];

  if (d != null && d < 0) flags.push(flag("miskeyed", `D = ${d.toFixed(2)}`));
  else if (d != null && d < D_WEAK) flags.push(flag("low_discrimination", `D = ${d.toFixed(2)}`));

  if (rpb != null && rpb < 0) flags.push(flag("negative_rpb", `r = ${rpb.toFixed(2)}`));
  else if (rpb != null && rpb < RPB_WEAK) flags.push(flag("low_rpb", `r = ${rpb.toFixed(2)}`));

  if (p != null && p < P_TOO_HARD) flags.push(flag("too_hard", `ตอบถูก ${Math.round(p * 100)}%`));
  if (p != null && p > P_TOO_EASY) flags.push(flag("too_easy", `ตอบถูก ${Math.round(p * 100)}%`));

  const dead = deadDistractors(stat?.distractors);
  if (dead.length) flags.push(flag("dead_distractor", `ตัวเลือก ${dead.join(", ")}`));

  const omit = omitRate(stat?.distractors, n);
  if (omit != null && omit > OMIT_HIGH) flags.push(flag("high_omit", `ไม่ตอบ ${Math.round(omit * 100)}%`));

  const worst = flags.some((f) => f.severity === "stop")
    ? "stop"
    : flags.some((f) => f.severity === "warn")
      ? "warn"
      : flags.length
        ? "info"
        : "ok";

  return {
    n,
    tentative: n < MIN_N,
    verdict: worst === "stop" ? "retire" : worst === "warn" ? "review" : "keep",
    severity: worst,
    flags,
  };
}

// ค่าความเชื่อมั่นทั้งฉบับ ใช้ช่วงที่นิยมอ้างในการสอบวัดผลระดับใบประกอบวิชาชีพ
export function reliabilityLabel(kr20) {
  const v = num(kr20);
  if (v == null) return { label: "คำนวณไม่ได้", cls: "muted" };
  if (v >= 0.8) return { label: "เชื่อมั่นสูง", cls: "approved" };
  if (v >= 0.7) return { label: "ใช้ได้", cls: "approved" };
  if (v >= 0.6) return { label: "พอใช้ ควรเพิ่มจำนวนข้อ", cls: "review" };
  return { label: "ต่ำ — ผลสอบยังไม่น่าเชื่อถือ", cls: "retired" };
}

// ชั้นสีที่ใช้ร่วมกับ .pill ใน globals.css
export const verdictClass = { keep: "approved", review: "review", retire: "retired" };
export const verdictLabel = { keep: "ใช้ได้", review: "ควรทบทวน", retire: "ควรถอน/แก้เฉลย" };
