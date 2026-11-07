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
  /* Beyond UFLI: phonics is in place, so these levels build fluency, vocabulary and comprehension. */
  { n: 13, name: "Longer stories",          grade: "Grade 3",   focus: "longer stories with dialogue and paragraphs" },
  { n: 14, name: "Chapter-style stories",   grade: "Grade 3–4", focus: "describing words, feelings and longer plots" },
  { n: 15, name: "Richer vocabulary",       grade: "Grade 4",   focus: "working out new words from the story around them" },
  { n: 16, name: "Stories and true facts",  grade: "Grade 4–5", focus: "fiction and nonfiction, cause and effect" },
  { n: 17, name: "Deeper reading",          grade: "Grade 5–6", focus: "reading between the lines, characters' choices" },
  { n: 18, name: "Advanced reading",        grade: "Grade 6–7", focus: "complex sentences, history, science and opinions" },
];
const levelSub = lv => lv.ufli ? `about UFLI ${lv.ufli}` : `beyond UFLI, about ${lv.grade}`;

/* The story library lives in library/level01.js to level18.js. Each file calls S() once per story. */
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

/* Placement test, our own, inspired by DIBELS: letter sounds, made-up words, a short passage.
   Three versions so a kid who is re-tested doesn't see the same one twice in a row. */
const BAND_INFO = [
  { level: 2, label: "Short vowels" },
  { level: 4, label: "sh, th, ch, blends" },
  { level: 7, label: "Silent e" },
  { level: 9, label: "Vowel teams and r" },
];
const PLACEMENTS = [
  {
    letters: "m a s t p f i n o d c u g b e h r l k w j y v x z q t s m a d n i p o f c e u g r b l h".split(" "),
    words: [["zat", "mip", "fot", "lun", "ped"], ["shom", "thip", "chab", "flet", "grum"], ["bame", "tipe", "rofe", "mune", "zade"], ["feep", "goam", "tair", "sork", "lurt"]],
    passage: { title: "The Market", text: "On Saturday, Sana went to the market with her mother. The market was busy and loud. They bought rice, eggs and six red apples. Sana saw a man selling bright kites. She asked her mother if she could have one. Her mother smiled and said yes. On the way home, Sana held the kite high in the wind. It was the best day of the week." },
    advanced: { title: "The Indus River", text: "The Indus is one of the longest rivers in Asia. It begins as melting snow high in the mountains of Tibet and travels nearly three thousand kilometres before it reaches the Arabian Sea near Karachi. Along the way, it passes through deep valleys, wide plains and busy cities. For thousands of years, people have depended on its water. More than four thousand years ago, an advanced civilization grew along its banks. Its people built carefully planned cities with straight streets, brick houses and covered drains, which was remarkable for that time. Today, the river still provides water for millions of farmers, who use canals to carry it to their fields of wheat, rice and cotton. However, the Indus faces serious problems. Glaciers that feed it are shrinking, and some years bring dangerous floods while others bring drought. Scientists and farmers are working together to find ways to share the water fairly and protect the river for future generations." },
  },
  {
    letters: "s t a m f p n i d o g c b u r e l h w k y j x v q z p m t a s f d i n c o b g e u h l r".split(" "),
    words: [["vop", "jit", "nug", "seb", "daf"], ["shub", "thep", "chog", "slom", "grap"], ["lume", "pobe", "kibe", "tade", "vone"], ["boap", "heeb", "darp", "morb", "lirt"]],
    passage: { title: "The Rainy Day", text: "It rained all morning, so Bilal and his sister could not play outside. They sat by the window and watched the drops run down the glass. Their mother made hot tea and a plate of pakoras. Bilal counted the puddles in the yard. When the rain stopped, the sun came out and a rainbow spread over the hills. The children ran outside and jumped in every puddle they could find." },
    advanced: { title: "The Bicycle Repair Shop", text: "Farhan had always been curious about how things worked, so when the old mechanic on his street offered to teach him, he agreed immediately. Every afternoon after school, he walked to the narrow shop, which smelled of oil and rubber. At first, Mr. Iqbal only allowed him to sweep the floor and sort bolts into tins. Farhan felt impatient, but he noticed that the old man was watching how carefully he worked. After two weeks, Mr. Iqbal handed him a punctured tyre. 'Find the hole without looking,' he said. Farhan was puzzled, until he was shown how to dip the tube in water and watch for a stream of tiny bubbles. Gradually, he learned to adjust brakes, replace chains and straighten bent wheels. Months later, a customer arrived with a bicycle that nobody else could repair. Mr. Iqbal simply stepped aside and nodded toward Farhan. His hands were trembling slightly, but he knew exactly where to begin." },
  },
  {
    letters: "a p t s i m o f n c d u b g e r l w h k j v y z x q m s a t p n f i d o g c u b r e h l".split(" "),
    words: [["bim", "tox", "rud", "fep", "gac"], ["chun", "whep", "thib", "plok", "frim"], ["fope", "dute", "jine", "sabe", "pome"], ["taip", "roat", "keem", "porf", "nirb"]],
    passage: { title: "The New Goat", text: "Hamid's uncle gave him a little brown goat with a white face. Hamid named her Coco. Every morning, he took Coco to the field to eat grass. One day, Coco ran away and hid behind the old well. Hamid looked everywhere. At last he heard a soft bleat and found her chewing a flower. He laughed, picked her up and carried her home for supper." },
    advanced: { title: "Why Bees Matter", text: "Although bees are tiny, they play an enormous role in feeding the world. As a bee travels from flower to flower collecting nectar, powdery pollen sticks to the hairs on its body. When it visits the next flower, some of that pollen is transferred, which allows the plant to produce fruit and seeds. This process is called pollination. Apples, mangoes, almonds and many vegetables depend on it. In fact, scientists estimate that roughly one out of every three mouthfuls of food we eat relies on pollinators like bees. Unfortunately, bee populations in many countries have been declining. Some of the causes include chemical sprays used on crops, the loss of wild flowers, and diseases that spread between hives. Farmers can help by planting flowering hedges along the edges of their fields and by spraying less often. Even a small garden with a variety of flowers can provide a valuable source of food for local bees." },
  },
].map(v => ({ letters: v.letters, passage: v.passage, advanced: v.advanced, bands: BAND_INFO.map((b, i) => ({ ...b, words: v.words[i] })) }));
