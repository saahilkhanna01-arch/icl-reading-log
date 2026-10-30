// AI helper for the reading log. Runs on Netlify so the Groq key never reaches the browser.
// Set GROQ_API_KEY (required) and GROQ_MODEL (optional) in Netlify: Site configuration > Environment variables.

export const config = { path: "/api/ai" };

const LEVELS = {
  1:  { name: "Short a", pattern: "short a in three-letter words (cat, map, sad, fan) with consonants m, s, t, p, f, n, d, c, h, b, g, r, l", words: [60, 90] },
  2:  { name: "Short i and o", pattern: "short i and short o in three-letter words (pig, sit, hop, pot), plus short a", words: [70, 100] },
  3:  { name: "Short u and e", pattern: "short u and short e (bus, sun, hen, bed), plus all short vowels", words: [80, 120] },
  4:  { name: "Double letters and ck", pattern: "ff, ll, ss, zz endings (hill, puff, miss) and ck (duck, kick)", words: [100, 140] },
  5:  { name: "sh, th, ch, wh", pattern: "digraphs sh, th, ch, wh (ship, thin, chip, when)", words: [110, 150] },
  6:  { name: "Blends, ng and nk", pattern: "consonant blends (st, fr, gr, pl, sl, tr) and -ng, -nk (sing, bank)", words: [120, 170] },
  7:  { name: "Silent e", pattern: "silent e words a_e, i_e, o_e, u_e (cake, kite, home, cute)", words: [140, 200] },
  8:  { name: "Endings -s, -ed, -ing", pattern: "adding -s, -es, -ed, -ing to known words (jumps, wished, running)", words: [150, 210] },
  9:  { name: "ar, or, er, ir, ur", pattern: "r-controlled vowels ar, or, er, ir, ur (farm, storm, her, bird, turn)", words: [170, 230] },
  10: { name: "ai, ay, ee, ea, oa, ow", pattern: "long vowel teams ai, ay, ee, ea, oa, ow (rain, play, tree, read, boat, snow)", words: [180, 250] },
  11: { name: "oo, ou, ow, oi, oy, aw", pattern: "vowel teams oo, ou, ow (cow), oi, oy, aw, au (moon, cloud, coin, toy, saw)", words: [200, 270] },
  12: { name: "Longer words", pattern: "two- and three-syllable words, prefixes (un-, re-) and suffixes (-ful, -less, -ly, -tion)", words: [220, 300] },
};

const AUDIENCE = `The readers are children aged 6 to 13 in villages in rural Pakistan, learning to read English as a second language over Zoom with volunteer high school tutors from Canada.`;
const STYLE = `Settings and details should feel familiar to them: village life, farm animals (goats, buffalo, hens), school, family, cricket, kites, the market, rain and monsoon, cooking, festivals such as Eid. Use Pakistani names. Keep the tone warm and kind: a small problem and a happy ending. Nothing scary or violent, no romance, no religious teaching. Short sentences.`;

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
const str = (v, max) => String(v ?? "").replace(/\s+\n/g, "\n").trim().slice(0, max);
const arr = (v, n) => (Array.isArray(v) ? v : []).slice(0, n);

function earlier(n) {
  return Object.entries(LEVELS).filter(([k]) => Number(k) < n).map(([k, l]) => `Level ${k}: ${l.pattern}`).join("\n") || "None. This is the first level.";
}

function storyPrompt(level, count, focusWords, avoid) {
  const L = LEVELS[level];
  return `You write decodable reading stories. ${AUDIENCE}

Write ${count} different stories for Level ${level}: ${L.name}.
This level's phonics focus: ${L.pattern}.
Patterns the child already knows from earlier levels:
${earlier(level)}

Rules:
- Each story is ${L.words[0]} to ${L.words[1]} words long, split into 2 to 4 short paragraphs separated by a blank line.
- Most words must follow this level's pattern or an earlier level's pattern. Use many words with this level's focus.
- Any other word must be a very common sight word (the, a, is, was, to, of, said, you, they, he, she, we, my, are, have, do, what, where, come, some) or a name.
- List every sight word and name you used that does not follow the patterns in "tricky" (at most 8).
- ${STYLE}
- Each story has its own title and its own plot.${focusWords?.length ? `\n- Work these practice words in naturally where they fit the level: ${focusWords.slice(0, 10).join(", ")}.` : ""}${avoid?.length ? `\n- Do not reuse these titles: ${avoid.slice(0, 60).join("; ")}.` : ""}
- For each story write 3 simple comprehension questions a child can answer by talking, with a short answer each. Answers must be in the story.

Reply with JSON only, in this shape:
{"stories":[{"title":"","text":"","tricky":[""],"questions":[{"q":"","a":""}]}]}`;
}

