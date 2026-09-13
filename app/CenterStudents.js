"use client";
import { useCallback, useEffect, useState } from "react";
const fdate = (s) => { if (!s) return "—"; const d = new Date(s); return isNaN(d) ? "—" : d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" }); };
const accMeta = (s) => s === "approved" ? { label: "ใช้งานได้", cls: "approved" } : s === "pending" ? { label: "รออนุมัติ", cls: "draft" } : s === "revoked" ? { label: "ถูกบล็อค", cls: "retired" } : { label: "ยังไม่ขอเข้าใช้", cls: "" };

export default function CenterStudents({ sb, notify }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addQ, setAddQ] = useState("");
  const [found, setFound] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async (term) => {
    setLoading(true);
    const { data, error } = await sb.rpc("center_students_list", { _q: term || null, _scope: "mine" });
    setLoading(false);
    if (error) return notify("โหลดรายชื่อไม่สำเร็จ: " + error.message);
    setRows(data || []);
  }, [sb, notify]);
  useEffect(() => { load(""); }, [load]);

  const setAccess = async (uid, status) => {
    if (status === "revoked" && !confirm("บล็อคนักศึกษารายนี้? จะเข้าทำข้อสอบไม่ได้ทันที")) return;
    setBusy(true);
    const { error } = await sb.rpc("center_set_student_access", { _uid: uid, _status: status });
    setBusy(false);
    if (error) return notify("ผิดพลาด: " + error.message);
    setRows((rs) => rs.map((r) => r.id === uid ? { ...r, access_status: status } : r));
    notify(status === "approved" ? "อนุมัติให้เข้าสอบแล้ว" : status === "revoked" ? "บล็อคแล้ว" : "อัปเดตแล้ว");
  };
  const findStudents = async () => {
    if (!addQ.trim()) return;
    setBusy(true);
    const { data, error } = await sb.rpc("center_students_list", { _q: addQ.trim(), _scope: "unassigned" });
    setBusy(false);
    if (error) return notify("ค้นหาไม่สำเร็จ: " + error.message);
    setFound(data || []);
  };
  const claim = async (uid) => {
    setBusy(true);
    const { error } = await sb.rpc("center_claim_student", { _uid: uid });
    setBusy(false);
    if (error) return notify("ผิดพลาด: " + error.message);
    setFound((f) => (f || []).filter((x) => x.id !== uid));
    notify("เพิ่มนักศึกษาเข้าศูนย์แล้ว"); load(q);
  };

  const centerName = rows[0]?.center_name;
  const pendingN = rows.filter((r) => r.access_status === "pending").length;
  return (
    <div>
      <div className="workspace-heading no-print"><div><h2>บัญชีนักศึกษาของศูนย์</h2><p>อนุมัติ/บล็อคการเข้าสอบของนักศึกษาในศูนย์{centerName ? " " + centerName : "ของท่าน"} · จัดการได้เฉพาะนักศึกษาในศูนย์ของท่านเท่านั้น</p></div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost" onClick={() => setShowAdd((v) => !v)}>{showAdd ? "ซ่อน" : "➕ เพิ่มนักศึกษาเข้าศูนย์"}</button>
          <button className="btn ghost" onClick={() => window.print()}>🖨️ พิมพ์รายชื่อ</button>
        </div>
      </div>

      {showAdd && <div className="card no-print" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>เพิ่มนักศึกษาเข้าศูนย์</h3>
        <p className="set-note">ค้นหานักศึกษาที่ยังไม่ได้สังกัดศูนย์ใด (ด้วยอีเมล ชื่อ หรือรหัสนักศึกษา) แล้วดึงเข้าศูนย์ของท่าน · หากนักศึกษาสังกัดศูนย์อื่นแล้ว ต้องให้เจ้าหน้าที่ สพพ. เป็นผู้ย้าย</p>
        <div className="row" style={{ gap: 6, margin: "8px 0" }}>
          <input value={addQ} onChange={(e) => setAddQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && findStudents()} placeholder="อีเมล / ชื่อ / รหัสนักศึกษา" />
          <button className="btn" disabled={busy} onClick={findStudents}>ค้นหา</button>
        </div>
        {found && (found.length === 0 ? <p className="muted">ไม่พบนักศึกษาที่ยังไม่สังกัดศูนย์ตามคำค้น</p> :
          <div className="tablewrap"><table>
            <thead><tr><th>นักศึกษา</th><th>รหัส</th><th /></tr></thead>
            <tbody>{found.map((r) => <tr key={r.id}><td>{r.full_name || "—"}<br /><span className="muted">{r.email}</span></td><td>{r.student_id || "—"}</td><td><button className="btn ghost sm" disabled={busy} onClick={() => claim(r.id)}>ดึงเข้าศูนย์</button></td></tr>)}</tbody>
          </table></div>)}
      </div>}

      <div className="card">
        <div className="row no-print" style={{ gap: 6, marginBottom: 12, alignItems: "center" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(q)} placeholder="ค้นหาในศูนย์: ชื่อ / อีเมล / รหัส" style={{ maxWidth: 320 }} />
          <button className="btn ghost" disabled={busy} onClick={() => load(q)}>ค้นหา</button>
          <span className="grow" />
          <span className="muted">{rows.length} คน{pendingN ? " · รออนุมัติ " + pendingN : ""}</span>
        </div>
        {loading ? <p className="muted">กำลังโหลด…</p> : rows.length === 0 ? <div className="empty">ยังไม่มีนักศึกษาในศูนย์ — ใช้ “เพิ่มนักศึกษาเข้าศูนย์” เพื่อดึงเข้ามา</div> :
        <div className="tablewrap"><table>
          <thead><tr><th>นักศึกษา</th><th>รหัสนักศึกษา</th><th>สถานะเข้าสอบ</th><th>สมัครเมื่อ</th><th className="no-print">จัดการ</th></tr></thead>
          <tbody>{rows.map((r) => { const m = accMeta(r.access_status); return <tr key={r.id}>
            <td>{r.full_name || "—"}<br /><span className="muted">{r.email}</span></td>
            <td>{r.student_id || "—"}</td>
            <td><span className={"pill " + m.cls}>{m.label}</span></td>
            <td>{fdate(r.created_at)}</td>
            <td className="no-print"><div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
              {r.access_status !== "approved" && <button className="btn ghost sm" disabled={busy} onClick={() => setAccess(r.id, "approved")}>อนุมัติ</button>}
              {r.access_status !== "revoked" && <button className="btn ghost sm" style={{ color: "var(--stop)" }} disabled={busy} onClick={() => setAccess(r.id, "revoked")}>บล็อค</button>}
              {r.access_status === "revoked" && <button className="btn ghost sm" disabled={busy} onClick={() => setAccess(r.id, "approved")}>ปลดบล็อค</button>}
            </div></td>
          </tr>; })}</tbody>
        </table></div>}
      </div>
    </div>
  );
}
