'use client';
import { useState, useEffect, useRef } from "react";

// ── Constants ───────────────────────────────────────────
const SIZES = [
  { key: "large",  label: "大顆", color: "#C8820A" },
  { key: "medium", label: "普通", color: "#D4680A" },
  { key: "small",  label: "小顆", color: "#B83A20" },
];
const KERRY_URL = "https://www.kerrytj.com/zh/checkin";
const ORDERS_KEY    = "pomelo-orders-v2";
const CUSTOMERS_KEY = "pomelo-customers-v1";

// ── Storage ─────────────────────────────────────────────
async function storageGet(key: string) {
  try { 
    const r = localStorage.getItem(key); 
    return r ? JSON.parse(r) : null; 
  } catch { return null; }
}

async function storageSet(key: string, val: any) {
  try { 
    localStorage.setItem(key, JSON.stringify(val)); 
  } catch {}
}


function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

// ── Claude OCR ──────────────────────────────────────────
async function ocr(base64) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 200,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: "這是嘉里大榮貨運單。找出托運編號（條碼下方，如 a1320-351-480-5 或 40371303609）。只回傳編號本身，找不到就回傳「找不到」。" }
        ]}]
      })
    });
    const d = await r.json();
    return d.content?.[0]?.text?.trim() || "找不到";
  } catch { return "找不到"; }
}

// ── Shared Styles ────────────────────────────────────────
const S = {
  input: {
    width: "100%", padding: "0.6rem 0.75rem", borderRadius: "0.6rem",
    border: "1.5px solid #D9C9A3", background: "#FFFDF7",
    fontFamily: "'Noto Sans TC', sans-serif", fontSize: "0.92rem",
    color: "#3A2205", outline: "none", boxSizing: "border-box",
  },
  label: {
    display: "block", marginBottom: "0.3rem", fontFamily: "'Noto Sans TC'",
    fontSize: "0.78rem", color: "#8A6530", fontWeight: 600, letterSpacing: "0.04em",
  },
  btnPrimary: {
    width: "100%", background: "linear-gradient(135deg,#D4850A,#B8600A)",
    color: "white", border: "none", borderRadius: "0.75rem", padding: "0.82rem",
    fontFamily: "'Noto Sans TC'", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer",
  },
};

// ── Modal ────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,10,5,0.72)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:"1rem" }}>
      <div style={{ background:"#FEFAF3", borderRadius:"1.25rem", width:"100%",
        maxWidth:480, maxHeight:"90vh", overflowY:"auto",
        boxShadow:"0 24px 64px rgba(0,0,0,0.3)", border:"1.5px solid #E8D9B8" }}>
        <div style={{ padding:"1.1rem 1.4rem 0.7rem", display:"flex",
          justifyContent:"space-between", alignItems:"center", borderBottom:"1px solid #EDE3CC" }}>
          <span style={{ fontFamily:"'Noto Serif TC',serif", fontSize:"1rem", color:"#4A2F0A", fontWeight:700 }}>{title}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:"1.4rem",
            cursor:"pointer", color:"#A0865A", lineHeight:1, padding:"0 0.2rem" }}>×</button>
        </div>
        <div style={{ padding:"1.1rem 1.4rem 1.4rem" }}>{children}</div>
      </div>
    </div>
  );
}

