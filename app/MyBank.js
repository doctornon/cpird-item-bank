"use client";
import { useCallback, useEffect, useState } from "react";
// xlsx เป็นไลบรารีก้อนใหญ่และใช้เฉพาะตอนดาวน์โหลด template หรืออ่านไฟล์ที่อัปโหลด
// จึงโหลดแบบ dynamic ไม่ให้ติดไปกับ bundle แรกของทุกคนที่เปิดแอป
const loadXlsx = () => import("xlsx");
import { OPT_LABELS } from "../lib/constants";
import ItemEditor from "./ItemEditor";
import ItemPreview from "./ItemPreview";

// ---- Excel helpers (shared shape with Import.js) ----
function pick(row, prefix) {
  const k = Object.keys(row).find((key) => key.trim().toLowerCase().startsWith(prefix));
  return k != null ? String(row[k] ?? "").trim() : "";
}
const MCQ_HEADERS = ["stem", "nl_domain", "nl_subitem", "physician_task", "specialty", "bloom", "difficulty", "option_a", "option_b", "option_c", "option_d", "option_e", "correct", "rationale", "tags"];
const MEQ_HEADERS = ["stem", "nl_domain", "nl_subitem", "physician_task", "specialty", "bloom", "difficulty", "model_answer", "max_score", "rubric", "tags"];

