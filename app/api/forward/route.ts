import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * ส่งต่อเคสไปยังช่องทางจริงของศูนย์ประสานงาน (ตั้งค่าผ่าน env — ดู .env.local.example)
 *  - FORWARD_WEBHOOK_URL : รับ POST JSON { text, content, incidentId, agency } (Slack/Discord/Make/Zapier/n8n ฯลฯ)
 *  - RESEND_API_KEY + FORWARD_EMAIL_TO (+ FORWARD_EMAIL_FROM) : ส่งอีเมลผ่าน Resend
 * ถ้าไม่ได้ตั้งค่า จะตอบ 501 เพื่อให้หน้าเว็บแจ้งผู้ใช้ตามจริง (ไม่แกล้งทำเป็นส่งสำเร็จ)
 */

const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 10;
}

export async function GET() {
  return NextResponse.json({
    webhook: Boolean(process.env.FORWARD_WEBHOOK_URL),
    email: Boolean(process.env.RESEND_API_KEY && process.env.FORWARD_EMAIL_TO),
  });
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (limited(ip)) return NextResponse.json({ ok: false, error: 'ส่งถี่เกินไป กรุณารอสักครู่' }, { status: 429 });

  let body: { text?: unknown; incidentId?: unknown; agency?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const incidentId = typeof body.incidentId === 'string' ? body.incidentId.slice(0, 80) : '';
  const agency = typeof body.agency === 'string' ? body.agency.slice(0, 200) : '';
  if (!text || text.length > 4000) return NextResponse.json({ ok: false, error: 'ข้อความว่างหรือยาวเกินไป' }, { status: 400 });

  const webhook = process.env.FORWARD_WEBHOOK_URL;
  const resendKey = process.env.RESEND_API_KEY;
  const emailTo = process.env.FORWARD_EMAIL_TO;
  if (!webhook && !(resendKey && emailTo)) {
    return NextResponse.json({ ok: false, configured: false, error: 'ยังไม่ได้ตั้งค่าช่องทางส่งอัตโนมัติบนเซิร์ฟเวอร์' }, { status: 501 });
  }

  const sent: string[] = [];
  const failed: string[] = [];

  if (webhook) {
    try {
      const r = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, content: text, incidentId, agency }),
        signal: AbortSignal.timeout(8000),
      });
      (r.ok ? sent : failed).push('webhook');
    } catch {
      failed.push('webhook');
    }
  }

  if (resendKey && emailTo) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: process.env.FORWARD_EMAIL_FROM || 'FloodSafe Krabi <onboarding@resend.dev>',
          to: emailTo.split(',').map((s) => s.trim()).filter(Boolean),
          subject: `[FloodSafe กระบี่] ส่งต่อเคส ${incidentId}${agency ? ` → ${agency}` : ''}`,
          text,
        }),
        signal: AbortSignal.timeout(8000),
      });
      (r.ok ? sent : failed).push('email');
    } catch {
      failed.push('email');
    }
  }

  return NextResponse.json({ ok: sent.length > 0, configured: true, sent, failed }, { status: sent.length > 0 ? 200 : 502 });
}
