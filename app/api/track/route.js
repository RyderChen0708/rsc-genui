import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const no = searchParams.get('no');

  if (!no) {
    return NextResponse.json({ error: '請提供托運單號' }, { status: 400 });
  }

  try {
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

    // 加上更完整的 Header，徹底偽裝成從嘉里大榮官網發出的請求
    const response = await fetch('https://www.kerrytj.com/api/Tracking/GetTracking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Referer': 'https://www.kerrytj.com/zh/search/search_track.aspx',
        'Origin': 'https://www.kerrytj.com'
      },
      body: JSON.stringify(payload)
    });

    // 先抓取純文字，避免直接 json() 壞掉
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`回傳的不是 JSON，可能是被阻擋了。伺服器回應：${text.substring(0, 100)}`);
    }

    if (!data.list || data.list.length === 0 || !data.list[0].course) {
      return NextResponse.json({ error: '查無此單號或尚未建檔', rawData: data }, { status: 404 });
    }

    const courseData = data.list[0].course;
    
    const history = courseData.map(item => {
      let timeStrFull = "時間未知";
      try {
        // 加入防護機制：確保日期和時間真的存在才處理
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
    // 💡 關鍵修改：把真正的錯誤原因 (error.message) 印在畫面上！
    return NextResponse.json({ 
      error: '查詢失敗，系統異常', 
      details: error.message 
    }, { status: 500 });
  }
}
