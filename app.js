(() => {
"use strict";
const CFG = window.ICL_CONFIG || {};
const ADMIN_DEFAULT_HASH = "438abe17717f5a9cfebbe58a52ec720924e0a7f9c46663b8ba9f0410f12acfbe"; // "corner2026"
const COLS = ["tutors", "students", "picks", "attendance", "readings", "checks", "config", "stories", "questions", "warmups", "notes"];
const AI_URL = "/api/ai";

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad2 = n => String(n).padStart(2, "0");
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const TODAY = dayKey();
const fmtDay = k => { if (!k) return "–"; const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }); };
const fmtShort = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" }); };
const fmtDayLong = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }); };
const fmtTime = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${pad2(s % 60)}`; };
const pct = v => v == null ? "–" : `${Math.round(v * 100)}%`;
const plural = (n, a, b) => `${n} ${n === 1 ? a : (b || a + "s")}`;
const first = name => (name || "").split(" ")[0];
const levelOf = n => LEVELS.find(l => l.n === n);
const tokens = text => text.split(/\s+/).filter(Boolean);
const isWord = t => /[A-Za-z]/.test(t);
const clean = t => t.replace(/[^A-Za-z']/g, "").replace(/^'+|'+$/g, "").toLowerCase();
const paragraphs = text => String(text).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
const wordCount = text => tokens(text).filter(isWord).length;
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function sha(s) { try { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); } catch { return null; } }
let toastT; function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3200); }
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- data store: Supabase when configured, this device otherwise ---------- */
const D = Object.fromEntries(COLS.map(c => [c, []]));
/* Google sign-in through Supabase. Anyone who signs in with Google is a tutor; admins are listed in the database. */
const Auth = { on: false, user: null, isAdmin: null, email: "" };
const myRecord = () => Auth.email ? D.tutors.find(t => (t.email || "").toLowerCase() === Auth.email && t.active !== false) : null;
const isApproved = () => !!Auth.user;
const Store = {
  sb: null, live: false, ready: false, err: "",
  local() { try { return JSON.parse(lsGet("icl-local") || "{}"); } catch { return {}; } },
  saveLocal(o) { lsSet("icl-local", JSON.stringify(o)); },
  loadLocal() { const o = this.local(); COLS.forEach(c => D[c] = Object.entries(o[c] || {}).map(([id, v]) => ({ ...v, id }))); sortAll(); },
  async init() {
    if (CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase) {
      this.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
      this.live = true;
      Auth.on = CFG.googleSignIn !== false;
      if (Auth.on) {
        const { data } = await this.sb.auth.getSession();
        this.setUser(data?.session?.user || null);
        this.sb.auth.onAuthStateChange((_ev, session) => {
          const u = session?.user || null;
          if ((u?.id || null) === (Auth.user?.id || null)) return;
          this.setUser(u);
          if (u) this.afterLogin(); else { COLS.forEach(c => D[c] = []); render(); }
        });
        if (!Auth.user) { this.ready = true; render(); return; }
      }
      await this.afterLogin();
      return;
    } else this.loadLocal();
    this.ready = true; render();
  },
  setUser(u) { Auth.user = u; Auth.email = (u?.email || "").toLowerCase(); Auth.isAdmin = null; },
  async afterLogin() {
    await this.loadAll();
    if (Auth.on) {
      const { data, error } = await this.sb.rpc("is_admin");
      Auth.isAdmin = error ? null : !!data;
      if (!myRecord()) {
        const old = D.tutors.find(t => (t.email || "").toLowerCase() === Auth.email);
        if (old) await this.update("tutors", old.id, { active: true }).catch(() => {});
        else {
          const name = Auth.user.user_metadata?.full_name || Auth.user.user_metadata?.name || Auth.email.split("@")[0];
          await this.add("tutors", { name, email: Auth.email, approved: true, active: true, at: Date.now() }).catch(() => {});
        }
      }
      if (myRecord() && isApproved()) { S.me = myRecord().id; lsSet("icl-me", S.me); S.signedToday = lsGet("icl-day") === TODAY && lsGet("icl-day-who") === S.me; loadSessions(); }
    }
    if (!this.subscribed) {
      this.subscribed = true;
      try { this.sb.channel("records").on("postgres_changes", { event: "*", schema: "public", table: "records" }, p => this.apply(p)).subscribe(); } catch {}
      setInterval(() => { if (!Auth.on || Auth.user) this.loadAll(); }, 60000);
    }
    this.ready = true; render();
  },
  async loadAll() {
    const all = []; let from = 0;
    for (;;) {
      const { data, error } = await this.sb.from("records").select("id,col,data").range(from, from + 999);
      if (error) { this.err = error.message; scheduleRender(); return; }
      all.push(...data); if (data.length < 1000) break; from += 1000;
    }
    this.err = "";
    COLS.forEach(c => D[c] = []);
    all.forEach(r => { if (D[r.col]) D[r.col].push({ ...r.data, id: r.id.slice(r.col.length + 1) }); });
    sortAll(); scheduleRender();
  },
  apply(p) {
    if (p.eventType === "DELETE") {
      const full = p.old?.id; if (!full) return;
      const c = full.split("/")[0], id = full.slice(c.length + 1);
      if (D[c]) D[c] = D[c].filter(x => x.id !== id);
    } else {
      const r = p.new; if (!r || !D[r.col]) return;
      const id = r.id.slice(r.col.length + 1);
      D[r.col] = D[r.col].filter(x => x.id !== id).concat({ ...r.data, id });

    }
    sortAll(); scheduleRender();
  },
  async set(c, id, data) {
    const { id: _drop, ...body } = data;
    D[c] = D[c].filter(x => x.id !== id).concat({ ...body, id }); sortAll(); scheduleRender();
    if (this.live) {
      const { error } = await this.sb.from("records").upsert({ id: `${c}/${id}`, col: c, data: body, updated_at: new Date().toISOString() });
      if (error) { this.loadAll(); throw error; }
    } else { const o = this.local(); (o[c] ||= {})[id] = body; this.saveLocal(o); }
  },
  async add(c, data) { const id = newId(); await this.set(c, id, data); return id; },
  async update(c, id, patch) { const cur = D[c].find(x => x.id === id) || {}; return this.set(c, id, { ...cur, ...patch }); },
  async remove(c, id) {
    D[c] = D[c].filter(x => x.id !== id); scheduleRender();
    if (this.live) { const { error } = await this.sb.from("records").delete().eq("id", `${c}/${id}`); if (error) { this.loadAll(); throw error; } }
    else { const o = this.local(); if (o[c]) delete o[c][id]; this.saveLocal(o); }
  },
};
async function safe(p, ok) {
  try { await p; if (ok) toast(ok); return true; }
  catch { toast("That didn't save. Check the internet connection and try again."); return false; }
}
function sortAll() {
  D.tutors.sort((a, b) => a.name.localeCompare(b.name));
  D.students.sort((a, b) => a.name.localeCompare(b.name));
  ["readings", "checks", "warmups", "notes", "stories"].forEach(c => D[c].sort((a, b) => (b.at || 0) - (a.at || 0)));
}

/* ---------- AI ---------- */
const AI = {
  ok: location.protocol.startsWith("http"),
  async call(task, payload) {
    if (!this.ok) throw new Error("The AI works once the site is online.");
    let r;
    try { r = await fetch(AI_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task, ...payload }) }); }
    catch { throw new Error("Couldn't reach the AI. Check the internet connection."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "The AI isn't available right now.");
    return j;
  },
};

/* ---------- derived ---------- */
const tutor = id => D.tutors.find(t => t.id === id);
const student = id => D.students.find(s => s.id === id);
const activeTutors = () => D.tutors.filter(t => t.active !== false);
const activeStudents = () => D.students.filter(s => s.active !== false);
const picksToday = () => D.picks.filter(p => p.date === TODAY);
const pickOf = sid => picksToday().find(p => p.studentId === sid);
const myKids = () => picksToday().filter(p => p.tutorId === S.me).sort((a, b) => (a.at || 0) - (b.at || 0)).map(p => student(p.studentId)).filter(Boolean);
const hereToday = () => D.attendance.filter(a => a.date === TODAY);
const readingsOf = sid => D.readings.filter(r => r.studentId === sid);
const readingsToday = () => D.readings.filter(r => r.date === TODAY);
const allStories = () => [...STORIES.map(s => ({ ...s, source: "built-in" })), ...D.stories.filter(s => s.active !== false)];
const storyById = id => STORIES.find(s => s.id === id) || D.stories.find(s => s.id === id);
const storiesAt = n => allStories().filter(s => s.level === n);
const questionsFor = st => (st.questions && st.questions.length) ? st.questions : (D.questions.find(q => q.id === st.id)?.items || null);
const classDays = () => [...new Set([...D.attendance.map(a => a.date), ...D.picks.map(p => p.date)])].sort().reverse();
function kidAttendance(sid, n = 8) {
  const days = classDays().slice(0, n), came = new Set(D.picks.filter(p => p.studentId === sid).map(p => p.date));
  const firstDay = [...came].sort()[0];
  const relevant = days.filter(d => !firstDay || d >= firstDay);
  return { came: relevant.filter(d => came.has(d)).length, of: relevant.length, missedLast: relevant.slice(0, 2).filter(d => d !== TODAY && !came.has(d)).length };
}
function practiceWords(sid, max = 10) {
  const seen = new Map();
  readingsOf(sid).slice(0, 3).forEach(r => (r.missed || []).forEach(w => seen.set(w, (seen.get(w) || 0) + 2)));
  D.warmups.filter(w => w.studentId === sid).slice(0, 2).forEach(w => (w.wrong || []).forEach(x => seen.set(x, (seen.get(x) || 0) + 1)));
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(e => e[0]);
}
function warmupDeck(k) {
  const words = practiceWords(k.id, 8);
  const lvl = k.level || 1;
  storiesAt(lvl).forEach(st => (st.tricky || []).forEach(w => { const c = clean(w); if (c && !words.includes(c) && words.length < 12) words.push(c); }));
  if (words.length < 8) {
    const pool = [...new Set(storiesAt(lvl).flatMap(st => tokens(st.text).filter(isWord).map(clean)).filter(w => w.length >= 3))];
    for (let i = 0; words.length < 10 && pool.length; i++) { const w = pool.splice((i * 7) % pool.length, 1)[0]; if (!words.includes(w)) words.push(w); }
  }
  return words.slice(0, 12);
}
function struggling(s) {
  if (!s.level || s.level <= 1) return false;
  const atLevel = readingsOf(s.id).filter(r => r.level === s.level).slice(0, 2);
  return atLevel.length === 2 && atLevel.every(r => r.accuracy < 0.85);
}
function levelHint(k, inResult) {
  if (readyToMoveUp(k)) return `<div class="moveup" ${inResult ? 'style="margin:0 0 16px"' : ""}><span>Two stories in a row at 95% or more on Level ${k.level}. Ready for Level ${k.level + 1}: ${esc(levelOf(k.level + 1).name)}.</span><div><button class="btn small primary" data-act="levelup" data-id="${k.id}">Move up to Level ${k.level + 1}</button></div></div>`;
  if (struggling(k)) return `<div class="movedown" ${inResult ? 'style="margin:0 0 16px"' : ""}><span>The last two Level ${k.level} stories were under 85%. Level ${k.level - 1} (${esc(levelOf(k.level - 1).name)}) may help build confidence.</span><div class="inline"><button class="btn small" data-act="leveldown" data-id="${k.id}">Move to Level ${k.level - 1}</button><button class="btn small quiet" data-act="dismisshint" data-id="${k.id}">Keep Level ${k.level}</button></div></div>`;
  return "";
}
function readyToMoveUp(s) {
  if (!s.level || s.level >= 12) return false;
  const atLevel = readingsOf(s.id).filter(r => r.level === s.level).slice(0, 2);
  return atLevel.length === 2 && atLevel.every(r => r.accuracy >= 0.95);
}
function latestNote(sid) {
  const n = D.notes.find(x => x.studentId === sid && x.date !== TODAY && x.text);
  const r = readingsOf(sid).find(x => x.date !== TODAY && x.note);
  if (n && (!r || (n.at || 0) >= (r.at || 0))) return { text: n.text, by: n.tutorId, date: n.date };
  return r ? { text: r.note, by: r.tutorId, date: r.date } : null;
}

/* ---------- state ---------- */
const S = {
  screen: "class", step: lsGet("icl-step-" + TODAY) || "pick", kidId: null, activeKid: null,
  me: lsGet("icl-me"), signedToday: lsGet("icl-day") === TODAY,
  sessions: {}, pickerQ: "", newKid: "", newTutor: "", kidsQ: "", signQ: "",
  adminOk: false, adminMsg: "", textSize: Number(lsGet("icl-size")) || 0,
  summary: null, libLevel: "", openStory: null,
};
const sess = kid => (S.sessions[kid] ||= { mode: "home", browse: null });
/* Lesson progress is saved on this computer as the tutor works, so a reload or crash doesn't lose marked words or the timer. */
const SESS_KEY = "icl-sess-" + TODAY;
function saveSessions() {
  try {
    const out = {};
    for (const [kid, x] of Object.entries(S.sessions)) {
      out[kid] = { ...x, writing: false, marked: x.marked ? [...x.marked] : undefined,
        check: x.check ? { ...x.check, miss: x.check.miss.map(m => [...m]) } : undefined,
        q: x.q && x.q.loading ? { reload: true } : x.q };
    }
    lsSet(SESS_KEY, JSON.stringify({ me: S.me, activeKid: S.activeKid, savedAt: Date.now(), sessions: out }));
  } catch {}
}
function loadSessions() {
  try {
    const o = JSON.parse(lsGet(SESS_KEY) || "null");
    if (!o || o.me !== S.me) return;
    const stale = Date.now() - (o.savedAt || 0) > 30 * 60000;
    for (const [kid, x] of Object.entries(o.sessions || {})) {
      if (x.marked) x.marked = new Set(x.marked);
      if (x.check) x.check.miss = x.check.miss.map(m => new Set(m));
      if (x.running && stale) { x.acc = (x.acc || 0) + Math.max(0, (o.savedAt || 0) - (x.startedAt || 0)); x.running = false; }
      S.sessions[kid] = x;
    }
    S.activeKid = o.activeKid || null;
    for (const [kid, x] of Object.entries(S.sessions)) if (x.mode === "questions" && x.q?.reload) setTimeout(() => loadQuestions(kid), 0);
  } catch {}
}
function setStep(step) { S.step = step; lsSet("icl-step-" + TODAY, step); }

/* ---------- rendering ---------- */
let rq = 0;
function scheduleRender() { cancelAnimationFrame(rq); rq = requestAnimationFrame(render); }
function render() {
  const a = document.activeElement, fid = a && a.id, ss = a && a.selectionStart, se = a && a.selectionEnd;
  $("#side").innerHTML = sideHTML();
  $("#topbar").innerHTML = topHTML();
  let h = "";
  if (Store.ready && !Store.live) h += `<div class="banner">Trying it out: the database isn't connected yet, so everything is saved on this computer only. Add your Supabase details to config.js to share the log with every tutor.</div>`;
  if (Store.err) h += `<div class="banner">Can't reach the class log right now (${esc(Store.err)}). Your screen may be out of date.</div>`;
  h += gateHTML() ?? ({ class: classHTML, kids: kidsHTML, kid: kidHTML, admin: adminHTML })[S.screen]();
  $("#main").innerHTML = h;
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); try { if (ss != null) el.setSelectionRange(ss, se); } catch {} } }
  tickTimers();
  saveSessions();
}
const ICON = {
  class: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"/></svg>',
  kids: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="5.5" r="2.5"/><path d="M1.5 14c.4-2.6 2.2-4 4.5-4s4.1 1.4 4.5 4"/><circle cx="11.5" cy="6" r="2"/><path d="M11.5 10c1.7 0 2.8 1.1 3 3"/></svg>',
  admin: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="7" width="10" height="7.5" rx="2"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>',
};
const TICK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5l3 3 7-7"/></svg>';
const MARK = '<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><rect width="30" height="30" rx="9" fill="var(--accent)"/><path d="M15 9.5c-2.2-1.3-4.6-1.8-7-1.5v12c2.4-.3 4.8.2 7 1.5 2.2-1.3 4.6-1.8 7-1.5V8c-2.4-.3-4.8.2-7 1.5z" fill="none" stroke="var(--accent-ink)" stroke-width="1.6" stroke-linejoin="round"/><path d="M15 9.5v12" stroke="var(--accent-ink)" stroke-width="1.6"/></svg>';
function navHTML() {
  const items = [["class", "Today's class"], ["kids", "Kids"], ["admin", "Admin"]];
  return `<nav class="nav" aria-label="Main">${items.map(([v, l]) => `<button data-act="go" data-v="${v}" ${S.screen === v || (v === "kids" && S.screen === "kid") ? 'aria-current="page"' : ""}>${ICON[v]}${l}</button>`).join("")}</nav>`;
}
function sideHTML() {
  const me = tutor(S.me);
  return `<div class="brand">${MARK}<div><b>Interschool Corner of Learning</b><span>Sunday reading log</span></div></div>
  ${navHTML()}
  ${Auth.on && Auth.user ? `<div class="me"><span class="muted small">Signed in as</span><b>${esc(myRecord()?.name || Auth.email)}</b><span class="muted small" style="display:block;overflow-wrap:anywhere">${esc(Auth.email)}</span><button class="linkish" data-act="signout">Sign out</button></div>`
    : me && S.signedToday ? `<div class="me"><span class="muted small">Teaching today as</span><b>${esc(me.name)}</b><button class="linkish" data-act="signout">Not you?</button></div>` : ""}`;
}
function topHTML() { return `${MARK}<b style="font-size:14px">Corner of Learning</b>${navHTML()}`; }
function tile(k, v, c, unit = "") { return `<div class="tile s3"><span class="k">${k}</span><span class="v">${v}${unit ? `<small>${unit}</small>` : ""}</span><span class="c">${esc(c)}</span></div>`; }

