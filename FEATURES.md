# Study Reader: Feature Guide

A complete guide to every feature in Study Reader (v0.5.2): what it does, how to use it, and
what to expect. For installation, see the [README](README.md#install).

**Contents**

1. [The side panel at a glance](#1-the-side-panel-at-a-glance)
2. [Capturing what you're reading](#2-capturing-what-youre-reading)
3. [Reading whole PDFs](#3-reading-whole-pdfs)
4. [Find on page](#4-find-on-page)
5. [Listening: regular reading and podcast discussion](#5-listening-regular-reading-and-podcast-discussion)
6. [Interrupting with questions](#6-interrupting-with-questions)
7. [Quizzes](#7-quizzes)
8. [Statistics](#8-statistics)
9. [Usage log, verbose mode, and exports](#9-usage-log-verbose-mode-and-exports)
10. [Choosing an AI provider](#10-choosing-an-ai-provider)
11. [Voices and speech](#11-voices-and-speech)
12. [Errors and troubleshooting](#12-errors-and-troubleshooting)
13. [The Debug panel](#13-the-debug-panel)
14. [Privacy and data](#14-privacy-and-data)

---

## 1. The side panel at a glance

Click the Study Reader icon in Chrome's toolbar to open the panel beside the page you're reading.
From top to bottom:

| Section | What it's for |
|---|---|
| **Header** | Shows which AI is in use ("powered by Gemini"). |
| **Error banner** | Appears in red at the top when something goes wrong, with a hint about what to do. |
| **Listening mode** | Regular reading or Podcast discussion. Applies to everything you play. |
| **1 · Capture this page** | Grab the text you're reading, or a page range of a PDF. |
| **…or find something on it** | Describe what you're looking for; get matching passages. |
| **2 · Listen** | Play, Pause, Resume, plus a "now playing" line showing who's speaking. |
| **3 · Interrupt** | Type a question; playback pauses, you hear an answer, then it resumes. |
| **4 · Check understanding** | Quiz me, with a one-line running score underneath. |
| **Status line** | Progress messages, including a seconds counter while the AI works. |
| **Statistics** | Your study history by mode, quiz results, AI usage, exports. |
| **Settings** | AI provider and keys, voices, speech rate, and the Debug panel. |

Everything works on the **current passage**: the text you last grabbed, a PDF page range, or a
Find match. Grabbing something new replaces it.

---

## 2. Capturing what you're reading

**How to use it:** open the page you're studying, then click **Grab text**. A preview of the
captured text appears under the button, and the status line reports how much was captured.

**Scope options:**
- **What's on screen:** only the part of the page currently visible. Good for a single section.
- **Whole loaded page:** everything the page has loaded, including parts you'd need to scroll to.

**What it can read:**
- Ordinary web pages and articles.
- Text inside **iframes**, which many e-readers and course sites use (VitalSource Bookshelf's web
  reader puts book pages in one).
- Text inside **web components** (shadow DOM), used by sites such as Google Patents.
- Whole **PDFs** (see the next section).

**What it skips:** navigation menus, headers, footers, buttons, and hidden elements, so you hear
the content rather than the site's controls.

**Tip:** if a capture looks too short or too long, switch the scope and grab again.
Settings → Debug shows exactly what was found in each part of the page.

---

## 3. Reading whole PDFs

Many course sites show PDFs in a viewer that keeps only a few pages loaded at a time and drops
pages as you scroll. Study Reader gets around this by reading the **PDF file itself**, so all
pages are available, not just the ones on screen.

**How to use it:** open the PDF on your course site (or in a Chrome tab) and click **Grab text**.
When a PDF is found, a bar appears:

> **PDF · 25 pages** pages [1] to [25] **Use these pages**

All pages are used by default. To study part of it, enter a range (for example 10 to 12) and click
**Use these pages**.

**How it finds the PDF:**
1. If the tab itself is a PDF (Chrome's own viewer), it reads that file.
2. If the page uses Mozilla's pdf.js viewer (common on course sites), it asks the viewer for every
   page's text directly.
3. Otherwise it looks for the PDF behind the viewer (in embeds, iframes, web components, and the
   page's network activity) and downloads it **using your existing login**. If the site refuses a
   direct download, it fetches the file from inside the page instead, just as the viewer does.

**Tips and limits:**
- For the podcast, shorter ranges start faster. In podcast mode, the status line suggests this
  when you've selected more than 8 pages.
- Words split across lines with a hyphen are rejoined.
- **Scanned PDFs** (photos of pages with no text layer) can't be read yet; you'll get a clear
  message saying so.
- **Password-protected PDFs** can't be opened.
- Find results on a PDF show page numbers (e.g. "p. 7").

---

## 4. Find on page

Search by **meaning**, not exact words. Useful for long readings, search results, or reference
pages.

**How to use it:**
1. Describe what you want in the box, e.g. *"systems that choose a teaching mode from quiz
   results"* or *"the part about sampling bias"*.
2. Click **Find on page**. The whole page (or whole PDF) is read and sent to the AI with your
   description.
3. You get up to 8 ranked matches, each with a short name, a closeness score, a one-line reason,
   a snippet, and page numbers for PDFs.

**For each match:**
- **Listen** plays it in your chosen listening mode.
- **Use for questions & quiz** makes it the current passage without playing it.
- **Listen to all matches** (when there are two or more) plays them together. In podcast mode the
  hosts compare the matches against what you were looking for.

**Limit:** Find sees only what's loaded. On a search site, that's the current results page; go to
the next page and run Find again for more.

---

## 5. Listening: regular reading and podcast discussion

Choose the **Listening mode** at the top of the panel, then click **Play**.

### Regular reading
The captured text is read aloud, sentence by sentence, by your computer's built-in voice.
It's free, private (nothing is sent to an AI), and starts instantly.

### Podcast discussion
The AI writes a short two-host discussion of the material (12 to 20 turns), then two voices
perform it:
- **Maya** explains the material clearly.
- **Sam** asks the questions a curious listener would ask and offers everyday examples.

The hosts are instructed to stay faithful to the material, and to say so out loud ("this goes
beyond the text, but…") if they add anything that isn't in it.

When the script is ready, the status line shows how long it took, e.g.
*"Discussion ready: 16 turns in 9.2s (Gemini · gemini-3.8-flash)."*

### Controls
- **Pause** stops mid-sentence; **Resume** replays that sentence and continues.
- The **now playing** line shows the current sentence and who is speaking.
- While the AI is writing, the status line counts seconds so you know it's working.

---

## 6. Interrupting with questions

Ask a question at any point, like raising your hand in a lecture.

**How to use it:** type your question in **3 · Interrupt** and click **Ask**. For example:
*"Can you give an example?"*, *"Explain that more simply"*, *"How does this relate to
reliability?"*

**What happens depends on your listening mode:**

*Podcast discussion:* the two hosts take your question together, like a call-in show.
1. Playback pauses.
2. Maya picks up your question in her own words ("Good question from our listener…"), Sam follows
   up or offers an everyday example, and they talk it through in 3 to 6 short turns, in their
   two voices, grounded in the material and aware of what they were just discussing.
3. They lead back into the podcast, which resumes at the sentence where you interrupted.

*Regular reading:* a single, direct answer, like asking a lecturer.
1. Playback pauses.
2. The AI answers in a natural spoken style (3 to 6 sentences) with one concrete example,
   grounded in the material and aware of where you paused.
3. Reading resumes where it left off.

Either way, the answer is also shown as text in the panel (for discussions, with who said what).

You can also ask questions when nothing is playing.

---

## 7. Quizzes

**How to use it:** click **Quiz me** after studying a passage (or before, to test what you already
know).

**What you get:** four multiple-choice questions designed to check understanding rather than
trivia, with plausible wrong answers. Click an answer to see whether you were right, which answer
was correct, and an explanation.

**Question levels:** each question is labeled with the kind of thinking it requires, using
Bloom's taxonomy:

| Level | Asks you to… |
|---|---|
| Remember | recall a fact or definition |
| Understand | explain or interpret an idea |
| Apply | use an idea in a new situation |
| Analyze | break down, compare, or find relationships |

**How results are counted:** each answer is credited to the mode you used to study that material
(regular reading, podcast, or none if you hadn't listened), along with how much of it you'd heard.
The line under the quiz shows a running score for each mode.

---

## 8. Statistics

Open **Statistics** near the bottom of the panel. It updates automatically.

**By study mode**: one row each for Regular reading, Podcast, and Without listening:
- **Listens**: how many times you played material in that mode.
- **Avg heard**: on average, how much of the material you listened to before stopping.
- **Quizzes**: quizzes taken after studying in that mode.
- **Correct / Accuracy**: answers right out of answered, and the percentage.

**Accuracy by question level**: your accuracy at each Bloom's level, split by mode, with the
number of questions in parentheses. This shows, for example, whether podcasts help more with
"apply" questions than with "remember" questions.

**Questions you asked**: how many questions you've asked, and how many were answered as a host
discussion versus a single answer.

**Materials**: how many distinct materials you've studied, how many you've listened to in **both**
modes, and how many you've been quizzed on after both modes. These are the fair, like-for-like
comparisons.

**AI usage (tokens)**: for each provider and model: number of calls (and failures), average
seconds per call, and tokens in, out, and spent on "thinking" (reasoning), as reported by the
provider. Useful for comparing speed and cost.

---

## 9. Usage log, verbose mode, and exports

Study Reader keeps a log of what you do, **on your computer only**, to power the Statistics and
your own analysis.

### What's logged (always)
Captures, listening sessions (mode, how much you heard), podcasts generated, questions asked,
quizzes generated, every quiz answer (level, right or wrong, time to answer), and every AI
request (task, seconds, tokens, success or error). Each entry records the provider, model, and
study mode in use.

### Materials and fair comparisons
Every passage you study gets a **material ID**: a fingerprint of the exact text. Grabbing the same
page, or the same PDF page range, again gives the same ID. That's how Statistics knows you
studied the *same* material in podcast and regular mode.

### Verbose logging
Tick **Verbose logging** in Statistics to also save the *content*:
- the actual quiz questions, options, your answer, the correct answer, and the explanation
- podcast scripts
- your questions and the answers
- a **target summary** of each new material: two sentences plus key concepts, so you can see at a
  glance what each log entry was about (costs one extra AI request per new material)

Use verbose mode when you want to check question quality, compare the questions generated in each
mode, or confirm which material a result belongs to.

### Prompt versions
Each podcast, quiz, and answer records the version of the instructions that produced it. If the
prompts are improved later, old and new results can be told apart.

### Exporting
- **Export log (CSV)**: one row per event; opens in Excel, Google Sheets, R, or Python.
- **Export everything (JSON)**: all events, plus the materials table (with summaries) and the
  prompt versions.

Every column is described in the [README's data dictionary](README.md#export-columns-csv).
Exports never contain API keys.

### Clearing
**Clear log…** erases the log and materials. It asks for a second click to confirm.

### Research tip
If you study the same material in both modes, the second pass usually scores better from
repetition alone. Alternate which mode comes first, or compare on different but similar material.

---

## 10. Choosing an AI provider

Choose in **Settings → AI provider**. Switching takes effect immediately, so you can compare
providers on the same page. Each provider needs its own API key, stored only in your browser.

| Provider | Get a key | Default model | Notes |
|---|---|---|---|
| **Claude** (Anthropic) | [console.anthropic.com](https://console.anthropic.com) | `claude-sonnet-5-5` | |
| **Gemini** (Google) | [aistudio.google.com](https://aistudio.google.com) | `gemini-3.8-flash` | `gemini-3.5-flash-lite` is faster and cheaper. |
| **OpenAI** | [platform.openai.com](https://platform.openai.com) | `gpt-6-luna` | Fast, low-cost model. |
| **OpenAI-compatible** | Depends on the service | Your choice | Set **Server address** for OpenRouter, Groq, a local Ollama or LM Studio, etc. A key may not be needed for local servers. |

To use a different model, type its name in the provider's **model** field and click **Save
settings**. Leave it blank to use the default.

**What needs a key:** podcast mode, Find, questions, quizzes, and material summaries.
Regular reading works without one.

**Reliability:** structured replies (podcast scripts, quizzes, Find results) are requested in a
fixed format. If a model's reply comes back malformed, Study Reader automatically asks once more.

---

## 11. Voices and speech

In **Settings**:
- **Voice 1** reads in regular mode and plays Maya in podcasts.
- **Voice 2** plays Sam.
- **Test voices** plays a short introduction from each.
- **Speech rate** speeds up or slows down all speech.

Natural-sounding voices are listed first. On a Mac, the best ones are free downloads:
System Settings → Accessibility → Spoken Content → System Voice → **Manage Voices**, then pick
voices marked *Premium* or *Enhanced* (Ava, Zoe and Evan are good). Chrome's "Google" voices are
also available.

If both hosts sound the same, check that Voice 1 and Voice 2 are different; Settings shows a
warning when they match, or when only one voice is installed.

If you hear nothing, check that your computer isn't muted.

---

## 12. Errors and troubleshooting

When something goes wrong, a red banner appears at the top of the panel with what happened and
what to try. It clears when you start your next action, or click ✕.

| Message | What to do |
|---|---|
| *…rejected the API key* | Re-paste the key in Settings and click **Save settings**. |
| *…doesn't recognize the model name* | Check the spelling, or clear the field to use the default. |
| *…hit a usage or rate limit* | Wait a minute, or check your plan and credits. |
| *No reply … after 2 minutes* | Try again, use a faster model, or a smaller section or page range. |
| *Couldn't reach …* | Check your internet connection. |
| *The page didn't respond in time* | Reload the page and grab again. |
| *Chrome doesn't allow extensions to read this page* | Chrome's own pages and the Web Store are off-limits; use a regular page. |
| *Couldn't download the PDF* | Make sure you're signed in to the course site, reload, and retry. |
| *This PDF is password-protected* | Protected PDFs can't be opened. |
| *No text layer / scanned images* | Scanned PDFs aren't supported yet. |
| *No readable text found* | The page may be images of text. Check Settings → Debug. |

**Common questions**
- **The podcast takes a while to start.** The AI writes the whole script first. Use a shorter page
  range or a faster model; the status line shows the seconds.
- **It only read part of my PDF.** Make sure you're on v0.4.0 or later, then grab again; the PDF bar
  should show the full page count.
- **Nothing happens when I click.** Close and reopen the side panel. After updating the extension,
  the panel keeps running the old version until reopened.

---

## 13. The Debug panel

At the bottom of **Settings**:
- **Frames found** lists each part of the page that was read, how many text blocks it gave, the
  method used, and any PDF found (and how it was read). Useful when a site doesn't capture well.
- **Recent AI timings** lists the last 30 AI requests: when, provider and model, task, seconds,
  input size, and tokens.
- **Copy timings** copies that list for pasting into feedback.

---

## 14. Privacy and data

- **API keys** are stored only in this browser's extension storage and are never exported.
- **Captured text** is sent only to the AI provider you choose, under your own key, and only for
  AI features. Regular reading never leaves your computer.
- **PDF downloads** use your existing course-site login, from your own browser.
- **The usage log** stays on your computer unless you export it. Verbose logging stores the
  content of quizzes, scripts and questions locally; turn it off if you don't want that.
- **Clear log** removes the log at any time.
