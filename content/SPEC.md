# Hudhud curriculum v2 — content spec (for content writers)

Hudhud is a one-to-one spoken-English platform for Saudi children (Arabic L1) taught by an AI voice teacher on an iPad.
Each level = 4 units × 6 lessons = 24 lessons (about 2 months at 3 lessons/week). A lesson is 25 minutes.

## What changed (v2)
A lesson is no longer free conversation around a sentence pattern. Every lesson follows a fixed 7-stage script shown
as slides beside the teacher (inspired by 51Talk "Classic English", improved for children and Saudi context):

1. Objective — one sentence "Today you will …".
2. Warm-up — one personal question about the topic.
3. Expressions — 6 words/expressions, each with a short English definition (simple, at level), Arabic meaning,
   and a sentence frame with a gap the child completes aloud with their own idea (e.g. "I have a fondness for ___.").
4. Model dialogue — two short parts (Part I, Part II) between two named characters (Saudi or international names),
   using the 6 expressions; one sentence in the dialogue is the FUNCTION sentence (the language function of the unit),
   given separately in `focus`; then 2 comprehension questions.
5. Speak out — a role-play situation (2–3 sentences, addressed to the child: "You and your friend …") and 3 questions
   the teacher asks in role, each with a hint telling the child what to say (not the answer itself).
6. Culture — a short "Around Saudi Arabia" or "Around the world" text as 3 bullet points + 2 opinion questions.
7. Exit — one prompt asking the child to say 2 sentences with today's function without help.

A UNIT = one topic + ONE language function (e.g. topic "Sports", function "expressing preferences").
Lessons 1–5 practise the same function in 5 different situations; lesson 6 is a bigger task that uses the whole unit.
Lessons 2–6 recycle 1–2 expressions from earlier lessons of the unit (they may appear again in frames/dialogue).
After lesson 6 there is a unit test.

## Rules
- English must be natural, correct and exactly at the level's CEFR (use Cambridge YLE / KET / PET / FCE / CAE / CPE
  wordlists and grammar as your guide). Not childish above level 6.
- Saudi-friendly and age-appropriate: no dating, alcohol, pork, gambling, horror, politics, religion debates. Saudi places,
  food, Eid, Ramadan, AlUla, Riyadh Season, football, family, school are welcome; also international culture.
- Gender-neutral wording for the child ("you"). Character names mixed (Faisal, Noura, Omar, Reem, Sam, Emma …).
- Levels 1–4: expressions are words or 2–3-word chunks with picture-friendly meanings, frames are very short,
  dialogues 4–6 short lines each part, culture points one short sentence each.
- Levels 9+: at least 3 of the 6 expressions must be multi-word (collocations, phrasal verbs, fixed phrases, idioms
  from B1+ upward).
- Definitions are in simple English at or below the level; `ar` is a short Arabic gloss.
- No emojis inside English text fields except `e` (unit emoji) and `emoji` fields.
- Keep each string short: definitions ≤ 14 words, dialogue lines ≤ 25 words (≤ 12 for levels 1–4).

## JSON shape of content/L{n}.json (write the whole file)
```json
{
  "level": 8, "cefr": "B1", "gse": "43-46", "exam": "Cambridge B1 Preliminary for Schools", "v": 2,
  "units": [
    {"t": "Sports and Free Time", "ar": "الرياضة ووقت الفراغ", "e": "⚽",
     "fn": "Expressing preferences", "fnAr": "التعبير عن التفضيل",
     "cando": "Can say which activities they prefer and give reasons and examples.",
     "grammar": ["prefer + -ing / to", "would rather + base verb"],
     "lessons": [
       ["My Favourite Sport", "Express your preference for a sport and explain why", "I prefer … to … because … / I'd rather …"],
       … 6 lessons, each [title, objective (same as script.objective without 'Today you will'), key patterns]
     ]}
    … 4 units
  ],
  "scripts": {
    "0-0": {
      "objective": "Today you will say which sport you prefer and explain why.",
      "warmup": "What sports do you like to watch or play?",
      "expressions": [
        {"w": "be hooked on", "def": "to enjoy something so much you can't stop", "ar": "مدمن على / متعلّق جداً بـ", "frame": "I've been hooked on ___ since ___."}
        … exactly 6
      ],
      "dialogue": {
        "scene": "Faisal invites his friend Omar to play padel after school.",
        "p1": [{"s": "Faisal", "t": "…"}, {"s": "Omar", "t": "…"}],
        "p2": [{"s": "Faisal", "t": "…"}, {"s": "Omar", "t": "…"}],
        "focus": "I'd rather play football than padel, to be honest.",
        "qs": ["Which sport does Omar prefer?", "Why does Faisal like padel?"]
      },
      "speakout": {
        "scene": "Your cousin wants to choose a new sport for the summer. Help them decide.",
        "prompts": [
          {"q": "Which sport do you prefer, and why?", "hint": "Say the sport and give one reason with 'because'."},
          {"q": "…", "hint": "…"}, {"q": "…", "hint": "…"}
        ]
      },
      "culture": {"title": "Padel in Saudi Arabia", "points": ["…", "…", "…"], "qs": ["…?", "…?"]},
      "exit": "Tell me two sports you prefer and why, without looking at the slides."
    }
    … keys "ui-li" for all 24 lessons ("0-0" … "3-5")
  },
  "kits": {
    "0-0": {"words": [{"w": "…", "ar": "…", "ex": "example sentence"} … the same 6 expressions],
            "dialogue": [{"s": "A", "t": "…"} … 6–8 lines, a shorter version of the model dialogue],
            "grammar": {"title": "…", "ar": "short Arabic explanation", "examples": ["…", "…", "…"]}}
    … all 24
  },
  "quizzes": {
    "0-0": [5 items: 2 × {"type":"order","words":[…],"answer":"…","ar":"رتّب الجملة"},
                     3 × {"type":"mc","q":"…","options":["…","…","…"],"answer":index}]  // about this lesson's expressions/function
    … all 24
  },
  "unitTests": {
    "0": {"items": [10 items: 4 mc on expressions, 3 mc on the function/grammar, 3 order],
          "speak": ["2 short speaking prompts that require the unit function"]}
    … "0".."3"
  },
  "levelTest": {"items": [20 items covering all 4 units: mc + order], "speak": ["3 prompts, one per 1–2 units"]}
}
```
`stories` already exist in the old files; the build script keeps the old `stories` array, so do NOT write stories.
`mc.answer` is the index of the correct option (0-based); options are 3 (levels 1–4) or 4 (levels 5+), only ONE correct.
`order.words` is the answer split into words (punctuation stays attached), in the correct order (the app shuffles).

## Placement bank content/P{n}.json (write the whole file)
Items must test what level n teaches in v2 (its functions, expressions and grammar), be clearly harder than level n-1
and easier than n+1, and have exactly one correct answer.
```json
{"level": 8,
 "mcq": [10 items {"q":"…","options":[4],"answer":i,"skill":"grammar|vocabulary|function"}],
 "listen": [4 items {"script":"20–60 words","q":"…","options":[3],"answer":i}],
 "read": {"passage": "60–150 words (levels 1–4: 25–60)", "qs": [4 items {"q","options":[3],"answer":i}]},
 "aloud": ["3 sentences to read aloud, at level"],
 "speak": ["3 open questions that invite the level's functions"]
}
```
Levels 1–2: questions are short, words concrete, options 3 for mcq too.
