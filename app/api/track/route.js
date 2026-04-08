import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const no = searchParams.get('no');

  if (!no) {
    return NextResponse.json({ error: '請提供托運單號' }, { status: 400 });
  }

  try {
    // ==========================================
    // 🕵️‍♂️ 步驟一：先偷偷發送「同意隱私權條款」，並取得 Cookie 通行證
    // ==========================================
    const agreeRes = await fetch('https://www.kerrytj.com/api/Tracking/SetAgreeStatus?status=Y&type=6', {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
      }
    });

    // 從伺服器的回應中，把 set-cookie 抓出來 (這就是我們的通行證)
    const cookies = agreeRes.headers.get('set-cookie') || '';

    // ==========================================
    // 📦 步驟二：帶著通行證，正式查詢包裹
    // ==========================================
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

    const response = await fetch('https://www.kerrytj.com/api/Tracking/GetTracking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Referer': 'https://www.kerrytj.com/zh/search/search_track.aspx',
        'Origin': 'https://www.kerrytj.com',
        // 🔑 關鍵破解：把剛剛拿到的 Cookie 塞進請求標頭裡！
        'Cookie': cookies 
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`回傳的不是 JSON，可能通行證失效或被阻擋。伺服器回應：${text.substring(0, 100)}`);
    }

    if (!data.list || data.list.length === 0 || !data.list[0].course) {
      return NextResponse.json({ error: '查無此單號或尚未建檔', rawData: data }, { status: 404 });
    }

    const courseData = data.list[0].course;
    
    const history = courseData.map(item => {
      let timeStrFull = "時間未知";
      try {
        if (item.processCargoCrtDate && item.processCargoCrtTime != null) {
          const d = item.processCargoCrtDate.toString();
          const dateStr = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
          
          const t = item.processCargoCrtTime.toString().padStart(6, '0');
          const timeStr = `${t.slice(0,2)}:${t.slice(2,4)}`;
          timeStrFull = `${dateStr} ${timeStr}`;
        }
      } catch(e) {
        console.error("時間解析錯誤");
      }

      return {
        time: timeStrFull,
        message: `${item.statusIdName || '未知狀態'} (${item.processDepotIdName || '未知站所'})`
      };
    });

    history.sort((a, b) => new Date(b.time) - new Date(a.time));
    const currentStatus = history.length > 0 ? history[0].message : "處理中";

    return NextResponse.json({
      trackingNumber: no,
      status: currentStatus,
      history: history
    });

  } catch (error) {
    return NextResponse.json({ 
      error: '查詢失敗，系統異常', 
      details: error.message 
    }, { status: 500 });
  }
}
