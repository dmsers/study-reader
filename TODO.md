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

## Quality

- [ ] Test podcast accuracy and usefulness across subjects (sciences, humanities, math-heavy).
- [ ] Test quiz quality: understanding vs. recall.
