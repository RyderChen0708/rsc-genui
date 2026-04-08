'use client';
import { useState, useEffect, useRef } from "react";
import jsQR from "jsqr"; 
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

// 👉 請將這裡的內容，替換成你剛剛在 Firebase 複製的金鑰！
const firebaseConfig = {
  apiKey: "AIzaSyA0gfZsXBaYQmNJqH8UfeqJ8T2GjNxlHM0",
  authDomain: "pomelo-manager-df403.firebaseapp.com",
  projectId: "pomelo-manager-df403",
  storageBucket: "pomelo-manager-df403.firebasestorage.app",
  messagingSenderId: "G-XMXKERFH4V",
  appId: "1:118535587315:web:4380220b015840abadfe86"
};
// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── Constants ───────────────────────────────────────────
const SIZES = [
  { key: "large",  label: "大顆", color: "#1B4332" },
  { key: "medium", label: "普通", color: "#40916C" },
  { key: "small",  label: "小顆", color: "#74C69D" },
];
const KERRY_URL = "https://www.kerrytj.com/zh/checkin";
const ORDERS_KEY    = "pomelo-orders-v2";
const CUSTOMERS_KEY = "pomelo-customers-v1";

// ── Storage (全面升級為 Firebase 雲端同步) ───────────────────────────
async function storageGet(key) {
  try {
    const docSnap = await getDoc(doc(db, "pomelo_data", key));
    return docSnap.exists() ? docSnap.data().value : null;
  } catch (e) {
    console.error("讀取失敗:", e);
    return null;
  }
}

async function storageSet(key, val) {
  try {
    await setDoc(doc(db, "pomelo_data", key), { value: val });
  } catch (e) {
    console.error("儲存失敗:", e);
  }
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }


// (⚠️ 已經將原本的 Claude OCR 函數完全刪除，省下 API 費用與等待時間)

// ── Shared Styles ────────────────────────────────────────
const S = {
  input: {
    width: "100%", padding: "0.6rem 0.75rem", borderRadius: "0.6rem",
    border: "1.5px solid #95D5B2", background: "#FFFFFF",
    fontFamily: "'Noto Sans TC', sans-serif", fontSize: "0.92rem",
    color: "#1B4332", outline: "none", boxSizing: "border-box",
  },
  label: {
    display: "block", marginBottom: "0.3rem", fontFamily: "'Noto Sans TC'",
    fontSize: "0.78rem", color: "#2D6A4F", fontWeight: 600, letterSpacing: "0.04em",
  },
  btnPrimary: {
    width: "100%", background: "linear-gradient(135deg,#40916C,#2D6A4F)",
    color: "white", border: "none", borderRadius: "0.75rem", padding: "0.82rem",
    fontFamily: "'Noto Sans TC'", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer",
  },
};

// ── Modal ────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(10,25,15,0.72)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:"1rem" }}>
      <div style={{ background:"#F0FFF4", borderRadius:"1.25rem", width:"100%",
        maxWidth:480, maxHeight:"90vh", overflowY:"auto",
        boxShadow:"0 24px 64px rgba(0,0,0,0.3)", border:"1.5px solid #B7E4C7" }}>
        <div style={{ padding:"1.1rem 1.4rem 0.7rem", display:"flex",
          justifyContent:"space-between", alignItems:"center", borderBottom:"1px solid #B7E4C7" }}>
          <span style={{ fontFamily:"'Noto Serif TC',serif", fontSize:"1rem", color:"#1B4332", fontWeight:700 }}>{title}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:"1.4rem",
            cursor:"pointer", color:"#52B788", lineHeight:1, padding:"0 0.2rem" }}>×</button>
        </div>
        <div style={{ padding:"1.1rem 1.4rem 1.4rem" }}>{children}</div>
      </div>
    </div>
  );
}

