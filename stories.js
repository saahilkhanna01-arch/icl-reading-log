/* Story library and placement check. Levels follow the UFLI Foundations order; lesson ranges are approximate. */
const LEVELS = [
  { n: 1,  name: "Short a",                 ufli: "1–8",     focus: "a with m, s, t, p, f, n, d, c" },
  { n: 2,  name: "Short i and o",           ufli: "9–20",    focus: "i and o in three-letter words" },
  { n: 3,  name: "Short u and e",           ufli: "21–34",   focus: "all five short vowels" },
  { n: 4,  name: "Double letters and ck",   ufli: "35–38",   focus: "ff, ll, ss, zz, ck" },
  { n: 5,  name: "sh, th, ch, wh",          ufli: "39–45",   focus: "two letters, one sound" },
  { n: 6,  name: "Blends, ng and nk",       ufli: "46–53",   focus: "st, fr, gr, pl, -ng, -nk" },
  { n: 7,  name: "Silent e",                ufli: "54–62",   focus: "a_e, i_e, o_e, u_e" },
  { n: 8,  name: "Endings -s, -ed, -ing",   ufli: "63–76",   focus: "adding endings to known words" },
  { n: 9,  name: "ar, or, er, ir, ur",      ufli: "77–83",   focus: "r-controlled vowels" },
  { n: 10, name: "ai, ay, ee, ea, oa, ow",  ufli: "84–91",   focus: "long vowel teams" },
  { n: 11, name: "oo, ou, ow, oi, oy, aw",  ufli: "92–106",  focus: "other vowel teams" },
  { n: 12, name: "Longer words",            ufli: "107–128", focus: "two and three syllables, prefixes, suffixes" },
];

/* The story library lives in library/level01.js to level12.js. Each file calls S() once per story. */
const STORIES = [];
function S(level, title, text, tricky, questions) {
  const n = STORIES.filter(s => s.level === level).length + 1;
  STORIES.push({
    id: `L${level}-${String(n).padStart(2, "0")}`,
    level, title, text,
    tricky: tricky.split(",").map(w => w.trim()).filter(Boolean).slice(0, 8),
    questions: questions.split(";").map(x => { const [q, a] = x.split("|"); return { q: q.trim(), a: (a || "").trim() }; }).filter(q => q.q),
    source: "built-in",
  });
}

/* Placement check, our own, inspired by DIBELS: letter sounds, made-up words, a short passage. */
const PLACEMENT = {
  letters: "m a s t p f i n o d c u g b e h r l k w j y v x z q t s m a d n i p o f c e u g r b l h".split(" "),
  bands: [
    { level: 2,  label: "Short vowels",        words: ["zat", "mip", "fot", "lun", "ped"] },
    { level: 4,  label: "sh, th, ch, blends",  words: ["shom", "thip", "chab", "flet", "grum"] },
    { level: 7,  label: "Silent e",            words: ["bame", "tipe", "rofe", "mune", "zade"] },
    { level: 9,  label: "Vowel teams and r",   words: ["feep", "goam", "tair", "sork", "lurt"] },
  ],
  passage: { title: "The Market", text: "On Saturday, Sana went to the market with her mother. The market was busy and loud. They bought rice, eggs and six red apples. Sana saw a man selling bright kites. She asked her mother if she could have one. Her mother smiled and said yes. On the way home, Sana held the kite high in the wind. It was the best day of the week." },
};
