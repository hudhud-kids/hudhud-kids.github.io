import { splitTags, tagStream, tidy, tagNudge, isOurToolResult } from "./relay_fns.ts";
let fails = 0; const ck = (n: string, ok: boolean, x?: any) => { console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(x)); if (!ok) fails++; };
const sse = (e: string, d: any) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;
function stream(blocks: any[], opts: any = {}) { // blocks: [{type:'text',parts:[...]} | {type:'thinking'} | {type:'tool_use'}]
  let s = sse("message_start", { type: "message_start", message: { id: "m", role: "assistant", content: [], usage: {} } });
  blocks.forEach((b, i) => {
    if (b.type === "text") { s += sse("content_block_start", { type: "content_block_start", index: i, content_block: { type: "text", text: "" } });
      for (const p of b.parts) s += sse("content_block_delta", { type: "content_block_delta", index: i, delta: { type: "text_delta", text: p } }); }
    else if (b.type === "thinking") { s += sse("content_block_start", { type: "content_block_start", index: i, content_block: { type: "thinking", thinking: "" } }); s += sse("content_block_delta", { type: "content_block_delta", index: i, delta: { type: "thinking_delta", thinking: "hmm" } }); }
    else if (b.type === "tool_use") { s += sse("content_block_start", { type: "content_block_start", index: i, content_block: { type: "tool_use", id: "toolu_01abc", name: "lesson_event", input: {} } }); s += sse("content_block_delta", { type: "content_block_delta", index: i, delta: { type: "input_json_delta", partial_json: '{"tags":"[GOT]"}' } }); }
    s += sse("content_block_stop", { type: "content_block_stop", index: i }); });
  s += sse("message_delta", { type: "message_delta", delta: { stop_reason: opts.stop || "end_turn" }, usage: { output_tokens: 5 } }) + sse("message_stop", { type: "message_stop" });
  return s;
}
async function run(raw: string, chunk = 0) {
  const enc = new TextEncoder(); const bytes = enc.encode(raw); const parts: Uint8Array[] = [];
  if (!chunk) parts.push(bytes); else for (let i = 0; i < bytes.length; i += chunk) parts.push(bytes.slice(i, i + chunk));
  const rs = new ReadableStream({ start(c) { parts.forEach(p => c.enqueue(p)); c.close(); } });
  const out = await new Response(rs.pipeThrough(tagStream())).text(); let say = "", tags = "", stop = "", tools: any[] = [];
  for (const b of out.split("\n\n")) { const l = b.split("\n").find(x => x.startsWith("data:")); if (!l) continue; const d = JSON.parse(l.slice(5));
    if (d.delta?.type === "text_delta") say += d.delta.text; if (d.delta?.partial_json) tags += d.delta.partial_json; if (d.type === "message_delta") stop = d.delta.stop_reason;
    if (d.type === "content_block_start" && d.content_block.type === "tool_use") tools.push(d.content_block.id); }
  return { say, tags, stop, tools, out };
}
const A = async () => {
  // 1 normal
  let r = await run(stream([{ type: "text", parts: ["Great job, Ahmed! ", "What do you like?\n[GOT] [NEXT]\n[MOOD:happy]"] }]));
  ck("normal: spoken without tags, tags in tool_use, stop=tool_use", r.say.trim() === "Great job, Ahmed! What do you like?" && /GOT/.test(r.tags) && r.stop === "tool_use", r);
  // 2 tag split across SSE chunks at every byte size
  for (const n of [1, 3, 7, 50]) { r = await run(stream([{ type: "text", parts: ["Nice!", " What is it?\n[GO", "T] [NE", "XT]\n[MOOD:ha", "ppy]"] }]), n);
    ck(`tag split across chunks (chunk=${n})`, r.say.trim() === "Nice! What is it?" && /GOT/.test(r.tags) && /NEXT/.test(r.tags) && /MOOD:happy/.test(r.tags), r); }
  // 3 thinking block before text
  r = await run(stream([{ type: "thinking" }, { type: "text", parts: ["Hello! Say hi.\n[MOOD:happy]"] }]));
  ck("thinking block + text", r.say.trim() === "Hello! Say hi." && /MOOD/.test(r.tags), r);
  // 4 two text blocks (tags in 1st)
  r = await run(stream([{ type: "text", parts: ["Good!\n[GOT]"] }, { type: "text", parts: [" Now say: I am happy.\n[MOOD:happy]"] }]));
  ck("two text blocks: all spoken text kept, tags merged", /Good!/.test(r.say) && /Now say: I am happy\./.test(r.say) && /GOT/.test(r.tags) && /MOOD/.test(r.tags), r);
  // 5 model calls the tool itself + our tags
  r = await run(stream([{ type: "text", parts: ["Nice work. Next?\n[MOOD:happy]"] }, { type: "tool_use" }]), 0);
  ck("model's own tool_use block: only ONE lesson_event reaches Deepgram (else double-call)", r.tools.length === 1, { tools: r.tools, stop: r.stop });
  r = await run(stream([{ type: "text", parts: ["Nice work. Next?"] }, { type: "tool_use" }]), 0);
  ck("model's own tool_use (no tags in text): its id is toolu_hh* so the follow-up tool_result is answered locally", r.tools.every(x => x.startsWith("toolu_hh")) , r.tools);
  // 6 bracket in plain text
  r = await run(stream([{ type: "text", parts: ["Say [pause] then count. Ready?\n[MOOD:happy]"] }]));
  ck("non-tag bracket [pause] is never read aloud", /Say\s+then count\. Ready\?/.test(r.say) && !/\[/.test(r.say), r.say);
  // 7 Arabic in spoken part is removed; [AR] tag preserved
  r = await run(stream([{ type: "text", parts: ["Say hello مرحبا to him.\n[AR:hello = مرحبا]\n[MOOD:happy]"] }]));
  ck("Arabic stripped from speech, [AR] kept in tags", !/[؀-ۿ]/.test(r.say) && /AR:hello/.test(r.tags), r);
  // 8 only tags (empty spoken)
  r = await run(stream([{ type: "text", parts: ["[GOT] [NEXT] [MOOD:happy]"] }]));
  ck("tags-only reply => a short neutral spoken line (never silence)", r.say.trim().length > 3, r);
  // 9 truncated at max_tokens mid tag
  r = await run(stream([{ type: "text", parts: ["Good try! Now say: I like it.\n[GOT] [NEX"] }], { stop: "max_tokens" }));
  ck("max_tokens mid-tag: spoken ok", r.say.trim() === "Good try! Now say: I like it.", r);
  // 10 no tags at all
  r = await run(stream([{ type: "text", parts: ["Good try! What next?"] }]));
  ck("no tags: spoken kept, stop_reason end_turn", r.say.trim() === "Good try! What next?" && r.stop === "end_turn", r);
  // 11 tags BEFORE the spoken text
  r = await run(stream([{ type: "text", parts: ["[GOT] [STAR] Great! Now tell me more.\n[MOOD:happy]"] }]));
  ck("tag first then speech: speech not lost", /Great! Now tell me more\./.test(r.say) && /GOT/.test(r.tags), r);
  // 13 spaces/word glue between held part and earlier text
  r = await run(stream([{ type: "text", parts: ["Great", "! What", " is it?[GOT]"] }]));
  ck("tag glued to the last word", r.say.trim() === "Great! What is it?", r.say);
  // 14 Arabic number/Eastern digits? and emoji left in speech
  // splitTags
  ck("splitTags ignores [BOARD:..|..] pipe", splitTags("Look! [BOARD:giraffe|🦒|زرافة] [MOOD:happy]").tags.includes("BOARD"));
  const a = splitTags("Say [FIX:I play|I played|tip] now"); ck("splitTags mid-text tag keeps both sides", a.spoken === "Say now", a);
  ck("splitTags: unknown tag [HINT:x] is not read aloud", !splitTags("Try [HINT:go] now").spoken.includes("[HINT"), splitTags("Try [HINT:go] now"));
  ck("splitTags: lower-case [mood:happy] handled", splitTags("Hi [mood:happy]").tags !== "");
  // tidy
  let b: any = tidy({ system: "S", messages: [{ role: "assistant", content: "Hi" }, { role: "user", content: "x" }, { role: "user", content: "y" }, { role: "assistant", content: "ok" }] });
  ck("tidy: starts with user, merges same roles, ends with user", b.messages[0].role === "user" && b.messages.length >= 3 && b.messages[b.messages.length - 1].role === "user", b.messages.map((m: any) => m.role));
  b = tidy({ system: [{ type: "text", text: "A" }, { type: "text", text: "B" }], messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }, { role: "assistant", content: [{ type: "text", text: "Hello" }, { type: "tool_use", id: "toolu_hh1", name: "lesson_event", input: { tags: "[GOT]" } }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_hh1", content: "ok" }] }] });
  ck("tidy: tool_use/tool_result pair kept", b.messages.length === 3 && isOurToolResult(b), b.messages.map((m: any) => m.role));
  // tool_result for a later turn where Deepgram merges next user text into same user message as tool_result
  const mixed: any = { messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_hh1", content: "ok" }, { type: "text", text: "I like football" }] }] };
  ck("tool_result + new child text in ONE user message is NOT swallowed as empty turn", !isOurToolResult(mixed), "isOurToolResult requires every block to be a tool_result: ok");
  // tagNudge
  b = tidy({ messages: [{ role: "user", content: "hi" }, { role: "assistant", content: [{ type: "text", text: "Hello!" }] }, { role: "user", content: "I like football" }] }); tagNudge(b);
  ck("tagNudge: adds tag line to old assistant text and reminder to last user msg", /\[MOOD/.test(b.messages[1].content[0].text) && b.messages[2].content.some((c: any) => /App reminder/.test(c.text)), b.messages);
  // orphan tool_result with no preceding tool_use (after history trimming / context injection)
  b = tidy({ messages: [{ role: "assistant", content: [{ type: "text", text: "Hi" }, { type: "tool_use", id: "toolu_hh9", name: "lesson_event", input: { tags: "[GOT]" } }] }, { role: "user", content: [{ type: "text", text: "yes" }] }] });
  ck("tidy: assistant tool_use not followed by tool_result (Anthropic 400)", !(b.messages.some((m: any) => m.role === "assistant" && Array.isArray(m.content) && m.content.some((c: any) => c.type === "tool_use")) && !(b.messages[b.messages.indexOf(b.messages.find((m: any) => m.role === "assistant")) + 1].content.some((c: any) => c.type === "tool_result"))), JSON.stringify(b.messages).slice(0, 300));
  try { isOurToolResult({}); ck("isOurToolResult({}) does not throw", true); } catch (e) { ck("isOurToolResult with no messages does not throw", false, String(e)); }
  console.log(fails ? "RELAY FAILS: " + fails : "RELAY ALL PASS"); };
A();