// ── Confirm Dialog — replaces blocked confirm() ──────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,10,5,0.72)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:1200, padding:"1.5rem" }}>
      <div style={{ background:"#FEFAF3", borderRadius:"1.1rem", padding:"1.5rem 1.75rem",
        maxWidth:320, width:"100%", boxShadow:"0 16px 48px rgba(0,0,0,0.28)", border:"1.5px solid #E8D9B8" }}>
        <div style={{ fontFamily:"'Noto Sans TC'", fontSize:"0.95rem", color:"#3A2205",
          marginBottom:"1.25rem", lineHeight:1.6 }}>{message}</div>
        <div style={{ display:"flex", gap:"0.75rem" }}>
          <button onClick={onCancel} style={{ flex:1, padding:"0.65rem", borderRadius:"0.65rem",
            border:"1.5px solid #D9C9A3", background:"white", fontFamily:"'Noto Sans TC'",
            fontWeight:600, fontSize:"0.9rem", cursor:"pointer", color:"#8A6530" }}>取消</button>
          <button onClick={onConfirm} style={{ flex:1, padding:"0.65rem", borderRadius:"0.65rem",
            border:"none", background:"linear-gradient(135deg,#C0402A,#A03020)",
            fontFamily:"'Noto Sans TC'", fontWeight:700, fontSize:"0.9rem",
            cursor:"pointer", color:"white" }}>確定刪除</button>
        </div>
      </div>
    </div>
  );
}

