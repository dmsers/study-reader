// Study Reader — side panel logic.
// Capture text from the active tab (including shadow DOM, iframes and whole PDFs), or find
// passages that match a description, then play them as plain reading or a two-host discussion,
// with interrupt-to-ask and quizzes. Usage is logged locally (log.js) for the Statistics view.

const $ = (id) => document.getElementById(id);
const DEFAULT_MODEL = "claude-sonnet-5-5";
const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const DEFAULT_OPENAI_MODEL = "gpt-6-luna";
const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
// Bump a version whenever its prompt changes, so logged results can be compared fairly.
const PROMPT_VERSIONS = {
  podcast: "podcast-v1", quiz: "quiz-v2", ask: "ask-v1", askDiscussion: "ask-discussion-v1", summary: "summary-v1",
};
const SESSION = crypto.randomUUID(); // one per time the panel is opened

let sourceText = "";   // the passage everything below works on
let focus = "";        // what the user was looking for, when the passage came from Find
let queue = [];        // [{speaker:'A'|'B', text}] sentence-sized items
let pos = 0;
let playing = false;
let lastMode = "none"; // how the current passage was last listened to (for quiz stats)
let settings = {
  provider: "claude", apiKey: "", model: DEFAULT_MODEL,
  geminiKey: "", geminiModel: DEFAULT_GEMINI_MODEL,
  openaiKey: "", openaiModel: DEFAULT_OPENAI_MODEL, openaiBase: DEFAULT_OPENAI_BASE,
  rate: 1.0, mode: "read", voiceA: "", voiceB: "", verbose: false,
};
let found = { blocks: [], matches: [], query: "" };

function status(msg, isErr = false) {
  const el = $("status");
  el.textContent = msg;
  el.className = isErr ? "err" : "";
  if (isErr) showAlert(msg);
}

// ---------- prominent error banner (top of panel) ----------
// Errors appear in a red box at the top, with a plain-language hint, until dismissed
// or until the next action starts.
function showAlert(msg, hint = "") {
  $("alertMsg").textContent = msg;
  $("alertHint").textContent = hint;
  $("alertHint").hidden = !hint;
  $("alert").hidden = false;
  $("alert").scrollIntoView({ block: "nearest" });
}
function clearAlert() { $("alert").hidden = true; }

// Turns a raw error into a short message plus a hint about what to do.
function explain(e) {
  const m = String((e && e.message) || e);
  const prov = providerName();
  if (/PDF_PASSWORD/.test(m)) return {
    msg: "This PDF is password-protected.",
    hint: "Study Reader can't open protected PDFs.",
  };
  if (/PDF_FETCH/.test(m)) return {
    msg: "Couldn't download the PDF" + (m.replace("PDF_FETCH", "").trim() ? ` (${m.replace("PDF_FETCH", "").trim()})` : "") + ".",
    hint: "Make sure you're signed in to the course site, reload the page, and try again.",
  };
  if (/PDF_PARSE/.test(m)) return {
    msg: "The PDF downloaded but couldn't be opened.",
    hint: "The file may be damaged or in an unusual format.",
  };
  if (/TIMEOUT_CAPTURE/.test(m)) return {
    msg: "The page didn't respond to Study Reader in time.",
    hint: "Reload the page and try again. If it keeps happening, Settings → Debug shows how far it got.",
  };
  if (/TIMEOUT_AI/.test(m)) return {
    msg: `No reply from ${prov} after 2 minutes.`,
    hint: "Try again, try a faster model (e.g. gemini-3.5-flash-lite or gpt-6-luna), or use a smaller section or page range.",
  };
  if (/chrome:\/\/|chrome-extension:\/\/|Cannot access|cannot be scripted|The extensions gallery/i.test(m)) return {
    msg: "Chrome doesn't allow extensions to read this page.",
    hint: "This happens on Chrome's own pages, the Web Store, and some built-in viewers. Try a regular web page.",
  };
  if (/Failed to fetch|NetworkError|network/i.test(m)) return {
    msg: `Couldn't reach ${prov}.`,
    hint: "Check your internet connection and try again.",
  };
  if (/ 40[13]\b|API_KEY_INVALID|invalid x-api-key|Incorrect API key|authentication|permission/i.test(m)) return {
    msg: `${prov} rejected the API key.`,
    hint: "Re-paste the key in Settings and click Save settings.",
  };
  if (/ 404\b|not found|not supported for generateContent/i.test(m)) return {
    msg: `${prov} doesn't recognize the model name "${modelName()}".`,
    hint: "Check the spelling in Settings, or clear the field to use the default.",
  };
  if (/ 429\b|quota|rate limit|RESOURCE_EXHAUSTED/i.test(m)) return {
    msg: `${prov} says you've hit a usage or rate limit.`,
    hint: "Wait a minute and try again, or check your plan and credits.",
  };
  if (/ 5\d\d\b|overloaded|UNAVAILABLE/i.test(m)) return {
    msg: `${prov} is having trouble right now.`,
    hint: "Try again in a moment, or switch providers in Settings.",
  };
  return { msg: m, hint: "" };
}
function fail(what, e) {
  const { msg, hint } = explain(e);
  const el = $("status");
  el.textContent = `${what}: ${msg}`;
  el.className = "err";
  showAlert(`${what}: ${msg}`, hint);
  console.error(what, e);
}

function withTimeout(promise, ms, code) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => { t = setTimeout(() => reject(new Error(code)), ms); }),
  ]).finally(() => clearTimeout(t));
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
  $("openaiKey").value = settings.openaiKey;
  $("openaiModel").value = settings.openaiModel;
  $("openaiBase").value = settings.openaiBase;
  $("verbose").checked = !!settings.verbose;
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
  settings.openaiKey = $("openaiKey").value.trim();
  settings.openaiModel = $("openaiModel").value.trim() || DEFAULT_OPENAI_MODEL;
  settings.openaiBase = $("openaiBase").value.trim() || DEFAULT_OPENAI_BASE;
  settings.rate = parseFloat($("rate").value) || 1.0;
  settings.voiceA = $("voiceA").value;
  settings.voiceB = $("voiceB").value;
  await chrome.storage.local.set(settings);
  applyProvider();
  status("Settings saved.");
};