function build(b) {
  const level = Math.min(12, Math.max(1, Number(b.level) || 1));
  if (b.task === "stories") return storyPrompt(level, Math.min(3, Math.max(1, Number(b.count) || 2)), [], arr(b.avoid, 60).map(s => str(s, 80)));
  if (b.task === "story") return storyPrompt(level, 1, arr(b.focusWords, 10).map(s => str(s, 30)), arr(b.avoid, 60).map(s => str(s, 80)));
  if (b.task === "questions") return `${AUDIENCE}
Here is a story they read:
Title: ${str(b.title, 120)}
${str(b.text, 3000)}

Write 3 simple comprehension questions a child can answer by talking. Use easy words. Each answer must be in the story and short.
Reply with JSON only: {"questions":[{"q":"","a":""}]}`;
  if (b.task === "summary") return `${AUDIENCE}
A volunteer tutor just finished a one hour lesson. Write a short note (2 or 3 sentences, under 60 words) for whichever tutor teaches this child next week. Be specific and encouraging, use plain words, and say what to practise next. Do not invent anything that is not in the facts.

Facts about today's lesson:
${str(b.facts, 2500)}

Reply with JSON only: {"note":""}`;
  return null;
}

function tidy(task, out) {
  if (task === "stories" || task === "story") {
    const stories = arr(out.stories, 3).map(s => ({
      title: str(s.title, 80) || "A New Story",
      text: str(s.text, 3000),
      tricky: arr(s.tricky, 8).map(w => str(w, 30)).filter(Boolean),
      questions: arr(s.questions, 3).map(q => ({ q: str(q.q, 200), a: str(q.a, 200) })).filter(q => q.q),
    })).filter(s => s.text.split(/\s+/).length >= 30);
    if (!stories.length) throw new Error("empty");
    return { stories };
  }
  if (task === "questions") {
    const questions = arr(out.questions, 3).map(q => ({ q: str(q.q, 200), a: str(q.a, 200) })).filter(q => q.q);
    if (!questions.length) throw new Error("empty");
    return { questions };
  }
  if (task === "summary") return { note: str(out.note, 600) };
  return out;
}

async function callGroq(key, model, prompt, withReasoning) {
  const body = {
    model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.9,
    max_completion_tokens: 4000,
  };
  if (withReasoning) body.reasoning_effort = "low";
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const key = process.env.GROQ_API_KEY;
  if (!key) return json({ error: "The AI isn't set up yet. Add GROQ_API_KEY in Netlify's environment variables, then redeploy." }, 500);
  let b;
  try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const prompt = build(b);
  if (!prompt) return json({ error: "Unknown task." }, 400);

  const models = [...new Set([process.env.GROQ_MODEL, "openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile"].filter(Boolean))];
  let last = "The AI didn't answer.";
  for (const model of models) {
    for (const withReasoning of model.startsWith("openai/gpt-oss") ? [true, false] : [false]) {
      let r;
      try { r = await callGroq(key, model, prompt, withReasoning); } catch { last = "Couldn't reach Groq."; continue; }
      const j = await r.json().catch(() => null);
      if (r.status === 429) return json({ error: "The free AI limit is used up for the moment. Wait a minute and try again." }, 429);
      if (r.status === 401) return json({ error: "The Groq key isn't valid. Check GROQ_API_KEY in Netlify." }, 500);
      if (!r.ok) { last = j?.error?.message || `Groq error ${r.status}`; continue; }
      try { return json(tidy(b.task, JSON.parse(j.choices[0].message.content))); }
      catch { last = "The AI reply couldn't be read. Try again."; }
    }
  }
  return json({ error: last }, 502);
};