// ── Customer Manager ─────────────────────────────────────
function CustomerManager({ customers, onSave, onClose }) {
  const [list, setList] = useState(customers);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name:"", phone:"", address:"" });
  const [deleteTarget, setDeleteTarget] = useState(null);

  function startNew() { setEditing("new"); setForm({ name:"", phone:"", address:"" }); }
  function startEdit(c) { setEditing(c.id); setForm({ name:c.name, phone:c.phone||"", address:c.address||"" }); }

  function saveForm() {
    if (!form.name.trim()) return;
    const clean = { name:form.name.trim(), phone:form.phone.trim(), address:form.address.trim() };
    const updated = editing === "new"
      ? [...list, { id:uid(), ...clean }]
      : list.map(c => c.id === editing ? { ...c, ...clean } : c);
    setList(updated);
    setEditing(null);
  }

  function doDelete() {
    setList(l => l.filter(c => c.id !== deleteTarget));
    setDeleteTarget(null);
  }

  async function handleDone() {
    await storageSet(CUSTOMERS_KEY, list);
    onSave(list);
    onClose();
  }

  return (
    <>
      {deleteTarget && <ConfirmDialog message="確定刪除這位客戶？" onConfirm={doDelete} onCancel={() => setDeleteTarget(null)} />}
      <div style={{ display:"flex", flexDirection:"column", gap:"0.7rem" }}>
        {list.length === 0 && !editing && (
          <div style={{ textAlign:"center", padding:"1.5rem 0", color:"#B0905A",
            fontFamily:"'Noto Sans TC'", fontSize:"0.9rem" }}>還沒有客戶資料</div>
        )}

        {list.map(c => (
          <div key={c.id} style={{ background:"#FFF8EC", border:"1.5px solid #E8D4A0",
            borderRadius:"0.85rem", padding:"0.7rem 0.9rem",
            display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ fontFamily:"'Noto Serif TC'", fontWeight:700, color:"#3A2205" }}>{c.name}</div>
              {c.phone && <div style={{ fontSize:"0.78rem", color:"#8A6530", fontFamily:"'Noto Sans TC'" }}>📞 {c.phone}</div>}
              {c.address && <div style={{ fontSize:"0.78rem", color:"#8A6530", fontFamily:"'Noto Sans TC'" }}>📍 {c.address}</div>}
            </div>
            <div style={{ display:"flex", gap:"0.4rem", flexShrink:0 }}>
              <button onClick={() => startEdit(c)}
                style={{ padding:"0.25rem 0.55rem", borderRadius:"0.4rem", border:"1.5px solid #D4A050",
                  background:"white", color:"#A07020", fontFamily:"'Noto Sans TC'",
                  fontWeight:600, fontSize:"0.73rem", cursor:"pointer" }}>編輯</button>
              <button onClick={() => setDeleteTarget(c.id)}
                style={{ padding:"0.25rem 0.55rem", borderRadius:"0.4rem", border:"1.5px solid #E8B0A0",
                  background:"white", color:"#C0402A", fontFamily:"'Noto Sans TC'",
                  fontWeight:600, fontSize:"0.73rem", cursor:"pointer" }}>刪除</button>
            </div>
          </div>
        ))}

        {editing !== null && (
          <div style={{ background:"#F0EAD8", border:"1.5px solid #D4A050",
            borderRadius:"0.85rem", padding:"0.85rem", display:"flex", flexDirection:"column", gap:"0.6rem" }}>
            <div style={{ fontFamily:"'Noto Sans TC'", fontSize:"0.8rem", color:"#8A6530", fontWeight:700 }}>
              {editing === "new" ? "新增客戶" : "編輯客戶"}
            </div>
            {[["name","姓名 *","王小明"],["phone","電話","0912-345-678"],["address","地址","台北市..."]].map(([k,l,ph]) => (
              <div key={k}>
                <label style={S.label}>{l}</label>
                <input style={S.input} value={form[k]}
                  onChange={e => setForm(f => ({...f,[k]:e.target.value}))} placeholder={ph} />
              </div>
            ))}
            <div style={{ display:"flex", gap:"0.5rem" }}>
              <button onClick={() => setEditing(null)}
                style={{ flex:1, padding:"0.55rem", borderRadius:"0.6rem",
                  border:"1.5px solid #D9C9A3", background:"white",
                  fontFamily:"'Noto Sans TC'", fontWeight:600, fontSize:"0.85rem",
                  cursor:"pointer", color:"#8A6530" }}>取消</button>
              <button onClick={saveForm} disabled={!form.name.trim()}
                style={{ flex:2, padding:"0.55rem", borderRadius:"0.6rem", border:"none",
                  background: form.name.trim() ? "linear-gradient(135deg,#D4850A,#B8600A)" : "#CCC",
                  fontFamily:"'Noto Sans TC'", fontWeight:700, fontSize:"0.85rem",
                  cursor: form.name.trim() ? "pointer" : "not-allowed", color:"white" }}>儲存</button>
            </div>
          </div>
        )}

        <button onClick={startNew}
          style={{ padding:"0.6rem", borderRadius:"0.65rem", border:"2px dashed #D4A050",
            background:"transparent", color:"#A07020", fontFamily:"'Noto Sans TC'",
            fontWeight:600, fontSize:"0.85rem", cursor:"pointer" }}>
          ＋ 新增客戶
        </button>
        <button onClick={handleDone} style={S.btnPrimary}>完成並儲存</button>
      </div>
    </>
  );
}
// ── Add Order Form ───────────────────────────────────────
function AddOrderForm({ customers, onSave }) {
  const [name, setName]       = useState("");
  const [phone, setPhone]     = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote]       = useState("");
  const [qty, setQty]         = useState({ large:0, medium:0, small:0 });
  const [showDrop, setShowDrop] = useState(false);
  const wrapRef = useRef();

  const suggestions = name.trim()
    ? customers.filter(c => c.name.includes(name.trim()))
    : customers;
  const total = qty.large + qty.medium + qty.small;

  function pick(c) {
    setName(c.name); setPhone(c.phone||""); setAddress(c.address||"");
    setShowDrop(false);
  }

  function handleSave() {
    if (!name.trim() || total === 0) return;
    onSave({ id:uid(), name:name.trim(), phone:phone.trim(), address:address.trim(),
      note:note.trim(), qty, trackingNumber:"", shipped:false,
      shippedAt:null, createdAt:new Date().toISOString() });
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"0.85rem" }}>

      {/* Name + dropdown */}
      <div style={{ position:"relative" }} ref={wrapRef}>
        <label style={S.label}>買家姓名 *</label>
        <input style={S.input} value={name} autoComplete="off"
          onChange={e => { setName(e.target.value); setShowDrop(true); }}
          onFocus={() => setShowDrop(true)}
          placeholder="輸入或選擇客戶" />
        {showDrop && suggestions.length > 0 && (
          <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:200,
            background:"white", border:"1.5px solid #D4A050", borderRadius:"0.7rem",
            boxShadow:"0 8px 24px rgba(0,0,0,0.14)", overflow:"hidden" }}>
            {suggestions.map(c => (
              <div key={c.id} onMouseDown={e => { e.preventDefault(); pick(c); }}
                style={{ padding:"0.6rem 0.85rem", cursor:"pointer",
                  borderBottom:"1px solid #F0E8D0", fontFamily:"'Noto Sans TC'" }}
                onMouseEnter={e => e.currentTarget.style.background="#FFF8EC"}
                onMouseLeave={e => e.currentTarget.style.background="white"}>
                <div style={{ fontWeight:700, color:"#3A2205", fontSize:"0.9rem" }}>{c.name}</div>
                {c.phone && <div style={{ fontSize:"0.74rem", color:"#9A7040" }}>📞 {c.phone}</div>}
                {c.address && <div style={{ fontSize:"0.74rem", color:"#9A7040" }}>📍 {c.address}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      {/* invisible overlay to close dropdown on outside click */}
      {showDrop && suggestions.length > 0 && (
        <div style={{ position:"fixed", inset:0, zIndex:199 }} onClick={() => setShowDrop(false)} />
      )}

      <div>
        <label style={S.label}>聯絡電話</label>
        <input style={S.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="0912-345-678" />
      </div>
      <div>
        <label style={S.label}>收件地址</label>
        <input style={S.input} value={address} onChange={e => setAddress(e.target.value)} placeholder="台北市..." />
      </div>

      <div>
        <label style={S.label}>箱數（依柚子大小）</label>
        <div style={{ display:"flex", gap:"0.6rem" }}>
          {SIZES.map(s => (
            <div key={s.key} style={{ flex:1, background:"#FFF8EC",
              border:`1.5px solid ${s.color}33`, borderRadius:"0.75rem",
              padding:"0.7rem 0.4rem", textAlign:"center" }}>
              <div style={{ fontSize:"1.3rem", lineHeight:1 }}>🍊</div>
              <div style={{ fontFamily:"'Noto Sans TC'", fontSize:"0.7rem", color:s.color,
                fontWeight:700, margin:"0.2rem 0 0.35rem" }}>{s.label}</div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"0.2rem" }}>
                <button onClick={() => setQty(q => ({...q,[s.key]:Math.max(0,q[s.key]-1)}))}
                  style={{ width:22, height:22, borderRadius:"50%", border:`1.5px solid ${s.color}`,
                    background:"white", cursor:"pointer", color:s.color, fontWeight:700,
                    fontSize:"0.9rem", lineHeight:1, padding:0 }}>−</button>
                <span style={{ fontFamily:"monospace", fontSize:"1rem", minWidth:18,
                  textAlign:"center", color:"#3A2205", fontWeight:700 }}>{qty[s.key]}</span>
                <button onClick={() => setQty(q => ({...q,[s.key]:q[s.key]+1}))}
                  style={{ width:22, height:22, borderRadius:"50%", border:`1.5px solid ${s.color}`,
                    background:"white", cursor:"pointer", color:s.color, fontWeight:700,
                    fontSize:"0.9rem", lineHeight:1, padding:0 }}>＋</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label style={S.label}>備註</label>
        <input style={S.input} value={note} onChange={e => setNote(e.target.value)} placeholder="付款備註、特殊需求..." />
      </div>

      <button onClick={handleSave} disabled={total === 0 || !name.trim()} style={{
        ...S.btnPrimary,
        background: total > 0 && name.trim() ? "linear-gradient(135deg,#D4850A,#B8600A)" : "#CCC",
        cursor: total > 0 && name.trim() ? "pointer" : "not-allowed",
      }}>新增訂單</button>
    </div>
  );
}

// ── Scan Modal ───────────────────────────────────────────
function ScanModal({ order, onSaved, onClose }) {
  const [step, setStep]       = useState("upload");
  const [tracking, setTracking] = useState(order.trackingNumber || "");
  const [preview, setPreview] = useState(null);
  const fileRef = useRef();

  async function handleFile(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const url = ev.target.result;
      setPreview(url); setStep("scanning");
      const result = await ocr(url.split(",")[1]);
      setTracking(result === "找不到" ? "" : result);
      setStep("confirm");
    };
    reader.readAsDataURL(file);
  }

  function confirm() {
    if (!tracking.trim()) return;
    onSaved({ ...order, trackingNumber:tracking.trim(), shipped:true, shippedAt:new Date().toISOString() });
    setStep("done");
  }

  const trackInput = { ...S.input, fontFamily:"monospace", border:"2px solid #D4850A" };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"0.9rem", alignItems:"center" }}>
      {step === "upload" && (<>
        <div onClick={() => fileRef.current.click()} style={{ width:"100%",
          border:"2px dashed #D4A050", borderRadius:"1rem", padding:"1.75rem",
          textAlign:"center", background:"#FFF8EC", cursor:"pointer" }}>
          <div style={{ fontSize:"2.2rem" }}>📷</div>
          <div style={{ fontFamily:"'Noto Sans TC'", color:"#8A6530", fontSize:"0.88rem", marginTop:"0.4rem" }}>
            點此上傳貨運單照片<br/>
            <span style={{ fontSize:"0.76rem", color:"#B0905A" }}>AI 自動辨識托運編號</span>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleFile} />
        <div style={{ color:"#A0865A", fontSize:"0.8rem" }}>── 或手動輸入 ──</div>
        <input style={trackInput} value={tracking} onChange={e => setTracking(e.target.value)} placeholder="托運編號" />
        <button onClick={confirm} disabled={!tracking.trim()} style={{ ...S.btnPrimary,
          background: tracking.trim() ? "linear-gradient(135deg,#D4850A,#B8600A)" : "#CCC",
          cursor: tracking.trim() ? "pointer" : "not-allowed" }}>確認並標記已寄送</button>
      </>)}

      {step === "scanning" && (
        <div style={{ padding:"2.5rem", textAlign:"center" }}>
          <div style={{ fontSize:"2rem" }}>⏳</div>
          <div style={{ fontFamily:"'Noto Sans TC'", color:"#8A6530", marginTop:"0.6rem" }}>AI 辨識中...</div>
        </div>
      )}

      {step === "confirm" && (<>
        {preview && <img src={preview} style={{ width:"100%", borderRadius:"0.75rem", maxHeight:150, objectFit:"cover" }} />}
        <div style={{ width:"100%" }}>
          <label style={S.label}>辨識到的托運編號（可修改）</label>
          <input style={trackInput} value={tracking} onChange={e => setTracking(e.target.value)} placeholder="托運編號" />
        </div>
        <button onClick={confirm} disabled={!tracking.trim()} style={{ ...S.btnPrimary,
          background: tracking.trim() ? "linear-gradient(135deg,#2E8B57,#1F6B3F)" : "#CCC",
          cursor: tracking.trim() ? "pointer" : "not-allowed" }}>✅ 確認標記已寄送</button>
      </>)}

      {step === "done" && (
        <div style={{ textAlign:"center", padding:"1.5rem" }}>
          <div style={{ fontSize:"3rem" }}>✅</div>
          <div style={{ fontFamily:"'Noto Serif TC'", color:"#2E6B3A", fontWeight:700, marginTop:"0.5rem" }}>已標記為寄送完成</div>
          <button onClick={onClose} style={{ ...S.btnPrimary, marginTop:"1rem", width:"auto", padding:"0.6rem 2rem" }}>關閉</button>
        </div>
      )}
    </div>
  );
          }