function providerName() {
  if (settings.provider === "gemini") return "Gemini";
  if (settings.provider === "openai") {
    return /api\.openai\.com/.test(settings.openaiBase || DEFAULT_OPENAI_BASE) ? "OpenAI" : "OpenAI-compatible";
  }
  return "Claude";
}
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
  // Find the PDF file(s) this frame is showing, so the whole document can be read directly.
  // Course-site viewers often keep only a few pages in the page at once.
  const pdfs = new Set();
  const isPdfUrl = (u) => /\.pdf($|[?#&])/i.test(u);
  const add = (u) => { try { if (u) pdfs.add(new URL(u, location.href).href); } catch (e) {} };
  try {
    const fileParam = new URL(location.href).searchParams.get("file"); // pdf.js viewer: viewer.html?file=…
    if (fileParam) add(fileParam);
  } catch (e) {}
  if (isPdfUrl(location.href) || document.contentType === "application/pdf") add(location.href);
  const scan = (root) => {
    for (const el of root.querySelectorAll("*")) {
      const tag = el.tagName.toLowerCase();
      if (tag !== "a") { // ignore ordinary links to other documents
        for (const attr of ["src", "data", "file", "pdf-url", "data-src", "href"]) {
          const v = el.getAttribute && el.getAttribute(attr);
          if (v && (isPdfUrl(v) || el.getAttribute("type") === "application/pdf")) add(v);
        }
      }
      if (el.shadowRoot) scan(el.shadowRoot);
    }
  };
  scan(document);
  try {
    for (const e of performance.getEntriesByType("resource")) if (isPdfUrl(e.name)) add(e.name);
  } catch (e) {}
  return {
    url: location.href, method: useA ? "elements" : "deep", blocks: useA ? a : b,
    pdfs: Array.from(pdfs),
  };
}

// Runs in the page's own JavaScript world. Many course sites use Mozilla's pdf.js viewer,
// which already holds the whole document, so the text of every page can be read from it.
async function readFromPdfJsViewer() {
  const app = window.PDFViewerApplication;
  if (!app || !app.pdfDocument) return null;
  const doc = app.pdfDocument;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent();
    pages.push(tc.items.map((it) => (it.str || "") + (it.hasEOL ? "\n" : "")).join(""));
  }
  return { url: app.url || app.baseUrl || location.href, pages };
}

const looksLikePdfTab = (url = "") =>
  /\.pdf($|[?#])/i.test(url) || url.startsWith("chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai");

let pdfDoc = null;      // { url, pages: [text], source } when the current page's content is a PDF
let blockPages = [];    // page number for each captured block (PDFs only), used to label Find results
let pdfProblem = "";    // why a PDF on the page couldn't be read, if one was found
let lastTab = { title: "", url: "" }; // page the last capture came from

async function targetTab() {
  // window.__studyReaderTestTabId lets automated tests point the panel at a specific tab.
  if (window.__studyReaderTestTabId) return chrome.tabs.get(window.__studyReaderTestTabId);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function captureBlocks(scope) {
  const tab = await targetTab();
  if (!tab) throw new Error("No active tab found.");
  pdfDoc = null; blockPages = []; pdfProblem = "";
  lastTab = { title: tab.title || "", url: tab.url || "" };
  const debug = [];

  // 1. The tab itself is a PDF (Chrome's own viewer): read the file directly.
  if (looksLikePdfTab(tab.url)) {
    debug.push(`PDF tab — ${String(tab.url).slice(0, 120)}`);
    try {
      pdfDoc = { url: tab.url, pages: await readPdfFile(tab.url, null), source: "file" };
    } catch (e) {
      $("frames").textContent = debug.join("\n");
      throw e;
    }
  }

  // 2. Regular page: capture its text, and look for a PDF behind any document viewer.
  let frames = [];
  if (!pdfDoc) {
    const results = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: extractFromFrame,
        args: [scope],
      }),
      10000,
      "TIMEOUT_CAPTURE"
    );
    frames = results.filter((r) => r.result).map((r) => ({ ...r.result, frameId: r.frameId }));
    for (const f of frames) {
      debug.push(`${f.blocks.length} blocks (${f.method}) — ${f.url.slice(0, 120)}`);
      for (const p of f.pdfs) debug.push(`  PDF found — ${p.slice(0, 120)}`);
    }

    // 2a. A pdf.js viewer already holds the whole document; ask it for every page.
    try {
      const viewer = await withTimeout(
        chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          world: "MAIN",
          func: readFromPdfJsViewer,
        }),
        30000,
        "TIMEOUT_CAPTURE"
      );
      const hit = viewer.map((r) => r.result).find((r) => r && r.pages && r.pages.length);
      if (hit) {
        pdfDoc = { url: hit.url, pages: hit.pages.map(cleanPdfText), source: "viewer" };
        debug.push(`  Read ${hit.pages.length} pages from the page's PDF viewer`);
      }
    } catch (e) {
      debug.push(`  (viewer check skipped: ${e.message})`);
    }

    // 2b. Otherwise download the PDF the page is showing and read it ourselves.
    if (!pdfDoc) {
      const candidates = [];
      for (const f of frames) for (const url of f.pdfs) {
        if (!candidates.some((c) => c.url === url)) candidates.push({ url, frameId: f.frameId });
      }
      for (const c of candidates.slice(0, 3)) {
        try {
          pdfDoc = { url: c.url, pages: await readPdfFile(c.url, { tabId: tab.id, frameId: c.frameId }), source: "file" };
          debug.push(`  Read ${pdfDoc.pages.length} pages from the PDF file`);
          break;
        } catch (e) {
          pdfProblem = explain(e).msg;
          debug.push(`  Couldn't read ${c.url.slice(0, 80)}: ${e.message}`);
        }
      }
    }
  }
  $("frames").textContent = debug.join("\n") || "(no frames returned)";

  if (pdfDoc) {
    if (!pdfDoc.pages.some((t) => t.trim())) {
      pdfDoc = null;
      pdfProblem = "The PDF has no text layer. It looks like scanned images, which can't be read yet.";
    } else {
      return pdfBlocks(1, pdfDoc.pages.length);
    }
  }
  const seen = new Set();
  const blocks = [];
  for (const f of frames) {
    for (const t of f.blocks) if (t && !seen.has(t)) { seen.add(t); blocks.push(t); }
  }
  return blocks;
}

