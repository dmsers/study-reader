# Study Reader

**An AI study companion that works with whatever you're reading in the browser.**
It reads a page aloud, or turns it into a two-host podcast discussion you can interrupt with
questions. It also finds passages on a page by meaning and quizzes you on what you just learned.
It works with Claude or Gemini.

> **Status: early prototype (v0.3.1), shared privately for feedback.** It works end to end in
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
- **Find on page:** describe what you're looking for in plain language and get ranked matching
  passages, each with a one-line reason. Listen to one match or to all of them.
- **Quiz me:** four multiple-choice questions on the current material, with explanations.
  Scores are tallied by how you listened. That's groundwork for adapting to what works for each
  learner.
- **Choose your AI:** switch between Claude (Anthropic) and Gemini (Google) at any time.
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
5. Pick two voices and click **Test voices**. On a Mac, the natural-sounding voices are free
   downloads: System Settings → Accessibility → Spoken Content → System Voice → Manage Voices
   (look for *Premium* or *Enhanced*).

Read-aloud works without a key. The podcast, Find, questions and quizzes need one.

## What I'd like feedback on

Please open an issue using the **Feedback** template, or just send me notes. Most useful:

1. **Accuracy:** did the podcast or the answers say anything wrong or not in the material?
2. **Usefulness:** did the podcast help you understand, or was it filler?
3. **Quizzes:** did they test understanding, or just recall?
4. **Sites:** which pages worked or failed to capture? (Settings → Debug shows what was found.)
5. **Claude vs. Gemini:** if you tried both, which did you prefer, and why?

Please use material you're allowed to share when reporting problems: no screenshots of
copyrighted textbook pages.

## Privacy

- Your API key is stored only in your browser's extension storage.
- Captured text is sent only to the AI provider you choose, under your key. Nothing is sent
  anywhere else.
- Only settings and quiz tallies are saved locally.

## Known limitations

- The API key lives in the browser, which is fine for a personal prototype; a public release
  would route requests through a server.
- Built-in voices vary by computer; cloud text-to-speech isn't integrated yet.
- Find only sees what's currently loaded on the page.
- Figures, diagrams and math are not interpreted yet.
- Desktop Chrome only; phones don't support browser extensions.

## Roadmap ideas

- Voice input for interruptions
- Optional web search to enrich answers
- Figure and diagram explanations
- Natural cloud voices
- Adapting presentation to what's working for each learner, based on quiz results

## License

Copyright © 2026 VivaLaData. All rights reserved. Shared privately for evaluation; see
[LICENSE](LICENSE).
