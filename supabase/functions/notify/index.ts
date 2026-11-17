// Hudhud notifier: runs every minute (pg_cron -> pg_net). Sends lesson reminders, absence/attendance alerts,
// cheers and "lesson started" pushes. Riyadh time (UTC+3, no DST).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
let vapidOk = false;
const TZ = 3 * 3600e3, OPEN_AFTER = 30, APP = "https://hudhud-kids.github.io/";
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
// AI relay watchdog: the "ai" function must answer a request with an unknown session with 401 JSON within 5 s
// (that exercises the function and its database lookup without spending anything). State lives in tk_health (schema_8).
// Returns true when the family admins should be told now: 3 failures in a row, at most one alert per hour.
// With env HH_HEALTH_SECRET it also calls POST /ai/health (DEPLOY_10), which runs the real path's service-role reads
// (tk_sessions, tk_rows apiKey, tk_ai_usage): a non-200 or ok:false is a failure, and tk_health.detail names the failing checks.
// Without the env the watchdog behaves exactly as before (bad-session check only).
export async function relayDown(nowMs: number, db: any = sb, f: typeof fetch = fetch, base = Deno.env.get("SUPABASE_URL")!, secret = Deno.env.get("HH_HEALTH_SECRET") || ""): Promise<{ alert: boolean; stamp: string }> {
  let ok = false, detail = "";
  try {
    const r = await f(base + "/functions/v1/ai/claude", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: "00000000-0000-0000-0000-000000000000", body: {} }), signal: AbortSignal.timeout(5000) });
    const txt = await r.text(); let j: any = null; try { j = JSON.parse(txt); } catch { /* not JSON */ }
    ok = r.status === 401 && !!j && j.error === "bad_session";
    if (!ok) detail = `status ${r.status}: ${txt.slice(0, 120)}`;
  } catch (e) { detail = String((e && (e as any).message) || e).slice(0, 160); }
  if (secret) {
    let hd = "";
    try {
      const r = await f(base + "/functions/v1/ai/health", { method: "POST", headers: { "content-type": "application/json", "x-hh-health": secret },
        body: "{}", signal: AbortSignal.timeout(8000) });
      const txt = await r.text(); let j: any = null; try { j = JSON.parse(txt); } catch { /* not JSON */ }
      if (r.status !== 200) hd = `health status ${r.status}`;
      else if (!j || j.ok !== true) {
        const bad = j && j.checks && typeof j.checks === "object" ? Object.keys(j.checks).filter((k) => j.checks[k] === false) : [];
        hd = "health failed: " + (bad.length ? bad.join(",") : "bad answer");
      }
    } catch (e) { hd = "health: " + String((e && (e as any).message) || e).slice(0, 120); }
    if (hd) { ok = false; detail = detail ? detail.slice(0, 160) + " | " + hd : hd; }
  }
  const now = new Date(nowMs).toISOString();
  const { data: cur, error } = await db.from("tk_health").select("*").eq("id", "ai").maybeSingle();
  if (error) return { alert: false, stamp: "" }; // table missing (schema_8 not applied yet): the watchdog stays quiet
  if (ok) { if (!cur || cur.fails) await db.from("tk_health").upsert({ id: "ai", fails: 0, last_ok: now, detail: "" }); else if (!cur.last_ok || nowMs - Date.parse(cur.last_ok) > 10 * 60e3) await db.from("tk_health").update({ last_ok: now }).eq("id", "ai"); return { alert: false, stamp: "" }; }
  const fails = ((cur && cur.fails) || 0) + 1;
  const due = fails >= 3 && (!cur || !cur.last_alert || nowMs - Date.parse(cur.last_alert) >= 3600e3);
  await db.from("tk_health").upsert({ id: "ai", fails, last_fail: now, detail, last_ok: cur ? cur.last_ok : null, last_alert: due ? now : (cur ? cur.last_alert : null) });
  return { alert: due, stamp: now.slice(0, 13) };
}
async function run() {
  if (!vapidOk) { webpush.setVapidDetails("mailto:info@sahla-sa.com", Deno.env.get("VAPID_PUBLIC")!, Deno.env.get("VAPID_PRIVATE")!); vapidOk = true; }
  const nowMs = Date.now(), now = toLocal(nowMs);
  const { data: rows, error: e1 } = await sb.from("tk_rows").select("family_id,path,value,updated_at").or("path.like.kids/%,path.like.sched/%,path.like.guardians/%,path.like.cheers/%,path.like.livefeed/%,path.like.progress/%,path.like.balance/%,path.like.prices/%,path.like.live/%,path.eq.perLesson,path.eq.attendance,path.eq.reports");
  if (e1) throw new Error("rows: " + e1.message);
  const { data: subs, error: e2 } = await sb.from("tk_push_subs").select("*"); if (e2) throw new Error("subs: " + e2.message);
  let down = { alert: false, stamp: "" }; try { down = await relayDown(nowMs); } catch (_e) { /* the watchdog must never stop the reminders */ }
  let deep = { alert: false, stamp: "", why: "" }; try { deep = await selfTestTick(nowMs); } catch (_e) { /* never stops the reminders */ }
  const fam: Record<string, any> = {};
  for (const r of rows || []) { const f = fam[r.family_id] = fam[r.family_id] || { kids: {}, sched: {}, guardians: {}, cheers: {}, livefeed: {}, progress: {}, balance: {}, prices: {}, live: {}, perLesson: 10, attendance: [], reports: [] };
    const [top, sub] = r.path.split("/"); if (sub === "") continue;
    if (sub === undefined) f[top] = r.value; else f[top][sub] = r.value; }
  const msgs: { fam: string; key: string; to: (s: any) => boolean; title: string; body: string; url?: string }[] = [];
  for (const [fid, f] of Object.entries(fam)) {
    const gOf = (k: string) => Object.values(f.guardians).filter((g: any) => g && (g.kids || []).includes(k)).map((g: any) => g.id);
    const toKid = (k: string) => (s: any) => s.family_id === fid && s.role === "kid" && s.kid_id === k;
    const toGuard = (k: string) => { const gs = gOf(k); return (s: any) => s.family_id === fid && ((s.role === "guardian" && gs.includes(s.kid_id)) || s.role === "parent"); };
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yday = new Date(today.getTime() - 864e5);
    const toG1 = (k: string) => (x: any) => toGuard(k)(x) && (x.role === "guardian" || gOf(k).length === 0);
    const dow = now.getUTCDay(), hr = now.getUTCHours(), mn = now.getUTCMinutes(), dkey = keyOf(today).slice(0, 10);
    // siblings challenge result: Sunday 09:00 Riyadh, for the week Sunday..Saturday that just ended
    const activeKids = Object.entries<any>(f.kids).filter(([_, v]) => v && typeof v === "object" && !v.needPlace).map(([k]) => k);
    if (dow === 0 && hr === 9 && mn < 10 && activeKids.length >= 2) {
      const we = today.getTime() - TZ, ws = we - 7 * 864e5;
      const sc = activeKids.map((k) => ({ k, xp: ((f.progress[k] || {}).xpLog || []).filter((x: any) => x[0] >= ws && x[0] < we).reduce((a: number, x: any) => a + x[1], 0) })).sort((a, b) => b.xp - a.xp);
      if (sc[0].xp > 0) {
        const win = sc.filter((x) => x.xp === sc[0].xp).map((x) => x.k), nm = (k: string) => (f.kids[k].ar || f.kids[k].en || k);
        const wn = win.map(nm).join(" و ");
        for (const x of sc) {
          const won = win.includes(x.k);
          msgs.push({ fam: fid, key: `sib:${x.k}:${dkey}`, to: toKid(x.k), title: won ? "🏆 فزت بتحدي الإخوان!" : `⚔️ فاز ${wn} بتحدي الإخوان`, body: won ? `جمعت ${x.xp} نقطة الأسبوع الماضي. افتح هدهد واستلم كأسك الحصري 🎉` : `جمعت ${x.xp} نقطة. تحدي جديد بدأ اليوم، هالأسبوع فرصتك 💪` });
        }
        msgs.push({ fam: fid, key: `sibp:${dkey}`, to: (x: any) => x.family_id === fid && x.role === "parent", title: `⚔️ نتيجة تحدي الإخوان: ${wn}`, body: sc.map((x) => `${nm(x.k)} ${x.xp}`).join(" · ") + " نقطة" });
      }
    }
    for (const [k, kid] of Object.entries<any>(f.kids)) {
      if (!kid || typeof kid !== 'object') continue;
      const name = kid.ar || kid.en || k;
      const slots = [...slotsOn(f.sched[k], yday), ...slotsOn(f.sched[k], today)];
      const priceAt = (t: Date) => { let pr = Number(f.perLesson) || 10; for (const x of (f.prices[k] || [])) if (parseLocal(String(x.from).slice(0, 16).replace("Z", "")) <= t) pr = Number(x.price) || pr; return pr; };
      // money already used by lessons before a slot (attended, or ended without attendance), like the app's ledger
      const usedBefore = (t: Date) => { const sc = f.sched[k]; if (!sc || !sc.periods || !sc.periods.length) return 0; let used = 0;
        const start = parseLocal(sc.periods[0].from); const d0 = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
        const attSet = new Set((f.attendance || []).filter((a: any) => a.kid === k).map((a: any) => a.slot));
        for (let d = d0; d <= t; d = new Date(d.getTime() + 864e5)) for (const x of slotsOn(sc, d)) { if (x.t >= t) continue;
          if (attSet.has(x.key) || (now.getTime() - x.t.getTime()) / 60e3 > OPEN_AFTER) used += priceAt(x.t); }
        return used; };
      const bal = Number(f.balance[k]); const payable = (t: Date) => !isFinite(bal) || usedBefore(t) + priceAt(t) <= bal;
      for (const s of slots) {
        const mins = (s.t.getTime() - now.getTime()) / 60e3;
        if (!payable(s.t)) continue; // balance finished: no reminders and no "absent" alerts
        for (const T of [60, 30, 10]) {
          if (mins > 0 && mins <= T && mins > T - 8) {
            const when = T === 60 ? "بعد ساعة" : T === 30 ? "بعد نص ساعة" : "بعد 10 دقائق";
            const kidBody = T === 60 ? `يا ${name}، حصتك ${when} الساعة ${hhmm(s.t)}. جهّز الآيباد والسماعة 🎧`
              : T === 30 ? `يا ${name}، باقي نص ساعة على حصتك. راجع كلمات «حضّر لدرسك القادم» 📚`
              : `يا ${name}، حصتك تبدأ الساعة ${hhmm(s.t)}. ادخل الحين، المعلمة بانتظارك 👩‍🏫`;
            msgs.push({ fam: fid, key: `rem${T}:${k}:${s.key}`, to: toKid(k), title: T === 10 ? "🦜 حصتك بعد 10 دقائق!" : `🦜 حصتك ${when}`, body: kidBody });
            msgs.push({ fam: fid, key: `remg${T}:${k}:${s.key}`, to: (x: any) => toGuard(k)(x) && (x.role === "guardian" || gOf(k).length === 0), title: `⏰ حصة ${name} ${when}`, body: `الحصة الساعة ${hhmm(s.t)}.${T === 10 ? " تأكد إنه دخل الحصة." : " تأكد إنه جاهز ومعه الآيباد."}` });
          }
        }
        const attended = (f.attendance || []).some((a: any) => a.kid === k && a.slot === s.key);
        const inClass = f.live[k] && f.live[k].slot === s.key && nowMs - Date.parse(f.live[k].startedAt) < 60 * 60e3;
        if (!attended && !inClass && mins <= -60 && mins > -150)
          msgs.push({ fam: fid, key: `miss:${k}:${s.key}`, to: toGuard(k), title: `❌ ${name} غاب عن حصته`, body: `حصة ${hhmm(s.t)} انتهى وقتها بدون حضور، وانخصمت قيمتها من الرصيد.` });
      }
      for (const a of (f.attendance || []).filter((a: any) => a.kid === k && a.at && nowMs - Date.parse(a.at) < 3 * 3600e3)) {
        const rep = (f.reports || []).find((r: any) => r.kid === k && r.slot === a.slot);
        msgs.push({ fam: fid, key: `att:${k}:${a.slot}`, to: toGuard(k), title: `✅ ${name} حضر حصته`, body: `${a.title || "الحصة"}${rep ? ` · النتيجة ${rep.score}%${rep.talkPct != null ? ` · تكلّم ${rep.talkPct}%` : ""}` : ""}. افتح التقرير من هدهد.` });
      }
      for (const c of (f.cheers[k] || []).filter((c: any) => nowMs - Date.parse(c.at) < 3600e3))
        msgs.push({ fam: fid, key: `cheer:${c.id}`, to: toKid(k), title: `💌 رسالة من ${c.from || "ولي أمرك"}`, body: c.text });
      // weekly report: Thursday 20:00 Riyadh, last 7 days vs the 7 before
      if (dow === 4 && hr === 20 && mn < 10) {
        const end = nowMs, start = end - 7 * 864e5, pst = start - 7 * 864e5, inR = (t: number, a: number, b: number) => t >= a && t < b;
        const att = (f.attendance || []).filter((a: any) => a.kid === k && a.at && inR(Date.parse(a.at), start, end)).length;
        let sched = 0; for (let i = 0; i < 8; i++) for (const s of slotsOn(f.sched[k], new Date(today.getTime() - i * 864e5))) { const t = s.t.getTime() - TZ; if (inR(t, start, end) && t + OPEN_AFTER * 60e3 < nowMs) sched++; }
        sched = Math.max(sched, att);
        const reps = (f.reports || []).filter((r: any) => r.kid === k && inR(Date.parse(r.at), start, end)), prev = (f.reports || []).filter((r: any) => r.kid === k && inR(Date.parse(r.at), pst, start));
        const avg = (a: any[]) => a.length ? Math.round(a.reduce((s, r) => s + (r.score || 0), 0) / a.length) : null;
        const av = avg(reps), pv = avg(prev), cnt: Record<string, any> = {};
        reps.forEach((r: any) => (r.mistakes || []).forEach((m: any) => { const key = String(m.right || "").trim(); if (!key) return; cnt[key] = cnt[key] || { wrong: m.wrong, right: key, n: 0 }; cnt[key].n++; }));
        const top = Object.values(cnt).sort((a: any, b: any) => b.n - a.n).slice(0, 3) as any[];
        if (sched || reps.length) {
          const parts = [`حضر ${att} من ${sched}`];
          if (av != null) parts.push(`المعدل ${av}%${pv != null ? ` (${av - pv >= 0 ? "+" : ""}${av - pv})` : ""}`);
          const body = parts.join(" · ") + (top.length ? `\nأكثر الأخطاء: ${top.map((m) => m.right).join(" | ")}` : "\nما تكررت أخطاء 👏");
          msgs.push({ fam: fid, key: `wk:${k}:${dkey}`, to: toG1(k), title: `📊 تقرير ${name} الأسبوعي`, body });
        }
      }
      const lf = f.livefeed[k] || null;
      if (lf && lf.start && !lf.done && nowMs - lf.start < 20 * 60e3)
        msgs.push({ fam: fid, key: `live:${k}:${lf.start}`, to: (s: any) => toGuard(k)(s) && s.role === "guardian", title: `🔴 ${name} في الحصة الآن`, body: "افتح هدهد وشاهد المحادثة مباشرة، وأرسل له تشجيع 💪" });
    }
  }
  // new sign-up requests from the public join link -> the family's admin (parent)
  const { data: sus } = await sb.from("tk_signups").select("id,family_id,data,created_at").eq("status", "pending").gt("created_at", new Date(nowMs - 30 * 60e3).toISOString());
  for (const su of sus || []) {
    const d: any = (su.data && typeof su.data === "object") ? su.data : {}, names = (Array.isArray(d.kids) ? d.kids : []).map((k: any) => k && k.ar).filter(Boolean).map(String).join("، ");
    msgs.push({ fam: su.family_id, key: `signup:${su.id}`, to: (x: any) => x.family_id === su.family_id && x.role === "parent", title: "📥 طلب تسجيل جديد", body: `${d.g_name || "ولي أمر"} يبي يسجّل: ${names || "طفل"}. افتح لوحة الإدارة للقبول أو الرفض.` });
  }
  if (down.alert) {
    // every family's admin (parent) devices; the push log key allows one per family per hour
    for (const fid of new Set((subs || []).filter((s: any) => s.role === "parent").map((s: any) => s.family_id)))
      msgs.push({ fam: fid as string, key: `aidown:${down.stamp}`, to: (x: any) => x.family_id === fid && x.role === "parent", title: "⚠️ خدمة المعلمة متوقفة", body: "خدمة المعلمة ما ترد من 3 دقائق، والحصص ما تشتغل الآن. افتح لوحة الإدارة وتأكد من الخدمة." });
  }
  if (deep.alert) {
    for (const fid of new Set((subs || []).filter((s: any) => s.role === "parent").map((s: any) => s.family_id)))
      msgs.push({ fam: fid as string, key: `aideep:${deep.stamp}`, to: (x: any) => x.family_id === fid && x.role === "parent", title: "⚠️ فحص المعلم فشل", body: "الفحص التلقائي للحصة فشل مرتين: " + deep.why.slice(0, 120) });
  }
  // AI usage alert: once a day per child (and per family) when 80% and again at 100% of the daily cap, every 5 minutes
  if (now.getUTCMinutes() % 5 === 2) { try { for (const m of await usageAlerts(nowMs)) msgs.push(m); } catch (_e) { /* never stops the reminders */ } }
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

// Real end-to-end self test of the lesson path (POST /ai/selftest, needs HH_HEALTH_SECRET): every hour at minute 7, or at
// once when someone sets tk_health row "selftest".detail to "run" (from the SQL editor). Result JSON goes in that row's detail.
// Two failures in a row -> one push to the parents (at most every 6 hours).
export async function selfTestTick(nowMs: number, db: any = sb, f: typeof fetch = fetch, base = Deno.env.get("SUPABASE_URL")!, secret = Deno.env.get("HH_HEALTH_SECRET") || "") {
  const none = { alert: false, stamp: "", why: "" }; if (!secret) return none;
  const { data: cur, error } = await db.from("tk_health").select("*").eq("id", "selftest").maybeSingle(); if (error) return none;
  const asked = !!cur && /^run/.test(cur.detail || ""), hourly = new Date(nowMs).getUTCMinutes() === 7;
  if (!asked && !hourly) return none;
  let ok = false, detail = "";
  try {
    const r = await f(base + "/functions/v1/ai/selftest", { method: "POST", headers: { "content-type": "application/json", "x-hh-health": secret }, body: "{}", signal: AbortSignal.timeout(60000) });
    const txt = await r.text(); detail = txt.slice(0, 1800); let j: any = null; try { j = JSON.parse(txt); } catch { /* not JSON */ }
    ok = r.status === 200 && !!j && j.ok === true;
  } catch (e) { detail = "selftest: " + String((e as any)?.message || e).slice(0, 200); }
  const now = new Date(nowMs).toISOString();
  if (ok) { await db.from("tk_health").upsert({ id: "selftest", fails: 0, last_ok: now, detail, last_fail: cur ? cur.last_fail : null, last_alert: cur ? cur.last_alert : null }); return none; }
  const fails = (asked ? (cur.fails || 0) : ((cur && cur.fails) || 0)) + 1;
  const due = fails >= 2 && (!cur || !cur.last_alert || nowMs - Date.parse(cur.last_alert) >= 6 * 3600e3);
  await db.from("tk_health").upsert({ id: "selftest", fails, last_fail: now, detail, last_ok: cur ? cur.last_ok : null, last_alert: due ? now : (cur ? cur.last_alert : null) });
  let why = ""; try { const j = JSON.parse(detail); why = Object.entries(j.checks || {}).filter(([, v]: any) => !v.ok).map(([k, v]: any) => k + ": " + (v.why || "")).join(" | "); } catch { why = detail; }
  return { alert: due, stamp: now.slice(0, 13), why };
}

// Daily AI caps (same defaults as the relay; a family can override with the row "limits/@all").
// Returns parent pushes for every child / family at 80% or 100% of a cap today (Riyadh day); the push-log key keeps each one daily.
export const USE_DEF = { kidDay: 4000, famDay: 20000, kidTok: 6_000_000, famTok: 24_000_000 };
export async function usageAlerts(nowMs: number, db: any = sb) {
  const day = new Date(nowMs + TZ).toISOString().slice(0, 10), out: any[] = [];
  const { data: use } = await db.from("tk_ai_usage").select("family_id,kid_id,n,tok").eq("day", day);
  if (!use || !use.length) return out;
  const fams = [...new Set(use.map((u: any) => u.family_id))];
  const { data: rows } = await db.from("tk_rows").select("family_id,path,value").in("family_id", fams).or("path.eq.limits/@all,path.like.kids/%");
  const num = (x: any, d: number) => (Number(x) > 0 ? Number(x) : d);
  for (const fid of fams) {
    const lr = (rows || []).find((r: any) => r.family_id === fid && r.path === "limits/@all"), o: any = lr && lr.value && typeof lr.value === "object" ? lr.value : {};
    const lim = { kidDay: num(o.kidDay, USE_DEF.kidDay), famDay: num(o.famDay, USE_DEF.famDay), kidTok: num(o.kidTok, USE_DEF.kidTok), famTok: num(o.famTok, USE_DEF.famTok) };
    const nm = (k: string) => { const r = (rows || []).find((x: any) => x.family_id === fid && x.path === "kids/" + k); const v: any = r && r.value; return (v && (v.ar || v.en)) || k; };
    const toP = (x: any) => x.family_id === fid && x.role === "parent";
    const lvl = (p: number) => (p >= 1 ? 100 : p >= 0.8 ? 80 : 0);
    let fn = 0, ft = 0;
    for (const u of use.filter((x: any) => x.family_id === fid)) {
      fn += Number(u.n) || 0; ft += Number(u.tok) || 0;
      if (!u.kid_id || u.kid_id.startsWith("@")) continue;
      const pc = lvl(Math.max((Number(u.n) || 0) / lim.kidDay, (Number(u.tok) || 0) / lim.kidTok)); if (!pc) continue;
      out.push({ fam: fid, key: `use${pc}:${u.kid_id}:${day}`, to: toP, title: pc === 100 ? `⛔ حد المعلم اليومي اكتمل لـ${nm(u.kid_id)}` : `⚠️ ${nm(u.kid_id)}: 80% من حد المعلم اليومي`,
        body: pc === 100 ? "الحصص متوقفة لين بكرة." : "إذا اكتمل الحد تتوقف الحصص لين بكرة." });
    }
    const fp = lvl(Math.max(fn / lim.famDay, ft / lim.famTok));
    if (fp) out.push({ fam: fid, key: `usef${fp}:${day}`, to: toP, title: fp === 100 ? "⛔ العائلة وصلت حد استخدام المعلم اليوم" : "⚠️ العائلة استخدمت 80% من حد المعلم اليوم", body: fp === 100 ? "كل الحصص متوقفة لين بكرة." : "قرّبتوا من الحد اليومي للعائلة." });
  }
  return out;
}