// ---------- PDF reading ----------
let pdfjsLib = null;
async function loadPdfJs() {
  if (!pdfjsLib) {
    pdfjsLib = await import(chrome.runtime.getURL("lib/pdf.min.mjs"));
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdf.worker.min.mjs");
  }
  return pdfjsLib;
}

// Download a PDF using your existing login. First from the panel; if the site refuses,
// from inside the page that shows it (same origin, so the course site's cookies apply).
async function fetchPdfBytes(url, frame) {
  const isPdf = (b) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
  let why = "";
  try {
    const r = await fetchWithTimeout(url, { credentials: "include" }, 60000);
    if (r.ok) {
      const b = new Uint8Array(await r.arrayBuffer());
      if (isPdf(b)) return b;
      why = "the download wasn't a PDF (often a login page)";
    } else why = `HTTP ${r.status}`;
  } catch (e) { why = e.message; }

  if (frame) {
    const [res] = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: frame.tabId, frameIds: [frame.frameId] },
        func: async (u) => {
          const r = await fetch(u, { credentials: "include" });
          if (!r.ok) return { error: `HTTP ${r.status}` };
          const bytes = new Uint8Array(await r.arrayBuffer());
          let bin = "";
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
          return { b64: btoa(bin) };
        },
        args: [url],
      }),
      60000,
      "TIMEOUT_CAPTURE"
    );
    const out = res && res.result;
    if (out && out.b64) {
      const bin = atob(out.b64);
      const b = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
      if (isPdf(b)) return b;
      why = "the download wasn't a PDF (often a login page)";
    } else if (out && out.error) why = out.error;
  }
  throw new Error(`PDF_FETCH ${why}`);
}

async function readPdfFile(url, frame) {
  const bytes = await fetchPdfBytes(url, frame);
  const pdfjs = await loadPdfJs();
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: bytes,
      cMapUrl: chrome.runtime.getURL("lib/cmaps/"),
      cMapPacked: true,
      isEvalSupported: false,
    }).promise;
  } catch (e) {
    if (e && e.name === "PasswordException") throw new Error("PDF_PASSWORD");
    throw new Error(`PDF_PARSE ${e.message}`);
  }
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    status(`Reading PDF… page ${n} of ${doc.numPages}`);
    const tc = await (await doc.getPage(n)).getTextContent();
    pages.push(cleanPdfText(tc.items.map((it) => (it.str || "") + (it.hasEOL ? "\n" : "")).join("")));
  }
  doc.destroy();
  return pages;
}

