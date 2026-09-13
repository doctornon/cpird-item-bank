"use client";
import { useCallback, useEffect, useState } from "react";
const ROLES = [["item_writer", "ออกข้อสอบ"], ["reviewer", "คัดเลือก/วิพากษ์"], ["set_manager", "จัดทำชุด"], ["analyst", "วิเคราะห์ผล"], ["center_staff", "จนท.ศูนย์"], ["committee", "กรรมการ (รวม)"], ["registrar", "ทะเบียน"]];
const APPOINT_ROLES = [["item_writer", "กรรมการออกข้อสอบ"], ["reviewer", "กรรมการคัดเลือก/วิพากษ์"], ["set_manager", "กรรมการจัดทำชุด"], ["analyst", "กรรมการวิเคราะห์ผล"], ["committee", "กรรมการ (รวมทุกหน้าที่)"]];
const fmtDate = (s) => { if (!s) return "—"; const d = new Date(s); return isNaN(d) ? "—" : d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" }); };
const sortCenters = (list) => [...list].sort((a, b) => ((b.short_name === "สพพ.") - (a.short_name === "สพพ.")) || (a.short_name || a.name_th).localeCompare(b.short_name || b.name_th, "th"));

export default function AccountsAdmin({ sb, me, notify }) {
  const [rows, setRows] = useState([]);
  const [centers, setCenters] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("relevant");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [invites, setInvites] = useState([]);
  const [showInv, setShowInv] = useState(false);
  const [invForm, setInvForm] = useState({ label: "", days: "14", max: "" });
  const [apps, setApps] = useState([]);
  const [showApps, setShowApps] = useState(false);
  const [appointFor, setAppointFor] = useState(null);

  const load = useCallback(async (term) => {
    setLoading(true);
    const [{ data, error }, { data: mc }, { data: inv }, { data: ap }] = await Promise.all([
      sb.rpc("exam_user_accounts", { _q: term || null }),
      sb.from("medical_centers").select("id,name_th,short_name").eq("is_active", true),
      sb.rpc("exam_list_invites"),
      sb.rpc("exam_writer_list"),
    ]);
    if (error) { notify("โหลดบัญชีผู้ใช้ไม่สำเร็จ: " + error.message); setLoading(false); return; }
    setRows(data || []); setCenters(sortCenters(mc || [])); setInvites(inv || []); setApps(ap || []); setLoading(false);
  }, [sb, notify]);
  const decideApp = async (uid, status, role) => {
    setBusy(true);
    const { error } = await sb.rpc("exam_writer_decide", { _uid: uid, _status: status, _role: role || "item_writer" });
    setBusy(false);
    if (error) return notify("ผิดพลาด: " + error.message);
    setApps((a) => a.map((x) => x.user_id === uid ? { ...x, status } : x));
    notify(status === "appointed" ? "แต่งตั้งเป็นผู้ออกข้อสอบแล้ว" : status === "rejected" ? "ปฏิเสธใบสมัครแล้ว" : "อัปเดตแล้ว");
    load(q);
  };
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
  const setAccess = async (uid, status) => {
    if (status === "revoked" && !confirm("บล็อคผู้ใช้รายนี้? จะเข้าใช้ระบบคลังข้อสอบไม่ได้ทันที (สิทธิ์ staff ก็ถูกระงับด้วย)")) return;
    setBusy(true);
    const { error } = await sb.rpc("exam_set_access", { _uid: uid, _status: status });
    setBusy(false);
    if (error) return notify("ผิดพลาด: " + error.message);
    setRows((rs) => rs.map((r) => r.id === uid ? { ...r, access_status: status, requested_at: r.requested_at || new Date().toISOString() } : r));
    notify(status === "approved" ? "อนุมัติให้เข้าใช้งานแล้ว" : status === "revoked" ? "บล็อคผู้ใช้แล้ว" : "อัปเดตแล้ว");
  };

  const cancelApp = async (r) => {
    if (!confirm("ยกเลิกการเป็นผู้ออกข้อสอบของ " + (r.full_name || r.email) + " ?\n\n• ลบใบสมัคร และถอนสิทธิ์ผู้ออกข้อสอบ\n• ข้อสอบที่ออกไว้แล้วยังคงอยู่ในคลัง (ไม่ถูกลบ)")) return;
    setBusy(true);
    const { error } = await sb.rpc("exam_writer_cancel", { _uid: r.id });
    setBusy(false);
    if (error) return notify("ผิดพลาด: " + error.message);
    notify("ยกเลิกการเป็นผู้ออกข้อสอบแล้ว"); load(q);
  };
  const removeAcct = async (r) => {
    if (r.id === me) return notify("ลบบัญชีตนเองไม่ได้");
    if (!confirm("ลบ " + (r.full_name || r.email) + " ออกจากระบบคลังข้อสอบ ?\n\n• ถอนสิทธิ์ทั้งหมด และบล็อกการเข้าใช้งานทันที\n• ไม่ลบบัญชี Google/LMS ที่ใช้ร่วมกัน\n• ไม่ลบข้อสอบที่บุคคลนี้ออกไว้แล้ว (ยังอยู่ในคลัง)")) return;
    setBusy(true);
    const { error } = await sb.rpc("exam_remove_from_system", { _uid: r.id });
    setBusy(false);
    if (error) return notify("ผิดพลาด: " + error.message);
    setRows((rs) => rs.map((x) => x.id === r.id ? { ...x, access_status: "revoked", roles: [] } : x));
    notify("ลบออกจากระบบคลังข้อสอบแล้ว"); load(q);
  };

  const createInvite = async () => {
    setBusy(true);
    const { data, error } = await sb.rpc("exam_create_invite", { _label: invForm.label || null, _days: Number(invForm.days) || 0, _max_uses: Number(invForm.max) || null });
    setBusy(false);
    if (error) return notify("สร้างลิงก์ไม่สำเร็จ: " + error.message);
    setInvites((v) => [data, ...v]); setInvForm({ label: "", days: "14", max: "" });
    notify("สร้างลิงก์เชิญแล้ว");
  };
  const toggleInvite = async (id, active) => {
    setBusy(true);
    const { error } = await sb.rpc("exam_set_invite_active", { _id: id, _active: !active });
    setBusy(false);
    if (error) return notify("ผิดพลาด: " + error.message);
    setInvites((v) => v.map((x) => x.id === id ? { ...x, active: !active } : x));
  };
  const inviteLink = (code) => (typeof window !== "undefined" ? window.location.origin : "") + "/?invite=" + code;
  const copyLink = (code) => { const t = inviteLink(code); if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => notify("คัดลอกลิงก์แล้ว"), () => notify(t)); else notify(t); };

  const accessMeta = (r) => {
    if (r.access_status === "approved") return { label: "ใช้งานได้", cls: "approved" };
    if (r.access_status === "pending") return { label: "รออนุมัติ", cls: "draft" };
    if (r.access_status === "revoked") return { label: "ถูกบล็อค", cls: "retired" };
    if (r.is_staff) return { label: "staff (อัตโนมัติ)", cls: "mcq" };
    return { label: "—", cls: "" };
  };
  const matchFilter = (r) => {
    if (filter === "pending") return r.access_status === "pending";
    if (filter === "approved") return r.access_status === "approved";
    if (filter === "blocked") return r.access_status === "revoked";
    if (filter === "staff") return (r.roles || []).length > 0 || r.is_staff;
    if (filter === "relevant") return !!r.access_status || r.is_staff;
    return true;
  };
  const shown = rows.filter(matchFilter);
  const pendingN = rows.filter((r) => r.access_status === "pending").length;

  return (
    <div>
      <div className="workspace-heading"><div><h2>จัดการบัญชีผู้ใช้</h2><p>อนุมัติ/บล็อคการเข้าใช้ระบบคลังข้อสอบ กำหนดศูนย์แพทย์และสิทธิ์ · การสมัครยึดตามการเข้าสู่ระบบในเว็บนี้ · เฉพาะผู้ดูแลระบบ</p></div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost" onClick={() => setShowApps((v) => !v)}>{showApps ? "ซ่อนใบสมัคร" : "📝 ใบสมัครผู้ออกข้อสอบ" + (apps.filter((a) => a.status === "pending").length ? " (" + apps.filter((a) => a.status === "pending").length + ")" : "")}</button>
          <button className="btn" onClick={() => setShowInv((v) => !v)}>{showInv ? "ซ่อนลิงก์เชิญ" : "🔗 ลิงก์เชิญเข้าใช้งาน"}</button>
        </div></div>
      {showApps && <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>ใบสมัครเป็นผู้ออกข้อสอบ</h3>
        {apps.length === 0 ? <p className="muted">ยังไม่มีใบสมัคร</p> : <div className="tablewrap"><table>
          <thead><tr><th>ผู้สมัคร</th><th>ตำแหน่ง / สังกัด</th><th>ศูนย์แพทย์</th><th>สาขา</th><th>สถานะ</th><th>พิจารณา</th></tr></thead>
          <tbody>{apps.map((a) => <tr key={a.user_id}>
            <td>{a.full_name || "—"}<br /><span className="muted">{a.email}{a.phone ? " · " + a.phone : ""}</span>{a.motivation ? <div className="muted" style={{ fontSize: 12, marginTop: 4, whiteSpace: "pre-wrap" }}>{a.motivation}</div> : null}</td>
            <td>{a.position || "—"}{a.affiliation ? <div className="muted">{a.affiliation}</div> : null}</td>
            <td>{a.center_name || "—"}</td>
            <td>{a.specialties || "—"}</td>
            <td><span className={"pill " + (a.status === "appointed" ? "approved" : a.status === "rejected" ? "retired" : "draft")}>{a.status === "appointed" ? "แต่งตั้งแล้ว" : a.status === "rejected" ? "ปฏิเสธ" : "รอพิจารณา"}</span>{(a.roles || []).length ? <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>สิทธิ์: {(a.roles || []).join(", ")}</div> : null}</td>
            <td>{appointFor === a.user_id ? <div className="appoint-pop">
              <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>แต่งตั้งเป็น (เลือกบทบาท) — เพิ่มบทบาทอื่นภายหลังได้ที่ตารางด้านล่าง</p>
              {APPOINT_ROLES.map(([role, label]) => <button key={role} className="btn ghost sm" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 4 }} disabled={busy} onClick={() => { setAppointFor(null); decideApp(a.user_id, "appointed", role); }}>{label}</button>)}
              <button className="btn ghost sm" style={{ marginTop: 2 }} onClick={() => setAppointFor(null)}>ยกเลิก</button>
            </div> : <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
              {a.status !== "appointed" && <button className="btn ghost sm" disabled={busy} onClick={() => setAppointFor(a.user_id)}>✔ แต่งตั้ง ▾</button>}
              {a.status !== "rejected" && <button className="btn ghost sm" style={{ color: "var(--stop)" }} disabled={busy} onClick={() => decideApp(a.user_id, "rejected")}>ปฏิเสธ</button>}
            </div>}</td>
          </tr>)}</tbody>
        </table></div>}
      </div>}

      {showInv && <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>ลิงก์เชิญเข้าใช้งาน (กำหนดช่วงเวลาได้)</h3>
        <p className="set-note">ใครก็ตามที่เปิดลิงก์นี้แล้วเข้าสู่ระบบ จะได้รับสิทธิ์เข้าใช้งานทันที (ภายในเวลาและจำนวนครั้งที่กำหนด) โดยไม่ต้องรออนุมัติ</p>
        <div className="row" style={{ gap: 8, alignItems: "end", flexWrap: "wrap", margin: "8px 0 4px" }}>
          <div className="search-field"><label>ชื่อลิงก์ (ไม่บังคับ)</label><input value={invForm.label} onChange={(e) => setInvForm({ ...invForm, label: e.target.value })} placeholder="เช่น กรรมการรอบ พ.ย. 69" /></div>
          <div className="search-field"><label>อายุ (วัน)</label><input type="number" min="0" style={{ width: 100 }} value={invForm.days} onChange={(e) => setInvForm({ ...invForm, days: e.target.value })} placeholder="ไม่จำกัด" /></div>
          <div className="search-field"><label>ใช้ได้กี่คน</label><input type="number" min="0" style={{ width: 110 }} value={invForm.max} onChange={(e) => setInvForm({ ...invForm, max: e.target.value })} placeholder="ไม่จำกัด" /></div>
          <button className="btn" disabled={busy} onClick={createInvite}>สร้างลิงก์</button>
        </div>
        <div className="tablewrap" style={{ marginTop: 10 }}><table>
          <thead><tr><th>ชื่อ</th><th>ลิงก์</th><th>หมดอายุ</th><th>ใช้แล้ว</th><th>สถานะ</th><th /></tr></thead>
          <tbody>
            {invites.length === 0 ? <tr><td colSpan={6}><div className="empty">ยังไม่มีลิงก์เชิญ</div></td></tr> :
              invites.map((v) => <tr key={v.id}>
                <td>{v.label || <span className="muted">(ไม่มีชื่อ)</span>}</td>
                <td><code style={{ fontSize: 12 }}>…/?invite={v.code}</code></td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{v.expires_at ? fmtDate(v.expires_at) : "ไม่จำกัด"}</td>
                <td>{v.used_count}{v.max_uses ? " / " + v.max_uses : ""}</td>
                <td>{(() => { const expired = v.expires_at && new Date(v.expires_at) < new Date(); const full = v.max_uses && v.used_count >= v.max_uses; const ok = v.active && !expired && !full; return <span className={"pill " + (ok ? "approved" : "retired")}>{!v.active ? "ปิด" : expired ? "หมดอายุ" : full ? "ใช้ครบแล้ว" : "ใช้งานได้"}</span>; })()}</td>
                <td><div className="row" style={{ gap: 4 }}><button className="btn ghost sm" disabled={busy} onClick={() => copyLink(v.code)}>คัดลอก</button><button className="btn ghost sm" disabled={busy} onClick={() => toggleInvite(v.id, v.active)}>{v.active ? "ปิด" : "เปิด"}</button></div></td>
              </tr>)}
          </tbody></table></div>
      </div>}

      <div className="bank-search" style={{ alignItems: "end", flexWrap: "wrap", gap: 12 }}>
        <div className="search-field" style={{ flex: 1, minWidth: 220 }}><label htmlFor="ac-q">ค้นหา (ชื่อ / อีเมล / รหัสนักศึกษา)</label>
          <input id="ac-q" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(q)} placeholder="พิมพ์แล้วกด Enter — ค้นได้ทุกคนในฐานเพื่อเชิญ/อนุมัติ" /></div>
        <button className="btn" disabled={busy || loading} onClick={() => load(q)}>ค้นหา</button>
        {q && <button className="btn ghost" disabled={busy || loading} onClick={() => { setQ(""); load(""); }}>ล้าง</button>}
      </div>
      <div className="bank-status" role="tablist" style={{ marginTop: 8 }}>
        {[["relevant", "เกี่ยวข้องกับระบบ"], ["pending", "รออนุมัติ" + (pendingN ? " (" + pendingN + ")" : "")], ["approved", "อนุมัติแล้ว"], ["blocked", "ถูกบล็อค"], ["staff", "มีสิทธิ์ (staff)"], ["all", "ทั้งหมด"]].map(([v, l]) =>
          <button key={v} className={"status-filter" + (filter === v ? " selected" : "")} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}
      </div>
      <p className="set-note" style={{ marginTop: 6 }}>แสดง {shown.length} รายการ · รออนุมัติ {pendingN} คน{q ? "" : " · ค่าเริ่มต้นแสดงเฉพาะผู้ที่เกี่ยวข้องกับระบบ (เคยเข้าใช้/มีสิทธิ์) — ใช้ช่องค้นหาเพื่อหาคนอื่นในฐาน"}</p>

      {loading ? <p className="muted" role="status">กำลังโหลด…</p> :
        <div className="tablewrap">
          <table>
            <thead><tr><th>ผู้ใช้</th><th>การเข้าใช้ระบบ</th><th>ศูนย์แพทย์</th>{ROLES.map(([v, l]) => <th key={v} style={{ textAlign: "center" }}>{l}</th>)}<th>สมัคร/เข้าใช้เมื่อ</th></tr></thead>
            <tbody>
              {shown.length === 0 ? <tr><td colSpan={5 + ROLES.length}><div className="empty">ไม่พบบัญชีผู้ใช้</div></td></tr> :
                shown.map((r) => { const am = accessMeta(r); return (
                  <tr key={r.id}>
                    <td>{r.full_name || "(ไม่มีชื่อ)"}{r.id === me ? " (คุณ)" : ""}<br /><span className="muted">{r.email}</span></td>
                    <td>
                      <span className={"pill " + am.cls} style={{ marginRight: 6 }}>{am.label}</span>
                      <div className="row" style={{ gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                        {r.access_status !== "approved" && <button className="btn ghost sm" disabled={busy || r.id === me} onClick={() => setAccess(r.id, "approved")}>อนุมัติ</button>}
                        {r.access_status !== "revoked" && <button className="btn ghost sm" style={{ color: "var(--stop)" }} disabled={busy || r.id === me} onClick={() => setAccess(r.id, "revoked")}>บล็อค</button>}
                        {r.access_status === "revoked" && <button className="btn ghost sm" disabled={busy} onClick={() => setAccess(r.id, "approved")}>ปลดบล็อค</button>}
                      </div>
                      {r.id !== me && <div className="row" style={{ gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                        {(r.roles || []).includes("item_writer") && <button className="btn ghost sm" style={{ color: "var(--warn)" }} disabled={busy} onClick={() => cancelApp(r)}>ยกเลิกผู้ออกข้อสอบ</button>}
                        <button className="btn ghost sm" style={{ color: "var(--stop)" }} disabled={busy} onClick={() => removeAcct(r)}>ลบออกจากระบบ</button>
                      </div>}
                    </td>
                    <td>
                      <select value={r.medical_center_id || ""} disabled={busy} onChange={(e) => setCenter(r.id, e.target.value)} style={{ maxWidth: 190 }}>
                        <option value="">— ไม่ระบุ —</option>
                        {centers.map((c) => <option key={c.id} value={c.id}>{c.short_name || c.name_th}</option>)}
                      </select>
                    </td>
                    {ROLES.map(([role]) => { const has = (r.roles || []).includes(role); return <td key={role} style={{ textAlign: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={has} disabled={busy} onChange={() => toggleRole(r.id, role, has)} /></td>; })}
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDate(r.requested_at)}</td>
                  </tr>
                ); })}
            </tbody>
          </table>
        </div>}
      <p className="set-note" style={{ marginTop: 10 }}>สิทธิ์: <b>ผู้ออกข้อสอบ</b> = สร้าง/นำเข้าข้อสอบ · <b>กรรมการ</b> = วิพากษ์/อนุมัติ/จัดชุด/จัดรอบสอบ/ดูคะแนน · <b>จัดชุดข้อสอบ</b> = สร้างชุดและคัดเลือกข้อเข้าชุด (ไม่รวมอนุมัติ) · <b>ทะเบียน</b> = ดูชุดข้อสอบ · การให้สิทธิ์ staff จะอนุมัติการเข้าใช้งานให้อัตโนมัติ · “บล็อค” ระงับการเข้าใช้ทันทีแม้มีสิทธิ์ staff (ยกเว้นผู้ดูแลระบบ)</p>
    </div>
  );
}