export default function MyBank({ sb, bp, me, canWrite, notify }) {
  const [items, setItems] = useState([]);
  const [stems, setStems] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // "new-mcq" | "new-meq" | item
  const [previewing, setPreviewing] = useState(null);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.from("bank_items").select("*").eq("author_id", me).eq("status", "personal").order("updated_at", { ascending: false }).limit(1000);
    if (error) { setLoading(false); notify("โหลดคลังของฉันไม่สำเร็จ: " + error.message); return; }
    const list = data || [];
    setItems(list);
    const vids = list.map((x) => x.current_version_id).filter(Boolean);
    if (vids.length) {
      const { data: vs } = await sb.from("bank_item_versions").select("id,stem").in("id", vids);
      const m = {}; (vs || []).forEach((v) => { m[v.id] = v.stem; }); setStems(m);
    } else setStems({});
    setLoading(false);
  }, [sb, me, notify]);
  useEffect(() => { load(); }, [load]);

  const domainTitle = (c) => bp.domains.find((d) => d.code === c)?.title || c || "—";
  const taskName = (c) => bp.tasks.find((t) => t.code === c)?.name || c || "";
  const specName = (id) => bp.specs.find((s) => s.id === id)?.name_th || "";
  const domCode = (val) => { if (!val) return null; const d = bp.domains.find((x) => x.title === val || x.code === val || val.startsWith(x.code + ".") || val.startsWith(x.code + " ")); return d ? d.code : null; };
  const taskCode = (val) => { if (!val) return null; const t = bp.tasks.find((x) => x.name === val) || bp.tasks.find((x) => val.startsWith(x.name) || x.name.startsWith(val)); return t ? t.code : null; };
  const specId = (val) => { if (!val) return null; const s = bp.specs.find((x) => x.name_th === val) || bp.specs.find((x) => (x.name_th || "").startsWith(val) || val.startsWith(x.name_th || " ")); return s ? s.id : null; };

  // ---- submit personal -> real bank (draft) ----
  const submitToBank = async (it) => {
    if (!confirm("ส่งข้อ #" + it.id + " เข้าคลังจริง?\nข้อจะย้ายจากคลังของฉันไปเป็นสถานะ “ร่าง” ในคลังจริง เพื่อเข้าสู่ขั้นทบทวน/อนุมัติ")) return;
    setBusy(true);
    const { error } = await sb.from("bank_items").update({ status: "draft", updated_at: new Date().toISOString() }).eq("id", it.id);
    setBusy(false);
    if (error) return notify("ส่งเข้าคลังไม่สำเร็จ: " + error.message);
    notify("ส่งข้อ #" + it.id + " เข้าคลังจริงแล้ว (สถานะ: ร่าง)");
    load();
  };
  const del = async (it) => {
    if (!confirm("ลบข้อ #" + it.id + " ออกจากคลังของฉันถาวร?")) return;
    setBusy(true);
    const { error } = await sb.from("bank_items").delete().eq("id", it.id);
    setBusy(false);
    if (error) return notify("ลบไม่สำเร็จ: " + error.message);
    notify("ลบข้อ #" + it.id + " แล้ว");
    load();
  };

  // ---- Excel template download ----
  const downloadTemplate = async () => {
    const XLSX = await loadXlsx();
    const wb = XLSX.utils.book_new();
    const mcqExample = ["ผู้ป่วยชาย 60 ปี มีอาการเจ็บหน้าอก… (โจทย์ตัวอย่าง — ลบออกก่อนอัปโหลด)", (bp.domains[0]?.title || "I"), "", (bp.tasks[0]?.name || "การวินิจฉัย"), (bp.specs[0]?.name_th || "อายุรศาสตร์"), "", "", "ตัวเลือก A", "ตัวเลือก B", "ตัวเลือก C", "ตัวเลือก D", "ตัวเลือก E", "A", "เฉลยอธิบายว่าทำไม A ถูก", "tag1, tag2"];
    const meqExample = ["สถานการณ์ผู้ป่วย… (โจทย์ตัวอย่าง — ลบออกก่อนอัปโหลด)", (bp.domains[0]?.title || "I"), "", (bp.tasks[0]?.name || "การวินิจฉัย"), (bp.specs[0]?.name_th || "อายุรศาสตร์"), "", "", "แนวคำตอบ/เฉลย", "10", "เกณฑ์การให้คะแนน (rubric)", "tag1"];
    const wsMcq = XLSX.utils.aoa_to_sheet([MCQ_HEADERS, mcqExample]);
    const wsMeq = XLSX.utils.aoa_to_sheet([MEQ_HEADERS, meqExample]);
    XLSX.utils.book_append_sheet(wb, wsMcq, "MCQ");
    XLSX.utils.book_append_sheet(wb, wsMeq, "MEQ");
    // reference sheet with valid values
    const dList = bp.domains.map((d) => d.code + " — " + d.title);
    const tList = bp.tasks.map((t) => t.name);
    const sList = bp.specs.map((s) => s.name_th);
    const n = Math.max(dList.length, tList.length, sList.length);
    const ref = [["หมวด NL (nl_domain)", "ภารกิจแพทย์ (physician_task)", "สาขา (specialty)"]];
    for (let i = 0; i < n; i++) ref.push([dList[i] || "", tList[i] || "", sList[i] || ""]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ref), "ค่าที่ใช้ได้");
    XLSX.writeFile(wb, "template_คลังข้อสอบของฉัน.xlsx");
  };

  const parseSheet = (XLSX, ws, type) => {
    const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
    return json.filter((r) => pick(r, "stem")).map((r) => {
      const dRaw = pick(r, "nl_domain"), tRaw = pick(r, "physician_task"), spRaw = pick(r, "specialty");
      const base = {
        type, nl_domain_raw: dRaw, nl_domain_code: domCode(dRaw), nl_subitem: pick(r, "nl_subitem") || null,
        physician_task_raw: tRaw, physician_task: taskCode(tRaw), specialty_raw: spRaw, specialty_id: specId(spRaw),
        bloom_level: pick(r, "bloom") || null, difficulty_target: pick(r, "difficulty") || null, stem: pick(r, "stem"), tags: pick(r, "tags"),
      };
      if (type === "mcq") {
        const opts = OPT_LABELS.map((L) => ({ label: L, body: pick(r, "option_" + L.toLowerCase()) })).filter((o) => o.body);
        const correct = (pick(r, "correct") || "").toUpperCase().charAt(0);
        base.options = opts.map((o) => ({ ...o, is_correct: o.label === correct }));
        base.rationale = pick(r, "rationale") || null; base.rationale_mode = "combined";
      } else {
        base.meq_model_answer = pick(r, "model_answer") || null;
        base.meq_max_score = pick(r, "max_score") ? Number(pick(r, "max_score")) : null;
        base.rationale = pick(r, "rubric") || null; base.rationale_mode = "combined";
      }
      return base;
    });
  };
  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setResult(null); setProgress(0); setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = await loadXlsx();
      const wb = XLSX.read(buf, { type: "array" });
      let all = [];
      if (wb.Sheets["MCQ"]) all = all.concat(parseSheet(XLSX, wb.Sheets["MCQ"], "mcq"));
      if (wb.Sheets["MEQ"]) all = all.concat(parseSheet(XLSX, wb.Sheets["MEQ"], "meq"));
      if (!all.length) notify("ไม่พบข้อมูลในชีท MCQ/MEQ (ตรวจ template)");
      setRows(all);
    } catch (err) { notify("อ่านไฟล์ไม่สำเร็จ: " + (err.message || err)); }
  };
  const commit = async () => {
    if (!rows.length) return;
    setBusy(true); setProgress(0);
    let ok = 0, fail = 0; const errs = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const meta = { type: r.type, nl_domain_code: r.nl_domain_code, nl_subitem: r.nl_subitem, physician_task: r.physician_task, specialty_id: r.specialty_id, bloom_level: r.bloom_level, difficulty_target: r.difficulty_target, status: "personal" };
        const { data: ni, error: e1 } = await sb.from("bank_items").insert(meta).select("id").single();
        if (e1) throw e1;
        const itemId = ni.id;
        const vp = { item_id: itemId, version_no: 1, stem: r.stem, rationale: r.rationale, rationale_mode: r.rationale_mode };
        if (r.type === "meq") { vp.meq_model_answer = r.meq_model_answer; vp.meq_max_score = r.meq_max_score; }
        const { data: nv, error: e2 } = await sb.from("bank_item_versions").insert(vp).select("id").single();
        if (e2) throw e2;
        await sb.from("bank_items").update({ current_version_id: nv.id }).eq("id", itemId);
        if (r.type === "mcq" && r.options?.length) {
          const orows = r.options.map((o, idx) => ({ version_id: nv.id, label: o.label, body: o.body, is_correct: !!o.is_correct, order_index: idx }));
          const { error: e3 } = await sb.from("bank_item_options").insert(orows); if (e3) throw e3;
        }
        ok++;
      } catch (err) { fail++; errs.push("แถว " + (i + 1) + " (" + r.type.toUpperCase() + "): " + (err.message || err)); }
      setProgress(i + 1);
    }
    setBusy(false); setResult({ ok, fail, errs }); setRows([]); setFileName("");
    notify("นำเข้าคลังของฉันเสร็จ: สำเร็จ " + ok + " · ล้มเหลว " + fail);
    load();
  };
  const warn = (r) => {
    const w = [];
    if (!r.nl_domain_code) w.push("หมวด?");
    if (!r.physician_task) w.push("ภารกิจ?");
    if (!r.specialty_id) w.push("สาขา?");
    if (r.type === "mcq" && !r.options?.some((o) => o.is_correct)) w.push("ไม่มีเฉลย?");
    return w;
  };

  return (
    <>
      <a className="ai-badge" href="https://examprompt.vercel.app/" target="_blank" rel="noopener noreferrer"><img className="ai-badge-logo" src="/cpird-logo.png" alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} /><span className="ai-badge-text"><b>MCQ Prompt AI Builder <span className="ai-chip">✨ AI</span></b><span>ผู้ช่วยสร้าง prompt ออกข้อสอบ MCQ ด้วย AI ตาม Blueprint ศรว.</span></span><span className="ai-badge-cta">เปิดแพลตฟอร์ม ↗</span></a>
      <div className="workspace-heading">
        <div><h2>คลังข้อสอบของฉัน</h2><p>ที่เก็บข้อสอบส่วนตัวของคุณ — ร่างไว้ก่อน ยังไม่เข้าคลังจริง แล้วค่อยกด “ส่งเข้าคลังจริง” เมื่อพร้อม</p></div>
        {canWrite && <div className="row" style={{ gap: 6 }}>
          <button className="btn" onClick={() => setEditing("new-mcq")}>+ สร้าง MCQ</button>
          <button className="btn ghost" onClick={() => setEditing("new-meq")}>+ สร้าง MEQ</button>
        </div>}
      </div>

      {canWrite && <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h3 style={{ marginBottom: 4 }}>นำเข้าจาก Excel (เข้าคลังของฉัน)</h3>
            <p className="muted" style={{ margin: 0 }}>ดาวน์โหลด template → กรอกในชีท MCQ/MEQ → อัปโหลด · ข้อที่ได้จะอยู่ในคลังของฉัน (สถานะส่วนตัว)</p>
          </div>
          <button className="btn ghost" onClick={downloadTemplate}>⬇ ดาวน์โหลด template</button>
        </div>
        <div style={{ marginTop: 10 }}><input type="file" accept=".xlsx,.xls" onChange={onFile} /></div>
        {fileName && <div className="muted" style={{ marginTop: 8 }}>ไฟล์: {fileName} · พบ {rows.length} ข้อ</div>}
        {rows.length > 0 && <>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", margin: "10px 0 8px" }}>
            <div className="muted">ตรวจสอบก่อนนำเข้า — ⚠ คือจับคู่ไม่ครบ (ยังนำเข้าได้ ค่าที่ไม่ตรงจะเว้นว่าง)</div>
            <button className="btn" onClick={commit} disabled={busy}>{busy ? "กำลังนำเข้า… " + progress + "/" + rows.length : "นำเข้าคลังของฉัน (" + rows.length + ")"}</button>
          </div>
          <div className="tablewrap" style={{ maxHeight: "40vh", overflow: "auto" }}>
            <table><thead><tr><th>#</th><th>ชนิด</th><th>โจทย์</th><th>หมวด</th><th>ภารกิจ</th><th>สาขา</th><th>เฉลย</th><th>ตรวจ</th></tr></thead>
              <tbody>{rows.map((r, i) => { const w = warn(r); const correct = r.type === "mcq" ? (r.options?.find((o) => o.is_correct)?.label || "—") : "—"; return (
                <tr key={i}><td>{i + 1}</td><td><span className={"pill " + r.type}>{r.type.toUpperCase()}</span></td>
                  <td style={{ maxWidth: 300 }}>{r.stem.slice(0, 80)}</td>
                  <td>{r.nl_domain_code || <span className="muted">{r.nl_domain_raw || "—"}</span>}</td>
                  <td>{r.physician_task || <span className="muted">{r.physician_task_raw || "—"}</span>}</td>
                  <td>{r.specialty_id ? specName(r.specialty_id) : <span className="muted">{r.specialty_raw || "—"}</span>}</td>
                  <td>{correct}</td><td>{w.length ? <span className="pill review">⚠ {w.join(" ")}</span> : <span className="pill approved">ครบ</span>}</td></tr>
              ); })}</tbody></table>
          </div>
        </>}
        {result && <div className="row" style={{ gap: 18, marginTop: 10 }}>
          <div><span className="pv-big" style={{ color: "var(--good)" }}>{result.ok}</span> <span className="muted">สำเร็จ</span></div>
          <div><span className="pv-big" style={{ color: result.fail ? "var(--stop)" : "var(--ink-faint)" }}>{result.fail}</span> <span className="muted">ล้มเหลว</span></div>
          {result.errs.length > 0 && <ul style={{ margin: 0, color: "var(--stop)", fontSize: 12.5 }}>{result.errs.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}</ul>}
        </div>}
      </div>}

      <div className="result-summary" role="status"><span>{loading ? "กำลังโหลด…" : `มีข้อสอบในคลังของฉัน ${items.length} ข้อ`}</span></div>
      <div className="tablewrap">
        <table className="bank-table">
          <thead><tr><th>#</th><th>ข้อสอบ</th><th>หมวดหลัก</th><th>หมวดย่อย</th><th>ภารกิจ</th><th>สาขา</th><th><span className="sr-only">การดำเนินการ</span></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7}><div className="empty">กำลังโหลด…</div></td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={7}><div className="empty"><h3>ยังไม่มีข้อสอบในคลังของฉัน</h3><p>{canWrite ? "เริ่มด้วยปุ่มสร้าง หรือดาวน์โหลด template แล้วอัปโหลด" : "คลังส่วนตัวสำหรับผู้ออกข้อสอบ"}</p></div></td></tr>}
            {!loading && items.map((it) => <tr key={it.id}>
              <td className="item-idcell">#{it.id}</td>
              <td><div className="item-meta"><span className={"pill " + it.type}>{it.type.toUpperCase()}</span></div>
                <button className="item-title" onClick={() => setPreviewing(it)}>{(stems[it.current_version_id] || "ยังไม่มีข้อความโจทย์").slice(0, 160)}</button></td>
              <td>{domainTitle(it.nl_domain_code)}</td>
              <td>{it.nl_subitem || "—"}</td>
              <td>{taskName(it.physician_task) || "—"}</td>
              <td>{specName(it.specialty_id) || "—"}</td>
              <td><div className="item-actions">
                <button className="btn ghost sm" onClick={() => setPreviewing(it)}>ดู</button>
                {canWrite && <button className="btn ghost sm" onClick={() => setEditing(it)}>แก้ไข</button>}
                {canWrite && <button className="btn ghost sm" style={{ color: "var(--good)" }} disabled={busy} onClick={() => submitToBank(it)}>↥ ส่งเข้าคลังจริง</button>}
                {canWrite && <button className="btn ghost sm" style={{ color: "var(--stop)" }} disabled={busy} onClick={() => del(it)}>🗑 ลบ</button>}
              </div></td>
            </tr>)}
          </tbody>
        </table>
      </div>

      {previewing && <ItemPreview sb={sb} bp={bp} item={previewing} authorName="ฉัน" canWrite={false} canApprove={false} notify={notify}
        onChanged={load} onEdit={() => { const it = previewing; setPreviewing(null); setEditing(it); }} onClose={() => setPreviewing(null)} />}
      {editing && <ItemEditor sb={sb} bp={bp} notify={notify}
        item={typeof editing === "string" ? null : editing}
        initialType={editing === "new-meq" ? "meq" : "mcq"}
        createStatus="personal" canApprove={false}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}
