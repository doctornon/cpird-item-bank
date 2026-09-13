"use client";
import { useCallback, useEffect, useState } from "react";
const ROLES = [["item_writer", "ผู้ออกข้อสอบ"], ["committee", "กรรมการ"], ["registrar", "ทะเบียน"]];
const APPROVAL = { approved: "อนุมัติแล้ว", pending: "รออนุมัติ", rejected: "ไม่อนุมัติ", revision: "ขอแก้ไข" };
const APPROVAL_CLS = { approved: "approved", pending: "draft", rejected: "retired", revision: "review" };
const fmtDate = (s) => { if (!s) return "—"; const d = new Date(s); return isNaN(d) ? "—" : d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" }); };

export default function AccountsAdmin({ sb, me, notify }) {
  const [rows, setRows] = useState([]);
  const [centers, setCenters] = useState([]);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (term) => {
    setLoading(true);
    const [{ data, error }, { data: mc }] = await Promise.all([
      sb.rpc("exam_user_accounts", { _q: term || null }),
      sb.from("medical_centers").select("id,name_th,short_name").eq("is_active", true).order("display_order"),
    ]);
    if (error) { notify("โหลดบัญชีผู้ใช้ไม่สำเร็จ: " + error.message); setLoading(false); return; }
    setRows(data || []); setCenters(mc || []); setLoading(false);
  }, [sb, notify]);
  useEffect(() => { load(""); }, [load]);

  const centerName = (cid) => { const c = centers.find((x) => String(x.id) === String(cid)); return c ? (c.short_name || c.name_th) : null; };
  const setCenter = async (uid, cid) => {
    setBusy(true);
    const { error } = await sb.rpc("exam_set_user_center", { _uid: uid, _center: cid ? Number(cid) : null });
    setBusy(false);
    if (error) return notify("ผิดพลาด: " + error.message);
    setRows((rs) => rs.map((r) => r.id === uid ? { ...r, medical_center_id: cid ? Number(cid) : null, center_name: cid ? centerName(cid) : null } : r));
    notify("บันทึกศูนย์แพทย์แล้ว");
  };
  const toggleRole = async (uid, role, has) => {
    setBusy(true);
    const { error } = await sb.rpc("exam_set_user_role", { _uid: uid, _role: role, _grant: !has });
    setBusy(false);
    if (error) return notify("ผิดพลาด: " + error.message);
    setRows((rs) => rs.map((r) => r.id === uid ? { ...r, roles: has ? (r.roles || []).filter((x) => x !== role) : [...(r.roles || []), role] } : r));
    notify("อัปเดตสิทธิ์แล้ว");
  };

  const shown = rows.filter((r) => !roleFilter || (roleFilter === "staff" ? (r.roles || []).length > 0 : (r.roles || []).includes(roleFilter)));
  const staffCount = rows.filter((r) => (r.roles || []).length > 0).length;

  return (
    <div>
      <div className="workspace-heading"><div><h2>จัดการบัญชีผู้ใช้</h2><p>กำหนดศูนย์แพทย์และสิทธิ์การใช้งานระบบคลังข้อสอบให้ผู้ใช้ · เฉพาะผู้ดูแลระบบเท่านั้น</p></div></div>

      <div className="bank-search" style={{ alignItems: "end", flexWrap: "wrap", gap: 12 }}>
        <div className="search-field" style={{ flex: 1, minWidth: 220 }}><label htmlFor="ac-q">ค้นหา (ชื่อ / อีเมล / รหัสนักศึกษา)</label>
          <input id="ac-q" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(q)} placeholder="พิมพ์แล้วกด Enter" /></div>
        <button className="btn" disabled={busy || loading} onClick={() => load(q)}>ค้นหา</button>
        {q && <button className="btn ghost" disabled={busy || loading} onClick={() => { setQ(""); load(""); }}>ล้าง</button>}
      </div>
      <div className="bank-status" role="tablist" style={{ marginTop: 8 }}>
        {[["", "ทั้งหมด"], ["staff", "มีสิทธิ์ (staff)"], ...ROLES.map(([v, l]) => [v, l])].map(([v, l]) =>
          <button key={v || "all"} className={"status-filter" + (roleFilter === v ? " selected" : "")} aria-pressed={roleFilter === v} onClick={() => setRoleFilter(v)}>{l}</button>)}
      </div>
      <p className="set-note" style={{ marginTop: 6 }}>แสดง {shown.length} จาก {rows.length} บัญชี · มีสิทธิ์ในระบบคลังข้อสอบ {staffCount} คน{rows.length >= 1000 ? " · แสดงสูงสุด 1000 รายการ ใช้ช่องค้นหาเพื่อจำกัด" : ""}</p>

      {loading ? <p className="muted" role="status">กำลังโหลด…</p> :
        <div className="tablewrap">
          <table>
            <thead><tr><th>ผู้ใช้</th><th>ศูนย์แพทย์</th>{ROLES.map(([v, l]) => <th key={v} style={{ textAlign: "center" }}>{l}</th>)}<th>สถานะบัญชี</th><th>สมัครเมื่อ</th></tr></thead>
            <tbody>
              {shown.length === 0 ? <tr><td colSpan={4 + ROLES.length}><div className="empty">ไม่พบบัญชีผู้ใช้</div></td></tr> :
                shown.map((r) => (
                  <tr key={r.id}>
                    <td>{r.full_name || "(ไม่มีชื่อ)"}{r.id === me ? " (คุณ)" : ""}<br /><span className="muted">{r.email}</span></td>
                    <td>
                      <select value={r.medical_center_id || ""} disabled={busy} onChange={(e) => setCenter(r.id, e.target.value)} style={{ maxWidth: 190 }}>
                        <option value="">— ไม่ระบุ —</option>
                        {centers.map((c) => <option key={c.id} value={c.id}>{c.short_name || c.name_th}</option>)}
                      </select>
                    </td>
                    {ROLES.map(([role]) => {
                      const has = (r.roles || []).includes(role);
                      return <td key={role} style={{ textAlign: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={has} disabled={busy} onChange={() => toggleRole(r.id, role, has)} /></td>;
                    })}
                    <td>{r.approval_status ? <span className={"pill " + (APPROVAL_CLS[r.approval_status] || "")}>{APPROVAL[r.approval_status] || r.approval_status}</span> : <span className="muted">—</span>}</td>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDate(r.created_at)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>}
      <p className="set-note" style={{ marginTop: 10 }}>สิทธิ์: <b>ผู้ออกข้อสอบ</b> = สร้าง/นำเข้าข้อสอบ · <b>กรรมการ</b> = วิพากษ์/อนุมัติ/จัดชุด/จัดรอบสอบ/ดูคะแนน · <b>ทะเบียน</b> = ดูชุดข้อสอบ · ผู้ดูแลระบบ (super admin) มีสิทธิ์ทุกอย่างอยู่แล้ว · “สถานะบัญชี” มาจากระบบสมัครของ LMS (แก้ที่ LMS)</p>
    </div>
  );
}