function cleanPdfText(raw) {
  return String(raw || "")
    .replace(/(\w)-\n(\w)/g, "$1$2")   // re-join words hyphenated across lines
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Split pages into passage-sized blocks (for Find), remembering each block's page number.
function pdfBlocks(from, to) {
  const blocks = [];
  blockPages = [];
  for (let n = from; n <= to; n++) {
    const parts = pdfDoc.pages[n - 1].match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [];
    let chunk = "";
    for (const s of parts) {
      chunk += s;
      if (chunk.length >= 900) { blocks.push(chunk.trim()); blockPages.push(n); chunk = ""; }
    }
    if (chunk.trim()) { blocks.push(chunk.trim()); blockPages.push(n); }
  }
  return blocks;
}

function showPdfBar() {
  const bar = $("pdfBar");
  if (!pdfDoc) { bar.hidden = true; return; }
  const n = pdfDoc.pages.length;
  $("pdfInfo").textContent = `PDF · ${n} page${n > 1 ? "s" : ""}`;
  $("pdfFrom").max = $("pdfTo").max = n;
  $("pdfFrom").value = 1;
  $("pdfTo").value = n;
  bar.hidden = false;
}
function usePdfPages() {
  const n = pdfDoc.pages.length;
  let from = Math.min(Math.max(parseInt($("pdfFrom").value, 10) || 1, 1), n);
  let to = Math.min(Math.max(parseInt($("pdfTo").value, 10) || n, from), n);
  $("pdfFrom").value = from;
  $("pdfTo").value = to;
  const text = pdfDoc.pages.slice(from - 1, to).filter(Boolean).join("\n\n");
  setPassage(text, "", { title: lastTab.title || pdfDoc.url, url: pdfDoc.url, pages: `${from}-${to}`, source: "pdf-" + pdfDoc.source });
  const pages = to - from + 1;
  let msg = `Using pages ${from}–${to} of ${n}: ${text.length.toLocaleString()} characters.`;
  if (settings.mode === "podcast" && pages > 8) msg += " Tip: fewer pages make the podcast start faster.";
  status(msg);
}
$("pdfUse").onclick = () => { clearAlert(); if (pdfDoc) usePdfPages(); };

// After a capture, explain a PDF that was found but couldn't be read.
function pdfNotice(gotText) {
  if (!pdfProblem) return;
  showAlert(
    gotText ? "Found a PDF on this page but couldn't read it, so only the page text was captured."
            : "Found a PDF on this page but couldn't read it.",
    pdfProblem
  );
}

function setPassage(text, focusText = "", meta = {}) {
  stopPlayback();
  sourceText = text;
  focus = focusText;
  lastMode = "none";
  material = startMaterial(text, meta);
  $("preview").hidden = false;
  $("preview").textContent = text.slice(0, 1200) + (text.length > 1200 ? " …" : "");
  setEnabled(["play", "ask", "quiz"], true);
}

$("grab").onclick = async () => {
  status("Grabbing text…");
  try {
    const blocks = await captureBlocks($("scope").value);
    showPdfBar();
    if (pdfDoc) { usePdfPages(); return; }
    if (!blocks.length) {
      if (pdfProblem) { status("No readable text found.", false); pdfNotice(false); return; }
      fail("No readable text found", new Error("Study Reader reached the page but found no text in it."));
      $("alertHint").textContent = "If the page shows images of text (a scan), it can't be read yet. Settings → Debug lists what was reached.";
      $("alertHint").hidden = false;
      return;
    }
    const text = blocks.join("\n\n");
    setPassage(text, "", { title: lastTab.title, url: lastTab.url, source: "page", blocks: blocks.length });
    status(`Captured ${blocks.length} blocks, ${text.length.toLocaleString()} characters.`);
    pdfNotice(true);
  } catch (e) {
    fail("Couldn't grab text", e);
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
  const who = item.speaker === "B" ? "Sam" : lastMode === "podcast" || item.podcast ? "Maya" : "Reader";
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
    if (listenSession) listenSession.played = Math.max(listenSession.played, pos + 1);
    showNow(queue[pos]);
    await speak(queue[pos].text, queue[pos].speaker);
    if (!playing) break; // paused mid-sentence: replay this sentence on resume
    pos++;
  }
  if (pos >= queue.length && queue.length) {
    $("now").textContent = "Done.";
    setEnabled(["resume"], false);
    endListenSession();
  }
  playing = false;
  setEnabled(["pause"], false);
}
function pausePlayback() {
  playing = false;
  speechSynthesis.cancel();
  setEnabled(["pause"], false);
  setEnabled(["resume"], pos < queue.length);
}
function stopPlayback() {
  pausePlayback();
  endListenSession();
  queue = []; pos = 0;
  setEnabled(["resume"], false);
}

// One "listening session" = one play-through of the current material in one mode.
let listenSession = null;
function beginListenSession(mode) {
  listenSession = { mode, played: 0, total: queue.length, ended: false };
  logEvent("listen_start", { mode, items: queue.length });
}
function listenFraction() {
  return listenSession && listenSession.total ? Math.round((100 * listenSession.played) / listenSession.total) / 100 : 0;
}
function endListenSession() {
  if (!listenSession || listenSession.ended) return;
  listenSession.ended = true;
  logEvent("listen_end", {
    mode: listenSession.mode, items: listenSession.total, played: listenSession.played, fraction: listenFraction(),
  });
}

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
  beginListenSession("read");
  ensureSummary();
  play();
}

// ---------- AI providers ----------
// Every feature calls ai() or askJSON(). Each provider returns { text, usage }, where usage holds
// token counts as reported by the provider. Every call is logged as an "ai_call" event.
async function ai(system, user, maxTokens = 2000, json = false, opts = {}) {
  const quiet = !!opts.quiet; // background calls (e.g. material summaries) don't touch the status line
  const base = $("status").textContent.replace(/ \([^()]*\d+s\)$/, "");
  const task = opts.task || base.replace(/…$/, "").trim() || "AI request";
  const started = Date.now();
  const tick = () => {
    const secs = Math.round((Date.now() - started) / 1000);
    status(`${base} (${providerName()}, ${secs}s)`);
  };
  let timer = null;
  if (!quiet) { tick(); timer = setInterval(tick, 1000); }
  let ok = false, usage = {}, error = "";
  try {
    const call = settings.provider === "gemini" ? gemini : settings.provider === "openai" ? openai : claude;
    const out = await call(system, user, maxTokens, json);
    ok = true;
    usage = out.usage || {};
    return out.text;
  } catch (e) {
    error = String(e.message || e).slice(0, 200);
    throw e;
  } finally {
    if (timer) clearInterval(timer);
    logEvent("ai_call", {
      task, ok, error, secs: Math.round((Date.now() - started) / 100) / 10, inputChars: user.length,
      inputTokens: usage.input ?? "", outputTokens: usage.output ?? "",
      reasoningTokens: usage.reasoning ?? "", totalTokens: usage.total ?? "",
    }).then(renderTimings);
  }
}

function modelName() {
  if (settings.provider === "gemini") return settings.geminiModel || DEFAULT_GEMINI_MODEL;
  if (settings.provider === "openai") return settings.openaiModel || DEFAULT_OPENAI_MODEL;
  return settings.model || DEFAULT_MODEL;
}

// ---------- recent AI timings (Settings → Debug), from the usage log ----------
async function renderTimings() {
  try {
    const calls = (await SRLog.events()).filter((e) => e.type === "ai_call").slice(-30).reverse();
    $("timings").textContent = calls.length
      ? calls.map((t) => {
          const d = new Date(t.ts);
          const when = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
          const tok = t.totalTokens !== "" && t.totalTokens !== undefined
            ? `  ${Number(t.inputTokens || 0).toLocaleString()} in / ${Number(t.outputTokens || 0).toLocaleString()} out tokens`
            : "";
          return `${when}  ${t.provider} ${t.model}  ${t.task}: ${t.secs}s${t.ok ? "" : " (failed)"}` +
            `  [${Number(t.inputChars || 0).toLocaleString()} chars in]${tok}`;
        }).join("\n")
      : "(none yet)";
  } catch (e) {
    $("timings").textContent = "(log unavailable)";
  }
}
$("copyTimings").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("timings").textContent);
    status("Timings copied. Paste them into your feedback.");
  } catch (e) {
    status("Couldn't copy: select the text in the box and copy it by hand.", true);
  }
};

