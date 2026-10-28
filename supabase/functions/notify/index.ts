// Hudhud notifier: runs every minute (pg_cron -> pg_net). Sends lesson reminders, absence/attendance alerts,
// cheers and "lesson started" pushes. Riyadh time (UTC+3, no DST).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
let vapidOk = false;
const TZ = 3 * 3600e3, OPEN_AFTER = 30, APP = "https://mohammedftouhi.github.io/hudhud/";
const pad = (n: number) => String(n).padStart(2, "0");
// wall-clock helpers: a "local" Date stores Riyadh wall time in its UTC fields
const toLocal = (ms: number) => new Date(ms + TZ);
const keyOf = (t: Date) => `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}`;
const parseLocal = (s: string) => { const [d, hm = "00:00"] = s.split("T"); const [y, m, da] = d.split("-").map(Number); const h = hm.includes(":") ? hm.split(":") : [hm.slice(0, 2), hm.slice(2, 4)]; return new Date(Date.UTC(y, m - 1, da, Number(h[0]), Number(h[1] || 0))); };
const hhmm = (t: Date) => { let h = t.getUTCHours(); const m = pad(t.getUTCMinutes()); const am = h < 12; h = h % 12 || 12; return `${h}:${m} ${am ? "ص" : "م"}`; };

function slotsOn(sched: any, day: Date) { // day = local midnight
  if (!sched || !sched.periods || !sched.periods.length) return [];
  const ps = sched.periods.map((p: any) => ({ ...p, f: parseLocal(p.from) })).sort((a: any, b: any) => a.f - b.f);
  const cancel = new Set(sched.cancel || []), out: { t: Date; key: string }[] = [];
  const periodAt = (t: Date) => { let p = ps[0]; for (const q of ps) if (q.f <= t) p = q; return p; };
  for (const p of ps) {
    if (!p.days.includes(day.getUTCDay())) continue;
    const [h, m] = String(p.time).split(":").map(Number);
    const t = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m));
    if (t >= ps[0].f && periodAt(t) === p && !cancel.has(keyOf(t))) out.push({ t, key: keyOf(t) });
  }
  for (const x of sched.extra || []) { const t = parseLocal(x); if (t.getUTCFullYear() === day.getUTCFullYear() && t.getUTCMonth() === day.getUTCMonth() && t.getUTCDate() === day.getUTCDate() && !cancel.has(x)) out.push({ t, key: x }); }
  const seen = new Set(); return out.filter((s) => !seen.has(s.key) && seen.add(s.key));
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });
  try { return await run(); } catch (e) { return new Response("ERR " + ((e && (e as any).stack) || String(e)), { status: 500 }); }
});
async function run() {
  if (!vapidOk) { webpush.setVapidDetails("mailto:info@sahla-sa.com", Deno.env.get("VAPID_PUBLIC")!, Deno.env.get("VAPID_PRIVATE")!); vapidOk = true; }
  const nowMs = Date.now(), now = toLocal(nowMs);
  const { data: rows, error: e1 } = await sb.from("tk_rows").select("family_id,path,value,updated_at").or("path.like.kids/%,path.like.sched/%,path.like.guardians/%,path.like.cheers/%,path.like.livefeed/%,path.eq.attendance,path.eq.reports");
  if (e1) throw new Error("rows: " + e1.message);
  const { data: subs, error: e2 } = await sb.from("tk_push_subs").select("*"); if (e2) throw new Error("subs: " + e2.message);
  const fam: Record<string, any> = {};
  for (const r of rows || []) { const f = fam[r.family_id] = fam[r.family_id] || { kids: {}, sched: {}, guardians: {}, cheers: {}, livefeed: {}, attendance: [], reports: [] };
    const [top, sub] = r.path.split("/"); if (sub === "") continue;
    if (sub === undefined) f[top] = r.value; else f[top][sub] = r.value; }
  const msgs: { fam: string; key: string; to: (s: any) => boolean; title: string; body: string; url?: string }[] = [];
  for (const [fid, f] of Object.entries(fam)) {
    const gOf = (k: string) => Object.values(f.guardians).filter((g: any) => g && (g.kids || []).includes(k)).map((g: any) => g.id);
    const toKid = (k: string) => (s: any) => s.family_id === fid && s.role === "kid" && s.kid_id === k;
    const toGuard = (k: string) => { const gs = gOf(k); return (s: any) => s.family_id === fid && ((s.role === "guardian" && gs.includes(s.kid_id)) || s.role === "parent"); };
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yday = new Date(today.getTime() - 864e5);
    for (const [k, kid] of Object.entries<any>(f.kids)) {
      if (!kid || typeof kid !== 'object') continue;
      const name = kid.ar || kid.en || k;
      const slots = [...slotsOn(f.sched[k], yday), ...slotsOn(f.sched[k], today)];
      for (const s of slots) {
        const mins = (s.t.getTime() - now.getTime()) / 60e3;
        for (const T of [60, 30, 10]) {
          if (mins > 0 && mins <= T && mins > T - 8) {
            const when = T === 60 ? "بعد ساعة" : T === 30 ? "بعد نص ساعة" : "بعد 10 دقائق";
            const kidBody = T === 60 ? `يا ${name}، حصتك ${when} الساعة ${hhmm(s.t)}. جهّز الآيباد والسماعة 🎧`
              : T === 30 ? `يا ${name}، باقي نص ساعة على حصتك. راجع كلمات «حضّر لدرسك القادم» 📚`
              : `يا ${name}، حصتك تبدأ الساعة ${hhmm(s.t)}. ادخل الحين، المعلمة بانتظارك 👩‍🏫`;
            msgs.push({ fam: fid, key: `rem${T}:${k}:${s.key}`, to: toKid(k), title: T === 10 ? "🦜 حصتك بعد 10 دقائق!" : `🦜 حصتك ${when}`, body: kidBody });
            msgs.push({ fam: fid, key: `remg${T}:${k}:${s.key}`, to: (x: any) => toGuard(k)(x) && x.role === "guardian", title: `⏰ حصة ${name} ${when}`, body: `الحصة الساعة ${hhmm(s.t)}.${T === 10 ? " تأكد إنه دخل الحصة." : " تأكد إنه جاهز ومعه الآيباد."}` });
          }
        }
        const attended = (f.attendance || []).some((a: any) => a.kid === k && a.slot === s.key);
        if (!attended && mins <= -OPEN_AFTER && mins > -OPEN_AFTER - 90)
          msgs.push({ fam: fid, key: `miss:${k}:${s.key}`, to: toGuard(k), title: `❌ ${name} غاب عن حصته`, body: `حصة ${hhmm(s.t)} انتهى وقتها بدون حضور، وانخصمت قيمتها من الرصيد.` });
      }
      for (const a of (f.attendance || []).filter((a: any) => a.kid === k && a.at && nowMs - Date.parse(a.at) < 3 * 3600e3)) {
        const rep = (f.reports || []).find((r: any) => r.kid === k && r.slot === a.slot);
        msgs.push({ fam: fid, key: `att:${k}:${a.slot}`, to: toGuard(k), title: `✅ ${name} حضر حصته`, body: `${a.title || "الحصة"}${rep ? ` · النتيجة ${rep.score}%${rep.talkPct != null ? ` · تكلّم ${rep.talkPct}%` : ""}` : ""}. افتح التقرير من هدهد.` });
      }
      for (const c of (f.cheers[k] || []).filter((c: any) => nowMs - Date.parse(c.at) < 3600e3))
        msgs.push({ fam: fid, key: `cheer:${c.id}`, to: toKid(k), title: `💌 رسالة من ${c.from || "ولي أمرك"}`, body: c.text });
      const lf = f.livefeed[k] || null;
      if (lf && lf.start && !lf.done && nowMs - lf.start < 20 * 60e3)
        msgs.push({ fam: fid, key: `live:${k}:${lf.start}`, to: (s: any) => toGuard(k)(s) && s.role === "guardian", title: `🔴 ${name} في الحصة الآن`, body: "افتح هدهد وشاهد المحادثة مباشرة، وأرسل له تشجيع 💪" });
    }
  }
  if (!msgs.length) return Response.json({ sent: 0 });
  const { data: done } = await sb.from("tk_push_log").select("key").in("key", msgs.map((m) => m.fam + "|" + m.key));
  const already = new Set((done || []).map((d: any) => d.key));
  let sent = 0;
  for (const m of msgs) {
    const lk = m.fam + "|" + m.key; if (already.has(lk)) continue;
    const { error } = await sb.from("tk_push_log").insert({ key: lk }); if (error) continue; // another run took it
    const eps = new Set<string>();
    for (const s of (subs || []).filter(m.to)) {
      if (eps.has(s.endpoint)) continue; eps.add(s.endpoint);
      try { await webpush.sendNotification(s.sub, JSON.stringify({ title: m.title, body: m.body, url: m.url || APP, tag: m.key }), { TTL: 3600 }); sent++; }
      catch (e: any) { if (e && (e.statusCode === 404 || e.statusCode === 410)) await sb.from("tk_push_subs").delete().eq("endpoint", s.endpoint); }
    }
  }
  await sb.from("tk_push_log").delete().lt("created_at", new Date(nowMs - 3 * 864e5).toISOString());
  return Response.json({ sent, candidates: msgs.length });
}
