// เลือกข้อสอบเข้าชุดตามตารางสเปก โดยใช้สถิติรายข้อจริงเป็นตัวจัดอันดับ
// ฟังก์ชันบริสุทธิ์ทั้งไฟล์ ไม่แตะฐานข้อมูล จึงทดสอบซ้ำได้และให้ผลเดิมเมื่อ seed เท่ากัน

import { classifyItem } from "./itemStats.mjs";

export const DEFAULTS = {
  // เว้นระยะก่อนนำข้อเดิมกลับมาใช้ กันข้อรั่วจากรุ่นพี่สู่รุ่นน้อง
  minRestDays: 365,
  // ใช้ซ้ำเกินกว่านี้ถือว่าเปิดเผยมากแล้ว ควรพักไว้ก่อน
  maxUseCount: 3,
  // กันไม่ให้ผู้แต่งคนเดียวครองชุด
  maxSharePerAuthor: 0.25,
};

// PRNG ขนาดเล็กแบบกำหนดผลได้ ใช้เฉพาะตัดสินอันดับที่คะแนนเท่ากัน
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const jitter = (id, seed) => (hash32(String(id) + ":" + seed) % 1000) / 1000;

const daysSince = (iso, now) => {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (now - t) / 86400000;
};

// คุณภาพจากสถิติจริง ข้อที่ยังไม่เคยใช้สอบได้คะแนนกลาง ๆ
// จึงถูกเลือกก่อนข้อที่พิสูจน์แล้วว่าไม่ดี แต่หลังข้อที่พิสูจน์แล้วว่าดี
export function qualityScore(stat) {
  if (!stat || stat.p_value == null) return { score: 0.5, tested: false, verdict: null };
  const c = classifyItem(stat);
  if (c.verdict === "retire") return { score: 0, tested: true, verdict: c.verdict };
  const p = Number(stat.p_value);
  const d = stat.discrimination == null ? null : Number(stat.discrimination);
  const pPart = p >= 0.3 && p <= 0.85 ? 1 : p >= 0.2 && p <= 0.9 ? 0.6 : 0.2;
  const dPart = d == null ? 0.5 : d >= 0.3 ? 1 : d >= 0.2 ? 0.8 : d >= 0.1 ? 0.4 : 0.1;
  // ค่าที่ได้จากผู้สอบน้อยยังเชื่อไม่เต็มที่ ดึงเข้าหาค่ากลาง
  const confidence = c.tentative ? 0.6 : 1;
  const raw = 0.45 * pPart + 0.55 * dPart;
  return { score: 0.5 + (raw - 0.5) * confidence, tested: true, verdict: c.verdict };
}

// ยิ่งเพิ่งใช้และยิ่งใช้บ่อย ยิ่งถูกถ่วงลง
export function exposurePenalty(item, opts, now) {
  const rest = daysSince(item.last_used_at, now);
  const used = Number(item.use_count || 0);
  const restPart = rest >= opts.minRestDays ? 0 : 1 - rest / opts.minRestDays;
  const usePart = Math.min(1, used / Math.max(1, opts.maxUseCount));
  return 0.6 * restPart + 0.4 * usePart;
}

const reasonFor = (q, exposure) => {
  if (!q.tested) return "ยังไม่เคยใช้สอบ";
  if (exposure > 0.5) return "สถิติดีแต่เพิ่งใช้ไปไม่นาน";
  if (q.verdict === "review") return "สถิติพอใช้ ควรทบทวน";
  return "สถิติดี";
};

/**
 * เสนอรายการข้อที่ควรบรรจุในชุด
 * @param {object} args
 * @param {Array} args.pool ข้อในคลังพร้อม metadata
 * @param {Map|object} args.stats สถิติล่าสุดรายข้อ คีย์ด้วย id
 * @param {Array} args.targets ช่องของตารางสเปก [{key,label,need,pred}]
 * @param {Array} args.chosen id ที่อยู่ในชุดแล้ว จะไม่ถูกเลือกซ้ำ
 * @param {string} args.seed เปลี่ยน seed เพื่อสุ่มชุดใหม่แบบยังทำซ้ำได้
 */
