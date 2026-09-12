"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
const baht = (n) => (n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });

export default function ItemCompensation({ sb, notify }) {
  const [items, setItems] = useState([]);      // {id, author_id, status, use_count}
  const [sets, setSets] = useState([]);         // mcq exam_sets for the filter
  const [setId, setSetId] = useState("");       // "" = all
  const [setItemIds, setSetItemIds] = useState(null); // Set of item ids in chosen set
  const [names, setNames] = useState({});
  const [basis, setBasis] = useState("selected"); // 'selected' | 'used'
  const [rate, setRate] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: bi, error: e1 }, { data: es }] = await Promise.all([
      sb.from("bank_items").select("id,author_id,status,use_count,type").neq("status", "personal").eq("is_sample", false).limit(5000),
      sb.from("exam_sets").select("id,name,kind").eq("kind", "mcq").order("id"),
    ]);
    if (e1) { setLoading(false); notify("โหลดข้อมูลไม่สำเร็จ: " + e1.message); return; }
    const list = bi || [];
    setItems(list);
    setSets(es || []);
    const aids = [...new Set(list.map((x) => x.author_id).filter(Boolean))];
    if (aids.length) {
      const { data: ns } = await sb.rpc("profile_names", { _ids: aids });
      const m = {}; (ns || []).forEach((n) => { m[n.id] = n.full_name || n.email; }); setNames(m);
    }
    setLoading(false);
  }, [sb, notify]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!setId) { setSetItemIds(null); return; }
    sb.from("exam_set_items").select("item_id").eq("exam_set_id", setId).then(({ data }) => setSetItemIds(new Set((data || []).map((r) => String(r.item_id)))));
  }, [sb, setId]);

  const rows = useMemo(() => {
    const inSet = (it) => !setItemIds || setItemIds.has(String(it.id));
    const by = {};
    for (const it of items) {
      const a = it.author_id || "—";
      const r = by[a] || (by[a] = { author: a, submitted: 0, selected: 0, used: 0 });
      r.submitted++; // total authored (non-personal), bank-wide
      if (setItemIds) {
        if (inSet(it)) { r.selected++; if (it.use_count > 0) r.used++; }
      } else {
        if (it.status === "approved") r.selected++;
        if (it.use_count > 0) r.used++;
      }
    }
    const rt = Number(rate) || 0;
    return Object.values(by).map((r) => {
      const base = basis === "used" ? r.used : r.selected;
      return { ...r, name: names[r.author] || (r.author === "—" ? "(ไม่ระบุผู้ออก)" : r.author.slice(0, 8)), base, pay: base * rt };
    }).sort((a, b) => b.base - a.base || b.submitted - a.submitted);
  }, [items, setItemIds, names, basis, rate]);

  const totals = useMemo(() => rows.reduce((a, r) => ({ submitted: a.submitted + r.submitted, selected: a.selected + r.selected, used: a.used + r.used, base: a.base + r.base, pay: a.pay + r.pay }), { submitted: 0, selected: 0, used: 0, base: 0, pay: 0 }), [rows]);

  const selLabel = setItemIds ? "คัดเลือกเข้าชุดนี้" : "ผ่านคัดเลือก (อนุมัติ)";
  const usedLabel = setItemIds ? "ใช้จริง (ในชุดนี้)" : "ใช้จริง (เคยสอบ)";

  if (loading) return <div><p className="muted" role="status">กำลังโหลด…</p></div>;
  return (
    <div>
      <div className="workspace-heading"><div><h2>ค่าตอบแทนการออกข้อสอบ</h2><p>สรุปตามผู้ออกข้อสอบ — จำนวนข้อที่ส่ง / ได้รับคัดเลือก / ใช้จริง · เลือกฐานคำนวณและอัตราต่อข้อ</p></div></div>

      <div className="bank-search" style={{ alignItems: "end", flexWrap: "wrap", gap: 12 }}>
        <div className="search-field"><label htmlFor="ic-set">ขอบเขต (ชุดข้อสอบ)</label>
          <select id="ic-set" value={setId} onChange={(e) => setSetId(e.target.value)}><option value="">ทุกชุด (ภาพรวมทั้งคลัง)</option>{sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="search-field"><label htmlFor="ic-rate">อัตราค่าตอบแทน (บาท/ข้อ)</label>
          <input id="ic-rate" type="number" min="0" step="1" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="เช่น 200" /></div>
      </div>
      <div className="bank-status" role="tablist" style={{ marginTop: 8 }}>
        <span className="mk" style={{ margin: "0 8px 0 0", alignSelf: "center" }}>ฐานคำนวณค่าตอบแทน:</span>
        {[["selected", "ตามข้อที่คัดเลือก"], ["used", "ตามข้อที่ใช้จริง"]].map(([v, l]) =>
          <button key={v} className={"status-filter" + (basis === v ? " selected" : "")} aria-pressed={basis === v} onClick={() => setBasis(v)}>{l}</button>)}
      </div>
      <p className="set-note" style={{ marginTop: 6 }}>ปี 2570 เป็นต้นไปคิดจาก “ข้อที่ผ่านเกณฑ์คัดเลือก” หรือเลือกคิดจาก “ข้อที่ใช้จริง” ได้ · {setItemIds ? "กำลังดูเฉพาะชุดที่เลือก" : "ภาพรวมทั้งคลัง"}</p>

      <div className="tablewrap">
        <table>
          <thead><tr><th>ผู้ออกข้อสอบ</th><th>ส่ง</th><th>{selLabel}</th><th>{usedLabel}</th><th>ฐาน</th><th>ค่าตอบแทน (฿)</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={6}><div className="empty">ไม่มีข้อมูล</div></td></tr> :
              rows.map((r) => <tr key={r.author}><td>{r.name}</td><td>{r.submitted}</td><td>{r.selected}</td><td>{r.used}</td><td><b>{r.base}</b></td><td>{Number(rate) > 0 ? baht(r.pay) : "—"}</td></tr>)}
          </tbody>
          {rows.length > 0 && <tfoot><tr style={{ fontWeight: 700, borderTop: "2px solid var(--line)" }}><td>รวม {rows.length} คน</td><td>{totals.submitted}</td><td>{totals.selected}</td><td>{totals.used}</td><td>{totals.base}</td><td>{Number(rate) > 0 ? baht(totals.pay) : "—"}</td></tr></tfoot>}
        </table>
      </div>
      <p className="set-note" style={{ marginTop: 8 }}>“ส่ง” = ข้อที่ผู้ออกสร้างเข้าคลัง (ไม่รวมคลังส่วนตัว) · “คัดเลือก” = {setItemIds ? "ข้อของผู้ออกที่อยู่ในชุดนี้" : "ข้อที่อนุมัติแล้ว"} · “ใช้จริง” = {setItemIds ? "ข้อในชุดนี้ที่เคยใช้สอบ" : "ข้อที่ use_count > 0"}</p>
    </div>
  );
}