// ── Confirm Dialog ───────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(10,25,15,0.72)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:1200, padding:"1.5rem" }}>
      <div style={{ background:"#F0FFF4", borderRadius:"1.1rem", padding:"1.5rem 1.75rem",
        maxWidth:320, width:"100%", boxShadow:"0 16px 48px rgba(0,0,0,0.28)", border:"1.5px solid #B7E4C7" }}>
        <div style={{ fontFamily:"'Noto Sans TC'", fontSize:"0.95rem", color:"#1B4332",
          marginBottom:"1.25rem", lineHeight:1.6 }}>{message}</div>
        <div style={{ display:"flex", gap:"0.75rem" }}>
          <button onClick={onCancel} style={{ flex:1, padding:"0.65rem", borderRadius:"0.65rem",
            border:"1.5px solid #95D5B2", background:"white", fontFamily:"'Noto Sans TC'",
            fontWeight:600, fontSize:"0.9rem", cursor:"pointer", color:"#2D6A4F" }}>取消</button>
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
          <div style={{ textAlign:"center", padding:"1.5rem 0", color:"#74C69D",
            fontFamily:"'Noto Sans TC'", fontSize:"0.9rem" }}>還沒有客戶資料</div>
        )}

        {list.map(c => (
          <div key={c.id} style={{ background:"#F0FFF4", border:"1.5px solid #95D5B2",
            borderRadius:"0.85rem", padding:"0.7rem 0.9rem",
            display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ fontFamily:"'Noto Serif TC'", fontWeight:700, color:"#1B4332" }}>{c.name}</div>
              {c.phone && <div style={{ fontSize:"0.78rem", color:"#2D6A4F", fontFamily:"'Noto Sans TC'" }}>📞 {c.phone}</div>}
              {c.address && <div style={{ fontSize:"0.78rem", color:"#2D6A4F", fontFamily:"'Noto Sans TC'" }}>📍 {c.address}</div>}
            </div>
            <div style={{ display:"flex", gap:"0.4rem", flexShrink:0 }}>
              <button onClick={() => startEdit(c)}
                style={{ padding:"0.25rem 0.55rem", borderRadius:"0.4rem", border:"1.5px solid #52B788",
                  background:"white", color:"#2D6A4F", fontFamily:"'Noto Sans TC'",
                  fontWeight:600, fontSize:"0.73rem", cursor:"pointer" }}>編輯</button>
              <button onClick={() => setDeleteTarget(c.id)}
                style={{ padding:"0.25rem 0.55rem", borderRadius:"0.4rem", border:"1.5px solid #E8B0A0",
                  background:"white", color:"#C0402A", fontFamily:"'Noto Sans TC'",
                  fontWeight:600, fontSize:"0.73rem", cursor:"pointer" }}>刪除</button>
            </div>
          </div>
        ))}

        {editing !== null && (
          <div style={{ background:"#E8F5E9", border:"1.5px solid #52B788",
            borderRadius:"0.85rem", padding:"0.85rem", display:"flex", flexDirection:"column", gap:"0.6rem" }}>
            <div style={{ fontFamily:"'Noto Sans TC'", fontSize:"0.8rem", color:"#2D6A4F", fontWeight:700 }}>
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
                  border:"1.5px solid #95D5B2", background:"white",
                  fontFamily:"'Noto Sans TC'", fontWeight:600, fontSize:"0.85rem",
                  cursor:"pointer", color:"#2D6A4F" }}>取消</button>
              <button onClick={saveForm} disabled={!form.name.trim()}
                style={{ flex:2, padding:"0.55rem", borderRadius:"0.6rem", border:"none",
                  background: form.name.trim() ? "linear-gradient(135deg,#40916C,#2D6A4F)" : "#CCC",
                  fontFamily:"'Noto Sans TC'", fontWeight:700, fontSize:"0.85rem",
                  cursor: form.name.trim() ? "pointer" : "not-allowed", color:"white" }}>儲存</button>
            </div>
          </div>
        )}

        <button onClick={startNew}
          style={{ padding:"0.6rem", borderRadius:"0.65rem", border:"2px dashed #52B788",
            background:"transparent", color:"#2D6A4F", fontFamily:"'Noto Sans TC'",
            fontWeight:600, fontSize:"0.85rem", cursor:"pointer" }}>
          ＋ 新增客戶
        </button>
        <button onClick={handleDone} style={S.btnPrimary}>完成並儲存</button>
      </div>
    </>
  );
}

