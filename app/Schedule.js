"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
const CATS = [["ศรว.", "ประกาศ ศรว."], ["MEC", "ภายใน MEC"], ["CPIRD", "CPIRD / สบพช."], ["deadline", "Deadline โครงการ"], ["other", "อื่น ๆ"]];
const CAT_CLS = { "ศรว.": "approved", MEC: "mcq", CPIRD: "meq", deadline: "retired", other: "" };
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

  // calendar grid
  const grid = useMemo(() => {
    const y = month.getFullYear(), m = month.getMonth();
    const first = new Date(y, m, 1); const startDow = (first.getDay() + 6) % 7; // Monday first
    const daysIn = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysIn; d++) cells.push(new Date(y, m, d));
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [month]);
  const eventsOn = (d) => { const s = iso(d); return filtered.filter((e) => s >= e.start_date && s <= (e.end_date || e.start_date)); };
  const todayIso = iso(today());

  const rowsTable = (list, label) => (
    <>
      <h3 className="delivery-subheading">{label} ({list.length})</h3>
      <div className="tablewrap"><table><thead><tr><th>วันที่</th><th>รายการ</th><th>หมวด</th><th>หมายเหตุ</th><th>ที่มา</th><th>นับถอยหลัง</th>{canWrite && <th />}</tr></thead>
        <tbody>{list.length === 0 ? <tr><td colSpan={canWrite ? 7 : 6}><div className="empty">ไม่มีรายการ</div></td></tr> : list.map((e) => { const n = daysUntil(e.start_date); return (
          <tr key={e.id}><td style={{ whiteSpace: "nowrap" }}>{fmt(e.start_date)}{e.end_date ? " – " + fmt(e.end_date) : ""}</td>
            <td><b>{e.title}</b></td>
            <td><span className={"pill " + (CAT_CLS[e.category] || "")}>{CATS.find(([k]) => k === e.category)?.[1] || e.category}</span></td>
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
      {loading ? <p className="muted" role="status">กำลังโหลด…</p> : view === "table" ? <>
        {rowsTable(upcoming, "กำลังจะถึง")}
        {past.length > 0 && <div style={{ marginTop: 18 }}>{rowsTable(past, "ผ่านไปแล้ว")}</div>}
      </> : <>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <button className="btn ghost sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹ เดือนก่อน</button>
          <h3 style={{ margin: 0 }}>{TH_MONTHS_FULL[month.getMonth()]} {month.getFullYear() + 543}</h3>
          <div className="row" style={{ gap: 6 }}><button className="btn ghost sm" onClick={() => { const t = today(); setMonth(new Date(t.getFullYear(), t.getMonth(), 1)); }}>วันนี้</button><button className="btn ghost sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>เดือนถัดไป ›</button></div>
        </div>
        <div className="cal-grid">
          {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((d) => <div key={d} className="cal-dow">{d}</div>)}
          {grid.map((d, i) => d == null ? <div key={"e" + i} className="cal-cell cal-empty" /> : (() => { const evs = eventsOn(d); const s = iso(d); return (
            <div key={s} className={"cal-cell" + (s === todayIso ? " cal-today" : "") + (d.getDay() === 0 || d.getDay() === 6 ? " cal-weekend" : "")} onClick={() => canWrite && setEditing(blank(s))} role={canWrite ? "button" : undefined} title={canWrite ? "คลิกเพื่อเพิ่มรายการวันนี้" : undefined}>
              <div className="cal-day">{d.getDate()}</div>
              {evs.map((e) => <div key={e.id} className={"cal-ev pill " + (CAT_CLS[e.category] || "")} title={e.title + (e.note ? " — " + e.note : "")} onClick={(ev) => { ev.stopPropagation(); if (canWrite) setEditing({ ...e, end_date: e.end_date || "", note: e.note || "", source: e.source || "" }); }}>{e.title}</div>)}
            </div>); })())}
        </div>
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
