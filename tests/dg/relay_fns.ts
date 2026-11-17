const LLM_MODEL = "claude-sonnet-5-5";
const AR = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+/g;
const TAG = /\[(MOOD|BOARD|FIX|AR|STAGE|END|GOAL|NEXT|GOT|EXIT|STAR|FLAG|REC|CHOICE|ORDER)\b[^\]]*\]/gi;
export function splitTags(t: string) {
  const tags = (t.match(TAG) || []).join(" ");
  const spoken = t.replace(TAG, " ").replace(/\[[^\]]{0,80}\]/g, " ").replace(/\[[^\]]*$/, "").replace(/[*_#`~]+/g, "").replace(AR, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim();
  return { spoken, tags };
}
// the answer to our own lesson_event call needs no model: an empty turn (the teacher already spoke)
export function isOurToolResult(body: any) {
  const ms = Array.isArray(body && body.messages) ? body.messages : []; const m = ms[ms.length - 1]; if (!m || m.role !== "user" || !Array.isArray(m.content)) return false;
  return m.content.length > 0 && m.content.every((c: any) => c.type === "tool_result" && String(c.tool_use_id || "").startsWith("toolu_hh"));
}
export function emptyTurn(stream: boolean) {
  const id = "msg_hh" + Date.now();
  if (!stream) return new Response(JSON.stringify({ id, type: "message", role: "assistant", model: LLM_MODEL, content: [], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } }), { status: 200, headers: { "content-type": "application/json" } });
  const ev = (e: string, d: unknown) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;
  const s = ev("message_start", { type: "message_start", message: { id, type: "message", role: "assistant", model: LLM_MODEL, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } })
    + ev("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 0 } }) + ev("message_stop", { type: "message_stop" });
  return new Response(s, { status: 200, headers: { "content-type": "text/event-stream" } });
}
/* rewrites the Anthropic event stream: text is passed on without tags/Arabic (held back from the first "[" to the end),
   and the tags are added as a tool_use block "lesson_event" with stop_reason "tool_use" */
export function tagStream() {
  const enc = new TextEncoder(), dec = new TextDecoder(); let buf = "", held = "", textIdx = -1, maxIdx = -1, sentAny = false; const skip = new Set<number>();
  const ev = (e: string, d: unknown) => enc.encode(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`);
  const clean = (t: string) => t.replace(AR, " ");
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctl) {
      buf += dec.decode(chunk, { stream: true }); let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const raw = buf.slice(0, i); buf = buf.slice(i + 2);
        const line = raw.split("\n").find((l) => l.startsWith("data:")); if (!line) continue;
        let d: any; try { d = JSON.parse(line.slice(5).trim()); } catch { continue; }
        const name = d.type;
        if (typeof d.index === "number") maxIdx = Math.max(maxIdx, d.index);
        if (name === "content_block_start" && d.content_block?.type === "text") { textIdx = d.index; ctl.enqueue(ev(name, d)); continue; }
        if (name === "content_block_start" && d.content_block?.type === "tool_use") { skip.add(d.index); continue; }
        if ((name === "content_block_delta" || name === "content_block_stop") && skip.has(d.index)) continue;
        if (name === "content_block_delta" && d.delta?.type === "text_delta" && d.index === textIdx) {
          let t: string = d.delta.text || "";
          if (held || t.includes("[")) { const k = held ? 0 : t.indexOf("["); const now = t.slice(0, k); held += t.slice(k); t = now; }
          t = clean(t); if (t) { sentAny = true; ctl.enqueue(ev(name, { ...d, delta: { type: "text_delta", text: t } })); }
          continue;
        }
        if (name === "content_block_stop" && d.index === textIdx) {
          const { spoken, tags } = splitTags(held);
          // nothing to say at all (only tags, or only Arabic): a short neutral line, so the child is never left in silence
          const say = spoken || (sentAny ? "" : (tags ? "Great, let's go on!" : "Sorry, can you say that again?"));
          if (say) { sentAny = true; ctl.enqueue(ev("content_block_delta", { type: "content_block_delta", index: textIdx, delta: { type: "text_delta", text: (spoken && sentAny ? " " : "") + say } })); }
          ctl.enqueue(ev(name, d)); held = tags; continue; // held now = the tags to hand over
        }
        if (name === "message_delta" && !held && skip.size && d.delta?.stop_reason === "tool_use") { ctl.enqueue(ev(name, { ...d, delta: { ...d.delta, stop_reason: "end_turn" } })); continue; }
        if (name === "message_delta" && held) {
          const idx = maxIdx + 1, id = "toolu_hh" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
          ctl.enqueue(ev("content_block_start", { type: "content_block_start", index: idx, content_block: { type: "tool_use", id, name: "lesson_event", input: {} } }));
          ctl.enqueue(ev("content_block_delta", { type: "content_block_delta", index: idx, delta: { type: "input_json_delta", partial_json: JSON.stringify({ tags: held }) } }));
          ctl.enqueue(ev("content_block_stop", { type: "content_block_stop", index: idx }));
          held = ""; ctl.enqueue(ev(name, { ...d, delta: { ...d.delta, stop_reason: "tool_use" } })); continue;
        }
        ctl.enqueue(ev(name, d));
      }
    },
  });
}

/* Deepgram builds the request; make it one the Messages API accepts: system text in "system", no empty turns,
   roles alternating, starting with the user and ending with the user (newer models refuse a final assistant "prefill") */
export function tidy(body: any) {
  const sys: string[] = []; if (typeof body.system === "string" && body.system) sys.push(body.system);
  else if (Array.isArray(body.system)) body.system.forEach((x: any) => x && x.text && sys.push(x.text));
  const out: any[] = [];
  for (const m of body.messages || []) {
    if (!m) continue;
    if (m.role === "system") { const t = typeof m.content === "string" ? m.content : (m.content || []).map((c: any) => c.text || "").join(" "); if (t) sys.push(t); continue; }
    let c = m.content; if (typeof c === "string") { if (!c.trim()) continue; c = [{ type: "text", text: c }]; }
    c = (c || []).filter((x: any) => x && !(x.type === "text" && !String(x.text || "").trim())); if (!c.length) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content = last.content.concat(c); else out.push({ role: m.role === "assistant" ? "assistant" : "user", content: c });
  }
  // a tool_use must be answered by a tool_result in the next message (and the other way round), or the API refuses
  for (let i = 0; i < out.length; i++) {
    const m = out[i];
    if (m.role === "assistant") { const nx = out[i + 1]; const ids = new Set((nx && nx.role === "user" ? nx.content : []).filter((c: any) => c.type === "tool_result").map((c: any) => c.tool_use_id));
      m.content = m.content.filter((c: any) => c.type !== "tool_use" || ids.has(c.id)); }
    else { const pv = out[i - 1]; const ids = new Set((pv && pv.role === "assistant" ? pv.content : []).filter((c: any) => c.type === "tool_use").map((c: any) => c.id));
      m.content = m.content.filter((c: any) => c.type !== "tool_result" || ids.has(c.tool_use_id)); }
  }
  for (let i = out.length - 1; i >= 0; i--) if (!out[i].content.length) out.splice(i, 1);
  for (let i = out.length - 1; i > 0; i--) if (out[i].role === out[i - 1].role) { out[i - 1].content = out[i - 1].content.concat(out[i].content); out.splice(i, 1); }
  if (!out.length || out[0].role !== "user") out.unshift({ role: "user", content: [{ type: "text", text: "(The lesson starts.)" }] });
  if (out[out.length - 1].role === "assistant") out.push({ role: "user", content: [{ type: "text", text: "(continue)" }] });
  body.messages = out; if (sys.length) body.system = sys.join("\n\n");
  delete body.temperature; delete body.top_p; delete body.top_k;
  return body;
}

/* Voice mode: the voice never reads the tags, so the model's own earlier replies come back WITHOUT them and it copies that
   and stops writing tags (the slides then stop moving). Show it its past replies with a tag line, and remind it in the
   newest message. */
export function tagNudge(body: any) {
  const ms = body.messages || [];
  for (const m of ms) {
    if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
    const t = [...m.content].reverse().find((c: any) => c.type === "text");
    if (t && !/\[[A-Z]+/.test(t.text)) t.text = String(t.text).trimEnd() + "\n[MOOD:happy]";
  }
  const last = ms[ms.length - 1];
  if (last && last.role === "user" && Array.isArray(last.content) && !last.content.some((c: any) => c.type === "tool_result"))
    last.content.push({ type: "text", text: "(App reminder: after your short spoken reply, write your tags on new lines: [GOT] once for each target expression the child used correctly (one expression = one [GOT]), [STAR] for an especially good answer, [NEXT] when this step is finished, [CHOICE:...] or [ORDER:...] when useful, and always [MOOD:...] last. Follow CURRENT STATUS.)" });
  return body;
}

/* thinking limits for the 5.x models: thinking counts inside max_tokens, so a short reply could come back empty */
export function thinkDefaults(b: any) {
  if (b.thinking || b.output_config) return b; const m = String(b.model || "");
  if (/haiku-5/.test(m)) { b.thinking = { type: "disabled" }; b.output_config = { effort: "medium" }; }
  else if (/sonnet-5/.test(m)) { b.thinking = { type: "between_tools" }; b.output_config = { effort: "high" }; }
  else if (/(opus|fable)-5/.test(m)) { b.output_config = { effort: "low" }; b.max_tokens = Math.min(4000, (Number(b.max_tokens) || 1000) + 1500); }
  return b;
}
/* the voice prompt = fixed rules + a status line that changes every 30 s: cache the fixed part */
export function cacheSystem(b: any) {
  if (typeof b.system !== "string") return b; const i = b.system.lastIndexOf("\nCURRENT STATUS:");
  if (i < 2000) return b;
  b.system = [{ type: "text", text: b.system.slice(0, i), cache_control: { type: "ephemeral" } }, { type: "text", text: b.system.slice(i + 1) }];
  return b;
}