// ── Order Form (新增與編輯共用) ───────────────────────────
function OrderForm({ customers, initialData, onSave }) {
  const [name, setName]       = useState(initialData?.name || "");
  const [phone, setPhone]     = useState(initialData?.phone || "");
  const [address, setAddress] = useState(initialData?.address || "");
  const [note, setNote]       = useState(initialData?.note || "");
  const [qty, setQty]         = useState(initialData?.qty || { large:0, medium:0, small:0 });
  const [showDrop, setShowDrop] = useState(false);
  const wrapRef = useRef();

  const suggestions = name.trim() ? customers.filter(c => c.name.includes(name.trim())) : customers;
  const total = qty.large + qty.medium + qty.small;

  function pick(c) {
    setName(c.name); setPhone(c.phone||""); setAddress(c.address||"");
    setShowDrop(false);
  }

  function handleSave() {
    if (!name.trim() || total === 0) return;
    if (initialData) {
      onSave({ ...initialData, name:name.trim(), phone:phone.trim(), address:address.trim(), note:note.trim(), qty });
    } else {
      onSave({ id:uid(), name:name.trim(), phone:phone.trim(), address:address.trim(), note:note.trim(), qty, trackingNumber:"", shipped:false, shippedAt:null, createdAt:new Date().toISOString() });
    }
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"0.85rem" }}>
      <div style={{ position:"relative" }} ref={wrapRef}>
        <label style={S.label}>買家姓名 *</label>
        <input style={S.input} value={name} autoComplete="off" onChange={e => { setName(e.target.value); setShowDrop(true); }} onFocus={() => setShowDrop(true)} placeholder="輸入或選擇客戶" />
        {showDrop && suggestions.length > 0 && (
          <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:200, background:"white", border:"1.5px solid #52B788", borderRadius:"0.7rem", boxShadow:"0 8px 24px rgba(0,0,0,0.14)", overflow:"hidden" }}>
            {suggestions.map(c => (
              <div key={c.id} onMouseDown={e => { e.preventDefault(); pick(c); }} style={{ padding:"0.6rem 0.85rem", cursor:"pointer", borderBottom:"1px solid #D8F3DC", fontFamily:"'Noto Sans TC'" }}>
                <div style={{ fontWeight:700, color:"#1B4332", fontSize:"0.9rem" }}>{c.name}</div>
                {c.phone && <div style={{ fontSize:"0.74rem", color:"#40916C" }}>📞 {c.phone}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      {showDrop && suggestions.length > 0 && <div style={{ position:"fixed", inset:0, zIndex:199 }} onClick={() => setShowDrop(false)} />}
      
      <div>
        <label style={S.label}>聯絡電話</label>
        <input style={S.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="0912-345-678" />
      </div>
      <div>
        <label style={S.label}>收件地址</label>
        <input style={S.input} value={address} onChange={e => setAddress(e.target.value)} placeholder="台北市..." />
      </div>

<div>
        <label style={S.label}>箱數（依文旦大小）</label>
       <div style={{ display:"flex", gap:"0.35rem" }}>
          {SIZES.map(s => (
            <div key={s.key} style={{ flex:1, background:"#F0FFF4", border:`1.5px solid ${s.color}33`, borderRadius:"0.6rem", padding:"0.6rem 0.2rem", textAlign:"center", minWidth:0 }}>
              <div style={{ display:"flex", justifyContent:"center", alignItems:"center", marginBottom:"0.2rem" }}>
  <img src="/pomelo-icon.png" alt="文旦" style={{ width:"1.6rem", height:"1.6rem", objectFit:"contain" }} />
</div>
              <div style={{ fontFamily:"'Noto Sans TC'", fontSize:"0.7rem", color:s.color, fontWeight:700, margin:"0.2rem 0 0.35rem" }}>{s.label}</div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"0.1rem" }}>
                {/* 加入 type="button" 且微調寬度為 24px，加入 flexShrink:0 防止變形 */}
                <button type="button" onClick={() => setQty(q => ({...q,[s.key]:Math.max(0,q[s.key]-1)}))} style={{ width:24, height:24, flexShrink:0, borderRadius:"50%", border:`1.5px solid ${s.color}`, background:"white", cursor:"pointer", color:s.color, fontWeight:700, fontSize:"0.9rem", lineHeight:1, padding:0, WebkitUserSelect:"none", touchAction:"manipulation" }}>−</button>
                
                <input 
                  type="text" 
                  inputMode="numeric" 
                  pattern="[0-9]*"
                  value={qty[s.key] === 0 ? "" : qty[s.key]} 
                  placeholder="0"
                  onChange={e => {
                    const pureNumber = e.target.value.replace(/\D/g, '');
                    let val = parseInt(pureNumber, 10);
                    setQty(q => ({ ...q, [s.key]: isNaN(val) ? 0 : val }));
                  }} 
                  // 寬度從 3.5 縮回 2.2rem，字體調回 1rem，加入 minWidth:0
                  style={{ width:"2.2rem", minWidth:0, fontFamily:"monospace", fontSize:"1rem", textAlign:"center", color:"#1B4332", fontWeight:700, border:"none", background:"transparent", outline:"none", padding:0, WebkitUserSelect:"none", touchAction:"manipulation" }} 
                />

                <button type="button" onClick={() => setQty(q => ({...q,[s.key]:q[s.key]+1}))} style={{ width:24, height:24, flexShrink:0, borderRadius:"50%", border:`1.5px solid ${s.color}`, background:"white", cursor:"pointer", color:s.color, fontWeight:700, fontSize:"0.9rem", lineHeight:1, padding:0, WebkitUserSelect:"none", touchAction:"manipulation" }}>＋</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label style={S.label}>備註</label>
        <input style={S.input} value={note} onChange={e => setNote(e.target.value)} placeholder="付款備註、特殊需求..." />
      </div>

      <button onClick={handleSave} disabled={total === 0 || !name.trim()} style={{ ...S.btnPrimary, background: total > 0 && name.trim() ? "linear-gradient(135deg,#40916C,#2D6A4F)" : "#CCC", cursor: total > 0 && name.trim() ? "pointer" : "not-allowed" }}>
        {initialData ? "儲存修改" : "新增訂單"}
      </button>
    </div>
  );
}

// ── Scan Modal (改用純前端 QR Code 掃描) ─────────────────────────
function ScanModal({ order, onSaved, onClose }) {
  const [step, setStep]       = useState("upload");
  const [tracking, setTracking] = useState(order.trackingNumber || "");
  const [preview, setPreview] = useState(null);
  const fileRef = useRef();

  async function handleFile(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setPreview(ev.target.result);
      setStep("preview");
    };
    reader.readAsDataURL(file);
    e.target.value = null;
  }

  function rotateImage() {
    if (!preview) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext("2d");
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      setPreview(canvas.toDataURL("image/jpeg"));
    };
    img.src = preview;
  }

  // 👈 新增的 QR Code 本機掃描功能
  function startScan() {
    setStep("scanning");
    
    // 使用 setTimeout 讓畫面有時間顯示「掃描中...」
    setTimeout(() => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          
          if (code && code.data) {
            setTracking(code.data); // 成功抓到條碼
          } else {
            setTracking("");
            alert("找不到 QR Code！請確保照片清晰且 QR 碼沒有被裁切，或嘗試旋轉照片。");
          }
        } catch (e) {
          setTracking("");
          alert("掃描發生錯誤，請手動輸入。");
        }
        setStep("confirm");
      };
      img.src = preview;
    }, 100);
  }

  function confirm() {
    if (!tracking.trim()) return;
    onSaved({ ...order, trackingNumber:tracking.trim(), shipped:true, shippedAt:new Date().toISOString() });
    setStep("done");
  }

  const trackInput = { ...S.input, fontFamily:"monospace", border:"2px solid #40916C" };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"0.9rem", alignItems:"center" }}>
      {step === "upload" && (<>
        <div onClick={() => fileRef.current.click()} style={{ width:"100%",
          border:"2px dashed #52B788", borderRadius:"1rem", padding:"1.75rem",
          textAlign:"center", background:"#F0FFF4", cursor:"pointer" }}>
          <div style={{ fontSize:"2.2rem" }}>📷</div>
          <div style={{ fontFamily:"'Noto Sans TC'", color:"#2D6A4F", fontSize:"0.88rem", marginTop:"0.4rem" }}>
            點此上傳貨運單照片<br/>
            <span style={{ fontSize:"0.76rem", color:"#74C69D" }}>掃描右上角 QR Code 讀取單號</span>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleFile} />
        <div style={{ color:"#52B788", fontSize:"0.8rem" }}>── 或手動輸入 ──</div>
        <input style={trackInput} value={tracking} onChange={e => setTracking(e.target.value)} placeholder="托運編號" />
        <button onClick={confirm} disabled={!tracking.trim()} style={{ ...S.btnPrimary,
          background: tracking.trim() ? "linear-gradient(135deg,#40916C,#2D6A4F)" : "#CCC",
          cursor: tracking.trim() ? "pointer" : "not-allowed" }}>確認並標記已寄送</button>
      </>)}

      {step === "preview" && (
        <div style={{ width:"100%", display:"flex", flexDirection:"column", gap:"0.8rem" }}>
          <div style={{ fontFamily:"'Noto Sans TC'", color:"#2D6A4F", fontSize:"0.88rem", fontWeight:600, textAlign:"center" }}>
            確認照片方向與清晰度
          </div>
          <img src={preview} style={{ width:"100%", maxHeight:250, objectFit:"contain", borderRadius:"0.75rem", border:"1px solid #95D5B2", background:"#FFFFFF" }} />
          <div style={{ display:"flex", gap:"0.5rem" }}>
            <button onClick={() => fileRef.current.click()} style={{ flex:1, padding:"0.6rem", borderRadius:"0.55rem", border:"1.5px solid #52B788", background:"white", color:"#2D6A4F", fontFamily:"'Noto Sans TC'", fontWeight:600, cursor:"pointer" }}>
              重新選擇
            </button>
            <button onClick={rotateImage} style={{ flex:1, padding:"0.6rem", borderRadius:"0.55rem", border:"1.5px solid #52B788", background:"white", color:"#2D6A4F", fontFamily:"'Noto Sans TC'", fontWeight:600, cursor:"pointer" }}>
              🔄 旋轉 90°
            </button>
          </div>
          {/* 按鈕改為 startScan */}
          <button onClick={startScan} style={{ ...S.btnPrimary, marginTop:"0.4rem" }}>
            ✨ 確認無誤，掃描 QR Code
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleFile} />
        </div>
      )}

      {step === "scanning" && (
        <div style={{ padding:"2.5rem", textAlign:"center" }}>
          <div style={{ fontSize:"2rem" }}>⏳</div>
          <div style={{ fontFamily:"'Noto Sans TC'", color:"#2D6A4F", marginTop:"0.6rem" }}>QR Code 掃描中...</div>
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
          <div style={{ fontFamily:"'Noto Serif TC'", color:"#1B4332", fontWeight:700, marginTop:"0.5rem" }}>已標記為寄送完成</div>
          <button onClick={onClose} style={{ ...S.btnPrimary, marginTop:"1rem", width:"auto", padding:"0.6rem 2rem" }}>關閉</button>
        </div>
      )}
    </div>
  );
}

