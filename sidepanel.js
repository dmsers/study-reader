// Study Reader prototype v0.2 — side panel logic.
// Capture text from every frame of the active tab (including shadow DOM), or find passages
// that match a description, then play them as plain reading or a two-host discussion,
// with interrupt-to-ask and quizzes.

const $ = (id) => document.getElementById(id);
const DEFAULT_MODEL = "claude-sonnet-5-5";
const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

let sourceText = "";   // the passage everything below works on
let focus = "";        // what the user was looking for, when the passage came from Find
let queue = [];        // [{speaker:'A'|'B', text}] sentence-sized items
let pos = 0;
let playing = false;
let lastMode = "none"; // how the current passage was last listened to (for quiz stats)
let settings = {
  provider: "claude", apiKey: "", model: DEFAULT_MODEL,
  geminiKey: "", geminiModel: DEFAULT_GEMINI_MODEL,
  rate: 1.0, mode: "read", voiceA: "", voiceB: "",
};
let found = { blocks: [], matches: [], query: "" };

function status(msg, isErr = false) {
  const el = $("status");
  el.textContent = msg;
  el.className = isErr ? "err" : "";
}
function setEnabled(ids, on) { ids.forEach((id) => ($(id).disabled = !on)); }

// ---------- settings ----------
async function loadSettings() {
  const s = await chrome.storage.local.get(Object.keys(settings));
  for (const [k, v] of Object.entries(s)) if (v !== undefined && v !== "") settings[k] = v;
  $("provider").value = settings.provider;
  $("apiKey").value = settings.apiKey;
  $("model").value = settings.model;
  $("geminiKey").value = settings.geminiKey;
  $("geminiModel").value = settings.geminiModel;
  $("rate").value = settings.rate;
  $("mode").value = settings.mode;
  applyProvider();
  populateVoices();
}
$("save").onclick = async () => {
  settings.provider = $("provider").value;
  settings.apiKey = $("apiKey").value.trim();
  settings.model = $("model").value.trim() || DEFAULT_MODEL;
  settings.geminiKey = $("geminiKey").value.trim();
  settings.geminiModel = $("geminiModel").value.trim() || DEFAULT_GEMINI_MODEL;
  settings.rate = parseFloat($("rate").value) || 1.0;
  settings.voiceA = $("voiceA").value;
  settings.voiceB = $("voiceB").value;
  await chrome.storage.local.set(settings);
  applyProvider();
  status("Settings saved.");
};

function providerName() { return settings.provider === "gemini" ? "Gemini" : "Claude"; }
function applyProvider() {
  document.querySelectorAll("[data-provider]").forEach((el) => {
    el.hidden = el.dataset.provider !== settings.provider;
  });
  $("poweredBy").textContent = "· powered by " + providerName();
}
// Switching provider takes effect immediately, handy for side-by-side demos.
$("provider").onchange = () => {
  settings.provider = $("provider").value;
  chrome.storage.local.set({ provider: settings.provider });
  applyProvider();
  status(`Now using ${providerName()}.`);
};
$("mode").onchange = () => {
  settings.mode = $("mode").value;
  chrome.storage.local.set({ mode: settings.mode });
};

