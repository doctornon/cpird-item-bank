// Official ศรว. Table of Specifications — two versions — + ICD chapter reference.
// Used to pick a spec when building an exam set, scale it to a target item count,
// and compute coverage gaps against the bank items' icd_system tag.

export const ICD_SYSTEMS = [
{ code: 1, roman: "I", th: "โรคติดเชื้อและปรสิต" },
{ code: 2, roman: "II", th: "เนื้องอกและมะเร็ง" },
{ code: 3, roman: "III", th: "โรคเลือดและภูมิคุ้มกัน" },
{ code: 4, roman: "IV", th: "ต่อมไร้ท่อ/เมแทบอลิก" },
{ code: 5, roman: "V", th: "จิตเวชและพฤติกรรม" },
{ code: 6, roman: "VI", th: "ระบบประสาท" },
{ code: 7, roman: "VII", th: "ตา" },
{ code: 8, roman: "VIII", th: "หู" },
{ code: 9, roman: "IX", th: "ระบบไหลเวียนโลหิต" },
{ code: 10, roman: "X", th: "ระบบหายใจ" },
{ code: 11, roman: "XI", th: "ทางเดินอาหาร" },
{ code: 12, roman: "XII", th: "ผิวหนัง" },
{ code: 13, roman: "XIII", th: "กระดูก/กล้ามเนื้อ/เนื้อเยื่อเกี่ยวพัน" },
{ code: 14, roman: "XIV", th: "ระบบสืบพันธุ์/ทางเดินปัสสาวะ" },
{ code: 15, roman: "XV", th: "ตั้งครรภ์/คลอด/หลังคลอด" },
{ code: 16, roman: "XVI", th: "ภาวะปริกำเนิด" },
{ code: 17, roman: "XVII", th: "ความผิดปกติแต่กำเนิด" },
{ code: 18, roman: "XVIII", th: "การบาดเจ็บและพิษ" },
{ code: 19, roman: "XIX", th: "สาเหตุภายนอก" },
];

// systems: { icdCode: [group2, group3] } ; category1 = หมวด1 general; group1 = emergency (across systems)
export const TOS = {
"2567": {
label: "เกณฑ์เดิม 2567 (ขั้นตอนที่ 2)",
note: "ประกาศแพทยสภา 12/2555 · เริ่มใช้ ก.ค. 2567 · ใช้กับ นศพ.ปี 5-6 ที่ยังสอบไม่ผ่าน",
total: 300, category1: 30, group1: 50,
systems: { 1:[12,4],2:[4,3],3:[6,6],4:[12,2],5:[7,5],6:[10,4],7:[4,3],8:[4,3],9:[7,7],10:[12,2],11:[12,2],12:[5,2],13:[10,4],14:[13,2],15:[12,6],16:[5,3],17:[0,5],18:[9,3],19:[10,0] },
},
"2569": {
label: "เกณฑ์ใหม่ 2569 (ส่วนที่ 1)",
note: "ประกาศแพทยสภา 4/2567 · มีผล 1 ม.ค. 2570 · ใช้กับ นศพ.ปี 4",
total: 250, category1: 30, group1: 50,
systems: { 1:[10,4],2:[1,4],3:[6,2],4:[7,3],5:[4,4],6:[9,3],7:[3,2],8:[3,2],9:[8,6],10:[10,4],11:[9,3],12:[4,1],13:[6,2],14:[7,5],15:[6,6],16:[4,2],17:[0,4],18:[6,2],19:[7,1] },
taskProps: { group1: { dx:.20, labs:.10, tx:.70, patho:0, prognosis:0 }, group23: { dx:.25, labs:.15, tx:.40, patho:.15, prognosis:.05 } },
},
};

export const SPEC_VERSIONS = Object.keys(TOS);

// Scale a spec to a target item count. Returns per-ICD-system targets (group2+3 combined),
// plus category1 (general) and group1 (emergency) targets, scaled proportionally.
export function scaledTargets(version, targetCount) {
const t = TOS[version];
if (!t) return null;
const N = Number(targetCount) > 0 ? Number(targetCount) : t.total;
const k = N / t.total;
const r = (x) => Math.round(x * k);
const systems = ICD_SYSTEMS.map((s) => {
const [g2, g3] = t.systems[s.code] || [0, 0];
return { code: s.code, roman: s.roman, th: s.th, base: g2 + g3, target: r(g2 + g3) };
});
return {
version, label: t.label, note: t.note, total: t.total, N, factor: k,
category1: { base: t.category1, target: r(t.category1) },
group1: { base: t.group1, target: r(t.group1) },
systems,
diseaseTotal: systems.reduce((a, s) => a + s.target, 0),
};
}
