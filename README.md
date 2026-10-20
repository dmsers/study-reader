# Study Reader

**An AI study companion that works with whatever you're reading in the browser.**
It reads a page aloud, or turns it into a two-host podcast discussion you can interrupt with
questions. It also finds passages on a page by meaning and quizzes you on what you just learned.
It works with Claude, Gemini, or OpenAI.

> **Status: early prototype (v0.5.0), shared privately for feedback.** It works end to end in
> Chrome on macOS. The quality of the AI output across subjects and models hasn't been
> systematically tested yet; that's what testers are helping with.

## Why I built this

Digital textbooks and course materials are spread across platforms. Some have added their own
AI study tools, but each one works only inside its own walls, and only for some titles. I wanted
one tool that meets me on whatever page I'm studying: it listens, explains, lets me interrupt
to ask "wait, what does that mean?", and checks that I actually understood.

## Features

- **Two ways to listen:** plain read-aloud using the computer's built-in voices (free, local),
  or a **podcast discussion** in which two AI hosts talk through the material.
- **Interrupt anytime:** ask a question mid-playback. You get a spoken answer with an example,
  then playback resumes where it left off.
- **Whole PDFs:** reads every page of a PDF, even when a course site's viewer only loads a few
  pages at a time, and lets you pick a page range.
- **Find on page:** describe what you're looking for in plain language and get ranked matching
  passages, each with a one-line reason. Listen to one match or to all of them.
- **Quiz me:** four multiple-choice questions on the current material, with explanations.
  Scores are tallied by how you listened. That's groundwork for adapting to what works for each
  learner.
- **Choose your AI:** switch between Claude (Anthropic), Gemini (Google), and OpenAI (or any
  OpenAI-compatible server) at any time.
- **Statistics and usage log:** see how often you study by podcast vs. regular reading, quiz
  accuracy for each, results by question level, and AI usage in tokens. Export everything as
  CSV or JSON for your own analysis.
- **Clear errors:** problems show in a banner at the top of the panel with what to do next.
- **Reads modern web apps:** captures text inside iframes and web components (shadow DOM),
  which many reader and search sites use.

## How it works

```
active tab ──► content capture (all frames, incl. shadow DOM)
                     │
                     ▼
              current passage ──► read aloud (Web Speech API)
                     │
                     ├──► AI provider (Claude or Gemini) ──► podcast script / answers / quiz / find
                     │                                         │
                     └────────────── speech, two voices ◄──────┘
```

- **Manifest V3 Chrome extension** with a side panel; no build step, plain JavaScript.
- **Capture** runs in every frame of the tab. It prefers semantic elements (`<p>`, headings,
  list items) and falls back to walking the rendered tree through shadow roots and slots.
- **AI calls** go through one `ai()` function with an adapter per provider. Structured
  replies (scripts, quizzes, matches) are requested as JSON and retried once if malformed.