// ---------- capture ----------
// Runs inside each frame of the page, so it must be self-contained.
// Two methods: (A) semantic elements like <p>, good for book readers and articles;
// (B) a walk of the rendered tree including shadow DOM, for component-heavy sites
// such as Google Patents. Whichever gives a reasonable amount of text wins.
function extractFromFrame(scope) {
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const offscreen = (el) => {
    if (scope !== "visible") return false;
    const r = el.getBoundingClientRect();
    return (r.width || r.height) && (r.bottom < 0 || r.top > vh);
  };

  // A: semantic elements in the regular DOM
  const SEL = "p,h1,h2,h3,h4,h5,h6,li,figcaption,caption,blockquote,th,td,dt,dd,pre";
  const a = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (el.closest("nav,header,footer,[role=navigation],[aria-hidden=true]")) continue;
    if (el.parentElement && el.parentElement.closest(SEL)) continue;
    const t = clean(el.innerText ?? el.textContent);
    if (t.length < 2) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (offscreen(el)) continue;
    a.push(t);
  }

  // B: rendered-tree walk through shadow roots and slots
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "NAV", "HEADER", "FOOTER",
    "BUTTON", "SELECT", "INPUT", "TEXTAREA"]);
  const lines = [];
  let cur = "";
  const flush = () => { const t = clean(cur); if (t) lines.push(t); cur = ""; };
  const kids = (n) => {
    if (n.nodeType === 1 && n.shadowRoot) return Array.from(n.shadowRoot.childNodes);
    if (n.nodeType === 1 && n.tagName === "SLOT") {
      const assigned = n.assignedNodes({ flatten: true });
      return assigned.length ? assigned : Array.from(n.childNodes);
    }
    return Array.from(n.childNodes);
  };
  const walk = (n) => {
    if (n.nodeType === 3) { cur += n.nodeValue; return; }
    if (n.nodeType !== 1 && n.nodeType !== 11) return;
    let block = false;
    if (n.nodeType === 1) {
      if (SKIP.has(n.tagName.toUpperCase())) return;
      if (n.getAttribute("aria-hidden") === "true") return;
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden") return;
      if (offscreen(n)) return;
      block = cs.display !== "contents" && !cs.display.startsWith("inline");
    }
    if (block) flush();
    for (const k of kids(n)) walk(k);
    if (block) flush();
  };
  if (document.body) walk(document.body);
  flush();
  // Group short lines into passage-sized blocks (e.g. title + details + snippet of one search result).
  const b = [];
  let chunk = "";
  for (const line of lines) {
    chunk = chunk ? chunk + " " + line : line;
    if (chunk.length >= 280) { b.push(chunk); chunk = ""; }
  }
  if (chunk) b.push(chunk);

  const total = (arr) => arr.reduce((s, t) => s + t.length, 0);
  const useA = a.length > 0 && total(a) >= 0.4 * total(b);
  return { url: location.href, method: useA ? "elements" : "deep", blocks: useA ? a : b };
}

async function captureBlocks(scope) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: extractFromFrame,
    args: [scope],
  });
  const frames = results.map((r) => r.result).filter(Boolean);
  $("frames").textContent = frames
    .map((f) => `${f.blocks.length} blocks (${f.method}) — ${f.url.slice(0, 120)}`)
    .join("\n") || "(no frames returned)";
  const seen = new Set();
  const blocks = [];
  for (const f of frames) {
    for (const t of f.blocks) if (t && !seen.has(t)) { seen.add(t); blocks.push(t); }
  }
  return blocks;
}

function setPassage(text, focusText = "") {
  stopPlayback();
  sourceText = text;
  focus = focusText;
  lastMode = "none";
  $("preview").hidden = false;
  $("preview").textContent = text.slice(0, 1200) + (text.length > 1200 ? " …" : "");
  setEnabled(["play", "ask", "quiz"], true);
}

$("grab").onclick = async () => {
  status("Grabbing text…");
  try {
    const blocks = await captureBlocks($("scope").value);
    if (!blocks.length) {
      status("No readable text found. Check Settings → Debug to see which frames were reached.", true);
      return;
    }
    const text = blocks.join("\n\n");
    setPassage(text);
    status(`Captured ${blocks.length} blocks, ${text.length.toLocaleString()} characters.`);
  } catch (e) {
    status("Capture failed: " + e.message, true);
  }
};

// ---------- speech ----------
// Natural-sounding voices first: macOS Premium/Enhanced downloads, then Chrome's Google voices.
let voices = [];
const voiceScore = (v) =>
  /premium/i.test(v.name) ? 3 : /enhanced/i.test(v.name) ? 2 : /google/i.test(v.name) ? 1 : 0;
function loadVoices() {
  voices = speechSynthesis.getVoices()
    .filter((v) => v.lang && v.lang.startsWith("en"))
    .sort((a, b) => voiceScore(b) - voiceScore(a));
  populateVoices();
}
function populateVoices() {
  for (const id of ["voiceA", "voiceB"]) {
    const sel = $(id);
    sel.innerHTML = "";
    for (const v of voices) {
      const o = document.createElement("option");
      o.value = v.name;
      o.textContent = `${v.name} (${v.lang})`;
      sel.append(o);
    }
  }
  const pick = (want, idx) =>
    voices.some((v) => v.name === want) ? want : ((voices[idx] || voices[0] || {}).name || "");
  $("voiceA").value = pick(settings.voiceA, 0);
  $("voiceB").value = pick(settings.voiceB, 1);
}
function voiceFor(speaker) {
  const name = $(speaker === "B" ? "voiceB" : "voiceA").value;
  return voices.find((v) => v.name === name);
}
for (const id of ["voiceA", "voiceB"]) {
  $(id).onchange = () => {
    settings[id] = $(id).value;
    chrome.storage.local.set({ [id]: settings[id] });
  };
}
$("testVoices").onclick = async () => {
  pausePlayback();
  await speak("Hi, I'm Maya. I'll walk you through the reading.", "A");
  await speak("And I'm Sam. I'll ask the questions you're probably thinking.", "B");
};
speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

