// Study Reader usage log.
// Events and materials are stored in IndexedDB on this computer only. Nothing is sent anywhere
// unless you export it yourself.
//
// Event fields (also the CSV columns, see README "Usage log"):
//   ts, session, type, provider, model, mode, materialId, materialTitle, materialUrl, pages, chars,
//   verbose, plus type-specific fields below. Verbose-only fields are stored only when verbose
//   logging was on at the time.

const SRLog = (() => {
  const DB_NAME = "study-reader-log";
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("events")) {
            db.createObjectStore("events", { keyPath: "id", autoIncrement: true });
          }
          if (!db.objectStoreNames.contains("materials")) {
            db.createObjectStore("materials", { keyPath: "id" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function run(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      let result;
      const req = fn(tx.objectStore(store));
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    add: (event) => run("events", "readwrite", (s) => s.add(event)),
    events: () => run("events", "readonly", (s) => s.getAll()),
    materials: () => run("materials", "readonly", (s) => s.getAll()),
    getMaterial: (id) => run("materials", "readonly", (s) => s.get(id)),
    putMaterial: (m) => run("materials", "readwrite", (s) => s.put(m)),
    async clear() {
      await run("events", "readwrite", (s) => s.clear());
      await run("materials", "readwrite", (s) => s.clear());
    },
  };
})();

// Column order for CSV export. Any other fields found in events are appended after these.
const SR_COLUMNS = [
  "id", "ts", "session", "type", "provider", "model", "mode", "materialId", "materialTitle",
  "materialUrl", "pages", "chars", "verbose",
  // ai_call
  "task", "secs", "ok", "error", "inputChars", "inputTokens", "outputTokens", "reasoningTokens", "totalTokens",
  // capture / listening
  "source", "blocks", "items", "played", "fraction",
  // podcast / quiz
  "promptVersion", "turns", "quizId", "questions", "listenFraction", "q", "level", "correct", "msToAnswer",
  // verbose-only
  "question", "options", "chosen", "correctAnswer", "explanation", "answer", "script", "quiz", "summary",
];

function srToCSV(events) {
  const extra = new Set();
  for (const e of events) for (const k of Object.keys(e)) if (!SR_COLUMNS.includes(k)) extra.add(k);
  const cols = SR_COLUMNS.concat([...extra]);
  const cell = (v) => {
    if (v === undefined || v === null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(",")].concat(events.map((e) => cols.map((c) => cell(e[c])).join(","))).join("\r\n");
}

function srDownload(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