// Asks for a JSON array; if the reply doesn't parse, asks once more.
async function askJSON(system, user, maxTokens, opts = {}) {
  const task = $("status").textContent.replace(/ \([^()]*\d+s\)$/, "").replace(/…$/, "");
  const raw = await ai(system, user, maxTokens, true, opts);
  try {
    return parseJSONArray(raw);
  } catch {
    if (!opts.quiet) status(`${task}, retrying…`);
    const retry = await ai(
      system + " Your previous reply was not valid JSON. Reply with the JSON array only, nothing else.",
      user, maxTokens, true, opts
    );
    return parseJSONArray(retry);
  }
}

async function fetchWithTimeout(url, opts, ms = 120000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e.name === "AbortError") throw new Error("TIMEOUT_AI");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function gemini(system, user, maxTokens, json) {
  if (!settings.geminiKey) throw new Error("Add your Gemini API key under Settings.");
  const model = settings.geminiModel || DEFAULT_GEMINI_MODEL;
  const resp = await fetchWithTimeout(
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
  const u = data.usageMetadata || {};
  return {
    text,
    usage: {
      input: u.promptTokenCount, output: u.candidatesTokenCount,
      reasoning: u.thoughtsTokenCount, total: u.totalTokenCount,
    },
  };
}

async function claude(system, user, maxTokens = 2000) {
  if (!settings.apiKey) throw new Error("Add your Anthropic API key under Settings.");
  const resp = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  const u = data.usage || {};
  return {
    text: data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"),
    usage: {
      input: u.input_tokens, output: u.output_tokens,
      total: (u.input_tokens || 0) + (u.output_tokens || 0),
    },
  };
}

// OpenAI, or any server that speaks OpenAI's Chat Completions format (OpenRouter, Groq,
// a local Ollama or LM Studio, …): change the server address in Settings.
async function openai(system, user, maxTokens, json) {
  const base = (settings.openaiBase || DEFAULT_OPENAI_BASE).replace(/\/+$/, "");
  const official = /api\.openai\.com/.test(base);
  if (official && !settings.openaiKey) throw new Error("Add your OpenAI API key under Settings.");
  const body = {
    model: settings.openaiModel || DEFAULT_OPENAI_MODEL,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  };
  // OpenAI's newer models take max_completion_tokens (which also covers reasoning);
  // most compatible servers still expect max_tokens.
  if (official) body.max_completion_tokens = Math.max(maxTokens * 4, 8192);
  else body.max_tokens = Math.max(maxTokens * 2, 4096);
  const headers = { "content-type": "application/json" };
  if (settings.openaiKey) headers.authorization = `Bearer ${settings.openaiKey}`;
  const resp = await fetchWithTimeout(`${base}/chat/completions`, {
    method: "POST", headers, body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  const msg = data.choices && data.choices[0] && data.choices[0].message;
  const text = (msg && (typeof msg.content === "string" ? msg.content
    : Array.isArray(msg.content) ? msg.content.map((c) => c.text || "").join("") : "")) || "";
  if (!text) {
    const why = (data.choices && data.choices[0] && data.choices[0].finish_reason) || (msg && msg.refusal) || "empty reply";
    throw new Error(`OpenAI returned no text (${why}).`);
  }
  const u = data.usage || {};
  return {
    text,
    usage: {
      input: u.prompt_tokens, output: u.completion_tokens,
      reasoning: u.completion_tokens_details && u.completion_tokens_details.reasoning_tokens,
      total: u.total_tokens,
    },
  };
}

function parseJSONArray(raw) {
  const start = raw.indexOf("["), end = raw.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error("Model didn't return JSON.");
  return JSON.parse(raw.slice(start, end + 1));
}

// ---------- podcast ----------
// TODO (see TODO.md, "Speed: podcast discussion"): if the timing log shows wait time grows
// with input size, split long passages into pieces, start playing the first piece's script
// right away, and write the rest in the background.
async function startPodcast() {
  lastMode = "podcast";
  const t0 = Date.now();
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
    const wait = Math.round((Date.now() - t0) / 100) / 10;
    logEvent("podcast_generated",
      { mode: "podcast", promptVersion: PROMPT_VERSIONS.podcast, turns: turns.length, secs: wait },
      { script: turns });
    beginListenSession("podcast");
    ensureSummary();
    status(`Discussion ready: ${turns.length} turns in ${wait}s (${providerName()} · ${modelName()}).`);
    play();
  } catch (e) {
    fail("Podcast failed", e);
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
    if (!blocks.length) { pdfNotice(false); throw new Error(pdfProblem || "No readable text on this page."); }
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
    fail("Find failed", e);
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
    const pages = [...new Set(m.blocks.map((i) => blockPages[i]).filter(Boolean))];
    const pageLabel = pages.length ? ` · p. ${pages.length > 1 ? pages[0] + "–" + pages[pages.length - 1] : pages[0]}` : "";
    if (typeof m.score === "number") score.textContent = `${m.score}% match${pageLabel}`;
    else score.textContent = pageLabel.replace(/^ · /, "");
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
    const meta = { title: `${lastTab.title} — ${m.label || "match"}`, url: lastTab.url, source: "find" };
    listen.onclick = () => { setPassage(t, found.query, meta); startListening(); };
    const use = document.createElement("button");
    use.className = "small";
    use.textContent = "Use for questions & quiz";
    use.onclick = () => { setPassage(t, found.query, meta); status(`Passage set: ${m.label || "match"}.`); };
    row.append(listen, use);
    card.append(head, why, snip, row);
    box.append(card);
  }
  $("playAll").hidden = found.matches.length < 2;
}

$("playAll").onclick = () => {
  const all = found.matches.map((m) => `${m.label || "Match"}:\n${matchText(m)}`).join("\n\n---\n\n");
  setPassage(all, found.query, { title: `${lastTab.title} — all matches for "${found.query}"`, url: lastTab.url, source: "find" });
  startListening();
};

// ---------- interrupt ----------
// In podcast mode the hosts discuss your question together; in regular reading you get a single,
// direct answer.
function answerStyle() {
  const mode = listenSession && !listenSession.ended ? listenSession.mode
    : lastMode !== "none" ? lastMode : settings.mode;
  return mode === "podcast" ? "discussion" : "single";
}

$("ask").onclick = async () => {
  const q = $("question").value.trim();
  if (!q) return;
  const wasActive = playing || (pos > 0 && pos < queue.length);
  const style = answerStyle();
  pausePlayback();
  status(style === "discussion" ? "The hosts are taking your question…" : "Answering your question…");
  $("ask").disabled = true;
  try {
    const where = queue[pos] ? queue[pos].text : "";
    const recent = queue.slice(Math.max(0, pos - 4), pos + 1)
      .map((it) => `${it.speaker === "B" ? "Sam" : style === "discussion" ? "Maya" : "Reader"}: ${it.text}`).join("\n");
    const context = `Material:\n\n${sourceText}\n\n` +
      (focus ? `The listener was looking for: ${focus}\n\n` : "") +
      (recent ? `Just before the interruption:\n${recent}\n\n` : "");

    let items, transcript;
    if (style === "discussion") {
      const turns = await askJSON(
        "A listener just interrupted your two-host educational podcast with a question. " +
        "Write a short exchange of 3 to 6 turns in which the hosts discuss it together. " +
        "Host A (Maya) explains clearly; host B (Sam) asks follow-ups and offers everyday examples. " +
        "Maya opens by picking up the listener's question in her own words (e.g. 'Good question from our listener…'). " +
        "Include at least one concrete example. Ground the discussion in the material; if either host goes beyond it, " +
        "they say so briefly. Each turn one to three sentences, natural spoken style, no stage directions. " +
        (wasActive
          ? "End with one short line leading back to where they were in the discussion. "
          : "End naturally; do not mention returning to an earlier discussion. ") +
        'Output ONLY a JSON array: [{"speaker":"A","text":"..."},{"speaker":"B","text":"..."}]',
        context + `Listener's question: ${q}`,
        1200
      );
      items = turns.flatMap((t) =>
        sentences(t.text).map((x) => ({ speaker: t.speaker === "B" ? "B" : "A", text: x, podcast: true })));
      transcript = turns.map((t) => `${t.speaker === "B" ? "Sam" : "Maya"}: ${t.text}`).join("\n");
    } else {
      const answer = await ai(
        "You are a patient tutor answering someone who just interrupted a lesson. " +
        "Answer in a natural spoken style, 3 to 6 sentences, and include one concrete example. " +
        "Ground the answer in the material; if you go beyond it, say so briefly.",
        context + `We had just reached: "${where}"\n\nQuestion: ${q}`,
        800
      );
      items = sentences(answer).map((x) => ({ speaker: "A", text: x }));
      transcript = answer;
    }

    $("answer").textContent = transcript;
    $("question").value = "";
    logEvent("question_asked", {
      style, turns: style === "discussion" ? transcript.split("\n").length : "",
      promptVersion: style === "discussion" ? PROMPT_VERSIONS.askDiscussion : PROMPT_VERSIONS.ask,
    }, { question: q, answer: transcript });
    status(wasActive ? "Answering, then picking up where we left off." : "Answering.");
    for (const it of items) {
      showNow(it);
      await speak(it.text, it.speaker);
    }
    if (wasActive) play();
    else { status(""); $("now").textContent = ""; }
  } catch (e) {
    fail("Question failed", e);
  } finally {
    $("ask").disabled = false;
  }
};

// ---------- quiz ----------
const LEVELS = ["remember", "understand", "apply", "analyze"];

$("quiz").onclick = async () => {
  pausePlayback();
  status("Writing questions…");
  $("quiz").disabled = true;
  $("quizArea").innerHTML = "";
  try {
    const qs = await askJSON(
      "Write multiple-choice questions that check understanding of the material, not trivia recall. " +
      "Use plausible wrong answers. Label each question with the thinking it requires, using one of: " +
      "remember, understand, apply, analyze (Bloom's taxonomy). " +
      'Output ONLY a JSON array: [{"q":"...","options":["...","...","...","..."],"answer":0,"why":"...","level":"understand"}] ' +
      "where answer is the index of the correct option.",
      "Write 4 questions for this material:\n\n" + sourceText,
      1500
    );
    // Results count toward the mode used to study this material, and how much of it was heard.
    const quizMode = lastMode;
    const heard = listenSession && listenSession.mode === quizMode ? listenFraction() : 0;
    const quizId = crypto.randomUUID().slice(0, 8);
    const shownAt = Date.now();
    logEvent("quiz_generated", {
      mode: quizMode, promptVersion: PROMPT_VERSIONS.quiz, quizId, questions: qs.length, listenFraction: heard,
    }, { quiz: qs });
    ensureSummary();

    qs.forEach((item, qi) => {
      const level = LEVELS.includes(String(item.level).toLowerCase()) ? String(item.level).toLowerCase() : "unlabeled";
      const box = document.createElement("div");
      box.className = "q";
      const p = document.createElement("div");
      p.textContent = item.q;
      const tag = document.createElement("div");
      tag.className = "level";
      tag.textContent = level === "unlabeled" ? "" : `Level: ${level}`;
      box.append(p, tag);
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
          logEvent("quiz_answer",
            { mode: quizMode, quizId, q: qi + 1, level, correct: ok, msToAnswer: Date.now() - shownAt,
              listenFraction: heard, promptVersion: PROMPT_VERSIONS.quiz },
            { question: item.q, options: item.options, chosen: opt,
              correctAnswer: item.options[item.answer], explanation: item.why });
        };
        box.append(b);
      });
      box.append(why);
      $("quizArea").append(box);
    });
    status("");
  } catch (e) {
    fail("Quiz failed", e);
  } finally {
    $("quiz").disabled = false;
  }
};