- **PDFs** are found behind document viewers (iframe/embed/web-component sources, pdf.js
  viewers, Chrome's PDF viewer), downloaded with the user's session, and parsed with a bundled
  copy of Mozilla pdf.js.
- **Speech** is sentence by sentence, so pausing, interrupting and resuming are precise.

## Install (for testers)

1. Download or clone this repository.
2. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**,
   and choose this folder.
3. Pin **Study Reader** and click its icon to open the side panel.
4. In **Settings**, choose a provider, paste your own API key, and click **Save settings**:
   - **Gemini:** key from [aistudio.google.com](https://aistudio.google.com) (Get API key).
     Default model `gemini-3.8-flash`; `gemini-3.5-flash-lite` is faster and cheaper.
   - **Claude:** key from [console.anthropic.com](https://console.anthropic.com).
     Default model `claude-sonnet-5-5`.
   - **OpenAI:** key from [platform.openai.com](https://platform.openai.com).
     Default model `gpt-6-luna`. For an OpenAI-compatible service, change the server address.
5. Pick two voices and click **Test voices**. On a Mac, the natural-sounding voices are free
   downloads: System Settings → Accessibility → Spoken Content → System Voice → Manage Voices
   (look for *Premium* or *Enhanced*).

Read-aloud works without a key. The podcast, Find, questions and quizzes need one.

## What I'd like feedback on

Please open an issue using the **Feedback** template, or just send me notes. Most useful:

1. **Speed, especially the podcast:** how long until it started talking, and was that acceptable?
   The extension times every AI request. Use **Settings → Debug → Copy timings** and paste the
   result into your feedback.
2. **Accuracy:** did the podcast or the answers say anything wrong or not in the material?
3. **Usefulness:** did the podcast help you understand, or was it filler?
4. **Quizzes:** did they test understanding, or just recall?
5. **Sites:** which pages worked or failed to capture? (Settings → Debug shows what was found.)
6. **Claude vs. Gemini:** if you tried both, which was faster, which was better, and is the
   trade-off worth it?

Please use material you're allowed to share when reporting problems: no screenshots of
copyrighted textbook pages.

## Usage log and statistics

Everything is stored locally in the browser (IndexedDB) and never sent anywhere unless you
export it. Open **Statistics** in the panel to see summaries, export, or clear the log.

**Verbose logging** (a checkbox in Statistics) additionally stores the content: quiz questions,
options, your answers, podcast scripts, your questions and the answers, and a two-sentence
"target summary" of each material (one extra AI request per new material).

**Materials.** Each studied text gets a `materialId`: a fingerprint of the exact text. Grabbing
the same page or PDF page range again gives the same ID, so you can compare podcast and regular
reading on identical material.

### Export columns (CSV)

| Column | Meaning |
|---|---|
| `ts`, `session` | Time (UTC) and an ID for each time the panel was opened |
| `type` | `capture`, `listen_start`, `listen_end`, `podcast_generated`, `question_asked`, `quiz_generated`, `quiz_answer`, `ai_call`, `material_summary` |
| `provider`, `model` | AI in use at the time |
| `mode` | Study mode: `read` (regular), `podcast`, or `none` (quizzed without listening) |
| `materialId`, `materialTitle`, `materialUrl`, `pages`, `chars` | What was studied |
| `verbose` | Whether verbose logging was on |
| `items`, `played`, `fraction` | Listening: sentences in total, sentences heard, share heard |
| `quizId`, `questions`, `q` | Quiz identity, number of questions, question number |
| `level`, `correct`, `msToAnswer` | Bloom's level, whether answered correctly, ms from quiz shown to answer |
| `listenFraction` | Share of the material heard in that mode before the quiz |
| `promptVersion` | Version of the prompt that produced the podcast, quiz, or answer |
| `task`, `secs`, `ok`, `error` | AI requests: what, how long, success, error text |
| `inputChars`, `inputTokens`, `outputTokens`, `reasoningTokens`, `totalTokens` | AI request size and tokens as reported by the provider |
| `question`, `options`, `chosen`, `correctAnswer`, `explanation` | Verbose only: quiz content |
| `answer`, `script`, `quiz`, `summary` | Verbose only: your question's answer, podcast script, full quiz, material summary |

The JSON export also contains the materials table (with summaries) and the current prompt versions.

**Research tip:** if you study the same material in both modes, the second time will usually score
better just from repetition. Alternate which mode comes first, or compare on different but similar
materials.

## Privacy

- Your API key is stored only in your browser's extension storage.
- Captured text is sent only to the AI provider you choose, under your key. Nothing is sent
  anywhere else.
- Settings and the usage log are saved locally; the log leaves your computer only if you export it.
- Exports never include API keys.

## Known limitations

- The API key lives in the browser, which is fine for a personal prototype; a public release
  would route requests through a server.
- Built-in voices vary by computer; cloud text-to-speech isn't integrated yet.
- Find only sees what's currently loaded on the page.
- Scanned PDFs (images of pages, no text layer) can't be read yet.
- Figures, diagrams and math are not interpreted yet.
- Desktop Chrome only; phones don't support browser extensions.

## Roadmap ideas

Development checks and to-dos are tracked in [TODO.md](TODO.md). First up: confirming whether
long passages are what slow the podcast down, and if so, splitting them so audio starts sooner.

- Voice input for interruptions
- Optional web search to enrich answers
- Figure and diagram explanations
- Natural cloud voices
- Adapting presentation to what's working for each learner, based on quiz results

## Third-party software

[pdf.js](https://github.com/mozilla/pdf.js) 4.10.38 by Mozilla, Apache License 2.0
(`lib/PDFJS-LICENSE`).

## License

Copyright © 2026 VivaLaData. All rights reserved. Shared privately for evaluation; see
[LICENSE](LICENSE).
