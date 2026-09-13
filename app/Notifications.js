"use client";
import { useCallback, useEffect, useRef, useState } from "react";
const KIND = { revise: "↩ ข้อสอบถูกส่งกลับให้แก้ไข", sent_back: "↩ ข้อสอบถูกส่งกลับให้แก้ไข", return: "↩ ข้อสอบถูกส่งกลับให้แก้ไข", approved: "✓ ข้อสอบได้รับการอนุมัติ" };
const rel = (s) => { if (!s) return ""; const d = new Date(s), diff = (Date.now() - d.getTime()) / 1000; if (diff < 60) return "เมื่อสักครู่"; if (diff < 3600) return Math.floor(diff / 60) + " นาทีที่แล้ว"; if (diff < 86400) return Math.floor(diff / 3600) + " ชม.ที่แล้ว"; return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" }); };

export default function Notifications({ sb, onOpen }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const load = useCallback(async () => {
    const { data } = await sb.from("item_notifications").select("id,item_id,kind,message,created_at,read_at").order("created_at", { ascending: false }).limit(30);
    setRows(data || []);
  }, [sb]);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (!open) return; const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; window.addEventListener("mousedown", h); return () => window.removeEventListener("mousedown", h); }, [open]);
  const unread = rows.filter((r) => !r.read_at).length;
  const now = () => new Date().toISOString();
  const markRead = async (id) => { await sb.from("item_notifications").update({ read_at: now() }).eq("id", id); setRows((rs) => rs.map((r) => r.id === id ? { ...r, read_at: r.read_at || now() } : r)); };
  const markAll = async () => { const ids = rows.filter((r) => !r.read_at).map((r) => r.id); if (!ids.length) return; await sb.from("item_notifications").update({ read_at: now() }).in("id", ids); setRows((rs) => rs.map((r) => ({ ...r, read_at: r.read_at || now() }))); };
  const click = (r) => { if (!r.read_at) markRead(r.id); setOpen(false); onOpen && onOpen(r.item_id); };
  return (
    <div className="notif" ref={ref}>
      <button type="button" className="notif-bell" aria-label={"การแจ้งเตือน" + (unread ? " (" + unread + " ใหม่)" : "")} onClick={() => { const n = !open; setOpen(n); if (n) load(); }}>🔔{unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}</button>
      {open && <div className="notif-pop">
        <div className="notif-head"><b>การแจ้งเตือน</b>{unread > 0 && <button className="btn ghost sm" onClick={markAll}>ทำเป็นอ่านทั้งหมด</button>}</div>
        {rows.length === 0 ? <p className="muted" style={{ padding: "14px" }}>ยังไม่มีการแจ้งเตือน</p> :
          <div className="notif-list">{rows.map((r) => <button key={r.id} type="button" className={"notif-item" + (r.read_at ? "" : " unread")} onClick={() => click(r)}>
            <div className="notif-title">{KIND[r.kind] || "🔔 แจ้งเตือน"}</div>
            {r.message && <div className="notif-msg">{r.message}</div>}
            <div className="notif-time">{rel(r.created_at)}</div>
          </button>)}</div>}
      </div>}
    </div>
  );
}
