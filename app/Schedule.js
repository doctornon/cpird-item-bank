"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
// The 3 exam-step sections (reorderable), then general categories
const STEPS = ["ส่วนที่ 1", "ขั้นตอนที่ 2", "ขั้นตอนที่ 3"];
const CATS = [
  ["ส่วนที่ 1", "ส่วนที่ 1 (ขั้นตอนที่ 1)"],
  ["ขั้นตอนที่ 2", "ขั้นตอนที่ 2"],
  ["ขั้นตอนที่ 3", "ขั้นตอนที่ 3 (OSCE / MEQ)"],
  ["ศรว.", "ประกาศ ศรว. (ทั่วไป)"],
  ["MEC", "ภายใน MEC"],
  ["CPIRD", "CPIRD / สบพช."],
  ["deadline", "Deadline โครงการ"],
  ["other", "อื่น ๆ"],
];
const CAT_LABEL = Object.fromEntries(CATS.map(([k, l]) => [k, l]));
const CAT_BG = { "ส่วนที่ 1": "var(--accent)", "ขั้นตอนที่ 2": "var(--review)", "ขั้นตอนที่ 3": "#8b5cf6", "ศรว.": "var(--approved)", MEC: "var(--draft)", CPIRD: "#0369a1", deadline: "var(--stop)", other: "var(--retired)" };
const SECTIONS = [...STEPS, "อื่น ๆ"]; // grouping buckets for the sectioned table
const SECTION_LABEL = { "ส่วนที่ 1": "ส่วนที่ 1 (ขั้นตอนที่ 1)", "ขั้นตอนที่ 2": "ขั้นตอนที่ 2", "ขั้นตอนที่ 3": "ขั้นตอนที่ 3 · OSCE / MEQ", "อื่น ๆ": "อื่น ๆ (MEC / CPIRD / Deadline)" };
const sectionOf = (e) => STEPS.includes(e.category) ? e.category : "อื่น ๆ";
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const TH_MONTHS_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
const fmt = (s) => { if (!s) return ""; const d = parse(s); return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`; };
const today = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
const daysUntil = (s) => Math.round((parse(s) - today()) / 86400000);
const blank = (date) => ({ title: "", category: "deadline", start_date: date || iso(today()), end_date: "", note: "", source: "" });

export default function Schedule({ sb, canWrite, notify }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("table");
  const [month, setMonth] = useState(() => { const t = today(); return new Date(t.getFullYear(), t.getMonth(), 1); });
  const [cat, setCat] = useState("");
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [grouped, setGrouped] = useState(true); // table: group by exam step
  const [order, setOrder] = useState(STEPS); // the 3 step sections, reorderable ("อื่น ๆ" always last)
  useEffect(() => { try { const o = JSON.parse(localStorage.getItem("cpird_sched_order") || "null"); if (Array.isArray(o) && o.length === STEPS.length && STEPS.every((s) => o.includes(s))) setOrder(o); } catch {} }, []);
  const moveSection = (s, dir) => setOrder((o) => { const i = o.indexOf(s), j = i + dir; if (j < 0 || j >= o.length) return o; const n = [...o]; [n[i], n[j]] = [n[j], n[i]]; try { localStorage.setItem("cpird_sched_order", JSON.stringify(n)); } catch {} return n; });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.from("schedule_events").select("*").order("start_date").order("id");
    if (error) notify("โหลดกำหนดการไม่สำเร็จ: " + error.message);
    setEvents(data || []); setLoading(false);
  }, [sb, notify]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => events.filter((e) => !cat || e.category === cat), [events, cat]);
  const upcoming = useMemo(() => filtered.filter((e) => daysUntil(e.end_date || e.start_date) >= 0), [filtered]);
  const past = useMemo(() => filtered.filter((e) => daysUntil(e.end_date || e.start_date) < 0).reverse(), [filtered]);

  const save = async () => {
    if (!editing.title.trim()) return notify("กรอกชื่อรายการ");
    if (!editing.start_date) return notify("กรอกวันที่เริ่ม");
    if (editing.end_date && editing.end_date < editing.start_date) return notify("วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
    setBusy(true);
    const row = { title: editing.title.trim(), category: editing.category, start_date: editing.start_date, end_date: editing.end_date || null, note: editing.note || null, source: editing.source || null, updated_at: new Date().toISOString() };
    const q = editing.id ? sb.from("schedule_events").update(row).eq("id", editing.id) : sb.from("schedule_events").insert(row);
    const { error } = await q;
    setBusy(false);
    if (error) return notify("บันทึกไม่สำเร็จ: " + error.message);
    notify("บันทึกกำหนดการแล้ว"); setEditing(null); load();
  };
  const del = async () => {
    if (!editing?.id || !confirm("ลบรายการนี้?")) return;
    setBusy(true);
    const { error } = await sb.from("schedule_events").delete().eq("id", editing.id);
    setBusy(false);
    if (error) return notify("ลบไม่สำเร็จ: " + error.message);
    notify("ลบแล้ว"); setEditing(null); load();
  };

  // calendar weeks with Google-Calendar-style spanning event bars (one bar per event, laid out in lanes)
  const weeks = useMemo(() => {
    const y = month.getFullYear(), m = month.getMonth();
    const first = new Date(y, m, 1); const startDow = (first.getDay() + 6) % 7; // Monday first
    const daysIn = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysIn; d++) cells.push(new Date(y, m, d));
    while (cells.length % 7) cells.push(null);
    const out = [];
    for (let w = 0; w * 7 < cells.length; w++) {
      const days = cells.slice(w * 7, w * 7 + 7);
      const firstD = days.find(Boolean), lastD = [...days].reverse().find(Boolean);
      const firstIso = firstD ? iso(firstD) : null, lastIso = lastD ? iso(lastD) : null;
      const segs = [];
      for (const e of filtered) {
        const es = e.start_date, ee = e.end_date || e.start_date;
        let sc = -1, ec = -1;
        for (let c = 0; c < 7; c++) { const d = days[c]; if (!d) continue; const s = iso(d); if (s >= es && s <= ee) { if (sc < 0) sc = c; ec = c; } }
        if (sc < 0) continue;
        segs.push({ id: e.id, e, sc, ec, contLeft: firstIso && es < firstIso, contRight: lastIso && ee > lastIso });
      }
      // lane assignment: earliest, then longest first; pack into lowest free lane
      segs.sort((a, b) => a.sc - b.sc || (b.ec - b.sc) - (a.ec - a.sc));
      const lanes = [];
      for (const seg of segs) {
        let lane = 0;
        for (; ; lane++) { const occ = lanes[lane] || (lanes[lane] = []); if (occ.every((r) => seg.ec < r.sc || seg.sc > r.ec)) { occ.push(seg); seg.lane = lane; break; } }
      }
      out.push({ days, segs, lanes: lanes.length });
    }
    return out;
  }, [month, filtered]);
  const todayIso = iso(today());
  const DAY_H = 24, LANE_H = 22;

  const rowsTable = (list, label) => (
    <>
      <h3 className="delivery-subheading">{label} ({list.length})</h3>
      <div className="tablewrap"><table><thead><tr><th>วันที่</th><th>รายการ</th><th>หมวด</th><th>หมายเหตุ</th><th>ที่มา</th><th>นับถอยหลัง</th>{canWrite && <th />}</tr></thead>
        <tbody>{list.length === 0 ? <tr><td colSpan={canWrite ? 7 : 6}><div className="empty">ไม่มีรายการ</div></td></tr> : list.map((e) => { const n = daysUntil(e.start_date); return (
          <tr key={e.id}><td style={{ whiteSpace: "nowrap" }}>{fmt(e.start_date)}{e.end_date ? " – " + fmt(e.end_date) : ""}</td>
            <td><b>{e.title}</b></td>
            <td><span className="pill" style={{ background: CAT_BG[e.category] || "var(--retired)" }}>{CAT_LABEL[e.category] || e.category}</span></td>
            <td className="muted">{e.note || "—"}</td><td className="muted">{e.source || "—"}</td>
            <td>{n > 0 ? <span className={"pill " + (n <= 14 ? "retired" : n <= 45 ? "review" : "approved")}>อีก {n} วัน</span> : n === 0 ? <span className="pill retired">วันนี้</span> : <span className="muted">ผ่านแล้ว</span>}</td>
            {canWrite && <td><button className="btn ghost sm" onClick={() => setEditing({ ...e, end_date: e.end_date || "", note: e.note || "", source: e.source || "" })}>แก้ไข</button></td>}
          </tr>); })}
        </tbody></table></div>
    </>
  );

  return (
    <div>
      <div className="workspace-heading"><div><h2>กำหนดการ & ประกาศ</h2><p>ตารางสอบ ศรว. (ประกาศ ที่ 3/2569 · ปี 2570) และ deadline โครงการ — ดูแบบตารางหรือปฏิทิน</p></div>
        {canWrite && <button className="btn" onClick={() => setEditing(blank())}>+ เพิ่มรายการ</button>}</div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <div className="bank-status" role="tablist" style={{ margin: 0 }}>
          {[["table", "📋 ตาราง"], ["calendar", "📅 ปฏิทิน"]].map(([v, l]) => <button key={v} className={"status-filter" + (view === v ? " selected" : "")} aria-pressed={view === v} onClick={() => setView(v)}>{l}</button>)}
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ marginLeft: "auto" }}><option value="">ทุกหมวด</option>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      {view === "table" && <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 10 }}>
        <label className="delivery-check" style={{ margin: 0 }}><input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />แบ่งเป็น 3 ส่วน (ตามขั้นตอนสอบ) — จัดลำดับส่วนได้</label>
      </div>}
      {loading ? <p className="muted" role="status">กำลังโหลด…</p> : view === "table" ? (
        grouped ? [...order.map((s, i) => [s, i]), ...(filtered.some((e) => sectionOf(e) === "อื่น ๆ") ? [["อื่น ๆ", -1]] : [])].map(([sec, idx]) => {
          const list = filtered.filter((e) => sectionOf(e) === sec);
          const up = list.filter((e) => daysUntil(e.end_date || e.start_date) >= 0);
          const pa = list.filter((e) => daysUntil(e.end_date || e.start_date) < 0).reverse();
          return (
            <section key={sec} className="sched-section" style={{ marginBottom: 22 }}>
              <div className="row" style={{ alignItems: "center", gap: 10, margin: "0 0 8px" }}>
                <span className="pill" style={{ background: sec === "อื่น ๆ" ? "var(--retired)" : CAT_BG[sec], fontSize: 12.5 }}>{SECTION_LABEL[sec]}</span>
                <span className="muted">{list.length} รายการ</span>
                {idx >= 0 && <div className="row" style={{ gap: 4, marginLeft: "auto" }}>
                  <button className="btn ghost sm" disabled={idx === 0} title="เลื่อนส่วนนี้ขึ้น" onClick={() => moveSection(sec, -1)}>↑</button>
                  <button className="btn ghost sm" disabled={idx === order.length - 1} title="เลื่อนส่วนนี้ลง" onClick={() => moveSection(sec, 1)}>↓</button>
                </div>}
              </div>
              {list.length === 0 ? <p className="muted" style={{ margin: "0 0 4px" }}>ไม่มีรายการในส่วนนี้</p> : <>
                {up.length > 0 && rowsTable(up, "กำลังจะถึง")}
                {pa.length > 0 && <div style={{ marginTop: 12 }}>{rowsTable(pa, "ผ่านไปแล้ว")}</div>}
              </>}
            </section>
          );
        }) : <>
          {rowsTable(upcoming, "กำลังจะถึง")}
          {past.length > 0 && <div style={{ marginTop: 18 }}>{rowsTable(past, "ผ่านไปแล้ว")}</div>}
        </>
      ) : <>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <button className="btn ghost sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹ เดือนก่อน</button>
          <h3 style={{ margin: 0 }}>{TH_MONTHS_FULL[month.getMonth()]} {month.getFullYear() + 543}</h3>
          <div className="row" style={{ gap: 6 }}><button className="btn ghost sm" onClick={() => { const t = today(); setMonth(new Date(t.getFullYear(), t.getMonth(), 1)); }}>วันนี้</button><button className="btn ghost sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>เดือนถัดไป ›</button></div>
        </div>
        <div className="cal-head">{["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((d) => <div key={d} className="cal-dow">{d}</div>)}</div>
        <div className="cal-weeks">
          {weeks.map((wk, wi) => { const rows = Math.max(wk.lanes, 2); return (
            <div key={wi} className="cal-week" style={{ gridTemplateRows: `${DAY_H}px repeat(${rows}, ${LANE_H}px)` }}>
              {wk.days.map((d, c) => d == null
                ? <div key={"e" + c} className="cal-cell cal-empty" style={{ gridColumn: c + 1, gridRow: "1 / -1" }} />
                : (() => { const s = iso(d); return (
                  <div key={s} className={"cal-cell" + (s === todayIso ? " cal-today" : "") + (d.getDay() === 0 || d.getDay() === 6 ? " cal-weekend" : "")} style={{ gridColumn: c + 1, gridRow: "1 / -1" }} onClick={() => canWrite && setEditing(blank(s))} role={canWrite ? "button" : undefined} title={canWrite ? "คลิกเพื่อเพิ่มรายการวันนี้" : undefined}>
                    <div className="cal-day">{d.getDate()}</div>
                  </div>); })())}
              {wk.segs.map((seg) => (
                <div key={seg.id} className="cal-bar" style={{
                  gridColumn: `${seg.sc + 1} / ${seg.ec + 2}`, gridRow: seg.lane + 2,
                  background: CAT_BG[seg.e.category] || "var(--retired)",
                  borderTopLeftRadius: seg.contLeft ? 0 : 6, borderBottomLeftRadius: seg.contLeft ? 0 : 6,
                  borderTopRightRadius: seg.contRight ? 0 : 6, borderBottomRightRadius: seg.contRight ? 0 : 6,
                  marginLeft: seg.contLeft ? 0 : 3, marginRight: seg.contRight ? 0 : 3,
                }} title={seg.e.title + (seg.e.note ? " — " + seg.e.note : "")} onClick={(ev) => { ev.stopPropagation(); if (canWrite) setEditing({ ...seg.e, end_date: seg.e.end_date || "", note: seg.e.note || "", source: seg.e.source || "" }); }}>
                  {seg.contLeft ? "‹ " : ""}{seg.e.title}
                </div>
              ))}
            </div>); })}
        </div>
        <div className="cal-legend">{[...STEPS, "MEC", "CPIRD", "deadline"].map((k) => <span key={k} className="cal-legend-item"><i style={{ background: CAT_BG[k] }} />{CAT_LABEL[k] || k}</span>)}</div>
      </>}

      {editing && <div className="overlay" onClick={(e) => e.target === e.currentTarget && setEditing(null)}><div className="modal">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><h3>{editing.id ? "แก้ไขรายการ" : "เพิ่มรายการ"}</h3><button className="btn ghost sm" onClick={() => setEditing(null)}>ปิด</button></div>
        <div className="field"><label>ชื่อรายการ</label><input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="เช่น ส่งข้อสอบรอบ 1 / ประชุมกรรมการ" /></div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <div className="field"><label>หมวด</label><select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field"><label>ที่มา (ไม่บังคับ)</label><input value={editing.source} onChange={(e) => setEditing({ ...editing, source: e.target.value })} placeholder="เช่น ประกาศ ศรว. ที่ 3/2569" /></div>
        </div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <div className="field"><label>วันเริ่ม</label><input type="date" value={editing.start_date} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} /></div>
          <div className="field"><label>วันสิ้นสุด (เว้นว่าง = วันเดียว)</label><input type="date" value={editing.end_date} onChange={(e) => setEditing({ ...editing, end_date: e.target.value })} /></div>
        </div>
        <div className="field" style={{ marginTop: 8 }}><label>หมายเหตุ</label><textarea rows={3} value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
          <div>{editing.id && <button className="btn ghost" style={{ color: "var(--stop)" }} disabled={busy} onClick={del}>🗑 ลบ</button>}</div>
          <div className="row" style={{ gap: 8 }}><button className="btn ghost" disabled={busy} onClick={() => setEditing(null)}>ยกเลิก</button><button className="btn" disabled={busy} onClick={save}>บันทึก</button></div>
        </div>
      </div></div>}
    </div>
  );
}