// ---------- usage log: materials and events ----------
// A "material" is the exact text being studied. Its ID is a fingerprint of the text, so the same
// pages studied in podcast mode and in regular mode share an ID and can be compared.
let material = null; // { ready: Promise<{id,title,url,pages,chars,source}> }

async function fingerprint(text) {
  const norm = text.toLowerCase().replace(/\s+/g, " ").trim();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
  return Array.from(new Uint8Array(buf)).slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function startMaterial(text, meta = {}) {
  const ready = (async () => {
    const m = {
      id: await fingerprint(text),
      title: (meta.title || "").slice(0, 200), url: meta.url || "", pages: meta.pages || "",
      chars: text.length, source: meta.source || "",
    };
    try {
      const known = await SRLog.getMaterial(m.id);
      if (!known) await SRLog.putMaterial({ ...m, firstSeen: new Date().toISOString(), summary: "" });
    } catch (e) {}
    logEvent("capture", { source: m.source, blocks: meta.blocks || "" }, null, m);
    return m;
  })();
  return { ready, text, summarizing: false };
}

async function logEvent(type, fields = {}, verboseFields = null, knownMaterial = null) {
  try {
    const m = knownMaterial || (material ? await material.ready : null);
    const ev = {
      ts: new Date().toISOString(), session: SESSION, type,
      provider: providerName(), model: modelName(), mode: lastMode,
      materialId: m ? m.id : "", materialTitle: m ? m.title : "", materialUrl: m ? m.url : "",
      pages: m ? m.pages : "", chars: m ? m.chars : "",
      verbose: !!settings.verbose,
      ...fields,
    };
    if (settings.verbose && verboseFields) Object.assign(ev, verboseFields);
    await SRLog.add(ev);
    scheduleStats();
  } catch (e) {
    console.warn("Study Reader: couldn't write to the usage log", e);
  }
}

// Verbose mode: a short "target summary" of each new material, so logs show exactly what was
// studied. Generated once per material, in the background (one extra AI request).
async function ensureSummary() {
  if (!settings.verbose || !material || material.summarizing) return;
  const mat = material;
  mat.summarizing = true;
  try {
    const m = await mat.ready;
    const stored = await SRLog.getMaterial(m.id);
    if (stored && stored.summary) return;
    const summary = await ai(
      "Summarize study material for a research log. Two sentences on what it covers, then " +
      "'Key concepts:' followed by 3 to 6 comma-separated concepts. Plain text only.",
      mat.text.slice(0, 60000), 400, false, { quiet: true, task: "Summarizing material" }
    );
    await SRLog.putMaterial({ ...(stored || m), summary });
    logEvent("material_summary", { promptVersion: PROMPT_VERSIONS.summary }, { summary }, m);
  } catch (e) {
    console.warn("Study Reader: material summary failed", e);
    mat.summarizing = false; // allow a retry later
  }
}

// ---------- statistics ----------
let statsTimer = null;
function scheduleStats() {
  clearTimeout(statsTimer);
  statsTimer = setTimeout(renderStats, 300);
}

const MODE_LABEL = { read: "Regular reading", podcast: "Podcast", none: "Without listening" };
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "—");
const num = (n) => Number(n || 0).toLocaleString();

