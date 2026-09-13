"use client";
export default function Heat({ cols, rows, matrix, transpose }) {
const max = Math.max(1, ...matrix.flat());
const color = (v) => v === 0 ? "var(--surface-2)" : `color-mix(in srgb, var(--accent) ${Math.round((0.18 + 0.82 * (v / max)) * 100)}%, var(--surface))`;
// non-transpose: rows = domains (down), cols = tasks/specialties (across)
// transpose: rows = tasks/specialties (down, readable), cols = domains (across, compact codes)
const rMeta = transpose ? cols.items : rows;
const cMeta = transpose ? rows : cols.items;
const val = (r, c) => transpose ? matrix[c][r] : matrix[r][c];
const corner = transpose ? (cols.axis || "") + " \\ หมวด" : "หมวด \\ " + (cols.axis || "");
return (
<table className={"heat" + (transpose ? " heat-t" : "")}>
<thead>
<tr>
<th style={{ minWidth: 132 }}>{corner}</th>
{cMeta.map((c, i) => <th key={i} title={c.title || c.label}>{c.label}</th>)}
<th>รวม</th>
</tr>
</thead>
<tbody>
{rMeta.map((rw, r) => {
let rt = 0; for (let c = 0; c < cMeta.length; c++) rt += val(r, c);
return (
<tr key={r}>
<td title={rw.title}><b style={{ color: "var(--accent)" }}>{rw.label}</b>{rw.sub ? <span className="muted"> {rw.sub}</span> : null}</td>
{cMeta.map((c, ci) => { const v = val(r, ci); return <td key={ci} style={{ background: color(v), fontWeight: v ? 600 : 400 }}>{v || "–"}</td>; })}
<td style={{ fontWeight: 700 }}>{rt}</td>
</tr>
);
})}
<tr>
<td><b>รวม</b></td>
{cMeta.map((c, ci) => { let s = 0; for (let r = 0; r < rMeta.length; r++) s += val(r, ci); return <td key={ci} style={{ fontWeight: 700 }}>{s}</td>; })}
<td style={{ fontWeight: 700 }}>{matrix.flat().reduce((a, b) => a + b, 0)}</td>
</tr>
</tbody>
</table>
);
}