/* ---------- Google sign-in gate ---------- */
const GOOGLE_G = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>';
function gateHTML() {
  if (!Auth.on) return null;
  if (!Store.ready) return `<div class="col"><p class="muted"><span class="spin"></span> Loading…</p></div>`;
  if (!Auth.user) return `<div class="col"><div class="title-row"><div><h1 class="greet">Welcome, tutors.</h1>
      <p class="sub">Interschool Corner of Learning · Sunday reading log</p></div></div>
    <section class="panel s6"><h2 style="font-size:16px;margin-bottom:6px">Sign in to start</h2>
      <p class="muted" style="margin-bottom:16px">Use your Google account. You'll stay signed in on this computer.</p>
      <button class="btn google" data-act="google">${GOOGLE_G}Sign in with Google</button>
      <p class="muted small" style="margin-top:14px">School accounts sometimes block outside sign-ins. If yours does, use a personal Gmail.</p></section></div>`;
  if (!myRecord()) return `<div class="col"><p class="muted"><span class="spin"></span> Setting up your account…</p></div>`;
  return null;
}

/* ---------- Today's class: sign in > pick kids > lesson > notes ---------- */
function classHTML() {
  const me = tutor(S.me);
  if (Auth.on && (!me || !S.signedToday)) return startClassHTML(myRecord() || me);
  if (!me || !S.signedToday) return signInHTML(me);
  if (S.step === "done") return doneHTML(me);
  if (S.step === "summary") return summaryHTML(me);
  if (S.step === "lesson" && myKids().length) return lessonHTML(me);
  return pickHTML(me);
}

function startClassHTML(me) {
  const here = hereToday();
  return `<div class="col">
    <div class="title-row"><div><h1 class="greet">Hello, ${esc(first(me?.name || ""))}.</h1>
      <p class="sub">${fmtDayLong(TODAY)} · ${plural(here.length, "tutor")} in class so far</p></div></div>
    <section class="panel s6"><h2 style="font-size:16px;margin-bottom:6px">Teaching today?</h2>
      <p class="muted" style="margin-bottom:16px">This marks you as here for today's class, then you choose your kids.</p>
      <button class="btn primary big" data-act="signin" data-id="${me?.id || ""}" ${me ? "" : "disabled"}>Start today's class</button></section></div>`;
}
function signInHTML(me) {
  const q = S.signQ.trim().toLowerCase();
  const list = activeTutors().filter(t => !q || t.name.toLowerCase().includes(q));
  const here = new Set(hereToday().map(a => a.tutorId));
  return `<div class="col">
    <div class="title-row"><div><h1 class="greet">${me ? `Welcome back, ${esc(first(me.name))}.` : "Who's teaching today?"}</h1>
      <p class="sub">${fmtDayLong(TODAY)} · Tap your name to sign in for today's class</p></div></div>
    <section class="panel">
      <div class="panel-head"><h2>Tutors <span class="count">${activeTutors().length}</span></h2>
        <input type="search" id="signq" data-input="signQ" placeholder="Find your name" value="${esc(S.signQ)}" aria-label="Find your name"></div>
      ${!Store.ready ? `<div class="empty">Loading the class list…</div>` :
        list.length ? `<div class="names">${list.map(t => `<button class="name-btn ${t.id === S.me ? "here" : ""}" data-act="signin" data-id="${t.id}">${esc(t.name)}${here.has(t.id) ? `<span class="muted small" style="display:block;font-weight:400">Signed in today</span>` : ""}</button>`).join("")}</div>`
        : `<div class="empty"><b>${q ? "No tutor by that name yet" : "No tutors yet"}</b>Add your name below to get started.</div>`}
      <form class="inline" data-form="newTutor" style="margin-top:16px">
        <input type="text" id="newtutor" data-input="newTutor" placeholder="New here? Type your full name" value="${esc(S.newTutor)}" aria-label="Your full name">
        <button class="btn" type="submit">Add me and sign in</button>
      </form>
    </section></div>`;
}

