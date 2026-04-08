import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const no = searchParams.get('no');

  if (!no) {
    return NextResponse.json({ error: '請提供托運單號' }, { status: 400 });
  }

  // 🔑 請記得換成你自己的 17token
  const API_KEY = "你的_17TRACK_密鑰";
  // 🚚 嘉里大榮 (Kerry TJ) 的 17TRACK 運輸商代碼
  const CARRIER_ID = 100704;

  try {
    // 🕵️‍♂️ 步驟一：註冊單號 (加上 carrier 指定運輸商)
    await fetch('https://api.17track.net/track/v2.2/register', {
      method: 'POST',
      headers: { '17token': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ number: no, carrier: CARRIER_ID }])
    });

    // 📦 步驟二：取得資訊 (同樣加上 carrier 以確保讀取正確的 provider)
    const response = await fetch('https://api.17track.net/track/v2.2/gettrackinfo', {
      method: 'POST',
      headers: { '17token': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ number: no, carrier: CARRIER_ID }])
    });

    const data = await response.json();

    const accepted = data?.data?.accepted?.[0];
    if (!accepted || !accepted.track_info) {
      return NextResponse.json({ error: '17TRACK 尚未抓取到資料，請稍後。' }, { status: 404 });
    }

    const trackInfo = accepted.track_info;
    const events = trackInfo.tracking?.providers?.[0]?.events || [];

    if (events.length === 0) {
      return NextResponse.json({ 
        trackingNumber: no,
        status: "17TRACK 正在抓取嘉里大榮詳情...", 
        history: [] 
      });
    }

    const history = events.map(event => {
      const date = event.time_raw?.date || "";
      const time = event.time_raw?.time || "";
      return {
        time: `${date} ${time}`.trim(),
        message: `${event.description}${event.location ? ` (${event.location})` : ""}`
      };
    });

    history.sort((a, b) => new Date(b.time) - new Date(a.time));
    const currentStatus = trackInfo.latest_event?.description || history[0]?.message || "處理中";

    return NextResponse.json({
      trackingNumber: no,
      status: currentStatus,
      history: history
    });

  } catch (error) {
    return NextResponse.json({ 
      error: '查詢失敗', 
      details: error.message 
    }, { status: 500 });
  }
}