export function proposeSet({ pool = [], stats, targets = [], chosen = [], seed = "1", now = Date.now(), options = {} }) {
  const opts = { ...DEFAULTS, ...options };
  const statOf = (id) => (stats instanceof Map ? stats.get(id) ?? stats.get(String(id)) : stats?.[id]);
  const taken = new Set(chosen.map(String));

  // เตรียมคะแนนครั้งเดียว แล้วนำไปใช้กับทุกช่อง
  const scored = pool
    .filter((it) => it.status === "approved" && !it.is_sample && !taken.has(String(it.id)))
    .map((it) => {
      const q = qualityScore(statOf(it.id));
      const exposure = exposurePenalty(it, opts, now);
      return { item: it, q, exposure, base: q.score - 0.5 * exposure + 0.001 * jitter(it.id, seed) };
    })
    // ข้อที่สถิติบอกว่าควรถอน ไม่ควรถูกหยิบมาใช้อัตโนมัติ
    .filter((c) => c.q.verdict !== "retire");

  const totalNeed = targets.reduce((n, t) => n + Math.max(0, Number(t.need) || 0), 0);
  const authorCap = Math.max(1, Math.ceil(totalNeed * opts.maxSharePerAuthor));
  const perAuthor = new Map();

  // ช่องที่มีตัวเลือกน้อยได้สิทธิ์เลือกก่อน ไม่งั้นช่องหายากจะถูกช่องง่ายแย่งไปหมด
  const order = targets
    .map((t) => ({ t, cands: scored.filter((c) => t.pred(c.item)) }))
    .sort((a, b) => a.cands.length / Math.max(1, a.t.need) - b.cands.length / Math.max(1, b.t.need));

  const picks = [];
  const used = new Set();
  const gaps = [];

  for (const { t, cands } of order) {
    const need = Math.max(0, Number(t.need) || 0);
    const available = cands.filter((c) => !used.has(String(c.item.id))).sort((a, b) => b.base - a.base);

    // หยิบทีละข้อ เพื่อให้โควตาผู้แต่งที่เพิ่งถูกใช้ไปมีผลกับการหยิบครั้งถัดไปทันที
    let taken = 0;
    while (taken < need) {
      let best = -1;
      let bestRank = null;
      for (let i = 0; i < available.length; i++) {
        const c = available[i];
        if (!c || used.has(String(c.item.id))) continue;
        // ผู้แต่งที่ครองโควตาแล้วถูกดันไปท้ายแถว แต่ยังใช้ได้ถ้าไม่มีตัวเลือกอื่น
        const over = (perAuthor.get(c.item.author_id) || 0) >= authorCap ? 1 : 0;
        const rank = [over, -c.base];
        if (bestRank === null || rank[0] < bestRank[0] || (rank[0] === bestRank[0] && rank[1] < bestRank[1])) {
          best = i; bestRank = rank;
        }
      }
      if (best < 0) break;
      const c = available[best];
      used.add(String(c.item.id));
      perAuthor.set(c.item.author_id, (perAuthor.get(c.item.author_id) || 0) + 1);
      picks.push({
        id: c.item.id,
        cell: t.key,
        cellLabel: t.label,
        score: Number(c.base.toFixed(4)),
        tested: c.q.tested,
        reason: reasonFor(c.q, c.exposure),
      });
      taken++;
    }
    if (taken < need) {
      gaps.push({ key: t.key, label: t.label, need, got: taken, short: need - taken });
    }
  }

  return {
    picks,
    gaps,
    filled: picks.length,
    need: totalNeed,
    complete: gaps.length === 0 && totalNeed > 0,
  };
}