// ── Tracking Modal (顯示 17TRACK 的歷史紀錄) ──────────────────────
function TrackingModal({ trackingNumber }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

 useEffect(() => {
    let isMounted = true; // 追蹤視窗是否還開著
    
    // 每次單號改變時，先重置狀態，確保畫面出現 Loading 轉圈圈
    setLoading(true);
    setError(null);
    setData(null);

    async function fetchTrack() {
      try {
        const res = await fetch(`/api/track?no=${trackingNumber}`);
        const result = await res.json();
        
        // 只有在視窗還開著的時候，才把資料寫入畫面
        if (isMounted) {
          if (res.ok) setData(result);
          else setError(result.error || "查詢失敗");
        }
      } catch (e) {
        if (isMounted) setError("連線異常，請稍後再試");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    
    fetchTrack();

    // Cleanup 函數：當視窗被關閉時，把開關切掉
    return () => {
      isMounted = false;
    };
  }, [trackingNumber]);

  if (loading) return <div style={{ textAlign:"center", padding:"2rem", color:"#2D6A4F" }}>⌛ 正在連線 17TRACK 抓取最新貨況...</div>;
  if (error) return <div style={{ textAlign:"center", padding:"2rem", color:"#B83A20" }}>⚠️ {error}</div>;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
      <div style={{ background:"#F0FFF4", padding:"0.8rem", borderRadius:"0.75rem", border:"1.5px solid #95D5B2", textAlign:"center" }}>
        <div style={{ fontSize:"0.75rem", color:"#2D6A4F" }}>目前狀態</div>
        <div style={{ fontSize:"1.2rem", fontWeight:900, color:"#1B4332", marginTop:"0.2rem" }}>{data.status}</div>
      </div>

      <div style={{ position:"relative", paddingLeft:"1.5rem", marginTop:"0.5rem" }}>
        {/* 時光軸垂直線 */}
        <div style={{ position:"absolute", left:"5px", top:"5px", bottom:"5px", width:"2px", background:"#B7E4C7" }} />
        
        {data.history.map((item, idx) => (
          <div key={idx} style={{ position:"relative", marginBottom:"1.2rem" }}>
            {/* 時光軸圓點 */}
            <div style={{ position:"absolute", left:"-20px", top:"5px", width:"12px", height:"12px", borderRadius:"50%", 
              background: idx === 0 ? "#D4850A" : "#95D5B2", border:"2px solid white", boxShadow:"0 0 0 2px #F0FFF4" }} />
            <div style={{ fontSize:"0.72rem", color:"#74C69D", fontFamily:"monospace" }}>{item.time}</div>
            <div style={{ fontSize:"0.9rem", color:"#1B4332", fontWeight: idx === 0 ? 700 : 400, marginTop:"0.2rem" }}>{item.message}</div>
          </div>
        ))}
      </div>

      <a href={`https://www.kerrytj.com/zh/checkin?no=${trackingNumber}`} target="_blank" rel="noopener noreferrer"
        style={{ textAlign:"center", fontSize:"0.75rem", color:"#52B788", textDecoration:"underline", marginTop:"0.5rem" }}>
        前往嘉里大榮官網查看原始資料
      </a>
    </div>
  );
}

// ── Order Card ───────────────────────────────────────────
function OrderCard({ order, onShip, onEdit, onDelete, onTrack }) {
  const total = order.qty.large + order.qty.medium + order.qty.small;
  const shippedDate = order.shippedAt ? new Date(order.shippedAt).toLocaleDateString("zh-TW") : null;
  const createdDate = new Date(order.createdAt).toLocaleDateString("zh-TW");
  const deliveredDate = order.deliveredAt ? new Date(order.deliveredAt).toLocaleDateString("zh-TW") : null;
  
  return (
    <div style={{ background: order.shipped
        ? "linear-gradient(135deg,#F0FFF4,#E8F5E9)"
        : "linear-gradient(135deg,#FFFFFF,#F0FFF4)",
      border:`1.5px solid ${order.shipped ? "#74C69D" : "#95D5B2"}`,
      borderRadius:"1.1rem", padding:"1rem 1.1rem",
      boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:"0.45rem", flexWrap:"wrap" }}>
            <span style={{ fontFamily:"'Noto Serif TC',serif", fontSize:"1rem", fontWeight:700, color:"#1B4332" }}>{order.name}</span>
            <span style={{ fontSize:"0.68rem", fontWeight:700, padding:"0.12rem 0.45rem", borderRadius:"99px", fontFamily:"'Noto Sans TC'", background: order.shipped ? "#2D6A4F" : "#52B788", color:"white" }}>
              {order.shipped ? "已寄送" : "待寄送"}
            </span>
          </div>
          {order.phone && <div style={{ fontSize:"0.78rem", color:"#2D6A4F", fontFamily:"'Noto Sans TC'", marginTop:"0.1rem" }}>📞 {order.phone}</div>}
          {order.address && <div style={{ fontSize:"0.78rem", color:"#2D6A4F", fontFamily:"'Noto Sans TC'" }}>📍 {order.address}</div>}
        </div>
        <div style={{ display:"flex", gap:"0.4rem", flexShrink:0, marginLeft:"0.5rem" }}>
          <button onClick={() => onEdit(order)} style={{ padding:"0.28rem 0.65rem", borderRadius:"0.45rem", border:"1.5px solid #52B788", background:"white", color:"#2D6A4F", fontFamily:"'Noto Sans TC'", fontWeight:700, fontSize:"0.75rem", cursor:"pointer" }}>編輯</button>
          <button onClick={() => onDelete(order.id)} style={{ padding:"0.28rem 0.65rem", borderRadius:"0.45rem", border:"1.5px solid #E8B0A0", background:"#FEF2F2", color:"#C0402A", fontFamily:"'Noto Sans TC'", fontWeight:700, fontSize:"0.75rem", cursor:"pointer" }}>刪除</button>
        </div>
      </div>

      <div style={{ display:"flex", gap:"0.45rem", marginTop:"0.65rem", flexWrap:"wrap" }}>
        {SIZES.map(s => order.qty[s.key] > 0 && (
  <span key={s.key} style={{ 
    background:`${s.color}15`, border:`1px solid ${s.color}55`, borderRadius:"0.45rem", 
    padding:"0.18rem 0.55rem", fontFamily:"'Noto Sans TC'", fontSize:"0.8rem", 
    color:s.color, fontWeight:600, 
    display:"inline-flex", alignItems:"center", gap:"0.25rem" /* 👈 關鍵的置中魔法 */
  }}>
    <img src="/pomelo-icon.png" alt="文旦" style={{ width:"1rem", height:"1rem", objectFit:"contain" }} />
    <span>{s.label} × {order.qty[s.key]} 箱</span>
  </span>
))}
        <span style={{ background:"#D8F3DC", borderRadius:"0.45rem", padding:"0.18rem 0.55rem", fontFamily:"'Noto Sans TC'", fontSize:"0.8rem", color:"#2D6A4F", fontWeight:600 }}>共 {total} 箱</span>
      </div>

      {order.note && <div style={{ marginTop:"0.45rem", fontSize:"0.78rem", color:"#40916C", fontFamily:"'Noto Sans TC'", fontStyle:"italic" }}>💬 {order.note}</div>}

      {order.trackingNumber && (
        <div style={{ marginTop:"0.55rem", display:"flex", alignItems:"center", gap:"0.45rem", flexWrap:"wrap" }}>
         <span onClick={() => onTrack(order.trackingNumber)} style={{ fontSize:"0.78rem", color:"#2D6A4F", fontFamily:"monospace", background:"#D8F3DC", padding:"0.18rem 0.55rem", borderRadius:"0.4rem", cursor:"pointer" }}>
            📦 {order.trackingNumber}
          </span>
          <button onClick={() => onTrack(order.trackingNumber)}
            style={{ fontSize:"0.76rem", color:"#D4850A", fontFamily:"'Noto Sans TC'", fontWeight:600, border:"1px solid #74C69D", background:"#E8F5E9", padding:"0.18rem 0.55rem", borderRadius:"0.4rem", cursor:"pointer" }}>
             🔍 查詢進度
          </button>
        </div>
      )}

      <div style={{ marginTop:"0.65rem", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:"0.72rem", color:"#74C69D", fontFamily:"'Noto Sans TC'" }}>
  建立 {createdDate}
  {shippedDate && `　寄出 ${shippedDate}`}
  {deliveredDate && `　配達 ${deliveredDate}`}
  {/* 如果已寄出但還沒配達，顯示最新狀態摘要 */}
  {order.shipped && !order.deliveredAt && order.lastStatus && `　(${order.lastStatus})`}
</span>
        {!order.shipped && (
          <button onClick={() => onShip(order)} style={{ background:"linear-gradient(135deg,#40916C,#2D6A4F)", color:"white", border:"none", borderRadius:"0.55rem", padding:"0.38rem 0.85rem", fontFamily:"'Noto Sans TC'", fontWeight:700, fontSize:"0.8rem", cursor:"pointer" }}>📷 上傳貨運單</button>
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

  useEffect(() => {
  // 當 orders 載入完成後，執行自動追蹤
  if (!loading && orders.length > 0) {
    autoUpdateTracking();
  }
}, [loading]); // 只在初始載入完成時執行一次

  async function autoUpdateTracking() {
  // 篩選出：已寄出、有單號、且「還沒確認配達」的訂單
  const pendingOrders = orders.filter(o => o.shipped && o.trackingNumber && !o.deliveredAt);
  
  if (pendingOrders.length === 0) return;

  let hasChanges = false;
  const newOrders = [...orders];

  // 逐一檢查狀態 (為了不要瞬間塞爆 API，我們用循環處理)
  for (const order of pendingOrders) {
    try {
      const res = await fetch(`/api/track?no=${order.trackingNumber}`);
      const data = await res.json();
      
     if (data.status) {
        const idx = newOrders.findIndex(o => o.id === order.id);
        if (idx !== -1) {
          // 1. 先拷貝原本的訂單資料，再更新最新狀態摘要
          newOrders[idx] = { 
            ...newOrders[idx], 
            lastStatus: data.status 
          };
          
          // 2. 如果 17TRACK 說「配送完成」或「Delivered」，我們就補上配達日期
          if (data.status.includes("完成") || data.status.includes("Delivered")) {
            // 嘗試從歷史紀錄抓取最後一筆的時間，抓不到就用今天
            const finishTime = data.history?.[0]?.time ? new Date(data.history[0].time).toISOString() : new Date().toISOString();
            
            // 同樣用拷貝的方式，把配達日期加進去
            newOrders[idx] = { 
              ...newOrders[idx], 
              deliveredAt: finishTime 
            };
          }
          hasChanges = true;
        }
      }
    } catch (e) {
      console.error(`自動追蹤單號 ${order.trackingNumber} 失敗`);
    }
  }

  // 如果有資料更新，一次性寫回 Firebase
  if (hasChanges) {
    setOrders(newOrders);
    await storageSet(ORDERS_KEY, newOrders);
  }
}
  

  async function handleAddOrder(order) {
    const updated = [order, ...orders];
    setOrders(updated); await storageSet(ORDERS_KEY, updated); setModal(null);
  }

  async function handleEditOrder(updatedOrder) {
    const updated = orders.map(o => o.id === updatedOrder.id ? updatedOrder : o);
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
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#F0FFF4 0%,#E8F5E9 40%,#C8E6C9 100%)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700;900&family=Noto+Sans+TC:wght@400;500;600;700&display=swap');
        * { box-sizing:border-box; } body { margin:0; }
      `}</style>

           {/* Header */}
      {/* Header */}
      <div style={{ background:"#F0FFF4", /* 👈 1. 背景改為淺綠色 */
        padding:"1.1rem 1.1rem 0.9rem", boxShadow:"0 4px 15px rgba(45,106,79,0.12)" }}> {/* 微調了陰影顏色讓它融入綠色系 */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontFamily:"'Noto Serif TC',serif", fontSize:"1.3rem",
              fontWeight:800, color:"#2D6A4F", letterSpacing:"0.04em", display:"flex", alignItems:"center", gap:"0.3rem" }}>
  <img src="/pomelo-icon.png" alt="文旦" style={{ width:"1.5rem", height:"1.5rem" }} />
  陳家文旦
</div>
            {/* 副標題調深為灰綠色，確保在淺底色上夠清晰 */}
            <div style={{ fontSize:"0.72rem", color:"#bf2636", fontFamily:"'Noto Sans TC'", marginTop:"0.1rem" }}>
              共 {stats.total} 筆 · 待寄送 {stats.pending} 筆
            </div>
          </div>
          <div style={{ display:"flex", gap:"0.45rem" }}>
            {/* 客戶按鈕：改為白底綠框綠字 */}
            <button onClick={() => setModal("customers")}
              style={{ background:"white", color:"#2D6A4F",
                border:"1.5px solid #95D5B2", borderRadius:"0.6rem",
                padding:"0.48rem 0.7rem", fontFamily:"'Noto Sans TC'",
                fontWeight:600, fontSize:"0.78rem", cursor:"pointer" }}>👥 客戶</button>
            {/* 新增按鈕：改為質感的森林綠色漸層 */}
            <button onClick={() => setModal("add")}
              style={{ background:"linear-gradient(135deg,#40916C,#2D6A4F)", color:"white",
                border:"none", borderRadius:"0.6rem", padding:"0.48rem 0.8rem",
                fontFamily:"'Noto Sans TC'", fontWeight:700, fontSize:"0.82rem",
                cursor:"pointer", boxShadow:"0 3px 10px rgba(45,106,79,0.3)" }}>＋ 新增</button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding:"0.8rem 0.8rem 0", display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.5rem" }}>
        {[["大顆",stats.large,"#1B4332"],["普通",stats.medium,"#40916C"],["小顆",stats.small,"#74C69D"]].map(([l,v,c]) => (
          <div key={l} style={{ background:"white", borderRadius:"0.75rem", padding:"0.6rem 0.4rem",
            textAlign:"center", border:`1.5px solid ${c}25`, boxShadow:"0 2px 8px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize:"0.68rem", color:c, fontWeight:700, fontFamily:"'Noto Sans TC'", display:"flex", alignItems:"center", justifyContent:"center", gap:"0.2rem" }}>
  <img src="/pomelo-icon.png" alt="文旦" style={{ width:"0.9rem", height:"0.9rem" }} /> {l}
</div>
            <div style={{ fontSize:"1.4rem", fontWeight:900, color:"#1B4332", fontFamily:"'Noto Serif TC'" }}>{v}</div>
            <div style={{ fontSize:"0.66rem", color:"#74C69D", fontFamily:"'Noto Sans TC'" }}>箱</div>
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
              borderRadius:"0.55rem", border:`1.5px solid ${filter===v ? "#D4850A" : "#95D5B2"}`,
              background: filter===v ? "linear-gradient(135deg,#40916C,#2D6A4F)" : "white",
              color: filter===v ? "white" : "#2D6A4F",
              fontFamily:"'Noto Sans TC'", fontWeight:600, fontSize:"0.78rem", cursor:"pointer" }}>{l}</button>
          ))}
        </div>
      </div>

            {/* List */}
      <div style={{ padding:"0.65rem 0.8rem 5rem", display:"flex", flexDirection:"column", gap:"0.6rem" }}>
        {loading && <div style={{ textAlign:"center", padding:"3rem", color:"#74C69D", fontFamily:"'Noto Sans TC'" }}>載入中...</div>}
        
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign:"center", padding:"3rem", color:"#74C69D",
            fontFamily:"'Noto Serif TC'", fontSize:"0.95rem" }}>
            {orders.length === 0 ? "還沒有訂單，點右上角新增！" : "沒有符合的訂單"}
          </div>
        )}
        {filtered.map(order => (
          <OrderCard key={order.id} order={order}
            onShip={o => setModal({ type:"ship", order:o })}
            onTrack={no => setModal({ type:"track", no })} // 👈 新增這行
            onEdit={o => setModal({ type:"edit", order:o })}
            onDelete={id => setModal({ type:"confirmDelete", id })} />
        ))}
      </div>

      {/* Modals */}
      {modal === "add" && (
        <Modal title="新增訂單" onClose={() => setModal(null)}>
          <OrderForm customers={customers} onSave={handleAddOrder} />
        </Modal>
      )}
      {modal?.type === "edit" && (
        <Modal title="編輯訂單" onClose={() => setModal(null)}>
          <OrderForm customers={customers} initialData={modal.order} onSave={handleEditOrder} />
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
      {modal?.type === "track" && (
      <Modal title={`物流追蹤 — ${modal.no}`} onClose={() => setModal(null)}>
      <TrackingModal trackingNumber={modal.no} />
        </Modal>
      )}
    </div>
  );
}
