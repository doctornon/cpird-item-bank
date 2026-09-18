"use client";
// ตัวแก้ไขรายการรูปประกอบ ใช้ร่วมกันระหว่างตอนของเคส MEQ และคำถามรายข้อ
// รูปเก็บเป็นข้อมูลมีโครงสร้าง {url, width, align} ไม่ใช่ HTML จึงไม่เปิดช่องฝัง markup
import { useState } from "react";
import { uploadQuestionImage } from "../lib/imageUpload.mjs";

const ALIGNS = [["left", "ชิดซ้าย"], ["center", "กึ่งกลาง"], ["right", "ชิดขวา"]];

export default function ImageField({ sb, label, images = [], onChange, disabled }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = Array.isArray(images) ? images : [];

  const add = async (file) => {
    setError(""); setBusy(true);
    try {
      const url = await uploadQuestionImage(sb, file, "meq");
      onChange([...list, { url, width: 60, align: "center" }]);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };
  const patch = (i, p) => onChange(list.map((im, j) => (j === i ? { ...im, ...p } : im)));
  const remove = (i) => onChange(list.filter((_, j) => j !== i));

  return (
    <div className="image-field">
      <div className="row" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <label style={{ margin: 0 }}>{label}</label>
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) add(f); e.target.value = ""; }} />
        {busy && <span className="muted">กำลังอัปโหลด…</span>}
      </div>
      {error && <p className="gap-short" role="alert" style={{ margin: "4px 0" }}>{error}</p>}
      {list.length > 0 && (
        <ul className="image-list">
          {list.map((im, i) => (
            <li key={im.url + i} className="image-row">
              <img src={im.url} alt="" loading="lazy" />
              <div className="image-controls">
                <label>ความกว้าง {im.width || 60}%
                  <input type="range" min="10" max="100" step="5" value={im.width || 60} disabled={disabled}
                    onChange={(e) => patch(i, { width: Number(e.target.value) })} />
                </label>
                <label>ตำแหน่ง
                  <select value={im.align || "center"} disabled={disabled} onChange={(e) => patch(i, { align: e.target.value })}>
                    {ALIGNS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <button type="button" className="btn ghost sm" disabled={disabled} onClick={() => remove(i)}>ลบรูป</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