function table(headers, rows) {
  const wrap = document.createElement("div");
  wrap.className = "tableWrap"; // scrolls sideways if the panel is narrow
  const t = document.createElement("table");
  wrap.append(t);
  const tr = document.createElement("tr");
  for (const h of headers) { const th = document.createElement("th"); th.textContent = h; tr.append(th); }
  t.append(tr);
  for (const r of rows) {
    const row = document.createElement("tr");
    for (const c of r) { const td = document.createElement("td"); td.textContent = c; row.append(td); }
    t.append(row);
  }
  return wrap;
}

async function renderStats() {
  let events = [];
  try { events = await SRLog.events(); } catch (e) { $("statsBody").textContent = "Usage log unavailable."; return; }
  const by = (type) => events.filter((e) => e.type === type);
  const modes = ["read", "podcast", "none"];
  const body = $("statsBody");
  body.innerHTML = "";

  if (!events.length) { body.textContent = "Nothing logged yet. Listen to something or take a quiz."; quickStats([]); return; }

  const first = new Date(events[0].ts).toLocaleDateString();
  const intro = document.createElement("p");
  intro.className = "muted";
  intro.textContent = `${num(events.length)} events since ${first}` +
    (events.some((e) => e.verbose) ? ` · ${num(events.filter((e) => e.verbose).length)} with verbose detail` : "");
  body.append(intro);

  // Listening and quizzes by mode
  const starts = by("listen_start"), ends = by("listen_end"), quizzes = by("quiz_generated"), answers = by("quiz_answer");
  const h1 = document.createElement("h3"); h1.textContent = "By study mode"; body.append(h1);
  body.append(table(["Mode", "Listens", "Avg heard", "Quizzes", "Correct", "Accuracy"], modes.map((m) => {
    const e = ends.filter((x) => x.mode === m);
    const avg = e.length ? pct(e.reduce((a, x) => a + (Number(x.fraction) || 0), 0), e.length) : "—";
    const a = answers.filter((x) => x.mode === m);
    const right = a.filter((x) => x.correct).length;
    return [MODE_LABEL[m], m === "none" ? "—" : num(starts.filter((x) => x.mode === m).length),
      m === "none" ? "—" : avg, num(quizzes.filter((x) => x.mode === m).length),
      `${right}/${a.length}`, pct(right, a.length)];
  })));

  // Accuracy by question level
  const levels = [...LEVELS, "unlabeled"].filter((l) => answers.some((a) => a.level === l));
  if (levels.length) {
    const h2 = document.createElement("h3"); h2.textContent = "Accuracy by question level"; body.append(h2);
    body.append(table(["Level", "Regular", "Podcast", "None"], levels.map((l) => [l, ...modes.map((m) => {
      const a = answers.filter((x) => x.level === l && x.mode === m);
      return a.length ? `${pct(a.filter((x) => x.correct).length, a.length)} (${a.length})` : "—";
    })])));
  }

  // Same material in both modes
  const matModes = new Map();
  for (const e of starts) {
    if (!e.materialId) continue;
    if (!matModes.has(e.materialId)) matModes.set(e.materialId, new Set());
    matModes.get(e.materialId).add(e.mode);
  }
  const both = [...matModes.values()].filter((s) => s.has("read") && s.has("podcast")).length;
  const quizzedBoth = new Map();
  for (const q of quizzes) {
    if (!q.materialId) continue;
    if (!quizzedBoth.has(q.materialId)) quizzedBoth.set(q.materialId, new Set());
    quizzedBoth.get(q.materialId).add(q.mode);
  }
  const qBoth = [...quizzedBoth.values()].filter((s) => s.has("read") && s.has("podcast")).length;
  const asked = by("question_asked");
  if (asked.length) {
    const hq = document.createElement("h3"); hq.textContent = "Questions you asked"; body.append(hq);
    const qp = document.createElement("p");
    const disc = asked.filter((e) => e.style === "discussion").length;
    qp.textContent = `${asked.length} total · ${disc} answered as a host discussion · ${asked.length - disc} as a single answer`;
    body.append(qp);
  }
  const h3 = document.createElement("h3"); h3.textContent = "Materials"; body.append(h3);
  const mp = document.createElement("p");
  mp.textContent = `${num(new Set(events.filter((e) => e.materialId).map((e) => e.materialId)).size)} studied · ` +
    `${both} listened to in both modes · ${qBoth} quizzed after both modes`;
  body.append(mp);

  // AI usage
  const calls = by("ai_call");
  if (calls.length) {
    const groups = new Map();
    for (const c of calls) {
      const k = `${c.provider}\n${String(c.model).replace(/-/g, "\u2011")}`; // keep model names on one line
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    const h4 = document.createElement("h3"); h4.textContent = "AI usage (tokens)"; body.append(h4);
    body.append(table(["Provider / model", "Calls", "Secs", "In", "Out", "Thinking"],
      [...groups.entries()].map(([k, cs]) => {
        const sum = (f) => cs.reduce((a, c) => a + (Number(c[f]) || 0), 0);
        const failed = cs.filter((c) => !c.ok).length;
        return [k, `${cs.length}${failed ? ` (${failed} failed)` : ""}`,
          (sum("secs") / cs.length).toFixed(1), num(sum("inputTokens")), num(sum("outputTokens")), num(sum("reasoningTokens"))];
      })));
  }
  quickStats(answers);
}

// One-line summary under the quiz.
function quickStats(answers) {
  const parts = ["read", "podcast", "none"].map((m) => {
    const a = answers.filter((x) => x.mode === m);
    return a.length ? `${MODE_LABEL[m].toLowerCase()}: ${a.filter((x) => x.correct).length}/${a.length}` : "";
  }).filter(Boolean);
  $("stats").textContent = parts.length ? "Quiz results — " + parts.join(" · ") : "";
}

// ---------- export, verbose toggle, clear ----------
const today = () => new Date().toISOString().slice(0, 10);
$("exportCsv").onclick = async () => {
  try {
    const events = await SRLog.events();
    srDownload(`study-reader-log-${today()}.csv`, srToCSV(events), "text/csv");
    status(`Exported ${events.length} events.`);
  } catch (e) { fail("Export failed", e); }
};
$("exportJson").onclick = async () => {
  try {
    const [events, materials] = await Promise.all([SRLog.events(), SRLog.materials()]);
    const doc = {
      exportedAt: new Date().toISOString(), extensionVersion: chrome.runtime.getManifest().version,
      promptVersions: PROMPT_VERSIONS, materials, events,
    };
    srDownload(`study-reader-log-${today()}.json`, JSON.stringify(doc, null, 2), "application/json");
    status(`Exported ${events.length} events and ${materials.length} materials.`);
  } catch (e) { fail("Export failed", e); }
};
$("verbose").onchange = () => {
  settings.verbose = $("verbose").checked;
  chrome.storage.local.set({ verbose: settings.verbose });
  status(settings.verbose ? "Verbose logging on." : "Verbose logging off.");
};
let clearArmed = false;
$("clearLog").onclick = async () => {
  if (!clearArmed) {
    clearArmed = true;
    $("clearLog").textContent = "Click again to erase the whole log";
    setTimeout(() => { clearArmed = false; $("clearLog").textContent = "Clear log…"; }, 5000);
    return;
  }
  clearArmed = false;
  $("clearLog").textContent = "Clear log…";
  try {
    await SRLog.clear();
    status("Usage log cleared.");
    renderStats();
    renderTimings();
  } catch (e) { fail("Couldn't clear the log", e); }
};

// ---------- init ----------
loadSettings();
renderStats();
renderTimings();

// Dismiss the error banner by hand, or automatically when a new action starts.
$("alertClose").onclick = clearAlert;
for (const id of ["grab", "find", "playAll", "play", "resume", "ask", "quiz", "testVoices"]) {
  $(id).addEventListener("click", clearAlert, { capture: true });
}
