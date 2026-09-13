"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
const num = (v) => (v == null || v === "" ? null : Number(v));
const pct = (v) => (v == null ? "—" : Number(v).toFixed(1) + "%");
const fdate = (iso) => (iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—");
const STATUS_TH = { in_progress: "กำลังทำ", submitted: "ส่งแล้ว", awaiting_grade: "รอตรวจ", graded: "ตรวจแล้ว" };

// aggregate helper: returns {key -> {rows:[], ...}}
function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
}
function agg(rows) {
  const withPct = rows.filter((r) => num(r.percent) != null);
  const avg = withPct.length ? withPct.reduce((s, r) => s + num(r.percent), 0) / withPct.length : null;
  const passed = rows.filter((r) => r.passed).length;
  const students = new Set(rows.map((r) => r.student_uid)).size;
  return { n: rows.length, students, avg, passed, passRate: rows.length ? (100 * passed) / rows.length : null };
}

export default function ScoreAnalytics({ sb, bp, notify, initialTab }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(initialTab || "sets"); // sets | centers | people
  const [sel, setSel] = useState({}); // {set, center, student, assignment, attempt}
  const [answers, setAnswers] = useState(null);
  const [itemAnalysis, setItemAnalysis] = useState(null);
  const [q, setQ] = useState("");
  const [ansFilter, setAnsFilter] = useState("all"); // all | correct | incorrect | bookmarked | selected
  const [selIds, setSelIds] = useState(() => new Set());
  const fmtAway = (s) => { s = Number(s) || 0; return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`; };
  const domainName = (code) => (bp?.domains || []).find((d) => d.code === code)?.title || code || "ไม่ระบุหมวด";

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.rpc("exam_attempt_rows", {});
    if (error) { setLoading(false); notify("โหลดผลสอบไม่สำเร็จ: " + error.message); return; }
    setRows(data || []); setLoading(false);
  }, [sb, notify]);
  useEffect(() => { load(); }, [load]);

  const resetDrill = () => { setSel({}); setAnswers(null); setItemAnalysis(null); };
  const switchTab = (t) => { setTab(t); resetDrill(); };

  // ------- aggregates -------
  const sets = useMemo(() => {
    const g = groupBy(rows, (r) => r.exam_set_id);
    return [...g.entries()].map(([id, rs]) => ({ id, name: rs[0].set_name || "(ไม่มีชื่อชุด)", kind: rs[0].kind, ...agg(rs) })).sort((a, b) => b.n - a.n);
  }, [rows]);
  const centers = useMemo(() => {
    const g = groupBy(rows, (r) => r.center_id);
    return [...g.entries()].map(([id, rs]) => ({ id, name: rs[0].center_name || "(ไม่ระบุศูนย์)", ...agg(rs) })).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  }, [rows]);
  const people = useMemo(() => {
    let base = rows;
    if (sel.center) base = base.filter((r) => String(r.center_id) === String(sel.center.id));
    if (sel.set) base = base.filter((r) => String(r.exam_set_id) === String(sel.set.id));
    const g = groupBy(base, (r) => r.student_uid);
    let list = [...g.entries()].map(([uid, rs]) => {
      const pcts = rs.map((r) => num(r.percent)).filter((x) => x != null);
      return { uid, name: rs[0].student_name || "(ไม่มีชื่อ)", code: rs[0].student_code || "", center: rs[0].center_name || "—",
        n: rs.length, best: pcts.length ? Math.max(...pcts) : null, avg: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
        passedAny: rs.some((r) => r.passed), rows: rs };
    });
    if (q.trim()) { const s = q.trim().toLowerCase(); list = list.filter((p) => (p.name || "").toLowerCase().includes(s) || (p.code || "").toLowerCase().includes(s)); }
    return list.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  }, [rows, sel.center, sel.set, q]);

  // assignments within a selected set
  const setAssignments = useMemo(() => {
    if (!sel.set) return [];
    const rs0 = rows.filter((r) => String(r.exam_set_id) === String(sel.set.id));
    const g = groupBy(rs0, (r) => r.assignment_id);
    return [...g.entries()].map(([id, rs]) => ({ id, title: rs[0].assignment_title || "(รอบสอบ)", open_at: rs[0].open_at, ...agg(rs) })).sort((a, b) => new Date(b.open_at || 0) - new Date(a.open_at || 0));
  }, [rows, sel.set]);

  // attempts for selected student (respecting set/center filter context)
  const studentAttempts = useMemo(() => {
    if (!sel.student) return [];
    return rows.filter((r) => r.student_uid === sel.student.uid).sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
  }, [rows, sel.student]);

  // attempts for a selected assignment
  const assignmentAttempts = useMemo(() => {
    if (!sel.assignment) return [];
    return rows.filter((r) => String(r.assignment_id) === String(sel.assignment.id)).sort((a, b) => (num(b.percent) ?? -1) - (num(a.percent) ?? -1));
  }, [rows, sel.assignment]);

  const openAttempt = async (r) => {
    setSel((s) => ({ ...s, attempt: r })); setAnswers(null);
    const { data, error } = await sb.rpc("exam_attempt_answers", { _attempt_id: r.attempt_id });
    if (error) return notify("โหลดคำตอบไม่สำเร็จ: " + error.message);
    setAnswers(data || []);
  };
  const openAssignment = async (a) => {
    setSel((s) => ({ ...s, assignment: a, attempt: null })); setItemAnalysis(null); setAnswers(null);
    const { data, error } = await sb.rpc("exam_item_analysis", { _assignment_id: a.id });
    if (error) return notify("โหลดวิเคราะห์รายข้อไม่สำเร็จ: " + error.message);
    setItemAnalysis(data || []);
  };

  const overall = useMemo(() => agg(rows), [rows]);

  // ---------- RENDER ----------
  if (loading) return <div className="section"><p role="status" className="muted">กำลังโหลดผลสอบ…</p></div>;

  // attempt answer detail (shared leaf)
  if (sel.attempt) {
    const r = sel.attempt;
    const ans = answers || [];
    const nCorrect = ans.filter((a) => a.is_correct).length;
    const nIncorrect = ans.length - nCorrect;
    const cats = {};
    ans.forEach((a) => { const k = a.domain_code || "—"; const c = cats[k] || (cats[k] = { n: 0, correct: 0 }); c.n++; if (a.is_correct) c.correct++; });
    const catRows = Object.entries(cats).map(([code, c]) => ({ code, name: code === "—" ? "ไม่ระบุหมวด" : domainName(code), ...c })).sort((x, y) => y.n - x.n);
    const nBook = ans.filter((a) => a.bookmarked).length;
    const shown = ansFilter === "all" ? ans : ansFilter === "correct" ? ans.filter((a) => a.is_correct) : ansFilter === "incorrect" ? ans.filter((a) => !a.is_correct) : ansFilter === "bookmarked" ? ans.filter((a) => a.bookmarked) : ans.filter((a) => selIds.has(a.item_id));
    const toggleSel = (id) => setSelIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const attemptAct = async (action, label) => {
      if (action === "delete_attempt" && !confirm("ลบผลสอบนี้ถาวร?")) return;
      if (action === "reopen" && !confirm("เปิดให้ผู้สอบคนนี้สอบรอบนี้ได้อีก 1 ครั้ง?")) return;
      const { error } = await sb.rpc("delivery_manage", { action, payload: { attempt_id: r.attempt_id } });
      if (error) return notify("ผิดพลาด: " + error.message);
      notify(label); if (action === "delete_attempt") { setSel((s) => ({ ...s, attempt: null })); setAnswers(null); } load();
    };
    const emailIt = () => {
      if (!r.student_email) return notify("ผู้สอบคนนี้ไม่มีอีเมลในระบบ");
      const subject = encodeURIComponent("ผลสอบ: " + r.assignment_title);
      const body = encodeURIComponent(`เรียน ${r.student_name || ""}\n\nผลสอบ "${r.assignment_title}" ครั้งที่ ${r.attempt_no}\nคะแนน: ${r.score} / ${r.max_score} (${pct(r.percent)}) · ${r.passed ? "ผ่าน" : "ไม่ผ่าน"} (เกณฑ์ ${r.pass_mark}%)\nส่งเมื่อ: ${fdate(r.submitted_at)}\n\nคลังข้อสอบ CPIRD`);
      window.location.href = `mailto:${r.student_email}?subject=${subject}&body=${body}`;
    };
    const filterLabel = { correct: " (เฉพาะถูก)", incorrect: " (เฉพาะผิด)", bookmarked: " (ปักหมุด)", selected: ` (ที่เลือก ${selIds.size})` }[ansFilter] || "";
    return (
      <div className="sa-attempt">
        <div className="row sa-noprint" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <button className="btn ghost sm" onClick={() => { setSel((s) => ({ ...s, attempt: null })); setAnswers(null); setAnsFilter("all"); setSelIds(new Set()); }}>‹ กลับ</button>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <button className="btn ghost sm" onClick={() => attemptAct("reopen", "เปิดให้สอบใหม่อีก 1 ครั้งแล้ว")}>🔁 เปิดสอบใหม่</button>
            <button className="btn ghost sm" disabled={!r.student_email} title={r.student_email || "ไม่มีอีเมล"} onClick={emailIt}>✉ อีเมลผล</button>
            <button className="btn ghost sm" style={{ color: "var(--stop)" }} onClick={() => attemptAct("delete_attempt", "ลบผลสอบแล้ว")}>🗑 ลบผล</button>
            <button className="btn ghost sm" onClick={() => window.print()}>🖨 พิมพ์{filterLabel}</button>
          </div>
        </div>
        <div className="workspace-heading"><div><h2>{r.student_name || "ผู้สอบ"} {r.student_code ? "· " + r.student_code : ""}</h2>
          <p>{r.assignment_title} · {r.set_name} · ครั้งที่ {r.attempt_no} · {fdate(r.submitted_at)}</p>
          <p className="muted">Monitor: {r.blur_count ? <span className="pill retired">ออกจากจอ {r.blur_count} ครั้ง · รวม {fmtAway(r.away_seconds)}</span> : <span className="pill approved">ไม่มีเหตุการณ์</span>}{r.student_email ? " · " + r.student_email : ""}</p></div>
          <div style={{ textAlign: "right" }}><div className="pv-big" style={{ color: r.passed ? "var(--good)" : "var(--stop)" }}>{pct(r.percent)}</div>
            <div className="muted">{r.score}/{r.max_score} · {r.passed ? "ผ่าน" : "ไม่ผ่าน"} (เกณฑ์ {r.pass_mark}%)</div></div>
        </div>
        {answers == null ? <p className="muted">กำลังโหลด…</p> : <>
          {catRows.length > 0 && <><h3 className="delivery-subheading">ถูก/ผิด ตามหมวด</h3>
            <div className="tablewrap"><table><thead><tr><th>หมวด</th><th>ถูก</th><th>ทั้งหมด</th><th>ร้อยละ</th></tr></thead>
              <tbody>{catRows.map((c) => <tr key={c.code}><td>{c.name}</td><td>{c.correct}</td><td>{c.n}</td><td><span className={"pill " + (c.correct / c.n >= 0.5 ? "approved" : "retired")}>{pct(100 * c.correct / c.n)}</span></td></tr>)}</tbody></table></div></>}
          <div className="bank-status sa-noprint" style={{ marginTop: 12 }}>
            {[["all", "ทุกข้อ " + ans.length], ["correct", "ถูก " + nCorrect], ["incorrect", "ผิด " + nIncorrect], ["bookmarked", "ปักหมุด " + nBook], ["selected", "ที่เลือก " + selIds.size]].map(([v, l]) =>
              <button key={v} className={"status-filter" + (ansFilter === v ? " selected" : "")} aria-pressed={ansFilter === v} onClick={() => setAnsFilter(v)}>{l}</button>)}
            {selIds.size > 0 && <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => { setAnsFilter("selected"); setTimeout(() => window.print(), 150); }}>🖨 พิมพ์ที่เลือก ({selIds.size})</button>}
          </div>
          <div className="tablewrap"><table><thead><tr><th className="sa-noprint"><input type="checkbox" aria-label="เลือกทั้งหมดที่แสดง" checked={shown.length > 0 && shown.every((a) => selIds.has(a.item_id))} onChange={(e) => setSelIds((s) => { const n = new Set(s); shown.forEach((a) => e.target.checked ? n.add(a.item_id) : n.delete(a.item_id)); return n; })} /></th><th>#</th><th>หมวด</th><th>โจทย์</th><th>ตอบ</th><th>เฉลย</th><th>ผล</th><th>คะแนน</th></tr></thead>
            <tbody>{shown.length === 0 ? <tr><td colSpan={8}><div className="empty">ไม่มีข้อในเงื่อนไขนี้</div></td></tr> :
              shown.map((a, i) => <tr key={a.item_id + "_" + i}><td className="sa-noprint"><input type="checkbox" checked={selIds.has(a.item_id)} onChange={() => toggleSel(a.item_id)} /></td><td>{i + 1}{a.bookmarked ? " 📌" : ""}</td>
                <td>{a.domain_code || "—"}</td>
                <td style={{ maxWidth: 420 }}>{(a.stem || "").slice(0, 200)}</td>
                <td>{a.selected_label || (a.essay_text ? "(อัตนัย)" : "—")}</td>
                <td>{a.correct_label || "—"}</td>
                <td>{a.is_correct ? <span className="pill approved">ถูก</span> : <span className="pill retired">ผิด</span>}</td>
                <td>{a.points_awarded ?? "—"}</td></tr>)}
            </tbody></table></div>
        </>}
      </div>
    );
  }

  // assignment detail: item analysis + attempts
  if (sel.assignment) {
    return (
      <div>
        <button className="btn ghost sm" onClick={() => { setSel((s) => ({ ...s, assignment: null })); setItemAnalysis(null); }}>‹ กลับ {sel.set ? "ชุด " + sel.set.name : ""}</button>
        <div className="workspace-heading"><div><h2>{sel.assignment.title}</h2><p>{sel.set?.name} · เปิดสอบ {fdate(sel.assignment.open_at)} · ผู้เข้าสอบ {sel.assignment.n} ครั้ง · เฉลี่ย {pct(sel.assignment.avg)} · ผ่าน {pct(sel.assignment.passRate)}</p></div></div>
        <h3 className="delivery-subheading">วิเคราะห์รายข้อ (ค่าความยาก/สัดส่วนตอบถูก)</h3>
        {itemAnalysis == null ? <p className="muted">กำลังโหลด…</p> : (
          <div className="tablewrap"><table><thead><tr><th>#ข้อ</th><th>โจทย์</th><th>ตอบ</th><th>ถูก</th><th>ตอบถูก %</th></tr></thead>
            <tbody>{itemAnalysis.length === 0 ? <tr><td colSpan={5}><div className="empty">ไม่มีข้อมูล</div></td></tr> :
              itemAnalysis.map((it) => { const f = num(it.facility); const cls = f == null ? "" : f < 30 ? "retired" : f > 85 ? "review" : "approved";
                return <tr key={it.item_id}><td>#{it.item_id}</td><td style={{ maxWidth: 420 }}>{(it.stem || "").slice(0, 140)}</td><td>{it.n_answered}</td><td>{it.n_correct}</td>
                  <td><span className={"pill " + cls}>{f == null ? "—" : f + "%"}</span></td></tr>; })}
            </tbody></table></div>
        )}
        <p className="muted" style={{ marginTop: 6 }}>สีแดง = ยากมาก (&lt;30%) · เหลือง = ง่ายมาก (&gt;85%) · เขียว = พอเหมาะ</p>
        <h3 className="delivery-subheading" style={{ marginTop: 16 }}>ผู้เข้าสอบในรอบนี้ ({assignmentAttempts.length})</h3>
        <div className="tablewrap"><table><thead><tr><th>ผู้สอบ</th><th>รหัส</th><th>ศูนย์</th><th>คะแนน</th><th>%</th><th>ผล</th><th></th></tr></thead>
          <tbody>{assignmentAttempts.map((r) => <tr key={r.attempt_id}><td>{r.student_name || "—"}</td><td>{r.student_code || "—"}</td><td>{r.center_name || "—"}</td>
            <td>{r.score}/{r.max_score}</td><td>{pct(r.percent)}</td><td>{r.passed ? <span className="pill approved">ผ่าน</span> : <span className="pill retired">ไม่ผ่าน</span>}</td>
            <td><button className="btn ghost sm" onClick={() => openAttempt(r)}>ดูคำตอบ</button></td></tr>)}
          </tbody></table></div>
      </div>
    );
  }

  // student detail: their attempts
  if (sel.student) {
    return (
      <div>
        <button className="btn ghost sm" onClick={() => setSel((s) => ({ ...s, student: null }))}>‹ กลับ</button>
        <div className="workspace-heading"><div><h2>{sel.student.name} {sel.student.code ? "· " + sel.student.code : ""}</h2><p>{sel.student.center} · เข้าสอบ {studentAttempts.length} ครั้ง · เฉลี่ย {pct(sel.student.avg)} · สูงสุด {pct(sel.student.best)}</p></div></div>
        <div className="tablewrap"><table><thead><tr><th>รอบสอบ</th><th>ชุด</th><th>ครั้งที่</th><th>วันที่</th><th>คะแนน</th><th>%</th><th>ผล</th><th></th></tr></thead>
          <tbody>{studentAttempts.map((r) => <tr key={r.attempt_id}><td>{r.assignment_title}</td><td>{r.set_name}</td><td>{r.attempt_no}</td><td>{fdate(r.submitted_at)}</td>
            <td>{r.score}/{r.max_score}</td><td>{pct(r.percent)}</td><td>{r.passed ? <span className="pill approved">ผ่าน</span> : <span className="pill retired">ไม่ผ่าน</span>}</td>
            <td><button className="btn ghost sm" onClick={() => openAttempt(r)}>ดูคำตอบ</button></td></tr>)}
          </tbody></table></div>
      </div>
    );
  }

  // set detail: assignments
  if (sel.set) {
    return (
      <div>
        <button className="btn ghost sm" onClick={() => setSel({})}>‹ กลับรายชุด</button>
        <div className="workspace-heading"><div><h2>{sel.set.name}</h2><p>{(sel.set.kind || "").toUpperCase()} · เข้าสอบ {sel.set.n} ครั้ง · {sel.set.students} คน · เฉลี่ย {pct(sel.set.avg)} · ผ่าน {pct(sel.set.passRate)}</p></div></div>
        <h3 className="delivery-subheading">รอบสอบที่ใช้ชุดนี้</h3>
        <div className="tablewrap"><table><thead><tr><th>รอบสอบ</th><th>เปิดสอบ</th><th>เข้าสอบ</th><th>เฉลี่ย</th><th>ผ่าน</th><th></th></tr></thead>
          <tbody>{setAssignments.map((a) => <tr key={a.id}><td>{a.title}</td><td>{fdate(a.open_at)}</td><td>{a.n} ({a.students} คน)</td><td>{pct(a.avg)}</td><td>{pct(a.passRate)}</td>
            <td><button className="btn ghost sm" onClick={() => openAssignment(a)}>วิเคราะห์รายข้อ</button></td></tr>)}
          </tbody></table></div>
        <h3 className="delivery-subheading" style={{ marginTop: 16 }}>รายคน (ในชุดนี้)</h3>
        <div className="tablewrap"><table><thead><tr><th>ผู้สอบ</th><th>รหัส</th><th>ศูนย์</th><th>ครั้ง</th><th>เฉลี่ย</th><th>สูงสุด</th><th></th></tr></thead>
          <tbody>{people.map((p) => <tr key={p.uid}><td>{p.name}</td><td>{p.code || "—"}</td><td>{p.center}</td><td>{p.n}</td><td>{pct(p.avg)}</td><td>{pct(p.best)}</td>
            <td><button className="btn ghost sm" onClick={() => setSel((s) => ({ ...s, student: p }))}>ดูรายคน</button></td></tr>)}
          </tbody></table></div>
      </div>
    );
  }

  // center detail: students
  if (sel.center) {
    return (
      <div>
        <button className="btn ghost sm" onClick={() => setSel({})}>‹ กลับรายศูนย์</button>
        <div className="workspace-heading"><div><h2>{sel.center.name}</h2><p>เข้าสอบ {sel.center.n} ครั้ง · {sel.center.students} คน · เฉลี่ย {pct(sel.center.avg)} · ผ่าน {pct(sel.center.passRate)}</p></div></div>
        <div className="bank-search"><div className="search-field"><label htmlFor="sa-q">ค้นหาผู้สอบ</label><input id="sa-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อ หรือรหัส" /></div></div>
        <div className="tablewrap"><table><thead><tr><th>ผู้สอบ</th><th>รหัส</th><th>ครั้ง</th><th>เฉลี่ย</th><th>สูงสุด</th><th>ผ่านอย่างน้อย 1</th><th></th></tr></thead>
          <tbody>{people.map((p) => <tr key={p.uid}><td>{p.name}</td><td>{p.code || "—"}</td><td>{p.n}</td><td>{pct(p.avg)}</td><td>{pct(p.best)}</td>
            <td>{p.passedAny ? <span className="pill approved">ผ่าน</span> : <span className="pill retired">ยังไม่ผ่าน</span>}</td>
            <td><button className="btn ghost sm" onClick={() => setSel((s) => ({ ...s, student: p }))}>ดูรายคน</button></td></tr>)}
          </tbody></table></div>
      </div>
    );
  }

  // top-level: tabs + summary
  return (
    <div>
      <div className="workspace-heading"><div><h2>ดูคะแนนสอบ</h2><p>วิเคราะห์ผลรายชุดข้อสอบ รายศูนย์แพทย์ และรายคน — คลิกเพื่อเจาะลึกถึงคำตอบรายข้อ</p></div></div>
      <div className="row" style={{ gap: 18, marginBottom: 4 }}>
        <div><span className="pv-big">{overall.n}</span> <span className="muted">ครั้งที่เข้าสอบ</span></div>
        <div><span className="pv-big">{overall.students}</span> <span className="muted">ผู้สอบ</span></div>
        <div><span className="pv-big">{pct(overall.avg)}</span> <span className="muted">คะแนนเฉลี่ย</span></div>
        <div><span className="pv-big">{pct(overall.passRate)}</span> <span className="muted">อัตราผ่าน</span></div>
      </div>
      <div className="bank-status" role="tablist" style={{ marginTop: 10 }}>
        {[["sets", "รายชุดข้อสอบ"], ["centers", "รายศูนย์แพทย์"], ["people", "รายคน"]].map(([v, l]) =>
          <button key={v} className={"status-filter" + (tab === v ? " selected" : "")} aria-pressed={tab === v} onClick={() => switchTab(v)}>{l}</button>)}
      </div>

      {rows.length === 0 ? <div className="empty card"><h3>ยังไม่มีผลสอบ</h3><p>เมื่อมีผู้เข้าสอบและส่งคำตอบแล้ว ผลจะแสดงที่นี่</p></div> : <>
        {tab === "sets" && <div className="tablewrap"><table><thead><tr><th>ชุดข้อสอบ</th><th>ชนิด</th><th>เข้าสอบ</th><th>ผู้สอบ</th><th>เฉลี่ย</th><th>อัตราผ่าน</th><th></th></tr></thead>
          <tbody>{sets.map((s) => <tr key={s.id}><td>{s.name}</td><td><span className={"pill " + (s.kind || "")}>{(s.kind || "").toUpperCase()}</span></td><td>{s.n}</td><td>{s.students}</td><td>{pct(s.avg)}</td><td>{pct(s.passRate)}</td>
            <td><button className="btn ghost sm" onClick={() => setSel({ set: s })}>เจาะลึก</button></td></tr>)}
          </tbody></table></div>}

        {tab === "centers" && <div className="tablewrap"><table><thead><tr><th>ศูนย์แพทย์</th><th>เข้าสอบ</th><th>ผู้สอบ</th><th>เฉลี่ย</th><th>อัตราผ่าน</th><th></th></tr></thead>
          <tbody>{centers.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.n}</td><td>{c.students}</td><td>{pct(c.avg)}</td><td>{pct(c.passRate)}</td>
            <td><button className="btn ghost sm" onClick={() => { setQ(""); setSel({ center: c }); }}>เจาะลึก</button></td></tr>)}
          </tbody></table></div>}

        {tab === "people" && <>
          <div className="bank-search"><div className="search-field"><label htmlFor="sa-q2">ค้นหาผู้สอบ</label><input id="sa-q2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อ หรือรหัส" /></div></div>
          <div className="tablewrap"><table><thead><tr><th>ผู้สอบ</th><th>รหัส</th><th>ศูนย์</th><th>ครั้ง</th><th>เฉลี่ย</th><th>สูงสุด</th><th></th></tr></thead>
            <tbody>{people.map((p) => <tr key={p.uid}><td>{p.name}</td><td>{p.code || "—"}</td><td>{p.center}</td><td>{p.n}</td><td>{pct(p.avg)}</td><td>{pct(p.best)}</td>
              <td><button className="btn ghost sm" onClick={() => setSel({ student: p })}>ดูรายคน</button></td></tr>)}
            </tbody></table></div>
        </>}
      </>}
    </div>
  );
}
