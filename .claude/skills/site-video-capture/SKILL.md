---
name: site-video-capture
description: Record a video of the real site for a human audience from a scene script. Invoke when asked to make, update or re-record a product demo or training video.
---

# site-video-capture — record a scene script into a video

A scene script (`videos/<name>.json`) is the edit surface. A UI change means editing the
script and rerunning, never editing the mp4. `scripts/site-video-capture.js` drives a real
browser through the script with Playwright, draws a pointer, trail and captions with an
in-page overlay, captures the session with CDP screencast, and encodes a constant-60fps
H.264 mp4 with ffmpeg. Every run also writes a `.vtt`, a `.transcript.md` and per-scene
stills alongside the mp4.

## Step 1 — read the scene script first

Open `videos/<name>.json` before touching anything else. Every target, caption and pacing
value lives there. `videos/tour.json` is the worked example: an unauthenticated walk
through the site. `videos/scene-script.schema.json` documents the format.

## Step 2 — iterate locally against a local instance

Serve `web/public` statically and point the script at it. No Docker, no AWS:

```bash
node scripts/static-server.mjs web/public
# prints LISTENING_ON:<port>
```

Check every target resolves and every scene lands where expected, without spending time on
capture or encode:

```bash
node scripts/site-video-capture.js --script videos/tour.json --base-url http://localhost:<port> --out target/videos/tour --stills-only
```

Review `target/videos/tour/stills/contact-sheet.png` — one image instead of nine. A missing
target is a hard failure: the error names the scene, the step and the target, and a
`stills/FAILED-<scene>-<step>.png` shows what the page actually looked like. Fix the
script's target — prefer a role or text target (`{"role": "link", "name": "..."}` or
`{"text": "..."}`) over a CSS selector, since those survive a markup refactor — then rerun
with `--scene <id>` to check just that scene.

The tour is unauthenticated, so a bare static server is enough: the only backend call is the
bundles catalogue fetch, served from the static `submit.catalogue.toml` file. A script whose
`auth` is `cognito-native` needs the proxy variant (`npm run start:proxy`, in another
terminal) or a deployed environment instead.

## Step 3 — record for real against the proxy variant or a deployment

```bash
node scripts/site-video-capture.js --script videos/tour.json --base-url http://localhost:<port> --out target/videos/tour
```

Watch the console: one line per step, with the measured wait and the elapsed timeline
total. Then check the timings:

```bash
node scripts/check-video-timings.js target/videos/tour/tour.timeline.json
```

A failure names the offending step and the expected-vs-actual numbers. It usually means a
step waited on something the script did not declare — add an `await` step with a `label`
rather than raising the tolerance.

## Step 4 — scrub the mp4 before accepting it

Open it in a player that steps frame by frame. Every click's ripple should occupy at least
450ms and grow smoothly; every scroll frame should differ from the last; every caption
should stay up for its computed minimum; the final frame should hold for `finalHoldMs` and
not cut to black.

## Step 5 — record for real with the workflow

```bash
gh workflow run video-capture.yml -f script=tour -f environment-name=prod
```

Download the artifact once it completes — the mp4, the `.vtt`, the `.transcript.md` and the
stills all travel together. A script whose `auth` is `cognito-native` runs against **prod
with the HMRC sandbox account**, writing rows as the synthetic test user — never point it at
a real customer account.

## Step 6 — publish accessibly

The mp4, the `.vtt` and the `.transcript.md` ship together, always. The transcript is what
satisfies WCAG SC 1.2.1 for a silent video — burned-in captions alone do not, because they
are pixels, unreadable by assistive tech. Embed the mp4 with player controls and without
autoplay, so SC 1.4.2 and 2.2.2 stay out of the embedder's problem.

Captions and the video title follow `plain-prose`: short sentences, read aloud before
committing.

## Reference

- `videos/scene-script.schema.json` — the format: scenes, steps, targets, pacing, captions.
- `scripts/lib/video/pacing.js` — the three pacing groups, wait subtraction, time
  compression for a wait past six seconds, caption minimum hold.
- `scripts/lib/video/overlay-runtime.js` / `overlay.js` — the in-page pointer, trail,
  caption box, timer pill and chapter label.
- `scripts/lib/video/capture.js` / `encode.js` — CDP screencast capture and the ffmpeg
  concat-demuxer encode (constant 60fps, H.264 High, closed GOP, faststart).
- `.github/workflows/video-capture.yml` — the real recording, dispatched by hand.
