"use client";
export default function Heat({ cols, rows, matrix }) {
const max = Math.max(1, ...matrix.flat());
const color = (v) => v === 0 ? "var(--surface-2)" : `color-mix(in srgb, var(--accent) ${Math.round((0.18 + 0.82 * (v / max)) * 100)}%, var(--surface))`;
return (
<table className="heat">
<thead>
<tr>
<th style={{ minWidth: 132 }}>{"หมวด \\ " + (cols.axis || "")}</th>
{cols.items.map((c, i) => <th key={i} title={c.title || c.label}>{c.label}</th>)}
<th>รวม</th>
</tr>
</thead>
<tbody>
{rows.map((rw, r) => {
const rt = matrix[r].reduce((a, b) => a + b, 0);
return (
<tr key={r}>
<td title={rw.title}><b style={{ color: "var(--accent)" }}>{rw.label}</b>{rw.sub ? <span className="muted"> {rw.sub}</span> : null}</td>
{matrix[r].map((v, c) => <td key={c} style={{ background: color(v), fontWeight: v ? 600 : 400 }}>{v || "–"}</td>)}
<td style={{ fontWeight: 700 }}>{rt}</td>
</tr>
);
})}
<tr>
<td><b>รวม</b></td>
{cols.items.map((c, i) => <td key={i} style={{ fontWeight: 700 }}>{matrix.reduce((a, row) => a + row[i], 0)}</td>)}
<td style={{ fontWeight: 700 }}>{matrix.flat().reduce((a, b) => a + b, 0)}</td>
</tr>
</tbody>
</table>
);
}