function sentences(text) {
  return (text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text])
    .map((s) => s.trim())
    .filter(Boolean);
}

// Chrome cuts off long utterances, so everything is spoken sentence by sentence.
function speak(text, speaker) {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = voiceFor(speaker);
    if (v) u.voice = v;
    u.rate = settings.rate;
    u.onend = resolve;
    u.onerror = resolve;
    speechSynthesis.speak(u);
  });
}

function showNow(item) {
  const who = item.speaker === "B" ? "Sam" : lastMode === "podcast" ? "Maya" : "Reader";
  $("now").innerHTML = "";
  const b = document.createElement("span");
  b.className = "who";
  b.textContent = who + ": ";
  $("now").append(b, document.createTextNode(item.text));
}

async function play() {
  if (playing) return;
  playing = true;
  setEnabled(["pause"], true);
  setEnabled(["resume"], false);
  while (playing && pos < queue.length) {
    showNow(queue[pos]);
    await speak(queue[pos].text, queue[pos].speaker);
    if (!playing) break; // paused mid-sentence: replay this sentence on resume
    pos++;
  }
  if (pos >= queue.length && queue.length) { $("now").textContent = "Done."; setEnabled(["resume"], false); }
  playing = false;
  setEnabled(["pause"], false);
}
function pausePlayback() {
  playing = false;
  speechSynthesis.cancel();
  setEnabled(["pause"], false);
  setEnabled(["resume"], pos < queue.length);
}
function stopPlayback() { pausePlayback(); queue = []; pos = 0; setEnabled(["resume"], false); }

$("pause").onclick = pausePlayback;
$("resume").onclick = play;
$("play").onclick = () => startListening();

async function startListening() {
  stopPlayback();
  if (settings.mode === "podcast") await startPodcast();
  else startRead();
}

function startRead() {
  lastMode = "read";
  queue = sentences(sourceText.replace(/\n\n/g, " ")).map((t) => ({ speaker: "A", text: t }));
  play();
}

// ---------- AI providers ----------
// Every feature calls ai() or askJSON(); adding a provider means adding one function here.
async function ai(system, user, maxTokens = 2000, json = false) {
  // Running timer on the status line, so a slow model looks busy rather than frozen.
  const base = $("status").textContent.replace(/ \([^()]*\d+s\)$/, "");
  const started = Date.now();
  const tick = () => {
    const secs = Math.round((Date.now() - started) / 1000);
    status(`${base} (${providerName()}, ${secs}s)`);
  };
  tick();
  const timer = setInterval(tick, 1000);
  try {
    return settings.provider === "gemini"
      ? await gemini(system, user, maxTokens, json)
      : await claude(system, user, maxTokens);
  } finally {
    clearInterval(timer);
  }
}

// Asks for a JSON array; if the reply doesn't parse, asks once more.
async function askJSON(system, user, maxTokens) {
  const raw = await ai(system, user, maxTokens, true);
  try {
    return parseJSONArray(raw);
  } catch {
    status("The reply wasn't in the expected format; asking again…");
    const retry = await ai(
      system + " Your previous reply was not valid JSON. Reply with the JSON array only, nothing else.",
      user, maxTokens, true
    );
    return parseJSONArray(retry);
  }
}

async function gemini(system, user, maxTokens, json) {
  if (!settings.geminiKey) throw new Error("Add your Gemini API key under Settings.");
  const model = settings.geminiModel || DEFAULT_GEMINI_MODEL;
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": settings.geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          // Newer Gemini models spend part of this budget on internal reasoning, so leave room.
          maxOutputTokens: Math.max(maxTokens * 4, 8192),
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    }
  );
  if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  const cand = data.candidates && data.candidates[0];
  const parts = (cand && cand.content && cand.content.parts) || [];
  const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("\n");
  if (!text) {
    const why = (cand && cand.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || "empty reply";
    throw new Error(`Gemini returned no text (${why}).`);
  }
  return text;
}

