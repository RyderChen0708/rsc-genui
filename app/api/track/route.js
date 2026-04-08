import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const no = searchParams.get('no');

  if (!no) {
    return NextResponse.json({ error: '請提供托運單號' }, { status: 400 });
  }

  try {
    // 1. 依照嘉里大榮的格式組裝 Payload
    const payload = {
      trackType: "0",
      trackNo: [
        { idxTxt: "一", value: no },
        { idxTxt: "二", value: "" },
        { idxTxt: "三", value: "" },
        { idxTxt: "四", value: "" },
        { idxTxt: "五", value: "" }
      ]
    };

    // 2. 發送 POST 請求到真實的 API
    const response = await fetch('https://www.kerrytj.com/api/Tracking/GetTracking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 加上 User-Agent 偽裝成一般瀏覽器，避免被阻擋
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    // 3. 防呆檢查：如果查無資料
    if (!data.list || data.list.length === 0 || !data.list[0].course) {
      return NextResponse.json({ error: '查無此單號或尚未建檔' }, { status: 404 });
    }

    // 4. 解析並整理歷史軌跡 (course 陣列)
    const courseData = data.list[0].course;
    
    const history = courseData.map(item => {
      // 處理日期：20260320 -> 2026-03-20
      const d = item.processCargoCrtDate.toString();
      const dateStr = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
      
      // 處理時間：35701 -> 035701 -> 03:57 (自動補齊 6 位數)
      const t = item.processCargoCrtTime.toString().padStart(6, '0');
      const timeStr = `${t.slice(0,2)}:${t.slice(2,4)}`;

      return {
        time: `${dateStr} ${timeStr}`,
        // 組合狀態與站所，例如："貨件已到配送站所 (板橋)"
        message: `${item.statusIdName} (${item.processDepotIdName})`
      };
    });

    // 確保時間軸是由新到舊排序（從最近發生的事情開始看）
    history.sort((a, b) => new Date(b.time) - new Date(a.time));

    // 取得最新的一筆狀態作為摘要
    const currentStatus = history.length > 0 ? history[0].message : "處理中";

    // 5. 回傳乾淨的 JSON 給我們自己的前端
    return NextResponse.json({
      trackingNumber: no,
      status: currentStatus,
      history: history
    });

  } catch (error) {
    console.error('Tracking API Error:', error);
    return NextResponse.json({ error: '查詢失敗，系統異常' }, { status: 500 });
  }
}
