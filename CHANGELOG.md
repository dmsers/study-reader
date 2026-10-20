# Changelog

## 0.5.0
- OpenAI provider, plus any OpenAI-compatible server (OpenRouter, Groq, local Ollama/LM Studio)
  via an editable server address. Default model gpt-6-luna.
- Token counts (input, output, reasoning) recorded for every AI request, for all providers.
- Local usage log (IndexedDB): captures, listening sessions (mode and how much was heard),
  podcasts, questions, quizzes and every quiz answer (question level, time to answer), and all
  AI requests. Each studied text gets a fingerprint ID, so podcast and regular reading can be
  compared on the same material.
- Statistics section: listens, quizzes and accuracy by study mode; accuracy by question level;
  materials studied in both modes; AI calls, speed and tokens by provider and model.
- Verbose logging: also stores the actual quiz questions/answers, podcast scripts, your questions,
  and an AI "target summary" of each material.
- Export the log as CSV (events) or JSON (events, materials, prompt versions); clear the log.
- Quizzes label each question with its Bloom's level (remember, understand, apply, analyze).
- Prompt versions are recorded with results, so changes to prompts don't muddy comparisons.

## 0.4.0
- Reads whole PDFs: finds the PDF behind course-site document viewers (including viewers that
  keep only a few pages loaded), PDFs in Chrome's own viewer, and pdf.js viewers, then extracts
  every page. Downloads use your existing login, falling back to fetching from inside the page.
- Page range controls for PDFs ("pages 10 to 12"); Find results show page numbers.
- Errors now appear in a banner at the top of the panel with a plain-language hint, and clear
  when you start the next action.
- Capture and AI requests time out with a clear message instead of waiting forever
  (10 seconds for the page, 2 minutes for the AI).
- Bundles Mozilla pdf.js 4.10.38 (Apache-2.0) in lib/.

## 0.3.2
- Every AI request is timed and logged with provider and model (Settings → Debug → Recent AI
  timings), with a Copy timings button for feedback.
- When a podcast is ready, the status line shows the total wait, e.g. "16 turns in 9.2s".

## 0.3.1
- Status line shows a running timer and the provider name while the AI is working.

## 0.3.0
- Gemini support: choose Claude or Gemini in Settings; switching takes effect immediately.
- Voice pickers for both voices, with natural-sounding (Premium/Enhanced/Google) voices listed
  first, plus a Test voices button.
- Structured AI replies are retried once if the JSON is malformed.

## 0.2.0
- Find on page: describe what you're looking for and get ranked matches by meaning, playable
  one at a time or all together.
- One Listening mode setting (Regular reading or Podcast discussion) applies everywhere.
- Text capture reaches inside web components (shadow DOM and slots), e.g. Google Patents.

## 0.1.0
- First prototype: capture visible text from all frames, read aloud, two-host podcast
  discussion, interrupt with questions, and quizzes with simple score tallies.
- Confirmed that text capture works in the VitalSource Bookshelf web reader.
