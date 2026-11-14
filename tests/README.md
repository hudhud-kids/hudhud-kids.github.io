# Pipeline tests

Browser tests (Playwright, Chromium) for the live-lesson pipeline in `index.html`. No network is needed: Claude, Azure
and Supabase are blocked and replaced by stubs inside the page.

    tests/run.sh                 # everything; exits non-zero on any failure
    tests/run.sh early resume    # only some tests
    PORT=9000 tests/run.sh       # another port (default 8781)
    VERBOSE=1 tests/run.sh warm  # full output
    SHOTS=/some/dir tests/run.sh messages health   # also write screenshots (5 screen sizes)

`run.sh` checks that the page script parses, starts `python3 -m http.server`, runs every `*.test.js` and prints a
summary. Playwright must be installed (locally or globally: `npm i -g playwright && npx playwright install chromium`).

| file | covers |
| --- | --- |
| `history.test.js` | stable history window, prompt cache keeps hitting |
| `warm.test.js` | speech recogniser + connection prepared in advance, token refresh, cleanup |
| `early.test.js` | mic opens during the teacher's last sentence, echo rule, kill switches, `lessonUtterance` contract |
| `saves.test.js` | debounced saves and paused cloud pulls during a lesson, flush at the end |
| `resume.test.js` | lesson snapshot, «تكمل حصتك؟», no double attendance |
| `messages.test.js` | ended session and no-internet messages, automatic retry |
| `health.test.js` | health counters, `healthSummary()`, `healthCardHTML()` |
| `stt-stream.test.js`, `stt-fail.test.js` | streaming recognition, end of turn, low confidence, REST fallback, typing fallback |
| `ack.test.js`, `first-sentence.test.js`, `turn.test.js`, `turn-end-words.test.js` | acknowledgement sound, first sentence, interrupt, latency, word rules |
| `loop.test.js` | 13 full turns with voice, at tablet and phone size |
| `formats.test.js` | whole lessons in every format at 4 levels |
| `placement.test.js` | placement routing simulation (`SIM_N=2000` for the full run), item banks, two-voice listening, probation |

Helpers: `h.js` (`open()` = demo child, nothing saved; `openReal()` = the same data stored in localStorage, so saving,
snapshots and reloads behave as in production; `check(name, ok)`), `mock.js` (scripted microphone and scripted Speech
SDK, documented at the top of the file).

Not covered here (needs real devices/services): echo cancellation on a real iPad speaker, the real Azure connection,
`sw.js`, and the Supabase functions.
