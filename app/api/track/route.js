import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const no = searchParams.get('no');

  if (!no) {
    return NextResponse.json({ error: '請提供托運單號' }, { status: 400 });
  }

  // 🔑 請將下方的字串，換成你剛剛在 17TRACK 控制台複製的 API Key (17token)！
  const API_KEY = "FAB196B8BDACFA6B5B536BDCD9BE0C78";

  try {
    // ==========================================
    // 步驟一：向 17TRACK 註冊單號 (告訴它我們要追蹤這個包裹)
    // ==========================================
    await fetch('https://api.17track.net/track/v2.2/register', {
      method: 'POST',
      headers: {
        '17token': API_KEY,
        'Content-Type': 'application/json'
      },
      // 17TRACK 通常會自動辨識物流商，所以我們只傳單號即可
      body: JSON.stringify([{ number: no }])
    });

    // ==========================================
    // 步驟二：取得追蹤資訊
    // ==========================================
    const response = await fetch('https://api.17track.net/track/v2.2/gettrackinfo', {
      method: 'POST',
      headers: {
        '17token': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{ number: no }])
    });

    const data = await response.json();

    // 防呆：檢查 17TRACK 是否有成功回傳這個單號的資料
    if (!data || !data.data || !data.data.accepted || data.data.accepted.length === 0) {
       return NextResponse.json({ error: '17TRACK 尚未抓取到資料，請稍後再試。', raw: data }, { status: 404 });
    }

    const trackInfo = data.data.accepted[0].track;
    
    // 如果 17TRACK 剛收到這個單號，可能還在爬蟲中，狀態會是 null
    if (!trackInfo || (!trackInfo.z1 && !trackInfo.z2 && !trackInfo.z0)) {
       return NextResponse.json({ 
         trackingNumber: no,
         status: "17TRACK 處理中 (首次查詢需等候幾分鐘)", 
         history: [] 
       });
    }

    // 17TRACK 的軌跡通常放在 z1 (最新狀態) 或 z0 陣列裡
    const rawHistory = trackInfo.z1 || trackInfo.z0 || trackInfo.z2 || [];
    
    const history = rawHistory.map(item => ({
      // 17TRACK 回傳的 item.z 是時間 (例如 "2026-03-20 16:03")
      time: item.z || "時間未知", 
      // 17TRACK 回傳的 item.d 是物流狀態與站所說明
      message: item.d || "狀態更新" 
    }));

    // 取得最新的一筆狀態作為摘要
    const currentStatus = history.length > 0 ? history[0].message : "處理中";

    return NextResponse.json({
      trackingNumber: no,
      status: currentStatus,
      history: history
    });

  } catch (error) {
    return NextResponse.json({ 
      error: '查詢失敗，17TRACK 系統連線異常', 
      details: error.message 
    }, { status: 500 });
  }
}
