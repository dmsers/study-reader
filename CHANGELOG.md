# Changelog

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