function pickHTML(me) {
  const q = S.pickerQ.trim().toLowerCase();
  const mine = new Set(myKids().map(k => k.id));
  const list = activeStudents().filter(s => !q || s.name.toLowerCase().includes(q));
  list.sort((a, b) => (mine.has(b.id) - mine.has(a.id)) || a.name.localeCompare(b.name));
  const here = hereToday(), kidsToday = new Set(picksToday().map(p => p.studentId)).size;
  return `<div class="col">
    <div class="title-row"><div><h1 class="greet">Hello, ${esc(first(me.name))}.</h1>
      <p class="sub">${fmtDayLong(TODAY)} · ${plural(here.length, "tutor")} and ${plural(kidsToday, "kid")} in class so far. Choose the kids you're teaching today.</p></div></div>
    <section class="panel">
      <div class="panel-head"><h2>All kids <span class="count">${activeStudents().length}</span></h2>
        <input type="search" id="pickq" data-input="pickerQ" placeholder="Search by name" value="${esc(S.pickerQ)}" aria-label="Search kids"></div>
      <div class="stack">
      ${list.length ? list.map(s => {
        const p = pickOf(s.id), other = p && p.tutorId !== S.me ? tutor(p.tutorId) : null, att = kidAttendance(s.id), added = mine.has(s.id);
        return `<div class="row ${added ? "added" : ""}"><div class="grow"><div class="t">${esc(s.name)}</div><div class="m">${s.level ? `Level ${s.level}` : "New, needs the placement test"}${att.of ? ` · came ${att.came} of the last ${plural(att.of, "class", "classes")}` : ""}</div></div>
          ${added ? `<span class="chip accent">In your group</span><button class="btn small quiet" data-act="unpick" data-id="${s.id}">Remove</button>`
          : other ? `<span class="chip">With ${esc(first(other.name))} today</span><button class="btn small quiet" data-act="pick" data-id="${s.id}">Take over</button>`
          : `<button class="btn small" data-act="pick" data-id="${s.id}">Add</button>`}</div>`;
      }).join("") : `<div class="empty"><b>${q ? `No kid called “${esc(S.pickerQ)}” yet` : "No kids in the log yet"}</b>Add a new kid below. They'll start with the placement test.</div>`}
      </div>
      <form class="inline" data-form="newKid" style="margin-top:14px">
        <input type="text" id="newkid" data-input="newKid" placeholder="New kid's name, e.g. Robert L." value="${esc(S.newKid)}" aria-label="New kid's name">
        <button class="btn" type="submit">Add new kid</button>
      </form>
      <div class="pickbar"><span class="muted">${mine.size ? `${plural(mine.size, "kid")} in your group` : "Add at least one kid to start"}</span>
        <button class="btn primary" data-act="startlesson" ${mine.size ? "" : "disabled"}>Start lesson</button></div>
    </section></div>`;
}

function lessonHTML(me) {
  const kids = myKids();
  if (!S.activeKid || !kids.find(k => k.id === S.activeKid)) S.activeKid = kids[0].id;
  const k = student(S.activeKid);
  return `<div class="col">
    <div class="kidbar">
      <div class="kidtabs" role="tablist" aria-label="Kids in today's lesson">${kids.map(x => {
        const s = sess(x.id), busy = ["read", "check", "warmup", "questions"].includes(s.mode);
        return `<button class="tab ${x.level ? "" : "needs"}" role="tab" aria-selected="${x.id === S.activeKid}" data-act="tab" data-id="${x.id}">${esc(x.name)}<span class="st">${busy ? "In progress" : x.level ? `Level ${x.level}` : "Needs test"}</span></button>`;
      }).join("")}</div>
      <div class="inline" style="flex:none"><button class="btn small quiet" data-act="tostep" data-v="pick">Change kids</button><button class="btn small" data-act="endlesson">End lesson</button></div>
    </div>
    ${kidWorkHTML(k)}
  </div>`;
}

/* ---------- guided lesson ---------- */
const LESSON_STEPS = [
  { key: "home", label: "Get ready", min: 2 },
  { key: "warmup", label: "Warm-up words", min: 8 },
  { key: "prep", label: "Teach new words", min: 7 },
  { key: "read", label: "Read the story", min: 15 },
  { key: "questions", label: "Questions", min: 8 },
  { key: "second", label: "Read again", min: 12 },
  { key: "wrap", label: "Wrap up", min: 3 },
];
const PATTERNS = {
  1: w => /^[^aeiou]*a[^aeiouy]+$/.test(w), 2: w => /^[^aeiou]*[io][^aeiouy]+$/.test(w), 3: w => /^[^aeiou]*[ue][^aeiouy]+$/.test(w),
  4: w => /(ff|ll|ss|zz|ck)/.test(w), 5: w => /(sh|th|ch|wh)/.test(w), 6: w => /(ng|nk|^st|^fr|^gr|^pl|^bl|^cl|^dr|^tr|^sp|^sl|^fl|^br|^cr|^sn|^sk|^sw|^gl|st$|mp$|nd$)/.test(w),
  7: w => /[aeiou][^aeiouwy]e$/.test(w) && w.length >= 4, 8: w => /(ed|ing|es)$/.test(w) && w.length >= 5, 9: w => /(ar|or|er|ir|ur)/.test(w),
  10: w => /(ai|ay|ee|ea|oa|ow)/.test(w), 11: w => /(oo|ou|ow|oi|oy|aw|au)/.test(w), 12: w => w.length >= 8,
};
function patternWords(st, n = 8) {
  const test = PATTERNS[st.level] || (() => false), tricky = new Set((st.tricky || []).map(clean)), out = [];
  for (const t of tokens(st.text)) { const w = clean(t); if (w.length > 1 && test(w) && !tricky.has(w) && !out.includes(w)) out.push(w); if (out.length >= n) break; }
  return out;
}
function nextStoryFor(k, skip) {
  const done = new Set(readingsOf(k.id).map(r => r.storyId));
  const lvl = sess(k.id).browse || k.level;
  const list = storiesAt(lvl).filter(st => (!st.forKid || st.forKid === k.id) && !done.has(st.id) && st.id !== skip);
  return list.find(st => st.forKid) || list[0] || storiesAt(lvl)[0];
}
function goStep(k, key, extra = {}) {
  const s = sess(k.id);
  Object.assign(s, extra, { mode: key, lstep: LESSON_STEPS.findIndex(x => x.key === key) });
  if (key === "prep" && !s.storyId) s.storyId = nextStoryFor(k)?.id;
  if (key === "warmup") s.warm = { words: warmupDeck(k), res: [], i: 0 };
  window.scrollTo(0, 0);
}
function stepDone(k, key) {
  const today = readingsOf(k.id).filter(r => r.date === TODAY && r.tutorId === S.me), s = sess(k.id);
  return { home: (s.lstep || 0) > 0, warmup: D.warmups.some(w => w.studentId === k.id && w.date === TODAY), prep: (s.lstep || 0) > 2 || today.length > 0,
    read: today.length > 0, questions: today.some(r => r.questions?.length), second: today.length > 1, wrap: D.notes.some(n => n.id === `${TODAY}_${k.id}`) }[key];
}
function stepperHTML(k, s) {
  const cur = s.mode === "result" ? (s.round > 1 ? 5 : 4) : s.mode === "pick" ? 2 : LESSON_STEPS.findIndex(x => x.key === s.mode);
  const total = LESSON_STEPS.reduce((a, x) => a + x.min, 0);
  return `<nav class="stepper" aria-label="Lesson steps for ${esc(first(k.name))}">${LESSON_STEPS.map((x, i) => {
    const done = stepDone(k, x.key) && i !== cur;
    return `<button class="stp ${i === cur ? "cur" : ""} ${done ? "done" : ""}" data-act="gostep" data-id="${k.id}" data-v="${x.key}" ${i === cur ? 'aria-current="step"' : ""}><span class="stp-n">${done ? TICK : ""}</span><span class="stp-l">${x.label}</span><span class="stp-m">${x.min} min</span></button>`;
  }).join("")}</nav><p class="stepper-note muted small">About ${total} minutes in all. Follow the steps in order, or tap any step to jump to it.</p>`;
}
const script = (text) => `<div class="script"><span class="script-k">Say</span><p>${text}</p></div>`;

function readyHTML(k, s) {
  const st = storyById(s.storyId) || nextStoryFor(k), name = esc(first(k.name));
  if (st && !s.storyId) s.storyId = st.id;
  return `${catchupHTML(k)}<div class="s9 stack" style="gap:var(--gap);align-content:start">
    <section class="panel"><div class="panel-head"><h2>Today's lesson with ${name}</h2><span class="muted small">Share your screen in Zoom now</span></div>
      <ol class="plan-list">
        <li><b>Warm-up words</b><span>Flash cards of words ${name} missed last time, plus this level's tricky words.</span></li>
        <li><b>Teach new words</b><span>Go over the tricky words and this level's sound before reading${st ? ` “${esc(st.title)}”` : ""}.</span></li>
        <li><b>Read the story</b><span>${name} reads aloud. You time it and tap any word they get wrong.</span></li>
        <li><b>Questions</b><span>Three quick questions to check they understood.</span></li>
        <li><b>Read again</b><span>Re-read the same story to build speed, or read a new one.</span></li>
        <li><b>Wrap up</b><span>Write a short note for next week's tutor.</span></li>
      </ol>
      ${script(`Hi ${name}! Today we'll practise some words, read a story together and then talk about it. Ready?`)}
      <div class="inline" style="margin-top:16px"><button class="btn primary big" data-act="gostep" data-id="${k.id}" data-v="warmup">Start: Warm-up words</button>
        <button class="btn quiet" data-act="gostep" data-id="${k.id}" data-v="prep">Skip the warm-up</button></div>
    </section></div>`;
}

function prepHTML(k, s) {
  const st = storyById(s.storyId) || nextStoryFor(k);
  if (!st) return `<section class="panel"><div class="empty"><b>No stories found</b></div></section>`;
  s.storyId = st.id;
  const lv = levelOf(st.level), name = esc(first(k.name)), pat = patternWords(st), tricky = st.tricky || [];
  const pw = new Set(practiceWords(k.id)), watch = [...new Set(tokens(st.text).map(clean))].filter(w => pw.has(w)).slice(0, 8);
  return `<section class="panel">
    <div class="panel-head"><div><h2>Before reading: “${esc(st.title)}”</h2><p class="muted small" style="margin-top:2px">Level ${st.level} · ${wordCount(st.text)} words${st.forKid ? ` · practice story for ${name}` : ""}${s.round > 1 ? " · second story" : ""}</p></div>
      <div class="inline"><button class="btn small quiet" data-act="gostep" data-id="${k.id}" data-v="pick">Choose a different story</button></div></div>
    <div class="prep-grid">
      ${tricky.length ? `<div class="prep-box"><h3>Tricky words</h3><p class="muted small">These don't follow the sound rules, so ${name} has to remember them.</p>
        <div class="bigwords">${tricky.map(w => `<span>${esc(w)}</span>`).join("")}</div>
        ${script(`Read each word, then ask ${name} to say it back: “This word is <i>${esc(tricky[0])}</i>. Your turn.”`)}</div>` : ""}
      ${pat.length ? `<div class="prep-box"><h3>Today's sound: ${esc(lv.name)}</h3><p class="muted small">Words from the story that use this level's pattern.</p>
        <div class="bigwords">${pat.map(w => `<span>${esc(w)}</span>`).join("")}</div>
        ${script(`Point to each word. “Sound it out with me… now read it fast.”`)}</div>` : ""}
      ${watch.length ? `<div class="prep-box warnbox"><h3>Watch for these</h3><p class="muted small">${name} missed these before, and they're in this story.</p>
        <div class="bigwords">${watch.map(w => `<span>${esc(w)}</span>`).join("")}</div></div>` : ""}
    </div>
    ${script(`This story is called “${esc(st.title)}”. What do you think it will be about? Read it out loud for me, and take your time.`)}
    <div class="inline" style="margin-top:16px"><button class="btn primary big" data-act="read" data-id="${k.id}" data-story="${st.id}">Start reading</button>
      <span class="muted small">Tap <b>Start timer</b> on the next screen as ${name} begins.</span></div>
  </section>`;
}

function secondHTML(k, s) {
  const name = esc(first(k.name)), prev = s.result, next = nextStoryFor(k, prev?.storyId);
  return `<section class="panel"><div class="panel-head"><h2>Second reading</h2><span class="muted small">Pick one</span></div>
    <div class="choice-grid">
      <button class="choice" data-act="reread" data-id="${k.id}" ${prev ? "" : "disabled"}><b>Read “${esc(prev?.title || "the same story")}” again</b><span>Best for building speed. Most kids read faster the second time, and you'll see the change in words a minute.</span></button>
      ${next ? `<button class="choice" data-act="newsecond" data-id="${k.id}" data-story="${next.id}"><b>Read a new story: “${esc(next.title)}”</b><span>Best if ${name} read the first one easily (95% or more). We'll go over its new words first.</span></button>` : ""}
    </div>
    ${script(`Great reading! Let's read ${prev ? "it" : "a story"} one more time. See if you can make it sound smooth, like you're telling it to a friend.`)}
    <div class="inline" style="margin-top:14px"><button class="btn quiet" data-act="gostep" data-id="${k.id}" data-v="wrap">Skip to wrap up</button></div>
  </section>`;
}

function wrapHTML(k, s) {
  const name = esc(first(k.name)), rs = readingsOf(k.id).filter(r => r.date === TODAY && r.tutorId === S.me).slice().reverse();
  const w = D.warmups.find(x => x.studentId === k.id && x.date === TODAY), saved = D.notes.find(n => n.id === `${TODAY}_${k.id}`);
  const same = rs.length > 1 && rs[0].storyId === rs[1].storyId && rs[0].seconds && rs[1].seconds;
  if (s.wrapNote == null) s.wrapNote = saved?.text || templateNote(k);
  const others = myKids().filter(x => x.id !== k.id), nextKid = others.find(x => !D.notes.some(n => n.id === `${TODAY}_${x.id}`)) || others[0];
  return `<section class="panel"><div class="panel-head"><h2>Wrap up with ${name}</h2>${saved ? `<span class="chip good">Note saved</span>` : ""}</div>
    <div class="result-nums">
      <div class="tile"><span class="k">Warm-up</span><span class="v">${w ? `${w.right.length}<small>of ${w.right.length + w.wrong.length}</small>` : "–"}</span></div>
      <div class="tile"><span class="k">Stories read</span><span class="v">${rs.length}</span><span class="c">${rs.length ? `${pct(avg(rs.map(r => r.accuracy)))} accuracy` : "None yet"}</span></div>
      <div class="tile"><span class="k">Reading speed</span><span class="v">${same ? `${Math.round(rs[0].wcpm)} → ${Math.round(rs[1].wcpm)}` : rs.find(r => r.seconds) ? Math.round(rs.find(r => r.seconds).wcpm) : "–"}</span><span class="c">${same ? "Words a minute, first read to second" : "Words correct a minute"}</span></div>
    </div>
    ${script(`You worked really hard today, ${name}. ${rs.length ? "Your reading is getting better every week. " : ""}See you next Sunday!`)}
    <div class="field" style="margin-top:16px"><label for="wrap-${k.id}">Note for next week's tutor</label>
      <textarea id="wrap-${k.id}" rows="3" data-input-sess="wrapNote" data-id="${k.id}" placeholder="What went well, what to practise next">${esc(s.wrapNote)}</textarea></div>
    <div class="inline" style="margin-top:14px"><button class="btn primary" data-act="savewrap" data-id="${k.id}">${saved ? "Update note" : "Save note"}</button>
      ${nextKid ? `<button class="btn" data-act="tab" data-id="${nextKid.id}">Go to ${esc(first(nextKid.name))}</button>` : ""}
      <button class="btn quiet" data-act="endlesson">End lesson for everyone</button></div>
  </section>`;
}

function kidWorkHTML(k) {
  const s = sess(k.id);
  if (s.mode === "check") return `<section>${checkHTML(k, s)}</section>`;
  if (s.mode === "checkResult") return `<section class="panel">${checkResultHTML(k, s)}</section>`;
  if (!k.level) return testIntroHTML(k);
  const top = stepperHTML(k, s);
  if (s.mode === "read") return top + `<section>${readerHTML(k, s)}</section>`;
  if (s.mode === "warmup") return top + `<section>${s.warm ? warmupHTML(k, s) : ""}</section>`;
  if (s.mode === "questions") return top + `<section>${questionsHTML(k, s)}</section>`;
  if (s.mode === "result") return top + `<section class="panel">${resultHTML(k, s)}</section>`;
  if (s.mode === "prep") return top + prepHTML(k, s);
  if (s.mode === "second") return top + secondHTML(k, s);
  if (s.mode === "wrap") return top + wrapHTML(k, s);
  if (s.mode === "pick") return top + planHTML(k, s).replace('<div class="s9 stack"', '<div class="stack" style="grid-column:1/-1"');
  return top + readyHTML(k, s);
}

function testIntroHTML(k) {
  return `<section class="panel">
    <div class="panel-head"><h2>${esc(k.name)} is new. Start with the placement test.</h2></div>
    <p style="max-width:62ch">It takes about five minutes and has three parts: letter sounds, made-up words, then a short story. Share your screen so ${esc(first(k.name))} can see it. At the end you'll get a suggested level to start at.</p>
    <div class="inline" style="margin-top:18px"><button class="btn primary" data-act="check" data-id="${k.id}">Start placement test</button>
      <label class="muted small" for="lvlpick-${k.id}">Already know their level?</label>
      <select id="lvlpick-${k.id}" data-act-change="setlevel" data-id="${k.id}"><option value="">Choose a level</option>${LEVELS.map(l => `<option value="${l.n}">Level ${l.n} · ${esc(l.name)}</option>`).join("")}</select></div>
  </section>`;
}

function catchupHTML(k) {
  const rs = readingsOf(k.id), last = rs.find(r => r.date !== TODAY) || rs[0], lv = levelOf(k.level), words = practiceWords(k.id), note = latestNote(k.id), att = kidAttendance(k.id);
  return `<section class="panel s3 catch">
    <h3>${esc(k.name)}</h3>
    <p class="muted small" style="margin-top:2px">Level ${lv.n} · ${esc(lv.name)}</p>
    <div class="facts">
      <div><div class="k">Last time</div><div class="v">${last ? `${fmtDay(last.date)} with ${esc(first(tutor(last.tutorId)?.name) || "a tutor")}<br><span class="num">${pct(last.accuracy)}</span> accuracy${last.seconds ? ` · <span class="num">${Math.round(last.wcpm)}</span> words a minute` : ""}` : "First lesson after the test"}</div></div>
      ${note ? `<div><div class="k">Note from ${esc(first(tutor(note.by)?.name) || "last tutor")}, ${fmtShort(note.date)}</div><div class="note">${esc(note.text)}</div></div>` : ""}
      ${words.length ? `<div><div class="k">Words to practise</div><div class="words">${words.map(w => `<span class="chip">${esc(w)}</span>`).join("")}</div></div>` : ""}
      ${att.of > 1 ? `<div><div class="k">Attendance</div><div class="v">Came ${att.came} of the last ${att.of} classes</div></div>` : ""}
    </div>
    ${sess(k.id).hideHint === k.level ? "" : levelHint(k, false)}
    <div class="inline" style="margin-top:16px"><button class="btn small quiet" data-act="check" data-id="${k.id}">Re-test level</button></div>
  </section>`;
}

function planHTML(k, s) {
  const today = readingsOf(k.id).filter(r => r.date === TODAY);
  const warm = D.warmups.some(w => w.studentId === k.id && w.date === TODAY);
  const qd = today.some(r => r.questions && r.questions.length);
  const n = s.browse || k.level, lv = levelOf(n);
  const done = new Map(); readingsOf(k.id).forEach(r => { if (!done.has(r.storyId)) done.set(r.storyId, r); });
  const list = storiesAt(n).filter(st => !st.forKid || st.forKid === k.id);
  const practice = list.filter(st => st.forKid && !done.get(st.id)).sort((a, b) => (b.at || 0) - (a.at || 0));
  const unread = list.filter(st => !st.forKid && !done.get(st.id));
  const read = list.filter(st => done.get(st.id)).sort((a, b) => (done.get(b.id).at || 0) - (done.get(a.id).at || 0));
  const libTotal = list.filter(st => !st.forKid).length, libRead = list.filter(st => !st.forKid && done.get(st.id)).length;
  const pw = practiceWords(k.id), name = esc(first(k.name));
  const storyRow = (st, kind) => {
    const r = done.get(st.id);
    if (kind === "read") return `<div class="row done"><div class="grow"><div class="t">${esc(st.title)}</div><div class="m">${wordCount(st.text)} words${st.forKid ? " · practice story" : ""}</div></div>
      <span class="chip ${r.accuracy >= .95 ? "good" : r.accuracy >= .9 ? "" : "warn"}">Read ${fmtShort(r.date)} · ${pct(r.accuracy)}</span>
      <button class="btn small quiet" data-act="${pickAct}" data-id="${k.id}" data-story="${st.id}">Read again</button></div>`;
    const next = kind === "next";
    return `<div class="row ${next ? "upnext" : ""}"><div class="grow"><div class="t">${esc(st.title)}</div><div class="m">${wordCount(st.text)} words${st.forKid ? ` · practice story for ${name}` : ""}</div></div>
      ${next ? `<span class="chip accent">Up next</span>` : ""}
      <button class="btn small ${next || st.forKid ? "primary" : ""}" data-act="${pickAct}" data-id="${k.id}" data-story="${st.id}">${pickAct === "choose" ? "Choose" : "Read"}</button></div>`;
  };
  const pickAct = s.mode === "pick" ? "choose" : "read";
  return `<div class="s9 stack" style="gap:var(--gap);align-content:start">
    ${s.mode === "pick" ? "" : `<section class="panel"><div class="panel-head"><h2>Today with ${esc(first(k.name))}</h2><span class="muted small">About an hour: warm-up, a story with questions, then a second story</span></div>
      <div class="plan">
        <button class="step ${warm ? "done" : ""}" data-act="warmup" data-id="${k.id}">${warm ? TICK : ""}Warm-up words</button>
        <button class="step ${today.length ? "done" : ""}" data-act="scrollstories">${today.length ? TICK : ""}First story</button>
        <span class="step ${qd ? "done" : ""}" style="cursor:default">${qd ? TICK : ""}Story questions</span>
        <button class="step ${today.length > 1 ? "done" : ""}" data-act="scrollstories">${today.length > 1 ? TICK : ""}Second story</button>
      </div></section>`}
    <section class="panel" id="stories">
      <div class="panel-head"><h2>${s.mode === "pick" ? `Choose a story for ${name}` : `Level ${n} stories`} <span class="muted" style="font-weight:400">${s.mode === "pick" ? `Level ${n} · ` : ""}${esc(lv.name)} · about UFLI ${lv.ufli}</span></h2>
        <div class="inline"><button class="btn small quiet" data-act="browse" data-id="${k.id}" data-n="${n - 1}" ${n <= 1 ? "disabled" : ""}>Easier</button>
        <button class="btn small quiet" data-act="browse" data-id="${k.id}" data-n="${n + 1}" ${n >= 12 ? "disabled" : ""}>Harder</button></div></div>
      ${n !== k.level ? `<p class="muted small" style="margin:-6px 0 12px">${name} is on Level ${k.level}. <button class="linkish" data-act="browse" data-id="${k.id}" data-n="${k.level}">Back to their level</button></p>` : ""}
      <div class="ai-card">
        <div class="grow"><div class="t">Practice story made for ${name}</div>
          <div class="m">${s.writing ? "Writing a new story… this takes a few seconds" : pw.length ? `AI writes a new Level ${n} story using the words ${name} keeps missing` : `AI writes a brand new Level ${n} story. After ${name} reads a story, it will use the words they miss.`}</div>
          ${pw.length && !s.writing ? `<div class="words" style="margin-top:8px">${pw.slice(0, 6).map(w => `<span class="chip">${esc(w)}</span>`).join("")}</div>` : ""}</div>
        <button class="btn primary" data-act="newstory" data-id="${k.id}" ${s.writing ? "disabled" : ""}>${s.writing ? '<span class="spin"></span> Writing' : "Make practice story"}</button>
      </div>
      <div class="progress-line"><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${libTotal}" aria-valuenow="${libRead}" aria-label="Library stories read at this level"><i style="width:${libTotal ? (libRead / libTotal) * 100 : 0}%"></i></div>
        <span class="small num"><b>${libRead}</b> <span class="muted">of ${libTotal} read at Level ${n}</span></span></div>
      ${practice.length ? `<h3 class="group-h">Practice stories for ${name} <span class="count">${practice.length}</span></h3><div class="stack">${practice.map(st => storyRow(st, "practice")).join("")}</div>` : ""}
      <h3 class="group-h">Up next <span class="count">${unread.length}</span></h3>
      ${unread.length ? `<div class="stack">${unread.map((st, i) => storyRow(st, i === 0 ? "next" : "unread")).join("")}</div>`
        : `<div class="empty"><b>${name} has read every Level ${n} story.</b>${n < 12 ? `Try <button class="linkish" data-act="browse" data-id="${k.id}" data-n="${n + 1}">Level ${n + 1}</button>, make a practice story, or read a favourite again below.` : "Make a practice story, or read a favourite again below."}</div>`}
      ${read.length ? `<button class="group-toggle" data-act="toggleread" data-id="${k.id}" aria-expanded="${!!s.showRead}"><span>${s.showRead ? "Hide" : "Show"} stories already read</span><span class="count">${read.length}</span></button>
        ${s.showRead ? `<div class="stack">${read.map(st => storyRow(st, "read")).join("")}</div>` : ""}` : ""}
    </section></div>`;
}

/* ---------- warm-up cards ---------- */
function warmupHTML(k, s) {
  const w = s.warm, i = w.i, done = i >= w.words.length;
  if (done) {
    const wrong = w.words.filter((_, j) => w.res[j] === false);
    return `<div class="reader"><div class="reader-bar"><div class="ttl">Warm-up done for ${esc(k.name)}</div></div>
      <div class="result-nums" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="tile"><span class="k">Read correctly</span><span class="v">${w.words.length - wrong.length}<small>of ${w.words.length}</small></span></div>
      <div class="tile"><span class="k">To keep practising</span><span class="c" style="margin-top:auto">${wrong.length ? "" : "None. Great start!"}</span><div class="words">${wrong.map(x => `<span class="chip bad">${esc(x)}</span>`).join("")}</div></div></div>
      <div class="inline"><button class="btn primary big" data-act="gostep" data-id="${k.id}" data-v="prep">Next: Teach new words</button><button class="btn" data-act="gostep" data-id="${k.id}" data-v="warmup">Do it again</button></div></div>`;
  }
  return `<div class="reader">
    <div class="reader-bar"><div><button class="linkish" data-act="gostep" data-id="${k.id}" data-v="prep">Skip to new words</button><div class="ttl">Warm-up words for ${esc(k.name)}</div></div>
      <span class="muted num">Word ${i + 1} of ${w.words.length}</span></div>
    ${i === 0 ? script(`Let's warm up! Read each word as fast as you can. If you're not sure, sound it out.`) : ""}
    <div class="flash-word" aria-live="polite">${esc(w.words[i])}</div>
    <div class="flash-btns"><button class="btn" data-act="wcard" data-id="${k.id}" data-ok="0">Wrong</button><button class="btn primary" data-act="wcard" data-id="${k.id}" data-ok="1">Right</button></div>
    <p class="muted small" style="text-align:center;margin-top:14px">Keyboard: left arrow for wrong, right arrow for right</p>
  </div>`;
}

/* ---------- reader ---------- */
function storyBody(text, marked, kid, act = "mark") {
  let wi = -1;
  return paragraphs(text).map(p => `<p>${tokens(p).map(t => { if (!isWord(t)) return esc(t); wi++; const i = wi; return `<button class="w ${marked.has(i) ? "miss" : ""}" data-act="${act}" data-i="${i}" data-id="${kid}" aria-pressed="${marked.has(i)}">${esc(t)}</button>`; }).join(" ")}</p>`).join("");
}
function readerHTML(k, s) {
  const st = storyById(s.storyId);
  if (!st) return `<div class="empty"><b>This story was removed</b><button class="linkish" data-act="home" data-id="${k.id}">Back to stories</button></div>`;
  const total = wordCount(st.text), size = 36 + S.textSize * 4;
  return `<div class="reader">
    <div class="reader-bar">
      <div><button class="linkish" data-act="gostep" data-id="${k.id}" data-v="prep">Back to new words</button>
        <div class="ttl">${esc(k.name)} is reading${s.round > 1 ? (s.reread ? " again" : " a second story") : ""} · Level ${st.level}</div></div>
      <div class="inline">
        <button class="btn small quiet" data-act="size" data-d="-1" aria-label="Smaller text">A−</button>
        <button class="btn small quiet" data-act="size" data-d="1" aria-label="Bigger text">A+</button>
        <span class="timer" data-timer="${k.id}">${fmtTime(elapsed(s))}</span>
        <button class="btn ${s.running ? "" : "primary"} ${!s.running && !elapsed(s) ? "nudge" : ""}" data-act="timer" data-id="${k.id}">${s.running ? "Pause" : elapsed(s) ? "Resume" : "Start timer"}</button>
      </div>
    </div>
    ${!s.running && !elapsed(s) && s.marked.size ? `<p class="timer-hint">The timer isn't running. Tap <b>Start timer</b> so we can measure reading speed.</p>` : ""}
    ${s.askTime ? `<div class="asktime"><div><b>The timer wasn't started.</b> <span class="muted">About how long did ${esc(first(k.name))} take to read it?</span></div>
      <div class="inline">${[1, 2, 3, 4, 5, 6].map(m => `<button class="btn small" data-act="settime" data-id="${k.id}" data-m="${m}">${m} min</button>`).join("")}<button class="btn small quiet" data-act="settime" data-id="${k.id}" data-m="0">Not sure, save without speed</button></div></div>` : ""}
    <div class="story" style="--size:${size}px"><h2>${esc(st.title)}</h2>${storyBody(st.text, s.marked, k.id)}</div>
    <div class="reader-foot">
      <div class="stack">
        <p class="muted small">Tap a word they get wrong or skip. Tap again to undo.${(st.tricky || []).length ? " Tricky words to go over first:" : ""}</p>
        ${(st.tricky || []).length ? `<div class="tricky">${st.tricky.map(w => `<span class="chip">${esc(w)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="stack" style="justify-items:end">
        <span class="num" style="font-size:15px"><b id="misscount">${s.marked.size}</b> <span class="muted">of ${total} words missed</span></span>
        <button class="btn primary" data-act="finish" data-id="${k.id}">Finish reading</button>
        <button class="linkish" data-act="restart" data-id="${k.id}">Start over</button>
      </div>
    </div></div>`;
}
const elapsed = s => (s.acc || 0) + (s.running ? Date.now() - s.startedAt : 0);
let tickI = null;
function tickTimers() {
  const any = Object.values(S.sessions).some(s => s.running);
  if (any && !tickI) tickI = setInterval(() => document.querySelectorAll("[data-timer]").forEach(el => { const s = S.sessions[el.dataset.timer]; if (s) el.textContent = fmtTime(elapsed(s)); }), 250);
  if (!any && tickI) { clearInterval(tickI); tickI = null; }
}

/* ---------- questions ---------- */
function questionsHTML(k, s) {
  const q = s.q;
  if (q.loading) return `<div class="reader"><div class="reader-bar"><div class="ttl">Questions about “${esc(s.result.title)}”</div></div><p style="padding:32px 0"><span class="spin"></span> Writing three questions…</p></div>`;
  if (!q.items) return `<div class="reader"><div class="reader-bar"><div class="ttl">Questions about “${esc(s.result.title)}”</div></div>
    <p style="padding:20px 0 16px">${esc(q.error || "No questions for this story.")} You can ask your own questions out loud instead.</p>
    <div class="inline"><button class="btn" data-act="qretry" data-id="${k.id}">Try again</button><button class="btn primary" data-act="qskip" data-id="${k.id}">Skip to results</button></div></div>`;
  const answered = q.marks.filter(m => m != null).length;
  return `<div class="reader">
    <div class="reader-bar"><div><div class="ttl">Questions about “${esc(s.result.title)}”</div><p class="muted small">Ask each question out loud. Mark whether ${esc(first(k.name))} understood.</p></div>
      <button class="btn small quiet" data-act="qshow" data-id="${k.id}">${q.show ? "Hide answers" : "Show answers to me"}</button></div>
    ${script(`Now I'm going to ask you some questions about the story. You can look back at it if you need to.`)}
    <div class="qs" style="padding-top:8px">${q.items.map((it, i) => `<div class="q"><div class="qt">${esc(it.q)}</div>
      <div class="seg" role="group" aria-label="Question ${i + 1}"><button class="no" aria-pressed="${q.marks[i] === false}" data-act="qmark" data-id="${k.id}" data-i="${i}" data-ok="0">Not yet</button><button class="ok" aria-pressed="${q.marks[i] === true}" data-act="qmark" data-id="${k.id}" data-i="${i}" data-ok="1">Got it</button></div>
      ${q.show ? `<div class="qa">Answer: ${esc(it.a)}</div>` : ""}</div>`).join("")}</div>
    <div class="inline" style="justify-content:flex-end;padding-top:12px"><button class="btn quiet" data-act="qskip" data-id="${k.id}">Skip</button><button class="btn primary" data-act="qsave" data-id="${k.id}" ${answered ? "" : "disabled"}>Save answers</button></div>
  </div>`;
}
async function loadQuestions(kid) {
  const s = sess(kid), st = storyById(s.result.storyId);
  const have = st && questionsFor(st);
  if (have) { s.q = { items: have, marks: have.map(() => null) }; render(); return; }
  s.q = { loading: true }; render();
  try {
    const out = await AI.call("questions", { title: st.title, text: st.text, level: st.level });
    s.q = { items: out.questions, marks: out.questions.map(() => null) };
    Store.set("questions", st.id, { items: out.questions, at: Date.now() }).catch(() => {});
  } catch (e) { s.q = { error: e.message }; }
  if (S.activeKid === kid) render();
}

/* ---------- results ---------- */
function resultHTML(k, s) {
  const r = { ...s.result, ...(D.readings.find(x => x.id === s.resultId) || {}) };
  const qs = r.questions || [];
  return `<div class="panel-head"><h2>${esc(k.name)} finished “${esc(r.title)}”</h2><span class="chip good">Saved</span></div>
    <div class="result-nums" style="grid-template-columns:repeat(${qs.length ? 4 : 3},minmax(0,1fr))">
      <div class="tile"><span class="k">Accuracy</span><span class="v">${Math.round(r.accuracy * 100)}<small>%</small></span></div>
      <div class="tile"><span class="k">Words correct a minute</span><span class="v">${r.seconds ? Math.round(r.wcpm) : "–"}</span><span class="c">${r.seconds ? `in ${fmtTime(r.seconds * 1000)}` : "Timer wasn't started"}</span></div>
      <div class="tile"><span class="k">Words missed</span><span class="v">${r.errors}<small>of ${r.total}</small></span></div>
      ${qs.length ? `<div class="tile"><span class="k">Questions</span><span class="v">${qs.filter(q => q.ok).length}<small>of ${qs.length}</small></span></div>` : ""}
    </div>
    ${r.missed.length ? `<p class="muted small">Missed</p><div class="words" style="margin-bottom:16px">${r.missed.map(w => `<span class="chip bad">${esc(w)}</span>`).join("")}</div>` : `<p style="margin-bottom:16px">No words missed. Well done!</p>`}
    ${s.hideHint === k.level ? "" : levelHint(k, true)}
    <div class="field" style="margin-bottom:16px;max-width:640px"><label for="rnote-${k.id}">Anything to remember about this story? (optional)</label>
      <div class="inline"><input type="text" id="rnote-${k.id}" data-input-sess="rnote" data-id="${k.id}" value="${esc(s.rnote ?? r.note ?? "")}" placeholder="e.g. Guessed from pictures, needs help with sh"><button class="btn" data-act="savernote" data-id="${k.id}">Save</button></div></div>
    ${s.round > 1 ? `<div class="inline"><button class="btn primary big" data-act="gostep" data-id="${k.id}" data-v="wrap">Next: Wrap up</button><button class="btn" data-act="gostep" data-id="${k.id}" data-v="second">Read one more</button></div>`
      : `<div class="inline"><button class="btn primary big" data-act="gostep" data-id="${k.id}" data-v="second">Next: Read again</button><button class="btn quiet" data-act="gostep" data-id="${k.id}" data-v="wrap">Skip to wrap up</button></div>`}
    <div class="undo-line">${s.confirmDel ? `<span>Delete this reading? It will be removed from ${esc(first(k.name))}'s progress.</span><button class="btn small danger" data-act="delresult" data-id="${k.id}">Yes, delete it</button><button class="btn small quiet" data-act="canceldel" data-id="${k.id}">Keep it</button>`
      : `<button class="linkish muted-link" data-act="askdel" data-id="${k.id}">Saved by mistake? Delete this reading</button>`}</div>`;
}

/* ---------- placement test ---------- */
const CHECK_STEPS = ["Letter sounds", "Made-up words", "Short story"];
function checkHTML(k, s) {
  const c = s.check, step = c.step, PLACEMENT = PLACEMENTS[c.v || 0];
  let body = "", hint = "";
  if (step === 0) { hint = "Ask them to say the sound each letter makes, left to right. Start the timer as they begin. Tap any sound they get wrong."; body = `<div class="grid-items letters">${PLACEMENT.letters.map((l, i) => `<button class="gi ${c.miss[0].has(i) ? "miss" : ""}" data-act="cmark" data-id="${k.id}" data-i="${i}" aria-pressed="${c.miss[0].has(i)}">${l}</button>`).join("")}</div>`; }
  if (step === 1) { hint = "These are made-up words, so they have to sound them out. Tap any word read wrong. No timer needed."; let i = -1; body = `<div class="grid-items nwords">${PLACEMENT.bands.map(b => `<span class="band-label">${esc(b.label)}</span>${b.words.map(w => { i++; return `<button class="gi ${c.miss[1].has(i) ? "miss" : ""}" data-act="cmark" data-id="${k.id}" data-i="${i}" aria-pressed="${c.miss[1].has(i)}">${w}</button>`; }).join("")}`).join("")}</div>`; }
  if (step === 2) { hint = "Start the timer as they begin reading. Tap any word read wrong or skipped. Stop when they finish or after two minutes."; body = `<div class="story" style="--size:${36 + S.textSize * 4}px"><h2>${PLACEMENT.passage.title}</h2>${storyBody(PLACEMENT.passage.text, c.miss[2], k.id, "cmark")}</div>`; }
  const timed = step !== 1;
  return `<div class="reader">
    <div class="reader-bar">
      <div><button class="linkish" data-act="home" data-id="${k.id}">Cancel test</button>
        <div class="ttl">Placement test for ${esc(k.name)} <span class="muted small" style="font-weight:400">· version ${(c.v || 0) + 1} of 3</span></div>
        <div class="steps" style="margin-top:6px">${CHECK_STEPS.map((n, i) => `<span class="chip ${i === step ? "accent" : i < step ? "good" : ""}">${n}</span>`).join("")}</div></div>
      ${timed ? `<div class="inline"><span class="timer" data-timer="${k.id}">${fmtTime(elapsed(s))}</span><button class="btn ${s.running ? "" : "primary"}" data-act="timer" data-id="${k.id}">${s.running ? "Pause" : elapsed(s) ? "Resume" : "Start timer"}</button></div>` : ""}
    </div>
    <p class="muted" style="margin-top:14px;max-width:70ch">${hint}</p>
    ${body}
    <div class="inline" style="justify-content:flex-end"><span class="muted num" id="cwrong">${c.miss[step].size} wrong</span>
      ${step > 0 ? `<button class="btn" data-act="cstep" data-id="${k.id}" data-d="-1">Back</button>` : ""}
      <button class="btn primary" data-act="cstep" data-id="${k.id}" data-d="1">${step === 2 ? "Finish test" : "Next part"}</button></div>
  </div>`;
}
function scoreCheck(c) {
  const PLACEMENT = PLACEMENTS[c.v || 0];
  const lettersRight = PLACEMENT.letters.length - c.miss[0].size;
  const lpm = c.secs[0] ? lettersRight / (c.secs[0] / 60) : null;
  const bandScores = PLACEMENT.bands.map((b, bi) => b.words.filter((_, wi) => !c.miss[1].has(bi * 5 + wi)).length);
  const ptotal = wordCount(PLACEMENT.passage.text);
  const pacc = (ptotal - c.miss[2].size) / ptotal;
  const pwcpm = c.secs[2] ? (ptotal - c.miss[2].size) / (c.secs[2] / 60) : null;
  let level, why;
  if (lettersRight < PLACEMENT.letters.length * 0.8 || (lpm != null && lpm < 20)) { level = 1; why = "Still learning letter sounds"; }
  else {
    const fail = PLACEMENT.bands.findIndex((b, i) => bandScores[i] < 4);
    if (fail >= 0) { level = PLACEMENT.bands[fail].level; why = `Missed 2 or more ${PLACEMENT.bands[fail].label.toLowerCase()} words`; }
    else if (pacc < 0.95 || (pwcpm != null && pwcpm < 60)) { level = 10; why = "Decodes well; vowel teams and fluency next"; }
    else { level = 12; why = "Strong on every part"; }
  }
  return { lettersRight, lettersTotal: PLACEMENT.letters.length, lpm, bandScores, pacc, pwcpm, level, why };
}
function checkResultHTML(k, s) {
  const r = s.checkResult;
  return `<div class="panel-head"><h2>Placement test for ${esc(k.name)}</h2></div>
    <div class="result-nums">
      <div class="tile"><span class="k">Letter sounds</span><span class="v">${r.lettersRight}<small>of ${r.lettersTotal}</small></span><span class="c">${r.lpm != null ? `${Math.round(r.lpm)} correct a minute` : "Not timed"}</span></div>
      <div class="tile"><span class="k">Made-up words</span><span class="v">${r.bandScores.reduce((a, b) => a + b, 0)}<small>of 20</small></span><span class="c">${BAND_INFO.map((b, i) => `${b.label} ${r.bandScores[i]}/5`).join(" · ")}</span></div>
      <div class="tile"><span class="k">Short story</span><span class="v">${Math.round(r.pacc * 100)}<small>%</small></span><span class="c">${r.pwcpm != null ? `${Math.round(r.pwcpm)} words correct a minute` : "Not timed"}</span></div>
    </div>
    <p style="margin-bottom:12px"><b>Suggested start: Level ${r.level}, ${esc(levelOf(r.level).name)}.</b> <span class="muted">${esc(r.why)}.</span></p>
    <div class="inline"><label class="muted small" for="clevel-${k.id}">Start at</label>
      <select id="clevel-${k.id}" data-input-sess="chosen" data-id="${k.id}">${LEVELS.map(l => `<option value="${l.n}" ${(s.chosen || r.level) == l.n ? "selected" : ""}>Level ${l.n} · ${esc(l.name)}</option>`).join("")}</select>
      <button class="btn primary" data-act="savecheck" data-id="${k.id}">Save and see stories</button></div>`;
}

/* ---------- end of lesson ---------- */
function factsFor(k) {
  const rs = readingsOf(k.id).filter(r => r.date === TODAY && r.tutorId === S.me);
  const w = D.warmups.find(x => x.studentId === k.id && x.date === TODAY);
  const c = D.checks.find(x => x.studentId === k.id && x.date === TODAY);
  const lines = [`Child: ${first(k.name)}, Level ${k.level || "not set"}${k.level ? ` (${levelOf(k.level).name})` : ""}.`];
  if (c) lines.push(`Took the placement test today and was placed at Level ${c.level}.`);
  if (w) lines.push(`Warm-up words: ${w.right.length} of ${w.right.length + w.wrong.length} right${w.wrong.length ? `; missed ${w.wrong.join(", ")}` : ""}.`);
  rs.slice().reverse().forEach(r => lines.push(`Read "${r.title}" (Level ${r.level}): ${Math.round(r.accuracy * 100)}% accuracy${r.seconds ? `, ${Math.round(r.wcpm)} words correct a minute` : ""}${r.missed.length ? `, missed ${r.missed.slice(0, 8).join(", ")}` : ", no words missed"}${r.questions?.length ? `, understood ${r.questions.filter(q => q.ok).length} of ${r.questions.length} questions` : ""}${r.note ? `. Tutor's note: ${r.note}` : ""}.`));
  if (!rs.length && !w && !c) lines.push("No stories were recorded today.");
  if (readyToMoveUp(k)) lines.push(`Ready to move up to Level ${k.level + 1}.`);
  if (struggling(k)) lines.push(`Found Level ${k.level} hard; the last two stories were under 85%.`);
  return lines.join("\n");
}
function templateNote(k) {
  const rs = readingsOf(k.id).filter(r => r.date === TODAY && r.tutorId === S.me);
  if (!rs.length) return "";
  const a = avg(rs.map(r => r.accuracy)), words = [...new Set(rs.flatMap(r => r.missed))].slice(0, 5);
  return `Read ${plural(rs.length, "story", "stories")} at Level ${rs[0].level} with ${Math.round(a * 100)}% accuracy on average.${words.length ? ` Practise: ${words.join(", ")}.` : " No words missed."}${readyToMoveUp(k) ? ` Ready to move up to Level ${k.level + 1}.` : ""}`;
}
async function startSummary() {
  setStep("summary");
  const kids = myKids();
  S.summary = Object.fromEntries(kids.map(k => [k.id, { text: D.notes.find(n => n.id === `${TODAY}_${k.id}`)?.text || "", loading: true }]));
  render();
  for (const k of kids) {
    const item = S.summary[k.id];
    if (item.text) { item.loading = false; continue; }
    try { const out = await AI.call("summary", { facts: factsFor(k) }); item.text = out.note || templateNote(k); }
    catch { item.text = templateNote(k); item.fallback = true; }
    item.loading = false; render();
  }
  render();
}
function summaryHTML(me) {
  if (!S.summary) { setTimeout(startSummary, 0); return `<div class="col"><p class="muted"><span class="spin"></span> Getting notes ready…</p></div>`; }
  const kids = myKids();
  return `<div class="col">
    <div class="title-row"><div><h1 class="greet">Notes for next week.</h1><p class="sub">The next tutor sees these when they open each kid. Change anything that isn't right.</p></div></div>
    ${kids.map(k => { const it = S.summary[k.id] || { text: "" }; const rs = readingsOf(k.id).filter(r => r.date === TODAY);
      return `<section class="panel s6"><div class="panel-head"><h2>${esc(k.name)}</h2><span class="muted small">${plural(rs.length, "story", "stories")} today${rs.length ? ` · ${pct(avg(rs.map(r => r.accuracy)))} accuracy` : ""}</span></div>
        ${it.loading ? `<p class="muted"><span class="spin"></span> Writing a note…</p>` : `<textarea id="sum-${k.id}" rows="4" data-sum="${k.id}" placeholder="What went well, what to practise next">${esc(it.text)}</textarea>`}</section>`; }).join("")}
    <div class="pickbar" style="grid-column:1/-1"><button class="btn quiet" data-act="tostep" data-v="lesson">Back to the lesson</button><button class="btn primary" data-act="savesummary">Save notes and finish</button></div>
  </div>`;
}
function doneHTML(me) {
  const n = myKids().length;
  return `<div class="col"><div class="title-row"><div><h1 class="greet">Thank you, ${esc(first(me.name))}.</h1><p class="sub">Notes saved for ${plural(n, "kid")}. See you next Sunday.</p></div></div>
    <section class="panel s6"><div class="inline"><button class="btn primary" data-act="signout">Sign out</button><button class="btn" data-act="tostep" data-v="lesson">Back to the lesson</button></div></section></div>`;
}

/* ---------- Kids ---------- */
function kidsHTML() {
  const q = S.kidsQ.trim().toLowerCase();
  const list = activeStudents().filter(s => !q || s.name.toLowerCase().includes(q));
  return `<div class="col">
    <div class="title-row"><div><h1 class="h1">Kids</h1><p class="sub">${plural(activeStudents().length, "kid")} in the program. Pick one to see their progress.</p></div>
      <input type="search" id="kidsq" data-input="kidsQ" placeholder="Search by name" value="${esc(S.kidsQ)}" aria-label="Search kids"></div>
    <section class="panel">
      ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Level</th><th>Last read</th><th class="n">Accuracy</th><th class="n">Words a minute</th><th class="n">Classes</th></tr></thead><tbody>
      ${list.map(s => { const rs = readingsOf(s.id), l = rs[0], att = kidAttendance(s.id); return `<tr class="click" data-act="kid" data-id="${s.id}" tabindex="0"><td><b style="font-weight:500">${esc(s.name)}</b></td><td>${s.level ? `Level ${s.level} <span class="muted">· ${esc(levelOf(s.level).name)}</span>` : `<span class="chip warn">Needs test</span>`}</td><td>${l ? fmtDay(l.date) : '<span class="muted">–</span>'}</td><td class="n">${l ? pct(l.accuracy) : "–"}</td><td class="n">${l && l.seconds ? Math.round(l.wcpm) : "–"}</td><td class="n">${att.of ? `${att.came} of ${att.of}` : "–"}</td></tr>`; }).join("")}
      </tbody></table></div>` : `<div class="empty"><b>${q ? "No kid by that name" : "No kids yet"}</b>Tutors add kids on the Today's class page.</div>`}
    </section></div>`;
}
function kidHTML() {
  const k = student(S.kidId);
  if (!k) return `<div class="col"><div class="empty"><b>Kid not found</b><button class="linkish" data-act="go" data-v="kids">Back to all kids</button></div></div>`;
  const rs = readingsOf(k.id), lv = levelOf(k.level), timed = rs.filter(r => r.seconds), att = kidAttendance(k.id, 12);
  const firstW = timed[timed.length - 1], lastW = timed[0];
  const checks = D.checks.filter(c => c.studentId === k.id), notes = D.notes.filter(n => n.studentId === k.id && n.text).slice(0, 6);
  const withQ = rs.filter(r => r.questions?.length), comp = withQ.length ? avg(withQ.map(r => r.questions.filter(q => q.ok).length / r.questions.length)) : null;
  return `<div class="col">
    <div class="title-row"><div><button class="linkish back" data-act="go" data-v="kids">All kids</button><h1 class="h1">${esc(k.name)}</h1>
      <p class="sub">${lv ? `Level ${lv.n} · ${esc(lv.name)} · about UFLI lessons ${lv.ufli}` : "No level yet. The placement test runs when they join a lesson."}</p></div></div>
    <div class="col tiles" style="grid-column:1/-1;gap:var(--gap)">
      ${tile("Stories read", rs.length, rs.length ? `Since ${fmtDay(rs[rs.length - 1].date)}` : "None yet")}
      ${tile("Words a minute", lastW ? Math.round(lastW.wcpm) : "–", lastW && firstW && lastW !== firstW ? `${Math.round(lastW.wcpm - firstW.wcpm) >= 0 ? "+" : "−"}${Math.abs(Math.round(lastW.wcpm - firstW.wcpm))} since the first timed story` : "Latest timed story")}
      ${tile("Understanding", comp == null ? "–" : Math.round(comp * 100), comp == null ? "No story questions yet" : `Questions right, ${plural(withQ.length, "story", "stories")}`, comp == null ? "" : "%")}
      ${tile("Attendance", att.of ? `${att.came}<small>of ${att.of}</small>` : "–", att.of ? "Classes since joining, last 12" : "No classes yet")}
    </div>
    <section class="panel s9"><div class="panel-head"><h2>Progress, story by story</h2><div class="legend"><span><i style="background:var(--accent)"></i>Words correct a minute</span><span><i style="background:var(--muted)"></i>Accuracy</span></div></div>
      ${chartHTML(rs.slice().reverse())}</section>
    <section class="panel s3"><div class="panel-head"><h2>Settings</h2></div>
      <div class="stack" style="gap:14px">
        <div class="field"><label for="klevel">Reading level</label><select id="klevel" data-act-change="setlevel" data-id="${k.id}"><option value="">No level</option>${LEVELS.map(l => `<option value="${l.n}" ${k.level === l.n ? "selected" : ""}>Level ${l.n} · ${esc(l.name)}</option>`).join("")}</select></div>
        <form class="field" data-form="rename" data-id="${k.id}"><label for="kname">Name</label><div class="inline"><input type="text" id="kname" value="${esc(k.name)}"><button class="btn small" type="submit">Save</button></div></form>
        ${practiceWords(k.id).length ? `<div class="field"><label>Words to practise</label><div class="words">${practiceWords(k.id).map(w => `<span class="chip">${esc(w)}</span>`).join("")}</div></div>` : ""}
        ${checks.length ? `<div class="field"><label>Placement tests</label>${checks.map(c => `<div class="small">${fmtDay(c.date)}: Level ${c.level} <span class="muted">· letters ${c.lettersRight}/${c.lettersTotal}, words ${c.wordsRight}/20, story ${pct(c.passageAccuracy)}</span></div>`).join("")}</div>` : ""}
      </div></section>
    ${notes.length ? `<section class="panel"><div class="panel-head"><h2>Tutor notes <span class="count">${notes.length}</span></h2></div><div class="stack">${notes.map(n => `<div class="row"><div class="grow"><div class="m">${fmtDay(n.date)} · ${esc(tutor(n.tutorId)?.name || "Tutor")}</div><div>${esc(n.text)}</div></div></div>`).join("")}</div></section>` : ""}
    <section class="panel"><div class="panel-head"><h2>Every story <span class="count">${rs.length}</span></h2></div>
      ${rs.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Story</th><th>Tutor</th><th class="n">Accuracy</th><th class="n">Words a minute</th><th class="n">Questions</th><th>Missed</th><th><span class="sr">Fix</span></th></tr></thead><tbody>
      ${rs.map(r => `<tr><td style="white-space:nowrap">${fmtDay(r.date)}</td><td>${esc(r.title)} <span class="muted">· L${r.level}</span></td><td>${esc(tutor(r.tutorId)?.name || "–")}</td><td class="n">${pct(r.accuracy)}</td><td class="n">${r.seconds ? Math.round(r.wcpm) : "–"}</td><td class="n">${r.questions?.length ? `${r.questions.filter(q => q.ok).length}/${r.questions.length}` : "–"}</td><td>${(r.missed || []).map(esc).join(", ") || '<span class="muted">None</span>'}</td><td><button class="btn small quiet" data-act="fixrow" data-id="${r.id}" aria-expanded="${S.fixRow === r.id}">Fix</button></td></tr>
      ${S.fixRow === r.id ? `<tr class="fix"><td colspan="8"><div class="inline">
        <label class="muted small" for="move-${r.id}">Saved for the wrong kid? Move it to</label>
        <select id="move-${r.id}"><option value="">Choose a kid</option>${activeStudents().filter(x => x.id !== k.id).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select>
        <button class="btn small" data-act="fixmove" data-id="${r.id}">Move</button>
        <span class="muted small">or</span>
        <button class="btn small ${S.fixDel ? "danger" : "quiet"}" data-act="fixdel" data-id="${r.id}">${S.fixDel ? "Yes, delete this reading" : "Delete it"}</button>
      </div></td></tr>` : ""}`).join("")}
      </tbody></table></div>` : `<div class="empty"><b>No stories yet</b>Stories read in lessons show up here.</div>`}
    </section>
  </div>`;
}
function chartHTML(rs) {
  if (rs.length < 2) return `<div class="empty"><b>${rs.length ? "One story so far" : "No stories yet"}</b>The chart appears after two stories.</div>`;
  const W = 800, H = 240, L = 40, R = 48, T = 16, B = 30;
  const maxW = Math.max(40, Math.ceil(Math.max(...rs.map(r => r.wcpm || 0)) / 20) * 20);
  const x = i => L + i * (W - L - R) / (rs.length - 1);
  const yW = v => T + (H - T - B) * (1 - v / maxW), yA = v => T + (H - T - B) * (1 - v);
  const wPts = rs.map((r, i) => r.seconds ? [x(i), yW(r.wcpm)] : null);
  const path = pts => pts.filter(Boolean).map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  const lastW = [...wPts].reverse().find(Boolean), step = Math.max(1, Math.ceil(rs.length / 6));
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Words correct a minute and accuracy over ${rs.length} stories">
    ${[0, maxW / 2, maxW].map(t => `<line x1="${L}" x2="${W - R}" y1="${yW(t)}" y2="${yW(t)}" stroke="var(--border)" stroke-width="1"/><text class="axis" x="${L - 8}" y="${yW(t) + 4}" text-anchor="end">${t}</text>`).join("")}
    <text class="axis" x="${W - R + 8}" y="${yA(1) + 4}">100%</text><text class="axis" x="${W - R + 8}" y="${yA(.5) + 4}">50%</text>
    <path d="${path(rs.map((r, i) => [x(i), yA(r.accuracy)]))}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 4"/>
    <path d="${path(wPts)}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
    ${wPts.map(p => p ? `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="var(--accent)"/>` : "").join("")}
    ${lastW ? `<circle cx="${lastW[0]}" cy="${lastW[1]}" r="6" fill="var(--surface)" stroke="var(--accent)" stroke-width="2.5"/>` : ""}
    ${rs.map((r, i) => i % step === 0 || i === rs.length - 1 ? `<text class="axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${fmtShort(r.date)}</text>` : "").join("")}
  </svg></div>`;
}


/* ---------- tutor attendance calendar ---------- */
function attendanceHTML() {
  const days = classDays();
  const now = new Date(); const [cy, cm] = (S.calMonth || `${now.getFullYear()}-${now.getMonth()}`).split("-").map(Number);
  const firstDay = new Date(cy, cm, 1), daysIn = new Date(cy, cm + 1, 0).getDate(), lead = firstDay.getDay();
  const byDay = {}; D.attendance.forEach(a => (byDay[a.date] ||= new Set()).add(a.tutorId));
  const maxN = Math.max(1, ...Object.values(byDay).map(x => x.size));
  const monthName = firstDay.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(`<div class="cal-cell blank"></div>`);
  for (let d = 1; d <= daysIn; d++) {
    const key = `${cy}-${pad2(cm + 1)}-${pad2(d)}`, n = byDay[key]?.size || 0, isSun = new Date(cy, cm, d).getDay() === 0;
    const tint = n ? Math.round(18 + 62 * (n / maxN)) : 0;
    cells.push(`<button class="cal-cell ${n ? "has" : ""} ${isSun ? "sun" : ""} ${S.calDay === key ? "sel" : ""} ${key === TODAY ? "today" : ""}" data-act="calday" data-v="${key}" ${n ? `style="--tint:${tint}%"` : ""} aria-label="${fmtDayLong(key)}: ${plural(n, "tutor")}">
      <span class="d">${d}</span>${n ? `<span class="n">${n}</span><span class="l">${n === 1 ? "tutor" : "tutors"}</span>` : ""}</button>`);
  }
  const sel = S.calDay && byDay[S.calDay] ? S.calDay : days.find(d => byDay[d]);
  let detail = `<div class="empty"><b>No classes yet</b>Days light up here once tutors sign in.</div>`;
  if (sel) {
    const here = [...(byDay[sel] || [])].map(tutor).filter(Boolean), hereIds = new Set(here.map(t => t.id));
    const away = activeTutors().filter(t => !hereIds.has(t.id) && (t.at || 0) <= new Date(sel + "T23:59").getTime());
    const kids = new Set(D.picks.filter(p => p.date === sel).map(p => p.studentId)).size, stories = D.readings.filter(r => r.date === sel).length;
    detail = `<h3 class="cal-h">${fmtDayLong(sel)}</h3>
      <p class="muted small" style="margin-bottom:12px">${plural(here.length, "tutor")} · ${plural(kids, "kid")} · ${plural(stories, "story", "stories")} read</p>
      <div class="k small muted">Came</div><div class="words" style="margin:4px 0 12px">${here.map(t => `<span class="chip good">${esc(t.name)}</span>`).join("") || "–"}</div>
      ${away.length ? `<div class="k small muted">Didn't come</div><div class="words" style="margin-top:4px">${away.map(t => `<span class="chip">${esc(t.name)}</span>`).join("")}</div>` : ""}`;
  }
  const recent = days.filter(d => byDay[d]).slice(0, 8).reverse();
  const rows = activeTutors().map(t => {
    const came = recent.filter(d => byDay[d].has(t.id)).length;
    const all = D.attendance.filter(a => a.tutorId === t.id).map(a => a.date).sort();
    return { t, came, total: new Set(all).size, last: all[all.length - 1] };
  }).sort((a, b) => b.came - a.came || b.total - a.total);
  return `<section class="panel"><div class="panel-head"><h2>Tutor attendance</h2>
      <div class="inline"><button class="btn small quiet" data-act="calmove" data-d="-1" aria-label="Previous month">Previous</button><b style="min-width:140px;text-align:center">${monthName}</b><button class="btn small quiet" data-act="calmove" data-d="1" aria-label="Next month">Next</button></div></div>
    <div class="cal-wrap">
      <div class="cal">
        ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => `<div class="cal-dow">${d}</div>`).join("")}
        ${cells.join("")}
      </div>
      <div class="cal-detail">${detail}</div>
    </div>
    ${recent.length ? `<h3 class="group-h" style="margin-top:22px">Each tutor, last ${plural(recent.length, "class", "classes")}</h3>
    <div class="table-wrap"><table class="att"><thead><tr><th>Tutor</th>${recent.map(d => `<th class="c">${fmtShort(d)}</th>`).join("")}<th class="n">Came</th><th class="n">All time</th><th>Last seen</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><b style="font-weight:500">${esc(r.t.name)}</b></td>${recent.map(d => `<td class="c">${byDay[d].has(r.t.id) ? '<span class="dot yes" title="Came"></span>' : '<span class="dot" title="Not there"></span>'}</td>`).join("")}<td class="n">${r.came} of ${recent.length}</td><td class="n">${r.total}</td><td>${r.last ? fmtDay(r.last) : '<span class="muted">Never</span>'}</td></tr>`).join("")}
    </tbody></table></div>` : ""}
  </section>`;
}

/* ---------- Admin ---------- */
function adminHTML() {
  if (Auth.on && Auth.isAdmin === true) S.adminOk = true;
  if (Auth.on && Auth.isAdmin === false) return `<div class="col"><div class="title-row"><div><h1 class="h1">Admin</h1><p class="sub">Only the program lead's Google account can open Admin.</p></div></div></div>`;
  if (!S.adminOk) return `<div class="col"><div class="title-row"><div><h1 class="h1">Admin</h1><p class="sub">Attendance, stories, tutors and downloads.</p></div></div>
    <section class="panel s6"><form class="stack" data-form="admin"><label for="apw" class="muted small">Admin password</label>
      <div class="inline"><input type="password" id="apw" autocomplete="current-password" placeholder="Password"><button class="btn primary" type="submit">Open admin</button></div>
      ${S.adminMsg ? `<p class="small" style="color:var(--negative)">${esc(S.adminMsg)}</p>` : ""}</form></section></div>`;
  const days = classDays();
  const missing = activeStudents().filter(s => { const a = kidAttendance(s.id); return a.of >= 2 && a.missedLast === 2; });
  const lib = D.stories.filter(s => s.active !== false), libShown = lib.filter(s => !S.libLevel || s.level === Number(S.libLevel));
  return `<div class="col">
    <div class="title-row"><div><h1 class="h1">Admin</h1><p class="sub">${plural(days.length, "class", "classes")} logged · ${plural(D.readings.length, "story", "stories")} read in total</p></div>
      <div class="inline"><button class="btn" data-act="csv" data-kind="readings">Download stories read (CSV)</button><button class="btn" data-act="csv" data-kind="kids">Download kids (CSV)</button></div></div>
    <div class="col tiles" style="grid-column:1/-1;gap:var(--gap)">
      ${tile("Tutors", activeTutors().length, `${new Set(D.attendance.map(a => a.tutorId)).size} have signed in at least once`)}
      ${tile("Kids", activeStudents().length, `${activeStudents().filter(s => !s.level).length} still need the placement test`)}
      ${tile("Story library", STORIES.length, `${Math.round(STORIES.length / 12)} per level, with questions${lib.length ? ` · ${lib.length} practice stories` : ""}`)}
      ${tile("Missing lately", missing.length, missing.length ? missing.slice(0, 3).map(s => first(s.name)).join(", ") : "No one has missed two classes in a row")}
    </div>
    <section class="panel s6"><div class="panel-head"><h2>Practice stories written by AI <span class="count">${lib.length}</span></h2>
      <select id="liblevel" data-input="libLevel" aria-label="Filter by level"><option value="">All levels</option>${LEVELS.map(l => `<option value="${l.n}" ${S.libLevel == l.n ? "selected" : ""}>Level ${l.n}</option>`).join("")}</select></div>
      <div class="stack">${libShown.slice(0, 40).map(st => `<div class="row"><div class="grow"><div class="t">${esc(st.title)}</div><div class="m">Level ${st.level} · ${wordCount(st.text)} words · ${fmtShort(dayKey(new Date(st.at || Date.now())))}${st.forKid ? ` · for ${esc(first(student(st.forKid)?.name))}` : ""}</div></div>
        <button class="btn small quiet" data-act="preview" data-id="${st.id}">${S.openStory === st.id ? "Close" : "Read"}</button><button class="btn small quiet" data-act="rmstory" data-id="${st.id}">Delete</button></div>${S.openStory === st.id ? `<div class="storyprev">${esc(st.text)}${(st.questions || []).length ? `\n\nQuestions:\n${st.questions.map(q => `• ${q.q} (${q.a})`).join("\n")}` : ""}</div>` : ""}`).join("") || `<div class="empty"><b>No practice stories yet</b>Tutors can make one for a kid during a lesson. The ${STORIES.length} library stories are always there.</div>`}
      ${libShown.length > 40 ? `<p class="muted small">Showing the newest 40. Filter by level to see more.</p>` : ""}</div>
    </section>
    ${attendanceHTML()}
    <section class="panel s6"><div class="panel-head"><h2>Kids missing lately <span class="count">${missing.length}</span></h2></div>
      <div class="stack">${missing.map(s => { const a = kidAttendance(s.id); const lastDay = D.picks.filter(p => p.studentId === s.id).map(p => p.date).sort().reverse()[0]; return `<div class="row"><div class="grow"><div class="t">${esc(s.name)}</div><div class="m">Missed the last 2 classes · last came ${fmtDay(lastDay)} · ${a.came} of ${a.of} overall</div></div><button class="btn small quiet" data-act="kid" data-id="${s.id}">Progress</button></div>`; }).join("") || `<div class="empty">Everyone has come to at least one of the last two classes.</div>`}</div>
    </section>
    <section class="panel s6"><div class="panel-head"><h2>Tutors <span class="count">${activeTutors().length}</span></h2></div>
      ${Auth.on ? `<p class="muted small" style="margin-bottom:12px">Tutors appear here the first time they sign in with Google.</p>`
        : `<form class="inline" data-form="adminTutor" style="margin-bottom:12px"><input type="text" id="atutor" data-input="newTutor" placeholder="Tutor's full name" value="${esc(S.newTutor)}" aria-label="Tutor's full name"><button class="btn" type="submit">Add tutor</button></form>`}
      <div class="stack">${activeTutors().map(t => `<div class="row"><div class="grow"><div class="t">${esc(t.name)}</div><div class="m">${t.email ? `${esc(t.email)} · ` : Auth.on ? "No Google account linked · " : ""}${plural(D.attendance.filter(a => a.tutorId === t.id).length, "class", "classes")} taught</div></div><button class="btn small quiet" data-act="rmtutor" data-id="${t.id}">Remove</button></div>`).join("") || `<div class="empty">No tutors yet.</div>`}</div>
    </section>
    <section class="panel s6"><div class="panel-head"><h2>Kids <span class="count">${activeStudents().length}</span></h2></div>
      <div class="stack">${activeStudents().map(s => `<div class="row"><div class="grow"><div class="t">${esc(s.name)}</div><div class="m">${s.level ? `Level ${s.level}` : "No level"} · ${plural(readingsOf(s.id).length, "story", "stories")}</div></div><button class="btn small quiet" data-act="rmkid" data-id="${s.id}">Remove</button></div>`).join("") || `<div class="empty">No kids yet.</div>`}</div>
    </section>
    <section class="panel"><div class="panel-head"><h2>Merge duplicate kids</h2></div>
      <p class="muted small" style="margin-bottom:12px">If the same kid was added twice, move everything from one into the other. Stories, tests, notes and attendance all come across.</p>
      <div class="inline">
        <label class="muted small" for="mfrom">Merge</label>
        <select id="mfrom" data-input="mergeFrom"><option value="">Choose the duplicate</option>${activeStudents().map(x => `<option value="${x.id}" ${S.mergeFrom === x.id ? "selected" : ""}>${esc(x.name)} · ${plural(readingsOf(x.id).length, "story", "stories")}</option>`).join("")}</select>
        <label class="muted small" for="minto">into</label>
        <select id="minto" data-input="mergeInto"><option value="">Choose the kid to keep</option>${activeStudents().filter(x => x.id !== S.mergeFrom).map(x => `<option value="${x.id}" ${S.mergeInto === x.id ? "selected" : ""}>${esc(x.name)} · ${plural(readingsOf(x.id).length, "story", "stories")}</option>`).join("")}</select>
        ${S.mergeConfirm && S.mergeFrom && S.mergeInto ? `<button class="btn small danger" data-act="merge">Yes, merge ${esc(student(S.mergeFrom)?.name)} into ${esc(student(S.mergeInto)?.name)}</button><button class="btn small quiet" data-act="cancelmerge">Cancel</button>`
          : `<button class="btn small" data-act="merge" ${S.mergeFrom && S.mergeInto && S.mergeFrom !== S.mergeInto ? "" : "disabled"}>Merge</button>`}
      </div></section>
    ${Auth.on && Auth.isAdmin === true ? "" : `<section class="panel"><div class="panel-head"><h2>Admin password</h2><button class="btn small quiet" data-act="lock">Lock admin</button></div>
      <form class="inline" data-form="pw"><input type="password" id="newpw" autocomplete="new-password" placeholder="New password, 6 or more characters" aria-label="New password"><button class="btn" type="submit">Change password</button></form>
    </section>`}
  </div>`;
}
function csvOf(rows) { return rows.map(r => r.map(v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n"); }
function exportCsv(kind) {
  let rows, name;
  if (kind === "readings") { name = `stories-read-${TODAY}.csv`; rows = [["date", "kid", "tutor", "story", "level", "words", "missed_count", "accuracy_pct", "words_correct_per_min", "seconds", "questions_right", "questions_asked", "missed_words", "note"], ...D.readings.map(r => [r.date, student(r.studentId)?.name, tutor(r.tutorId)?.name, r.title, r.level, r.total, r.errors, Math.round(r.accuracy * 100), r.seconds ? Math.round(r.wcpm) : "", r.seconds || 0, r.questions ? r.questions.filter(q => q.ok).length : "", r.questions ? r.questions.length : "", (r.missed || []).join(" "), r.note])]; }
  else { name = `kids-${TODAY}.csv`; rows = [["kid", "level", "level_name", "stories_read", "last_read", "last_accuracy_pct", "last_words_per_min", "classes_attended", "classes_since_joining"], ...activeStudents().map(s => { const l = readingsOf(s.id)[0], a = kidAttendance(s.id, 999); return [s.name, s.level || "", levelOf(s.level)?.name || "", readingsOf(s.id).length, l?.date || "", l ? Math.round(l.accuracy * 100) : "", l && l.seconds ? Math.round(l.wcpm) : "", a.came, a.of]; })]; }
  const url = URL.createObjectURL(new Blob([csvOf(rows)], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- actions ---------- */
async function signIn(id) {
  if (S.me !== id) { S.sessions = {}; S.activeKid = null; }
  S.me = id; lsSet("icl-me", id); lsSet("icl-day-who", id); loadSessions(); S.signedToday = true; lsSet("icl-day", TODAY); S.screen = "class";
  if (!["lesson", "summary", "done"].includes(S.step) || !myKids().length) setStep("pick");
  render();
  if (!hereToday().find(a => a.tutorId === id)) await safe(Store.set("attendance", `${TODAY}_${id}`, { date: TODAY, tutorId: id, at: Date.now() }));
}
async function pick(sid) { await safe(Store.set("picks", `${TODAY}_${sid}`, { date: TODAY, studentId: sid, tutorId: S.me, at: Date.now() })); render(); }
async function saveReading(kid) {
  const s = sess(kid), st = storyById(s.storyId);
  if (s.running) { s.acc = elapsed(s); s.running = false; }
  const toks = tokens(st.text).filter(isWord), total = toks.length;
  const missed = [...s.marked].sort((a, b) => a - b).map(i => clean(toks[i])).filter(Boolean);
  const seconds = Math.round((s.acc || 0) / 1000);
  const rec = { estimatedTime: !!s.estimated, date: TODAY, studentId: kid, tutorId: S.me, storyId: st.id, title: st.title, level: st.level, total, errors: missed.length, missed, seconds, accuracy: (total - missed.length) / total, wcpm: seconds ? (total - missed.length) / (seconds / 60) : 0, note: "", at: Date.now() };
  let id = null;
  try { id = await Store.add("readings", rec); } catch { toast("That didn't save. Check the internet connection and try again."); render(); return; }
  if (s.reread) { Object.assign(s, { mode: "result", result: rec, resultId: id, rnote: null }); render(); return; }
  Object.assign(s, { mode: "questions", lstep: 4, result: rec, resultId: id, rnote: null });
  loadQuestions(kid);
}
async function writeStoryFor(kid) {
  const k = student(kid), s = sess(kid), level = s.browse || k.level || 1;
  s.writing = true; render();
  try {
    const out = await AI.call("story", { level, focusWords: practiceWords(kid), avoid: storiesAt(level).map(x => x.title) });
    const st = out.stories[0];
    const id = await Store.add("stories", { ...st, level, source: "ai", forKid: kid, at: Date.now() });
    s.writing = false;
    goStep(k, "prep", { storyId: id });
    toast("Practice story ready");
  } catch (e) { s.writing = false; toast(e.message); }
  render();
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
  const act = b.dataset.act, id = b.dataset.id, s = id ? S.sessions[id] : null;
  switch (act) {
    case "go": S.screen = b.dataset.v; S.adminMsg = ""; window.scrollTo(0, 0); break;
    case "signin": return signIn(id);
    case "signout":
      S.signedToday = false; lsSet("icl-day", null); S.screen = "class"; S.summary = null;
      if (Auth.on && Store.sb) { S.me = null; lsSet("icl-me", null); S.sessions = {}; S.activeKid = null; S.adminOk = false; await Store.sb.auth.signOut(); }
      break;
    case "google": {
      const { error } = await Store.sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
      if (error) toast("Google sign-in isn't working yet. Check the Google setup in Supabase.");
      return;
    }
    case "approve": await safe(Store.update("tutors", id, { approved: true }), "Approved"); break;
    case "decline": await safe(Store.update("tutors", id, { active: false }), "Request declined"); break;
    case "pick": return pick(id);
    case "unpick": { const p = pickOf(id); if (p && p.tutorId === S.me) await safe(Store.remove("picks", p.id)); delete S.sessions[id]; break; }
    case "startlesson": setStep("lesson"); window.scrollTo(0, 0); break;
    case "tostep": setStep(b.dataset.v); if (b.dataset.v !== "summary") S.summary = null; window.scrollTo(0, 0); break;
    case "endlesson": window.scrollTo(0, 0); return startSummary();
    case "tab": S.activeKid = id; break;
    case "browse": sess(id).browse = Number(b.dataset.n); break;
    case "toggleread": sess(id).showRead = !sess(id).showRead; break;
    case "scrollstories": $("#stories")?.scrollIntoView({ behavior: "smooth", block: "start" }); return;
    case "gostep": goStep(student(id), b.dataset.v); break;
    case "choose": goStep(student(id), "prep", { storyId: b.dataset.story }); break;
    case "reread": { const x = sess(id); Object.assign(x, { mode: "read", lstep: 5, round: 2, reread: true, storyId: x.result?.storyId, marked: new Set(), acc: 0, running: false, startedAt: 0, askTime: false, timeAsked: false, estimated: false }); window.scrollTo(0, 0); break; }
    case "newsecond": goStep(student(id), "prep", { storyId: b.dataset.story, round: 2, reread: false }); break;
    case "savewrap": { const x = sess(id), text = (x.wrapNote || "").trim(); if (!text) { toast("Write a short note first."); return; } await safe(Store.set("notes", `${TODAY}_${id}`, { date: TODAY, studentId: id, tutorId: S.me, text, at: Date.now() }), "Note saved for next week"); break; }
    case "read": { const x = sess(id); Object.assign(x, { round: x.round || 1, reread: false, mode: "read", lstep: 3, storyId: b.dataset.story, marked: new Set(), acc: 0, running: false, startedAt: 0, askTime: false, timeAsked: false, estimated: false }); window.scrollTo(0, 0); break; }
    case "home": Object.assign(sess(id), { mode: "home", running: false }); break;
    case "restart": Object.assign(s, { marked: new Set(), acc: 0, running: false }); break;
    case "mark": { const i = Number(b.dataset.i); s.marked.has(i) ? s.marked.delete(i) : s.marked.add(i); saveSessions(); if (!s.running && !elapsed(s) && s.marked.size === 1) break; b.classList.toggle("miss"); b.setAttribute("aria-pressed", s.marked.has(i)); const c = $("#misscount"); if (c) c.textContent = s.marked.size; return; }
    case "timer": if (s.running) { s.acc = elapsed(s); s.running = false; } else { s.startedAt = Date.now(); s.running = true; } break;
    case "size": S.textSize = Math.max(-3, Math.min(4, S.textSize + Number(b.dataset.d))); lsSet("icl-size", S.textSize); break;
    case "finish": if (!s.running && !elapsed(s) && !s.timeAsked) { s.askTime = true; break; } return saveReading(id);
    case "settime": { const m = Number(b.dataset.m); s.acc = m * 60000; s.askTime = false; s.timeAsked = true; s.estimated = m > 0; return saveReading(id); }
    case "newstory": return writeStoryFor(id);
    case "warmup": { const k = student(id); Object.assign(sess(id), { mode: "warmup", warm: { words: warmupDeck(k), res: [], i: 0 } }); break; }
    case "wcard": {
      const w = s.warm; w.res[w.i] = b.dataset.ok === "1"; w.i++;
      if (w.i >= w.words.length) safe(Store.add("warmups", { date: TODAY, studentId: id, tutorId: S.me, right: w.words.filter((_, j) => w.res[j]), wrong: w.words.filter((_, j) => w.res[j] === false), at: Date.now() }));
      break;
    }
    case "askdel": s.confirmDel = true; break;
    case "canceldel": s.confirmDel = false; break;
    case "delresult": { await safe(Store.remove("readings", s.resultId), "Reading deleted"); Object.assign(s, { mode: "home", confirmDel: false, result: null, resultId: null }); break; }
    case "fixrow": S.fixRow = S.fixRow === id ? null : id; S.fixDel = false; break;
    case "fixdel": if (!S.fixDel) { S.fixDel = true; break; } await safe(Store.remove("readings", id), "Reading deleted"); S.fixRow = null; S.fixDel = false; break;
    case "fixmove": { const to = $(`#move-${id}`)?.value; if (!to) { toast("Choose a kid to move it to."); return; } await safe(Store.update("readings", id, { studentId: to }), `Moved to ${student(to)?.name}`); S.fixRow = null; break; }
    case "qmark": s.q.marks[Number(b.dataset.i)] = b.dataset.ok === "1"; break;
    case "qshow": s.q.show = !s.q.show; break;
    case "qretry": loadQuestions(id); return;
    case "qskip": s.mode = "result"; break;
    case "qsave": {
      const qs = s.q.items.map((it, i) => ({ q: it.q, ok: s.q.marks[i] === true })).filter((_, i) => s.q.marks[i] != null);
      await safe(Store.update("readings", s.resultId, { questions: qs }));
      s.mode = "result"; break;
    }
    case "savernote": await safe(Store.update("readings", s.resultId, { note: (s.rnote || "").trim() }), "Note saved"); break;
    case "leveldown": { const k = student(id); if (k && k.level > 1) { await safe(Store.update("students", id, { level: k.level - 1 }), `${k.name} moved to Level ${k.level - 1}`); Object.assign(sess(id), { browse: null, storyId: null }); } break; }
    case "dismisshint": sess(id).hideHint = student(id)?.level; break;
    case "levelup": { const k = student(id); if (k && k.level < 12) { await safe(Store.update("students", id, { level: k.level + 1 }), `${k.name} moved up to Level ${k.level + 1}`); Object.assign(sess(id), { browse: null, storyId: null }); } break; }
    case "check": { const v = D.checks.filter(c => c.studentId === id).length % PLACEMENTS.length; Object.assign(sess(id), { mode: "check", check: { step: 0, v, miss: [new Set(), new Set(), new Set()], secs: [0, 0, 0] }, acc: 0, running: false }); break; }
    case "cmark": { const c = s.check, i = Number(b.dataset.i), m = c.miss[c.step]; m.has(i) ? m.delete(i) : m.add(i); saveSessions(); b.classList.toggle("miss"); b.setAttribute("aria-pressed", m.has(i)); const w = $("#cwrong"); if (w) w.textContent = `${m.size} wrong`; return; }
    case "cstep": {
      const c = s.check; c.secs[c.step] = Math.round(elapsed(s) / 1000); s.acc = 0; s.running = false;
      if (Number(b.dataset.d) > 0 && c.step === 2) { s.checkResult = scoreCheck(c); s.chosen = s.checkResult.level; s.mode = "checkResult"; }
      else { c.step = Math.max(0, c.step + Number(b.dataset.d)); s.acc = (c.secs[c.step] || 0) * 1000; }
      break;
    }
    case "savecheck": {
      const r = s.checkResult, lvl = Number(s.chosen || r.level);
      await safe(Store.add("checks", { date: TODAY, studentId: id, tutorId: S.me, lettersRight: r.lettersRight, lettersTotal: r.lettersTotal, lettersPerMin: r.lpm, wordsRight: r.bandScores.reduce((a, b) => a + b, 0), bandScores: r.bandScores, passageAccuracy: r.pacc, passageWcpm: r.pwcpm, suggested: r.level, level: lvl, version: (s.check?.v || 0) + 1, at: Date.now() }));
      await safe(Store.update("students", id, { level: lvl }), `Saved. Starting at Level ${lvl}`);
      Object.assign(s, { mode: "home", lstep: 0, browse: null, storyId: null }); break;
    }
    case "savesummary": {
      for (const [kid, it] of Object.entries(S.summary || {})) {
        const text = (it.text || "").trim(); if (!text) continue;
        await safe(Store.set("notes", `${TODAY}_${kid}`, { date: TODAY, studentId: kid, tutorId: S.me, text, at: Date.now() }));
      }
      setStep("done"); toast("Notes saved"); break;
    }
    case "kid": S.kidId = id; S.screen = "kid"; window.scrollTo(0, 0); break;
    case "csv": exportCsv(b.dataset.kind); return;
    case "preview": S.openStory = S.openStory === id ? null : id; break;
    case "rmstory": await safe(Store.update("stories", id, { active: false }), "Story deleted"); break;
    case "rmtutor": await safe(Store.update("tutors", id, { active: false }), "Tutor removed. Their past classes stay in the log."); break;
    case "rmkid": await safe(Store.update("students", id, { active: false }), "Kid removed. Their past stories stay in the log."); break;
    case "lock": S.adminOk = false; break;
    case "calday": S.calDay = b.dataset.v; break;
    case "calmove": { const now = new Date(); const [y, m] = (S.calMonth || `${now.getFullYear()}-${now.getMonth()}`).split("-").map(Number); const d = new Date(y, m + Number(b.dataset.d), 1); S.calMonth = `${d.getFullYear()}-${d.getMonth()}`; break; }
    case "cancelmerge": S.mergeConfirm = false; break;
    case "merge": {
      const from = S.mergeFrom, into = S.mergeInto;
      if (!from || !into || from === into) break;
      if (!S.mergeConfirm) { S.mergeConfirm = true; break; }
      const a = student(from), z = student(into);
      let ok = true;
      for (const c of ["readings", "checks", "warmups", "notes", "picks"]) for (const d of D[c].filter(x => x.studentId === from)) ok = (await safe(Store.update(c, d.id, { studentId: into }))) && ok;
      for (const d of D.stories.filter(x => x.forKid === from)) await safe(Store.update("stories", d.id, { forKid: into }));
      if (!z.level && a.level) await safe(Store.update("students", into, { level: a.level }));
      if (ok) await safe(Store.update("students", from, { active: false, mergedInto: into }), `${a.name} merged into ${z.name}`);
      S.mergeFrom = ""; S.mergeInto = ""; S.mergeConfirm = false; break;
    }
  }
  render();
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.matches("tr[data-act]")) { e.target.click(); return; }
  if (S.screen === "class" && S.step === "lesson" && S.activeKid && sess(S.activeKid).mode === "warmup" && !e.target.matches("input,textarea,select")) {
    const btn = e.key === "ArrowRight" ? $('[data-act="wcard"][data-ok="1"]') : e.key === "ArrowLeft" ? $('[data-act="wcard"][data-ok="0"]') : null;
    if (btn) { e.preventDefault(); btn.click(); }
  }
});
document.addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.input) { S[t.dataset.input] = t.value; if (["signQ", "pickerQ", "kidsQ"].includes(t.dataset.input)) render(); }
  if (t.dataset.inputSess) { sess(t.dataset.id)[t.dataset.inputSess] = t.value; saveSessions(); }
  if (t.dataset.sum && S.summary?.[t.dataset.sum]) S.summary[t.dataset.sum].text = t.value;
});
document.addEventListener("change", async e => {
  const t = e.target;
  if (t.dataset.actChange === "setlevel") { await safe(Store.update("students", t.dataset.id, { level: t.value ? Number(t.value) : null }), t.value ? `Level set to ${t.value}` : null); Object.assign(sess(t.dataset.id), { browse: null, storyId: null }); render(); return; }
  if (t.dataset.input === "libLevel") { S.libLevel = t.value; render(); return; }
  if (t.dataset.input === "mergeFrom" || t.dataset.input === "mergeInto") { S[t.dataset.input] = t.value; S.mergeConfirm = false; if (S.mergeFrom === S.mergeInto) S.mergeInto = ""; render(); return; }
  if (t.dataset.inputSess) sess(t.dataset.id)[t.dataset.inputSess] = t.value;
});
document.addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, kind = f.dataset.form;
  if (kind === "register") {
    const name = (S.regName || "").trim().replace(/\s+/g, " "); if (!name) return;
    await safe(Store.add("tutors", { name, email: Auth.email, approved: false, active: true, at: Date.now() }), "Request sent");
    render(); return;
  }
  if (kind === "adminTutor" && Auth.on) {
    const name = S.newTutor.trim().replace(/\s+/g, " "), email = (S.newTutorEmail || "").trim().toLowerCase();
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Add a name and their Google email."); return; }
    const ex = D.tutors.find(t => (t.email || "").toLowerCase() === email);
    if (ex) await safe(Store.update("tutors", ex.id, { name, approved: true, active: true }), `${name} approved`);
    else await safe(Store.add("tutors", { name, email, approved: true, active: true, at: Date.now() }), `${name} added. They can sign in with that Google account.`);
    S.newTutor = ""; S.newTutorEmail = ""; render(); return;
  }
  if (kind === "newTutor" || kind === "adminTutor") {
    const name = S.newTutor.trim().replace(/\s+/g, " "); if (!name) return;
    const existing = D.tutors.find(t => t.name.toLowerCase() === name.toLowerCase());
    let id = existing?.id;
    if (existing && existing.active === false) await safe(Store.update("tutors", id, { active: true }));
    if (!existing) id = await Store.add("tutors", { name, active: true, at: Date.now() }).catch(() => null);
    S.newTutor = "";
    if (kind === "newTutor" && id) return signIn(id);
    toast(id ? `${name} added` : "That didn't save. Try again."); render();
  }
  if (kind === "newKid") {
    const name = S.newKid.trim().replace(/\s+/g, " "); if (!name) return;
    if (activeStudents().find(s => s.name.toLowerCase() === name.toLowerCase())) { toast(`There's already a kid called ${name}. Search for them, or add a last initial.`); return; }
    const id = await Store.add("students", { name, level: null, active: true, at: Date.now() }).catch(() => null);
    S.newKid = ""; if (id) await pick(id); else toast("That didn't save. Try again.");
  }
  if (kind === "rename") { const v = $("#kname").value.trim(); if (v) await safe(Store.update("students", f.dataset.id, { name: v }), "Name saved"); render(); }
  if (kind === "admin") {
    const pw = $("#apw").value, h = await sha(pw), cfg = D.config.find(c => c.id === "admin");
    if ((h && h === (cfg?.hash || ADMIN_DEFAULT_HASH)) || (!h && !cfg?.hash && pw === "corner2026")) { S.adminOk = true; S.adminMsg = ""; } else S.adminMsg = "That password isn't right.";
    render();
  }
  if (kind === "pw") { const v = $("#newpw").value; if (v.length < 6) { toast("Use 6 or more characters."); return; } const h = await sha(v); if (h) await safe(Store.set("config", "admin", { hash: h, at: Date.now() }), "Password changed"); render(); }
});

loadSessions();
Store.init();
})();