// ── Order Card ───────────────────────────────────────────
function OrderCard({ order, onShip, onDelete }) {
  const total = order.qty.large + order.qty.medium + order.qty.small;
  const shippedDate = order.shippedAt ? new Date(order.shippedAt).toLocaleDateString("zh-TW") : null;
  const createdDate = new Date(order.createdAt).toLocaleDateString("zh-TW");

  return (
    <div style={{ background: order.shipped
        ? "linear-gradient(135deg,#F0FAF4,#E8F5ED)"
        : "linear-gradient(135deg,#FFFEF9,#FFF8EC)",
      border:`1.5px solid ${order.shipped ? "#A8D4B4" : "#E8D4A0"}`,
      borderRadius:"1.1rem", padding:"1rem 1.1rem",
      boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:"0.45rem", flexWrap:"wrap" }}>
            <span style={{ fontFamily:"'Noto Serif TC',serif", fontSize:"1rem",
              fontWeight:700, color:"#3A2205" }}>{order.name}</span>
            <span style={{ fontSize:"0.68rem", fontWeight:700, padding:"0.12rem 0.45rem",
              borderRadius:"99px", fontFamily:"'Noto Sans TC'",
              background: order.shipped ? "#2E8B57" : "#D4850A", color:"white" }}>
              {order.shipped ? "已寄送" : "待寄送"}
            </span>
          </div>
          {order.phone && <div style={{ fontSize:"0.78rem", color:"#8A6530", fontFamily:"'Noto Sans TC'", marginTop:"0.1rem" }}>📞 {order.phone}</div>}
          {order.address && <div style={{ fontSize:"0.78rem", color:"#8A6530", fontFamily:"'Noto Sans TC'" }}>📍 {order.address}</div>}
        </div>
        <button onClick={() => onDelete(order.id)}
          style={{ marginLeft:"0.5rem", flexShrink:0, padding:"0.28rem 0.65rem",
            borderRadius:"0.45rem", border:"1.5px solid #E8B0A0",
            background:"#FFF0EC", color:"#C0402A", fontFamily:"'Noto Sans TC'",
            fontWeight:700, fontSize:"0.75rem", cursor:"pointer" }}>刪除</button>
      </div>

      <div style={{ display:"flex", gap:"0.45rem", marginTop:"0.65rem", flexWrap:"wrap" }}>
        {SIZES.map(s => order.qty[s.key] > 0 && (
          <span key={s.key} style={{ background:`${s.color}15`, border:`1px solid ${s.color}55`,
            borderRadius:"0.45rem", padding:"0.18rem 0.55rem",
            fontFamily:"'Noto Sans TC'", fontSize:"0.8rem", color:s.color, fontWeight:600 }}>
            🍊 {s.label} × {order.qty[s.key]} 箱
          </span>
        ))}
        <span style={{ background:"#F0E8D0", borderRadius:"0.45rem", padding:"0.18rem 0.55rem",
          fontFamily:"'Noto Sans TC'", fontSize:"0.8rem", color:"#7A5520", fontWeight:600 }}>
          共 {total} 箱
        </span>
      </div>

      {order.note && (
        <div style={{ marginTop:"0.45rem", fontSize:"0.78rem", color:"#9A7040",
          fontFamily:"'Noto Sans TC'", fontStyle:"italic" }}>💬 {order.note}</div>
      )}

      {order.trackingNumber && (
        <div style={{ marginTop:"0.55rem", display:"flex", alignItems:"center", gap:"0.45rem", flexWrap:"wrap" }}>
          <span style={{ fontSize:"0.78rem", color:"#5A7A5A", fontFamily:"monospace",
            background:"#E8F0E8", padding:"0.18rem 0.55rem", borderRadius:"0.4rem" }}>
            📦 {order.trackingNumber}
          </span>
          <a href={`${KERRY_URL}?no=${order.trackingNumber}`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize:"0.76rem", color:"#D4850A", fontFamily:"'Noto Sans TC'",
              fontWeight:600, textDecoration:"none", background:"#FFF0D0",
              padding:"0.18rem 0.55rem", borderRadius:"0.4rem", border:"1px solid #E8C070" }}>
            🔍 查詢貨況
          </a>
        </div>
      )}

      <div style={{ marginTop:"0.65rem", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:"0.72rem", color:"#B0905A", fontFamily:"'Noto Sans TC'" }}>
          建立 {createdDate}{shippedDate && `　寄出 ${shippedDate}`}
        </span>
        {!order.shipped && (
          <button onClick={() => onShip(order)} style={{ background:"linear-gradient(135deg,#D4850A,#B8600A)",
            color:"white", border:"none", borderRadius:"0.55rem", padding:"0.38rem 0.85rem",
            fontFamily:"'Noto Sans TC'", fontWeight:700, fontSize:"0.8rem", cursor:"pointer" }}>
            📷 上傳貨運單
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────
export default function App() {
  const [orders, setOrders]       = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null);
  const [filter, setFilter]       = useState("all");
  const [search, setSearch]       = useState("");

  useEffect(() => {
    Promise.all([storageGet(ORDERS_KEY), storageGet(CUSTOMERS_KEY)]).then(([o,c]) => {
      setOrders(o || []); setCustomers(c || []); setLoading(false);
    });
  }, []);

  async function handleAddOrder(order) {
    const updated = [order, ...orders];
    setOrders(updated); await storageSet(ORDERS_KEY, updated); setModal(null);
  }
  async function handleSaveShipped(upd) {
    const updated = orders.map(o => o.id === upd.id ? upd : o);
    setOrders(updated); await storageSet(ORDERS_KEY, updated);
  }
  async function handleDeleteConfirmed(id) {
    const updated = orders.filter(o => o.id !== id);
    setOrders(updated); await storageSet(ORDERS_KEY, updated); setModal(null);
  }
  async function handleSaveCustomers(list) {
    setCustomers(list); await storageSet(CUSTOMERS_KEY, list);
  }

  const filtered = orders.filter(o => {
    const mf = filter==="all" || (filter==="pending" && !o.shipped) || (filter==="shipped" && o.shipped);
    const ms = !search || o.name.includes(search) || o.address?.includes(search) || o.trackingNumber?.includes(search);
    return mf && ms;
  });

  const stats = {
    total: orders.length,
    pending: orders.filter(o => !o.shipped).length,
    large:  orders.reduce((s,o) => s+o.qty.large,  0),
    medium: orders.reduce((s,o) => s+o.qty.medium, 0),
    small:  orders.reduce((s,o) => s+o.qty.small,  0),
  };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#FDF6E3 0%,#F7EDD0 40%,#EFE0B8 100%)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700;900&family=Noto+Sans+TC:wght@400;500;600;700&display=swap');
        * { box-sizing:border-box; } body { margin:0; }
      `}</style>

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#8B4513,#A0522D,#6B3410)",
        padding:"1.1rem 1.1rem 0.9rem", boxShadow:"0 4px 20px rgba(80,30,0,0.25)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontFamily:"'Noto Serif TC',serif", fontSize:"1.3rem",
              fontWeight:900, color:"#FFE88A", letterSpacing:"0.04em" }}>🍊 柚子管理後台</div>
            <div style={{ fontSize:"0.72rem", color:"#D4B87A", fontFamily:"'Noto Sans TC'", marginTop:"0.1rem" }}>
              共 {stats.total} 筆 · 待寄送 {stats.pending} 筆
            </div>
          </div>
          <div style={{ display:"flex", gap:"0.45rem" }}>
            <button onClick={() => setModal("customers")}
              style={{ background:"rgba(255,255,255,0.15)", color:"#FFE8A0",
                border:"1.5px solid rgba(255,220,100,0.4)", borderRadius:"0.6rem",
                padding:"0.48rem 0.7rem", fontFamily:"'Noto Sans TC'",
                fontWeight:600, fontSize:"0.78rem", cursor:"pointer" }}>👥 客戶</button>
            <button onClick={() => setModal("add")}
              style={{ background:"linear-gradient(135deg,#FFD050,#F0A800)", color:"#4A2800",
                border:"none", borderRadius:"0.6rem", padding:"0.48rem 0.8rem",
                fontFamily:"'Noto Sans TC'", fontWeight:700, fontSize:"0.82rem",
                cursor:"pointer", boxShadow:"0 3px 10px rgba(200,130,0,0.4)" }}>＋ 新增</button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding:"0.8rem 0.8rem 0", display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.5rem" }}>
        {[["大顆",stats.large,"#C8820A"],["普通",stats.medium,"#D4680A"],["小顆",stats.small,"#B83A20"]].map(([l,v,c]) => (
          <div key={l} style={{ background:"white", borderRadius:"0.75rem", padding:"0.6rem 0.4rem",
            textAlign:"center", border:`1.5px solid ${c}25`, boxShadow:"0 2px 8px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize:"0.68rem", color:c, fontWeight:700, fontFamily:"'Noto Sans TC'" }}>🍊 {l}</div>
            <div style={{ fontSize:"1.4rem", fontWeight:900, color:"#3A2205", fontFamily:"'Noto Serif TC'" }}>{v}</div>
            <div style={{ fontSize:"0.66rem", color:"#B0905A", fontFamily:"'Noto Sans TC'" }}>箱</div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div style={{ padding:"0.65rem 0.8rem 0" }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜尋姓名、地址、托運編號..."
          style={{ ...S.input, marginBottom:"0.5rem" }} />
        <div style={{ display:"flex", gap:"0.4rem" }}>
          {[["all","全部"],["pending","待寄送"],["shipped","已寄送"]].map(([v,l]) => (
            <button key={v} onClick={() => setFilter(v)} style={{ flex:1, padding:"0.44rem",
              borderRadius:"0.55rem", border:`1.5px solid ${filter===v ? "#D4850A" : "#D9C9A3"}`,
              background: filter===v ? "linear-gradient(135deg,#D4850A,#B8600A)" : "white",
              color: filter===v ? "white" : "#8A6530",
              fontFamily:"'Noto Sans TC'", fontWeight:600, fontSize:"0.78rem", cursor:"pointer" }}>{l}</button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ padding:"0.65rem 0.8rem 5rem", display:"flex", flexDirection:"column", gap:"0.6rem" }}>
        {loading && <div style={{ textAlign:"center", padding:"3rem", color:"#B0905A", fontFamily:"'Noto Sans TC'" }}>載入中...</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign:"center", padding:"3rem", color:"#B0905A",
            fontFamily:"'Noto Serif TC'", fontSize:"0.95rem" }}>
            {orders.length === 0 ? "還沒有訂單，點右上角新增！" : "沒有符合的訂單"}
          </div>
        )}
        {filtered.map(order => (
          <OrderCard key={order.id} order={order}
            onShip={o => setModal({ type:"ship", order:o })}
            onDelete={id => setModal({ type:"confirmDelete", id })} />
        ))}
      </div>

      {/* Modals */}
      {modal === "add" && (
        <Modal title="新增訂單" onClose={() => setModal(null)}>
          <AddOrderForm customers={customers} onSave={handleAddOrder} />
        </Modal>
      )}
      {modal === "customers" && (
        <Modal title="客戶資料管理" onClose={() => setModal(null)}>
          <CustomerManager customers={customers} onSave={handleSaveCustomers} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.type === "ship" && (
        <Modal title={`上傳貨運單 — ${modal.order.name}`} onClose={() => setModal(null)}>
          <ScanModal order={modal.order}
            onSaved={async upd => { await handleSaveShipped(upd); }}
            onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.type === "confirmDelete" && (
        <ConfirmDialog
          message="確定刪除這筆訂單？此操作無法復原。"
          onConfirm={() => handleDeleteConfirmed(modal.id)}
          onCancel={() => setModal(null)} />
      )}
    </div>
  );
}