async function claude(system, user, maxTokens = 2000) {
  if (!settings.apiKey) throw new Error("Add your Anthropic API key under Settings.");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

function parseJSONArray(raw) {
  const start = raw.indexOf("["), end = raw.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error("Model didn't return JSON.");
  return JSON.parse(raw.slice(start, end + 1));
}

// ---------- podcast ----------
async function startPodcast() {
  lastMode = "podcast";
  status("Writing the discussion…");
  $("play").disabled = true;
  try {
    const intro = focus
      ? `The listener was looking for: "${focus}". Center the discussion on how these passages relate to that, ` +
        "and compare them if there are several.\n\n"
      : "";
    const turns = await askJSON(
      "You write short two-host podcast scripts from material on a web page or textbook. " +
      "Host A (Maya) explains clearly; host B (Sam) asks the questions a curious listener would ask and offers everyday examples. " +
      "Stay faithful to the material. If either host adds something not in it, they say so out loud (e.g. 'this goes beyond the text, but…'). " +
      "No sound effects, no stage directions. 12 to 20 turns, each one to three sentences. " +
      'Output ONLY a JSON array: [{"speaker":"A","text":"..."},{"speaker":"B","text":"..."}]',
      intro + "Material:\n\n" + sourceText,
      3000
    );
    queue = turns.flatMap((t) =>
      sentences(t.text).map((s) => ({ speaker: t.speaker === "B" ? "B" : "A", text: s }))
    );
    status(`Discussion ready: ${turns.length} turns.`);
    play();
  } catch (e) {
    status("Podcast failed: " + e.message, true);
  } finally {
    $("play").disabled = false;
  }
}

// ---------- find on page ----------
$("find").onclick = async () => {
  const q = $("findQuery").value.trim();
  if (!q) { status("Type what you're looking for first.", true); return; }
  $("find").disabled = true;
  $("results").innerHTML = "";
  $("playAll").hidden = true;
  status("Reading the whole page…");
  try {
    const blocks = await captureBlocks("all");
    if (!blocks.length) throw new Error("No readable text on this page.");
    let budget = 120000;
    const numbered = [];
    for (let i = 0; i < blocks.length && budget > 0; i++) {
      const t = blocks[i].slice(0, 1500);
      numbered.push(`[${i}] ${t}`);
      budget -= t.length;
    }
    status(`Searching ${numbered.length} blocks…`);
    const rawMatches = await askJSON(
      "You find the passages on a web page that match what the user describes, judging by meaning, not just shared words. " +
      "The page text is split into numbered blocks; a match may span adjacent blocks. " +
      "Return ONLY a JSON array, best match first, at most 8 items: " +
      '[{"blocks":[3,4],"label":"short name for the match","why":"one sentence on how it matches","score":0}] ' +
      "where score is 0-100 closeness. Include only genuinely relevant matches; return [] if none.",
      `Looking for: ${q}\n\nBlocks:\n${numbered.join("\n")}`,
      1500
    );
    const matches = rawMatches
      .map((m) => ({
        ...m,
        blocks: (Array.isArray(m.blocks) ? m.blocks : []).filter(
          (i) => Number.isInteger(i) && i >= 0 && i < blocks.length
        ),
      }))
      .filter((m) => m.blocks.length);
    found = { blocks, matches, query: q };
    renderMatches();
    status(matches.length
      ? `${matches.length} match${matches.length > 1 ? "es" : ""}. Listening uses ${settings.mode === "podcast" ? "podcast" : "regular"} mode.`
      : "Nothing on this page matches that.");
  } catch (e) {
    status("Find failed: " + e.message, true);
  } finally {
    $("find").disabled = false;
  }
};

function matchText(m) { return m.blocks.map((i) => found.blocks[i]).join("\n\n"); }

function renderMatches() {
  const box = $("results");
  box.innerHTML = "";
  for (const m of found.matches) {
    const card = document.createElement("div");
    card.className = "result";
    const head = document.createElement("div");
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = m.label || "Match";
    const score = document.createElement("span");
    score.className = "score";
    if (typeof m.score === "number") score.textContent = `${m.score}% match`;
    head.append(label, score);
    const why = document.createElement("div");
    why.className = "why";
    why.textContent = m.why || "";
    const snip = document.createElement("div");
    snip.className = "snip";
    const t = matchText(m);
    snip.textContent = t.slice(0, 220) + (t.length > 220 ? " …" : "");
    const row = document.createElement("div");
    row.className = "row";
    const listen = document.createElement("button");
    listen.className = "small primary";
    listen.textContent = "Listen";
    listen.onclick = () => { setPassage(t, found.query); startListening(); };
    const use = document.createElement("button");
    use.className = "small";
    use.textContent = "Use for questions & quiz";
    use.onclick = () => { setPassage(t, found.query); status(`Passage set: ${m.label || "match"}.`); };
    row.append(listen, use);
    card.append(head, why, snip, row);
    box.append(card);
  }
  $("playAll").hidden = found.matches.length < 2;
}

$("playAll").onclick = () => {
  const all = found.matches.map((m) => `${m.label || "Match"}:\n${matchText(m)}`).join("\n\n---\n\n");
  setPassage(all, found.query);
  startListening();
};

// ---------- interrupt ----------
$("ask").onclick = async () => {
  const q = $("question").value.trim();
  if (!q) return;
  const wasActive = playing || (pos > 0 && pos < queue.length);
  pausePlayback();
  status("Thinking…");
  $("ask").disabled = true;
  try {
    const where = queue[pos] ? queue[pos].text : "";
    const answer = await ai(
      "You are a patient tutor answering someone who just interrupted a lesson. " +
      "Answer in a natural spoken style, 3 to 6 sentences, and include one concrete example. " +
      "Ground the answer in the material; if you go beyond it, say so briefly.",
      `Material:\n\n${sourceText}\n\n` +
      (focus ? `They were looking for: ${focus}\n\n` : "") +
      `We had just reached: "${where}"\n\nQuestion: ${q}`,
      800
    );
    $("answer").textContent = answer;
    $("question").value = "";
    status(wasActive ? "Answering, then picking up where we left off." : "Answering.");
    for (const s of sentences(answer)) await speak(s, "A");
    if (wasActive) play();
    else status("");
  } catch (e) {
    status("Question failed: " + e.message, true);
  } finally {
    $("ask").disabled = false;
  }
};

// ---------- quiz + simple stats ----------
async function recordResult(correct) {
  const { stats = {} } = await chrome.storage.local.get("stats");
  const s = stats[lastMode] || { right: 0, total: 0 };
  s.total++;
  if (correct) s.right++;
  stats[lastMode] = s;
  await chrome.storage.local.set({ stats });
  renderStats(stats);
}
function renderStats(stats) {
  const label = { read: "after regular reading", podcast: "after podcast", none: "without listening" };
  const lines = Object.entries(stats || {}).map(
    ([m, s]) => `${label[m] || m}: ${s.right}/${s.total} (${Math.round((100 * s.right) / s.total)}%)`
  );
  $("stats").textContent = lines.length ? "Quiz results " + lines.join(" · ") : "";
}

$("quiz").onclick = async () => {
  pausePlayback();
  status("Writing questions…");
  $("quiz").disabled = true;
  $("quizArea").innerHTML = "";
  try {
    const qs = await askJSON(
      "Write multiple-choice questions that check understanding of the material, not trivia recall. " +
      "Use plausible wrong answers. " +
      'Output ONLY a JSON array: [{"q":"...","options":["...","...","...","..."],"answer":0,"why":"..."}] ' +
      "where answer is the index of the correct option.",
      "Write 4 questions for this material:\n\n" + sourceText,
      1500
    );
    for (const item of qs) {
      const box = document.createElement("div");
      box.className = "q";
      const p = document.createElement("div");
      p.textContent = item.q;
      box.append(p);
      const why = document.createElement("div");
      why.className = "why";
      item.options.forEach((opt, i) => {
        const b = document.createElement("button");
        b.textContent = opt;
        b.onclick = () => {
          const ok = i === item.answer;
          box.querySelectorAll("button").forEach((x, j) => {
            x.disabled = true;
            if (j === item.answer) x.classList.add("right");
          });
          if (!ok) b.classList.add("wrong");
          why.textContent = (ok ? "Correct. " : "Not quite. ") + item.why;
          recordResult(ok);
        };
        box.append(b);
      });
      box.append(why);
      $("quizArea").append(box);
    }
    status("");
  } catch (e) {
    status("Quiz failed: " + e.message, true);
  } finally {
    $("quiz").disabled = false;
  }
};

// ---------- init ----------
loadSettings();
chrome.storage.local.get("stats").then(({ stats }) => renderStats(stats));
