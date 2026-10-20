# To do

Development checks and next steps. Tester-facing information lives in the README.

## Speed: podcast discussion

- [ ] **Check:** does input size drive podcast wait time?
  Each entry in Settings → Debug → Recent AI timings records seconds and `[N chars in]`.
  Collect timings from your own runs and testers' feedback, then compare wait time against
  input size for each provider and model. If waits grow steeply with input size, long passages
  are the bottleneck.
- [ ] **To do, if the check confirms it:** split long passages into smaller pieces.
  Generate the script for the first piece and start playing it right away, while later pieces
  are written in the background. Time to first audio would then depend on the size of one
  piece, not the whole passage. Code location: `startPodcast()` in `sidepanel.js`.
- [ ] Compare models on the same passages: gemini-3.8-flash vs. gemini-3.5-flash-lite vs.
  claude-sonnet-5-5, for both speed and script quality.

## PDFs

- [ ] Test with real course PDFs on the actual course site; note which viewer it uses
      (Settings → Debug shows how the PDF was found and read).
- [ ] Scanned PDFs: add text recognition (OCR) for pages without a text layer.
- [ ] For long PDFs, consider suggesting a page range before generating a podcast.

## Learning research (usage log)

- [ ] Delayed retest: re-quiz the same material a few days later to measure retention, not
      just immediate recall.
- [ ] Confidence rating before each answer reveals (to separate guessing from knowing).
- [ ] Study-plan mode that randomly assigns podcast or regular reading to each new material
      (removes self-selection bias) and alternates which mode comes first.
- [ ] Question consistency: generate several quizzes for the same material and compare overlap
      and level mix, per mode and per model.
- [ ] Analysis notebook (Python or R) that reads the CSV/JSON export.

## Quality

- [ ] Test podcast accuracy and usefulness across subjects (sciences, humanities, math-heavy).
- [ ] Test quiz quality: understanding vs. recall.
