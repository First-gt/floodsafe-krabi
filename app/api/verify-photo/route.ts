import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const PROMPT = `คุณคือเจ้าหน้าที่ตรวจสอบรูปภาพของศูนย์ช่วยเหลือผู้ประสบอุทกภัย จังหวัดกระบี่ ประเทศไทย
หน้าที่: ตัดสินว่ารูปที่ผู้ใช้ส่งมาเป็น "ภาพถ่ายจริงของน้ำท่วมขังบนถนน/ในชุมชน/ในบ้าน" หรือไม่
ให้เข้มงวด:
- ไม่ใช่น้ำท่วม ถ้าเป็นรูปคน สัตว์ อาหาร เซลฟี่ วิวทั่วไป ถนนแห้ง สระน้ำ/ทะเล/แม่น้ำปกติ ภาพหน้าจอ การ์ตูน ภาพ AI ภาพโฆษณา หรือรูปที่ไม่เกี่ยวข้อง
- ถ้าเห็นน้ำท่วมจริง ให้ประเมินระดับน้ำเป็นเซนติเมตรโดยเทียบกับวัตถุในภาพ (ล้อรถ ขาคน ประตู รั้ว)
ตอบเป็น JSON เท่านั้น ตามรูปแบบ:
{"isFlood": boolean, "confidence": number 0-1, "estimatedDepthCm": number|null, "description": "บรรยายสิ่งที่เห็นสั้น ๆ เป็นภาษาไทย", "reason": "เหตุผลสั้น ๆ เป็นภาษาไทย"}`;

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ configured: false });

  let image: string;
  try {
    ({ image } = await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image ?? '');
  if (!m) return NextResponse.json({ error: 'bad_image' }, { status: 400 });
  if (m[2].length > 6_000_000) return NextResponse.json({ error: 'too_large' }, { status: 413 });

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: m[1], data: m[2] } }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) return NextResponse.json({ error: `upstream_${res.status}` }, { status: 502 });
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    const j = JSON.parse(text.replace(/^```json\s*|```$/g, '').trim());
    return NextResponse.json({
      configured: true,
      isFlood: !!j.isFlood,
      confidence: Number(j.confidence) || 0,
      estimatedDepthCm: typeof j.estimatedDepthCm === 'number' ? j.estimatedDepthCm : null,
      description: String(j.description ?? ''),
      reason: String(j.reason ?? ''),
    });
  } catch {
    return NextResponse.json({ error: 'parse_failed' }, { status: 502 });
  }
}
