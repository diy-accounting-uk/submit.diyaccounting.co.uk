# Design: `site-video-capture` — recording the real site for people to watch

Design for NEXT.md B17a.1. Covers the scene-script format, the pacing model, the overlay, the
capture and encode pipeline, the CLI, `video-capture.yml`, the skill, a build list, and the
acceptance check.

The audience is a person deciding whether to trust us with an HMRC submission. Everything below
serves that, not a test report.

---

## 1. What the research says the design must satisfy

### 1.1 Accessibility — the binding constraint

The videos go on a public site and on YouTube. WCAG 2.2 AA is the bar the GOV.UK Service Manual
sets and the one our own accessibility statement claims.

**A silent screen capture is "video-only prerecorded" and lands on SC 1.2.1 (Level A).** It needs a
text alternative describing what happens, or a narration track. Burned-in captions do not satisfy
it: they are pixels, unreadable by assistive tech.
https://www.w3.org/WAI/WCAG22/Understanding/audio-only-and-video-only-prerecorded.html

So the script must emit a transcript as a first-class output, not as an afterthought. This is the
single biggest thing the research changed.

If narration is ever added, the picture changes: SC 1.2.2 (captions, A) and SC 1.2.5 (audio
description, AA) both start to apply.
https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html

**GOV.UK's videos guidance** asks for closed captions (togglable, checked for accuracy), a
transcript covering "all important audio and visual information" including visual actions, audio
description for visuals the narration misses, and a voice-over or transcript when a video is
text-based with no narration. It also forbids content flashing more than three times a second.
https://guidance.publishing.service.gov.uk/formatting-content/videos/

That gives three required outputs per video, not one:

| Output | Satisfies |
| --- | --- |
| `<name>.mp4` with burned-in captions | the video itself |
| `<name>.vtt` | GOV.UK's closed-caption preference; YouTube ingests it directly |
| `<name>.transcript.md` | SC 1.2.1's text alternative |

**SC 2.3.1 (three flashes, A)** binds the overlay. The click ripple, the field highlight and the
timer must not blink. Every overlay animation is a single eased transition, never a repeat.
https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html

**SC 1.4.2 and 2.2.2** apply only if the video autoplays on a page. They are the embedder's
problem, so the site must embed with controls and without autoplay. Worth one line in the skill.

PSBAR 2018 exempts prerecorded time-based media published before 23 September 2020 and binds
everything after. We are a private company, so PSBAR does not bind us directly, but WCAG 2.2 AA
is what our accessibility statement claims and what an HMRC-adjacent audience expects.
https://www.legislation.gov.uk/uksi/2018/952

### 1.2 Caption legibility

BBC's subtitle guidelines size captions to a **line height of 8% of active video height** for 16:9,
and keep them inside the central **90% vertically, 75% horizontally**. Reading speed is 160–180
words per minute. Netflix caps at 20 characters per second for adult content.
https://www.clevercast.com/bbc-subtitling-guidelines/
https://www.closedcaptioncreator.com/blog/articles/subtitle-reading-speed.html

8% of 1080 is an 86px line height. That is broadcast sizing for TV viewing distance, and on a
screencast it covers a fifth of the UI we are trying to show. The default below is 40px type on a
56px line (5.2%), with the BBC figure kept in config so it can be raised. See the open choices in
section 11.

Safe area at 1920x1080 from BBC's percentages: 54px top and bottom, 240px left and right. The
caption box is capped at 1440px wide and sits 90px off the bottom.

Reading speed default is **15 characters per second** with a 1500ms floor. That is slower than Netflix's
20, because a viewer is also watching the UI move.

### 1.3 YouTube upload

From YouTube's recommended encoding settings:
https://support.google.com/youtube/answer/1722171

- mp4, H.264 High profile, progressive, CABAC, 4:2:0, BT.709.
- **Closed GOP, GOP length half the frame rate.** At 60fps that is `-g 30`, which also gives
  half-second seek granularity. The scrubbing requirement and the YouTube requirement agree.
- Two consecutive B-frames.
- moov atom at the front (`+faststart`).
- 1080p at high frame rate (48/50/60): **12 Mbps** target.
- Audio AAC-LC, 48kHz, 384kbps stereo. Our videos are silent; see the open choices.

1920x1080 is YouTube's 1080p entry. Shorts are up to 3 minutes, vertical, 1080p maximum.
https://support.google.com/youtube/answer/6375112
https://support.google.com/youtube/answer/10059070

YouTube always re-encodes, so the upload is a mezzanine. Encode generously (`-crf 18`) rather than
to a bitrate ceiling.

### 1.4 Demo-video conventions

Camtasia ships a cursor highlight, a click ring and a click ripple as named effects.
https://www.techsmith.com/learn/tutorials/camtasia/cursor-effects/
Screen Studio's "Smooth Cursor" interpolates raw pointer positions into curves rather than
replaying them. Both vendors recommend recording at full resolution and letting the tool zoom in
post, and Camtasia's SmartFocus docs ask for slow deliberate mouse movement.

Nobody publishes a typing speed for simulated typing. Average human typing is ~40wpm, about 3
characters per second, so ~90ms per character reads as a person typing rather than a paste.

30fps is treated as enough for static tutorial content; 60fps is recommended where there is
scrolling, dragging or fast pointer motion, because scrolling at 30fps visibly judders. Our tour
scrolls. 60fps it is.

**One deliberate divergence.** Published screencast guidance says cut waits out rather than film
them. https://www.nngroup.com/articles/instructional-video-guidelines/ Our audience is choosing
whether to trust an HMRC submission tool, so "how long does the receipt take" is information. The
operator's scaled timer keeps that information. Section 4.4 adds time compression so a 40-second
HMRC round trip does not become 40 seconds of film.

### 1.5 What already exists in the Playwright ecosystem

Playwright's `recordVideo` is CDP screencast underneath, converted to constant rate by computing
`frameNumber = floor((now - start) * fps / 1000)` and duplicating the last frame into the gaps.
So static pages give duplicate frames, not blank stretches. The real problems are elsewhere:

- **25fps, not configurable.** Open request since 2022: microsoft/playwright#17217.
- **Timestamp drift.** The frame-duplication maths accumulates rounding error, so long recordings
  speed up or slow down against the wall clock. Open: microsoft/playwright#35776.
- **VP8 in WebM**, which scrubs badly and is not a YouTube mezzanine.
- **No cursor at all.** Headless Chromium draws none.
- Recurring corruption and zero-byte output across platforms (#36685, #34116, #27253), and
  reported unreliability under `xvfb-run` in GitHub Actions (#8936).

`playwright-recast` (https://github.com/ThePatriczek/playwright-recast) is the closest existing
thing: animated cursor with easing, click ripples, zoom-to-action, burned-in subtitles, TTS. It is
actively developed. We borrow the ideas and reject the dependency, because it post-processes
Playwright's own webm and so inherits the 25fps and the drift, and it brings TTS and background
music we do not want.

`ghost-cursor` (https://github.com/Xetera/ghost-cursor) contributes the Bezier-path idea. We
borrow the eased curve and reject the randomised jitter and overshoot, which exists to defeat bot
detection and reads as sloppy in a training video.

`puppeteer-screen-recorder` and `playwright-video` both do CDP screencast plus ffmpeg. Both are
unmaintained. They confirm the architecture; they are not dependencies.

Justin Abrahms' write-up does roughly the hand-rolled version of this with an injected cursor,
`sleep()` pacing and an ffmpeg transcode:
https://justin.abrah.ms/blog/2026-02-12-generating-demo-videos-with-playwright.html

---

## 2. Capture method — recommendation

**Recommended: own the CDP screencast session, timestamp every frame, and let ffmpeg's concat
demuxer turn the timestamped sequence into constant-rate 60fps H.264.**

`Page.startScreencast` with `format: "jpeg"`, `quality: 85`, `maxWidth: 1920`, `maxHeight: 1080`.
Each `Page.screencastFrame` event carries base64 image data plus metadata; we write the JPEG to
`frames/%06d.jpg`, record `performance.now()` against it, and immediately
`Page.screencastFrameAck` (the stream stalls without the ack).
https://chromedevtools.github.io/devtools-protocol/tot/Page/

Three reasons this wins:

1. **We own the clock.** Playwright's drift bug (#35776) comes from accumulating rounded frame
   counts. Writing measured timestamps into a concat manifest and letting ffmpeg resample to CFR
   has no accumulator to drift.
2. **We choose the frame rate, codec and GOP.** 60fps, H.264 High, `-g 30`, faststart. That is
   both YouTube's recommendation and the fine scrubbing the operator asked for.
3. **Screencast frames are the compositor's own surface**, so they are much cheaper than
   `Page.captureScreenshot` per frame and do not fight the page's main thread.

**Frames only arrive on repaint, so the overlay guarantees repaints.** A 2x2px heartbeat element
in the overlay flips colour every `requestAnimationFrame`. That forces a compositor frame at the
display rate for the whole recording, so we sample a genuine ~60fps even while the page is still.
It costs disk, not CPU. Where frames do arrive irregularly, the concat manifest's per-frame
`duration` values plus `-vsync cfr -r 60` fill the gap with exact duplicates.

Disk cost: a 100-second tour at 60fps, 1080p, JPEG q85 is roughly 6000 frames at ~180KB, about
1.1GB under `target/`. Deleted after encode unless `--keep-frames`.

**Fallback 1 — fixed-cadence `page.screenshot()`.** A `setInterval` at 25fps writing PNGs, ffmpeg
upsampling to 60fps CFR. Deterministic, no CDP wrangling, guaranteed no gaps. Pointer motion looks
steppier. Use it if screencast frame delivery proves to coalesce badly under a CI container.
Behind `--capture screenshot`.

**Fallback 2 — Xvfb plus headed Chromium plus `ffmpeg -f x11grab`.** Real fixed-rate capture with
native scroll smoothness. Rejected as primary: it adds a display stack, community consensus puts
the practical ceiling at 24–30fps on a shared runner at 1080p, and it would give us the OS cursor
we do not want (we want the drawn one, which the overlay provides anyway). Documented, not built.

**Rejected: Playwright `recordVideo`.** 25fps, drift, VP8, no cursor, and CI reliability reports.
It is right for test artefacts and wrong for a deliverable.

**Rejected: `Emulation.setVirtualTimePolicy`.** It replaces the wall clock for deterministic test
runs. Against a live site with a real CDN and real HMRC calls it fights the thing we are trying to
film, which is how long the real thing actually takes.

---

## 3. Scene script

One JSON file per video under `videos/`. It is the edit surface: a UI change means editing the
script and rerunning, never re-cutting the mp4.

### 3.1 Top level

```jsonc
{
  "$schema": "./scene-script.schema.json",
  "name": "tour",
  "title": "A tour of DIY Accounting Submit",
  "description": "An unauthenticated walk through the site: what it does, how to use it, where to get help.",
  "auth": "none",                          // "none" | "cognito-native"
  "viewport": { "width": 1920, "height": 1080 },
  "deviceScaleFactor": 1,
  "fps": 60,

  "pacing": {
    "perCharMs": 90,
    "betweenActionsMs": 700,
    "aroundMotionMs": 1200,
    "minResidualMs": 150,
    "timerThresholdMs": 250,
    "timerFullScaleMs": 5000,
    "waitCompressionAfterMs": 6000,
    "waitCompressionFactor": 8
  },

  "captions": {
    "fontPx": 40,
    "lineHeightPx": 56,
    "maxLines": 2,
    "maxCharsPerLine": 46,
    "charsPerSecond": 15,
    "minMs": 1500,
    "fadeMs": 250,
    "safeArea": { "topPct": 5, "bottomPct": 5, "sidePct": 12.5 }
  },

  "suppress": [
    "#feedbackEngagementBanner",
    "#feedbackEngagementSection"
  ],

  "finalHoldMs": 3000,
  "scenes": [ /* ... */ ]
}
```

`suppress` hides page furniture that would distract or that is nondeterministic. It is a list of
CSS selectors set to `display: none` by the overlay on every navigation.

### 3.2 Scene

```jsonc
{
  "id": "home",
  "chapter": "Home",                 // small top-left label while the scene runs
  "still": true,                     // write a per-scene still at the scene's last frame
  "steps": [ /* ... */ ]
}
```

### 3.3 Steps

Every step is `{ "action": "...", ... }`. Common optional fields on any step: `caption`, `pauseMs`
(overrides the group default for this step), `note` (goes to the transcript, never on screen).

| action | fields | pacing group |
| --- | --- | --- |
| `goto` | `url` (relative to `--base-url`), `waitFor` | 3, before and after |
| `click` | `target` | 2 |
| `point` | `target`, `dwellMs` | 2 |
| `type` | `target`, `text`, `clear` | 1 per character, then 2 |
| `press` | `key` | 2 |
| `tab` | — | 2 |
| `select` | `target`, `value` | 2 |
| `scroll` | `target` *or* `to` (`"top"`/`"bottom"`/px), `durationMs` | 3, before and after |
| `highlight` | `target`, `holdMs` | 2 |
| `caption` | `text`, `holdMs` | none of its own |
| `hold` | `ms` | explicit |
| `await` | `until`, `label`, `timeoutMs` | measured, then group 2 residual |
| `still` | `name` | none |

`target` is either a CSS selector string, or `{ "role": "link", "name": "Bundles" }` resolved
through Playwright's `getByRole`, or `{ "text": "Submit your VAT return" }`. Role and text targets
survive a CSS refactor, so prefer them; the schema accepts all three.

**A missing target is a hard failure.** The repo rule is throw, don't skip. The error names the
scene id, the step index and the target, the frames captured so far are kept, and a still of the
failing viewport is written to `stills/FAILED-<scene>-<step>.png` so the operator can see what the
page actually looked like.

### 3.4 `videos/tour.json` — the worked example

Six pages: home, about, guide, help, bundles, accessibility. About 100 seconds.

```jsonc
{
  "$schema": "./scene-script.schema.json",
  "name": "tour",
  "title": "A tour of DIY Accounting Submit",
  "description": "An unauthenticated walk through the site.",
  "auth": "none",
  "viewport": { "width": 1920, "height": 1080 },
  "fps": 60,
  "pacing": { "perCharMs": 90, "betweenActionsMs": 700, "aroundMotionMs": 1200,
              "minResidualMs": 150, "timerThresholdMs": 250, "timerFullScaleMs": 5000,
              "waitCompressionAfterMs": 6000, "waitCompressionFactor": 8 },
  "suppress": ["#feedbackEngagementBanner", "#feedbackEngagementSection"],
  "finalHoldMs": 3000,

  "scenes": [
    {
      "id": "home",
      "chapter": "Home",
      "still": true,
      "steps": [
        { "action": "goto", "url": "/", "waitFor": "#mainContent",
          "caption": "DIY Accounting Submit files VAT returns straight to HMRC." },
        { "action": "point", "target": { "role": "heading", "name": "DIY Accounting Submit" }, "dwellMs": 600 },
        { "action": "scroll", "target": "#dynamicActivities",
          "caption": "Everything you can do is listed on the home page." },
        { "action": "point", "target": "#dynamicActivities a:first-of-type" },
        { "action": "scroll", "target": "#activitiesByBundle",
          "caption": "Activities are grouped by the bundle that unlocks them." },
        { "action": "hold", "ms": 1200 }
      ]
    },
    {
      "id": "about",
      "chapter": "About",
      "still": true,
      "steps": [
        { "action": "point", "target": "a.info-link[href='about.html']",
          "caption": "The info icon is the way in to everything explanatory." },
        { "action": "click", "target": "a.info-link[href='about.html']" },
        { "action": "scroll", "target": { "text": "Why Choose DIY Accounting Submit?" } },
        { "action": "hold", "ms": 1500 },
        { "action": "scroll", "target": { "text": "Ready to Submit Your VAT Return?" },
          "caption": "Making Tax Digital compliant and recognised by HMRC." },
        { "action": "hold", "ms": 1200 }
      ]
    },
    {
      "id": "guide",
      "chapter": "User guide",
      "still": true,
      "steps": [
        { "action": "click", "target": { "role": "link", "name": "User Guide" },
          "caption": "The user guide walks through a return in three steps." },
        { "action": "scroll", "target": { "text": "Submit your VAT return in 3 steps" } },
        { "action": "hold", "ms": 1800 },
        { "action": "scroll", "target": "#obligations",
          "caption": "It also covers obligations, liabilities, payments and penalties." },
        { "action": "hold", "ms": 1000 },
        { "action": "scroll", "target": "#receipts",
          "caption": "Every submission leaves a receipt you can find again." },
        { "action": "hold", "ms": 1400 }
      ]
    },
    {
      "id": "help",
      "chapter": "Help",
      "still": true,
      "steps": [
        { "action": "click", "target": "a.info-link[href='about.html']" },
        { "action": "click", "target": { "role": "link", "name": "Help & FAQs" },
          "caption": "The help page answers the questions people actually ask." },
        { "action": "click", "target": "#faq-search" },
        { "action": "type", "target": "#faq-search", "text": "receipt",
          "caption": "Type a word to filter the questions." },
        { "action": "hold", "ms": 2000 },
        { "action": "point", "target": "#faq-list" },
        { "action": "hold", "ms": 1200 },
        { "action": "scroll", "target": "#open-support-form",
          "caption": "If nothing fits, the support form reaches a person." },
        { "action": "hold", "ms": 1200 }
      ]
    },
    {
      "id": "bundles",
      "chapter": "Bundles",
      "still": true,
      "steps": [
        { "action": "click", "target": { "role": "link", "name": "Bundles" },
          "caption": "Bundles decide what you can run and how many submissions you get." },
        { "action": "await", "until": "#catalogBundles .bundle-card", "label": "Loading bundles" },
        { "action": "scroll", "target": "#catalogBundles" },
        { "action": "point", "target": "#catalogBundles .bundle-card:first-of-type" },
        { "action": "hold", "ms": 1600 },
        { "action": "scroll", "target": "#passEntryForm",
          "caption": "Got a pass? Redeem it here." },
        { "action": "hold", "ms": 1200 }
      ]
    },
    {
      "id": "accessibility",
      "chapter": "Accessibility",
      "still": true,
      "steps": [
        { "action": "scroll", "to": "bottom" },
        { "action": "click", "target": { "role": "link", "name": "accessibility" },
          "caption": "We publish an accessibility statement and the reports behind it." },
        { "action": "scroll", "target": { "text": "Conformance Status" } },
        { "action": "hold", "ms": 1500 },
        { "action": "scroll", "target": { "text": "Known Limitations" },
          "caption": "Including what still does not work." },
        { "action": "hold", "ms": 1500 },
        { "action": "scroll", "to": "top",
          "caption": "Start at submit.diyaccounting.co.uk." },
        { "action": "hold", "ms": 2000 }
      ]
    }
  ]
}
```

One `goto` at the start, then every page change is a real click on a real link. That is deliberate:
the viewer learns the route as well as the pages. The targets above are checked against the current
markup:

| Move | Target | Exists |
| --- | --- | --- |
| home → about | `a.info-link[href='about.html']` (the info icon, title "About & Help") | yes |
| about → guide | link "User Guide" (`a.about-nav-link`) | yes |
| guide → about | the same info icon, present in every page header | yes |
| about → help | link "Help & FAQs" (`a.about-nav-link`) | yes |
| help → bundles | `nav.main-nav` link "Bundles", present on every page | yes |
| bundles → accessibility | footer link "accessibility", present on every page | yes |

The doubling back through About on the way to Help is worth keeping. It shows the viewer that the
info icon is the hub, which is the one navigation fact a first-time visitor needs.

---

## 4. Pacing

### 4.1 The three groups

| Group | Config key | Default | Applies to |
| --- | --- | --- | --- |
| 1. Per typed character | `perCharMs` | 90 | each keystroke of a `type` step |
| 2. Between cells or clicks | `betweenActionsMs` | 700 | after `click`, `tab`, `press`, `select`, `point`, `highlight`, and after a completed `type` |
| 3. Around motion | `aroundMotionMs` | 1200 | before and after `scroll` and `goto` |

Every value is a single number, applied consistently. A step may override with `pauseMs`, but the
default path uses the group so the video has one rhythm. `--speed 1.5` scales all three for a
quick iteration pass; the config, not the flag, is what ships.

90ms per character is about 11 characters a second, close to a fast human typist and slow enough
to read. Group 3 at 1200ms gives the eye time to find the new position after the page moves.

### 4.2 Wait subtraction

For a step that waits on the backend, whether an `await`, a `goto` whose `waitFor` is not yet satisfied, or a
`click` that triggers a spinner:

```
w         = measured wait, wall clock
pause     = the step's configured group pause
residual  = max(minResidualMs, pause - w)
```

So a 200ms wait inside a 700ms group-2 pause leaves 500ms of still frame. A 3-second wait leaves
`minResidualMs` (150ms), because the viewer has already had three seconds to look at the screen.

`minResidualMs` exists so an action never reads as instantaneous. Without it, a slow step would
cut straight into the next action with no beat.

### 4.3 The timer overlay

When a wait passes `timerThresholdMs` (250ms), the overlay shows a timer pill anchored below the
pointer:

- A numeric elapsed count, `1.4s`, updated every animation frame from `performance.now()`.
- A horizontal bar scaled against `timerFullScaleMs` (5000ms). A 1.4s wait fills 28%. The scale is
  the same in every video, so a viewer who has watched two of them can compare at a glance.
- The step's `label` as small text above the count, e.g. "Loading bundles".
- On completion the bar turns to the success colour, holds 400ms, then fades over 250ms. One
  transition, no repeat, so SC 2.3.1 is not in play.

### 4.4 Time compression for long waits

Filming a 40-second HMRC round trip gives 40 seconds of spinner. Published screencast guidance
says cut it; the operator wants the duration visible. Both are satisfied by compressing the
picture while the timer keeps real time.

After `waitCompressionAfterMs` (6000ms) of a single wait, the capture keeps one frame in
`waitCompressionFactor` (8). A 40-second wait becomes 6 seconds at normal speed plus
34/8 ≈ 4.3 seconds of compressed footage, about 10 seconds on screen. The timer pill reads the
true elapsed seconds throughout and gains a small `×8` marker while compression is active, so the
viewer is not misled about how long it took.

Implemented in the frame writer: during compression, skip writing frames but keep extending the
previous frame's manifest duration, so the output stays CFR.

### 4.5 Caption timing

A caption's minimum on-screen time is `max(minMs, chars / charsPerSecond * 1000)`. At 15cps a
60-character caption gets 4 seconds. If the steps it covers finish sooner, the script holds the
caption; the hold is added to the timeline as a caption hold, not as an action pause, so the
pacing tolerance check in section 10 is not confused by it.

---

## 5. Overlay

### 5.1 Installation

`page.addInitScript({ content: overlayRuntime })` before any navigation. It runs before page
scripts on **every** navigation, so the overlay survives the tour's six page loads without
reinstalling. The old attempt used `addStyleTag` after load, which does not.

The runtime is a self-contained IIFE with no imports, living at
`scripts/lib/video/overlay-runtime.js` and read from disk as text. It exposes `window.__svc` with
`pointTo`, `click`, `typeChar`, `highlight`, `caption`, `chapter`, `timerStart`, `timerTick`,
`timerStop`, `scrollTo`, `suppress`, `mark`. The Node side calls them through `page.evaluate`.

Everything lives inside one `<div id="svc-overlay">` with `position: fixed; inset: 0; z-index:
2147483647; pointer-events: none;` so it never intercepts a real click and never shifts layout.

The overlay also sets `html { scroll-behavior: auto !important }` so the browser adds no scroll
animation of its own. The script owns scroll duration.

### 5.2 Pointer

A drawn SVG arrow, 28px, white fill with a 2px dark stroke and a soft drop shadow so it reads on
both light and dark backgrounds. A 44px translucent accent ring sits behind it, which is Camtasia's
"highlight cursor" idea.

Headless Chromium composites no OS cursor into the screencast at all, so a drawn pointer is the
only option, not a stylistic preference.

Movement follows a quadratic Bezier with a slight arc, eased in and out, over
`min(900, 240 + distance * 0.6)` ms. Borrowed from `ghost-cursor`'s curve idea; the randomised
jitter and overshoot are left out, because they exist to defeat bot detection and read as sloppy.

### 5.3 Trail

A `<canvas>` sized to the viewport at `devicePixelRatio`. Each pointer move stamps a soft 10px dot
at the new position. Every animation frame the canvas is cleared by `globalCompositeOperation =
'destination-out'` with alpha 0.035, so a trail fades over about 1.5 seconds. Cheap, and it
produces the repaints the screencast wants.

### 5.4 Edit trail

Where the pointer trail shows where the pointer went, an edit trail shows where the *edits* went.
A field that has been typed into keeps a 2px accent underline after the interaction ends, fading
to 40% opacity. Up to eight visited targets are kept, oldest dropped first. On a form-filling video
this leaves a visible record of the path through the form.

### 5.5 Action emphasis

- **Click ripple**: a ring expanding from 0 to 120px over 450ms with an ease-out and a fade to
  zero. Plus a 2px accent outline on the clicked element for 350ms.
- **Field highlight**: a 3px accent outline and a 6px soft glow on the target, growing in over
  200ms, held for the interaction, fading over 250ms.
- **Typing**: the field gets the highlight, and a caret pip pulses once per character. That is a single
  100ms fade per keystroke, so at 90ms per character it never reaches three flashes a second.

Every emphasis is one transition. Nothing loops.

### 5.6 Caption box

Bottom-centred inside the safe area: max-width 1440px, 90px off the bottom, 24px padding, 8px
radius. White text at 40px on a 56px line over `rgba(12,14,18,0.82)`, with a 1px light border so
the box edge reads against a dark page. Two lines maximum, wrapped at 46 characters. Fades in and
out over 250ms.

Contrast is well past 4.5:1 at those colours; the builder checks it and states the measured ratio
in the acceptance run.

### 5.7 Chapter marker and heartbeat

A small label top-left showing the scene's `chapter`, so a viewer scrubbing knows where they are.
Same styling at 24px.

The heartbeat is a 2x2px element in the top-left corner that flips between two near-identical
colours every `requestAnimationFrame`. It exists to guarantee the compositor produces a frame every
tick so the screencast samples at a steady rate. It is invisible at normal viewing and gets cropped
out of the stills.

---

## 6. Capture and encode

### 6.1 Frame capture

```
CDP session on the page
  Page.startScreencast { format: "jpeg", quality: 85, maxWidth: 1920, maxHeight: 1080 }
  on Page.screencastFrame:
      write frames/%06d.jpg
      push { index, tMs: now() - t0 }
      Page.screencastFrameAck { sessionId }
  ... run the scenes ...
  Page.stopScreencast
```

The ledger of `{ index, tMs }` becomes the concat manifest. Each entry's duration is the gap to
the next frame; the last entry's duration is `finalHoldMs`.

```
file 'frames/000001.jpg'
duration 0.016667
file 'frames/000002.jpg'
duration 0.033000
...
file 'frames/006000.jpg'
duration 3.000000
file 'frames/006000.jpg'
```

The concat demuxer needs the last file repeated without a duration, or its duration is ignored.
https://svn.ffmpeg.org/ffmpeg-formats.html

### 6.2 Encode

```
ffmpeg -y \
  -f concat -safe 0 -i frames/manifest.txt \
  -vsync cfr -r 60 \
  -vf "scale=1920:1080:flags=lanczos,format=yuv420p" \
  -c:v libx264 -profile:v high -preset slow -crf 18 \
  -g 30 -keyint_min 30 -sc_threshold 0 -bf 2 -coder 1 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -movflags +faststart \
  target/videos/tour/tour.mp4
```

- `-vsync cfr -r 60` turns the timestamped manifest into a constant 60fps timeline, duplicating
  frames across still stretches. Identical frames cost almost nothing as P-frames.
- `-g 30 -keyint_min 30 -sc_threshold 0` is a closed GOP of half the frame rate: YouTube's
  recommendation and half-second seek granularity in one setting.
- `-crf 18` is a mezzanine quality. YouTube re-encodes anyway.
- `-bf 2 -coder 1` match YouTube's two-B-frame, CABAC recommendation.
- `+faststart` puts the moov atom at the front.

The final hold is carried by the manifest's last entry rather than by `tpad`, so the held frame is
inside the same timeline and the duration maths stays in one place.

No overlay is drawn in ffmpeg. Everything visible is in the page, so
it survives into the stills and matches what the reviewer sees.

**ffmpeg binary.** The operator's Mac has no ffmpeg, and the Playwright container does not ship one
on PATH. Add `ffmpeg-static` as a devDependency and resolve the binary from it, falling back to
`ffmpeg` on PATH. That keeps local iteration and CI on the same binary with no apt step.

### 6.3 Stills

Each scene with `"still": true` gets `stills/NN-<sceneId>.png`, written with `page.screenshot()` at
the scene's last frame. Full resolution, PNG, overlay included so captions and pointer are
visible. The heartbeat pixel is covered by the screenshot clip.

Also write `stills/contact-sheet.png` (a 3-across montage via ffmpeg `tile`) so the operator
reviews one image instead of nine.

### 6.4 Captions and transcript

- `tour.vtt` — WebVTT from the caption timeline, cue times from measured frame timestamps. Upload
  alongside the video so YouTube shows real closed captions rather than auto-generated ones.
- `tour.transcript.md` — the SC 1.2.1 text alternative. One section per scene: the chapter name,
  the captions in order, and each step's `note` plus a plain description of the action ("clicks the
  Bundles link", "waits 2.1 seconds while bundles load"). Generated, so it stays true after a
  rerun.
- `tour.timeline.json` — every step with `sceneId`, `stepIndex`, `action`, `group`,
  `configuredMs`, `waitMs`, `residualMs`, `startMs`, `endMs`, `frameStart`, `frameEnd`. This is
  what the acceptance check reads.

---

## 7. CLI

```
node scripts/site-video-capture.js \
  --script videos/tour.json \
  --base-url https://local.submit.diyaccounting.co.uk:3443 \
  --out target/videos/tour
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--script <path>` | required | scene script JSON |
| `--base-url <url>` | `DIY_SUBMIT_BASE_URL` | site to record |
| `--out <dir>` | `target/videos/<name>` | output directory |
| `--fps <n>` | from script | override output frame rate |
| `--speed <x>` | 1.0 | scale all three pacing groups, for quick iteration |
| `--scene <ids>` | all | comma-separated scene ids, for iterating on one scene |
| `--capture <mode>` | `screencast` | `screencast` or `screenshot` (fallback 1) |
| `--stills-only` | false | run the script, write stills, skip video encode |
| `--no-encode` | false | keep frames, skip ffmpeg |
| `--keep-frames` | false | do not delete `frames/` after encode |
| `--headed` | false | watch it run locally |
| `--help` | | usage |

Argument parsing follows the house style in `scripts/deploy-app.js`: a `parseArgs()` switch over
`process.argv.slice(2)`, no dependency.

npm scripts:

```
"video:tour-proxy": "npx dotenv -e .env.proxy -- node scripts/site-video-capture.js --script videos/tour.json 2>&1 | tee videoCapture-proxy.log",
"video:tour-ci":    "npx dotenv -e .env.ci    -- node scripts/site-video-capture.js --script videos/tour.json 2>&1 | tee videoCapture-ci.log",
"video:tour-prod":  "npx dotenv -e .env.prod  -- node scripts/site-video-capture.js --script videos/tour.json 2>&1 | tee videoCapture-prod.log"
```

Wrapped in `bash -c 'set -o pipefail; ...'` to match the behaviour-test scripts.

For a bare local instance with no backend, `npx http-server web/public -p 8080` plus
`--base-url http://localhost:8080` is enough for the tour, because the tour is unauthenticated and
the bundles catalogue is the only backend call. The `await` step on `#catalogBundles .bundle-card`
fails loudly against a bare static server, which is correct. Record the tour against the proxy
variant or a deployed environment.

---

## 8. `video-capture.yml`

Shape mirrors `synthetic-test.yml`, so the auth handling is the same code path the operator
already trusts.

```yaml
name: video-capture
on:
  workflow_dispatch:
    inputs:
      script:            # choice: tour | obligations | view-return | submit-vat
      environment-name:  # choice: (auto) | ci | prod
      deployment-name:   # string, optional
      skip-native-auth-disable:  # boolean, default false
permissions:
  id-token: write
  contents: read
```

Jobs:

1. **`playwright-version`** — identical to synthetic-test: read the pinned version from
   `package-lock.json` so the container matches.
2. **`params`** — normalise inputs, resolve `github-environment` from the input or the branch.
3. **`names`** — OIDC to `SUBMIT_ACTIONS_ROLE_ARN`, chain to `SUBMIT_DEPLOY_ROLE_ARN`, read
   `/submit/<env>/last-known-good-deployment` from SSM when no deployment name is given, then
   `./.github/actions/get-names` for `public-url`. Copy the job as-is.
4. **`capture`** — `runs-on: ubuntu-24.04`, `container: mcr.microsoft.com/playwright:v<ver>-jammy`,
   `environment: ${{ needs.params.outputs.github-environment }}`.

   Steps:
   - Checkout, setup Node 24, `npm ci --ignore-scripts` with
     `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: 1`.
   - Read `"auth"` from the chosen scene script into a step output.
   - **Only when `auth == "cognito-native"`**: OIDC + deploy role, then
     `node scripts/toggle-cognito-native-auth.js enable <env>`, then
     `node scripts/ensure-cognito-test-user.js <env> videoCapture` (a lane of its own, so it never
     rotates a password out from under a running synthetic test).
   - Run the capture:
     ```
     node scripts/site-video-capture.js --script videos/${{ inputs.script }}.json \
       --out target/videos/${{ inputs.script }}
     ```
     with `DIY_SUBMIT_BASE_URL: ${{ needs.names.outputs.public-url }}`,
     `HMRC_ACCOUNT: sandbox`, `HMRC_SANDBOX_CLIENT_SECRET`, and the
     `TEST_AUTH_USERNAME` / `TEST_AUTH_PASSWORD` / `TEST_AUTH_TOTP_SECRET` outputs.
   - `node scripts/check-video-timings.js target/videos/<script>/timeline.json` — the acceptance
     check from section 10, non-blocking on the first runs, blocking once the tolerance settles.
   - **Only when `auth == "cognito-native"`**, `if: !cancelled() && inputs.skip-native-auth-disable
     != 'true'`: re-assume the roles and
     `node scripts/toggle-cognito-native-auth.js disable <env>`.
   - Upload `video-${{ inputs.script }}-${{ env }}` with `target/videos/<script>/` (mp4, stills,
     contact sheet, vtt, transcript, timeline). Retention 30 days, longer than the test artefacts'
     7, because these are deliverables someone will fetch by hand.

The tour is unauthenticated, so for B17a.1 the whole auth block is skipped. The spike's first real
run touches no Cognito and writes no data.

For B17a.2–4 the videos are authenticated and run against **prod with the HMRC sandbox account**,
which writes real rows as the synthetic user. Worth stating in the skill so nobody points it at a
live customer account.

The workflow does not upload to S3 or YouTube. Publishing is B17a.5 and stays the operator's.

---

## 9. The skill

`.claude/skills/site-video-capture/SKILL.md`, with a root symlink `SKILL_SITE_VIDEO_CAPTURE.md`,
matching the existing skills' layout.

Frontmatter description: "Record a video of the real site for a human audience from a scene script.
Invoke when asked to make, update or re-record a product demo or training video."

Procedure:

1. **Read the scene script first.** It is the edit surface. A UI change means editing
   `videos/<name>.json` and rerunning, never editing the mp4.
2. **Iterate locally.** `npm run video:tour-proxy -- --stills-only` to check every target resolves
   and every scene lands where you expect. Review `stills/contact-sheet.png`.
3. **Then record.** `npm run video:tour-proxy`. Watch `videoCapture-proxy.log`; the script prints a
   line per step with the measured and configured durations.
4. **Check the timings.** `node scripts/check-video-timings.js target/videos/tour/timeline.json`.
   A failure means a step waited on something the script did not declare. Add an `await` with a
   `label` rather than raising the tolerance.
5. **Scrub the mp4** before accepting it. Section 10's checks.
6. **Record for real** with `gh workflow run video-capture.yml -f script=tour
   -f environment-name=prod`, then download the artifact.
7. **Accessibility.** The mp4, the `.vtt` and the `.transcript.md` ship together. The transcript is
   what satisfies WCAG SC 1.2.1 for a silent video; the burned-in captions do not. Embed with
   controls and without autoplay so SC 1.4.2 and 2.2.2 stay out of play.
8. **Prose.** Captions and the video title follow `plain-prose`. Two lines, 46 characters a line,
   read aloud before committing.

Add a short "when a target breaks" section: the error names the scene, step and target; fix the
script's target, prefer a role or text target over a CSS one, rerun `--stills-only --scene <id>`.

---

## 10. Acceptance check for the spike

Three layers. The first two are mechanical, the third is the reviewer.

### 10.1 Timings match the config

`scripts/check-video-timings.js` reads `timeline.json` and asserts:

| Check | Tolerance |
| --- | --- |
| Group 2 step duration vs `betweenActionsMs` (plus measured wait, minus subtraction) | ±120ms |
| Group 3 step duration vs `aroundMotionMs`, before and after | ±120ms |
| Mean per-character interval within a `type` step vs `perCharMs` | ±25ms |
| Residual after a wait equals `max(minResidualMs, pause − waitMs)` | ±60ms |
| Every step with `waitMs > timerThresholdMs` has a timer marker in the overlay event log | exact |

### 10.2 The file is what it claims

`ffprobe` on the mp4 asserts:

- 1920x1080, `yuv420p`, H.264 High profile.
- `r_frame_rate == avg_frame_rate == 60/1`, a constant frame rate, so scrubbing is uniform.
- No gap between consecutive PTS greater than one frame period plus 1ms, so there are no skips.
- Keyframe interval 30, so seek granularity is half a second.
- `moov` before `mdat` (`+faststart` applied).
- Duration equals the timeline total plus `finalHoldMs`, ±250ms.
- One still per scene exists, at 1920x1080, plus the contact sheet.
- `tour.vtt` parses, and every cue's text appears in `tour.transcript.md`.

### 10.3 A reviewer can scrub it

Open in a player that steps frame by frame:

- Step across any click. The ripple occupies at least 12 consecutive frames (450ms at 60fps) and
  grows monotonically, with no frame where the ripple jumps.
- Step across any scroll. Every frame differs from the last; no frame is repeated mid-scroll.
- Step across a hold. Frames are identical, the timeline advances, and the caption stays legible.
- Every action is announced before it happens: the pointer arrives, the target highlights, then
  the click. Nothing happens off-pointer.
- Every scene has a caption, and no caption is on screen for less than its computed minimum.
- The final frame holds for three seconds and does not cut to black.
- The whole file plays with no blank frame anywhere.

The spike passes when all three layers pass on `videos/tour.json` recorded against the proxy
variant, and the same script recorded by `video-capture.yml` against prod produces an artifact
whose `check-video-timings.js` run is also clean.

---

## 11. Open choices for the operator

Four, in order of how much they change the output.

1. **Caption size.** Default is 40px type on a 56px line, 5.2% of frame height. BBC's broadcast
   guideline is an 8% line height, which at 1080p is 86px and covers about a fifth of the UI. The
   BBC figure is right for TV viewing distance and wrong for showing a form. Confirm 40px, or say
   which way to go.
2. **Silent track or no audio.** The videos have no sound. A well-formed mp4 with a silent AAC-LC
   track at 48kHz is friendlier to some players and matches YouTube's recommended settings; no
   audio track at all is a smaller file and unambiguous about there being nothing to hear. Default
   in the design is no audio track. Say if you want the silent track.
3. **Time compression for long waits.** Section 4.4 compresses a wait past six seconds by 8x while
   the timer keeps real time. It diverges from published guidance, which says cut waits entirely,
   and it means a viewer sees ten seconds of film for a forty-second wait. The alternative is to
   film waits in full and accept the runtime. Default is compression on.
4. **`ffmpeg-static` as a devDependency.** There is no ffmpeg on the operator's Mac and none on
   PATH in the Playwright container. `ffmpeg-static` (~80MB) gives one binary for local and CI with
   no apt step. The alternative is an `apt-get install -y ffmpeg` step in the workflow plus a brew
   install locally. Default is `ffmpeg-static`.

---

## 12. Build list

Sized for a Sonnet coder. Each item names its files and what "done" looks like.

| # | Files | Done when |
| --- | --- | --- |
| 1 | `videos/scene-script.schema.json` | JSON Schema for section 3, every action typed, `additionalProperties: false`. Validated at load with a plain hand-rolled validator or `ajv` if already present; a bad script fails with the offending path. |
| 2 | `videos/tour.json` | Section 3.4, with targets confirmed against the rendered pages. |
| 3 | `scripts/lib/video/pacing.js` | Pure functions: `groupFor(action)`, `residualAfterWait(pause, waitMs, cfg)`, `captionMinMs(text, cfg)`, `compressionFor(waitMs, cfg)`. No I/O. |
| 4 | `app/unit-tests/video/pacing.test.js` | Covers wait subtraction at, below and above the pause; the `minResidualMs` floor; caption minimum at 15cps; compression boundary at 6000ms. |
| 5 | `scripts/lib/video/overlay-runtime.js` | Browser IIFE, section 5. No imports. Exposes `window.__svc`. Records an event log of every emphasis it draws, readable from Node. |
| 6 | `scripts/lib/video/overlay.js` | Node side: reads the runtime as text, `installOverlay(page)` via `addInitScript`, typed wrappers, `readEvents(page)`. |
| 7 | `scripts/lib/video/capture.js` | `startScreencast(page, dir)` / `stop()`, frame writer, timestamp ledger, compression skipping, and the `screenshot` fallback mode behind the same interface. |
| 8 | `scripts/lib/video/encode.js` | Manifest builder, ffmpeg invocation from section 6.2, stills, contact sheet, `ffmpeg-static` resolution with a PATH fallback. |
| 9 | `scripts/lib/video/actions.js` | Action dispatch table, target resolution (CSS / role / text), hard failure with scene and step in the message plus a `FAILED-*.png` still. |
| 10 | `scripts/lib/video/captions.js` | WebVTT writer, transcript writer, `timeline.json` writer. |
| 11 | `app/unit-tests/video/captions.test.js` | VTT cue formatting, wrapping at `maxCharsPerLine`, transcript contains every caption. |
| 12 | `scripts/site-video-capture.js` | The CLI from section 7, orchestrating 3–10. Prints one line per step with configured and measured durations. |
| 13 | `scripts/check-video-timings.js` | Section 10.1 and 10.2. Exits non-zero with a table of the offending steps. |
| 14 | `.github/workflows/video-capture.yml` | Section 8. |
| 15 | `package.json` | The three npm scripts, `ffmpeg-static` devDependency; remove `test:captureDemo` and `test:captureDemo-simulator`. |
| 16 | `.claude/skills/site-video-capture/SKILL.md` + root symlink | Section 9. |
| 17 | Deletions | `behaviour-tests/captureDemo.behaviour.test.js`, `scripts/capture-demo-videos.js`, the `captureDemo` project in `playwright.config.js`, `behaviour-tests/helpers/playwrightTestForCapture.js` if nothing else uses it, `PLAN_DEMO_VIDEOS.md`. |

Build order: 1–4 first (the pacing model is the thing to get right and it is testable without a
browser), then 5–6 (the overlay, reviewable with `--stills-only`), then 7–8, then 9–12, then 13–14.

---

## 13. What to keep and what to drop from the previous attempt

`PLAN_DEMO_VIDEOS.md` already marks itself superseded. The code underneath it splits cleanly.

**Keep, as ideas:**

- **Blocking analytics.** `scripts/capture-demo-videos.js` routes `google-analytics`,
  `googletagmanager`, `gtag/js` and `client.rum` to a 204. Keep this exactly. Recording the site
  should not put rows in GA4, and the RUM script's own network activity adds noise to the frames.
  Move it into `site-video-capture.js` as a `context.route`.
- **The final-frame hold.** Both files hold three seconds at the end. Right instinct; it becomes
  `finalHoldMs` in the script, carried by the concat manifest instead of a `waitForTimeout`.
- **CSS injection to control what the frame shows.** The idea survives as `suppress` in the scene
  script. The mechanism does not; see below.
- **The `simulator-highlight` class idea** in `web/public/widgets/simulator-journeys.js`: highlight
  a target, scroll it into centre, then act on it. That is the right sequence for a human viewer.
  Rebuild it in the overlay so it works on the real site as well as inside the simulator iframe.

**Drop:**

- **Playwright `recordVideo`.** Section 1.5 and 2. This is the main thing being replaced.
- **Recording the simulator page through an iframe.** The operator's brief is the real site. The
  iframe-maximising CSS, the `#simulatorFrame` handling and the `simulator-bridge` postMessage
  commands all go with it. `simulator-journeys.js` stays where it is — it serves the interactive
  simulator page, which is a separate feature and not part of this.
- **`addStyleTag` after load.** It dies on the first navigation. `addInitScript` replaces it and is
  the reason the six-page tour works at all.
- **Driving journeys by clicking a hidden button and polling `#journeyStatusText`.** The capture
  script owns the journey now; the scene script is the source of truth for what happens and when.
- **`scripts/capture-demo-videos.js`'s server lifecycle.** Starting dynalite, the HTTP simulator and
  the app server from inside the capture script tangles two jobs. The new script records whatever
  `--base-url` points at. Locally that is `npm run start:proxy` in another terminal.
- **The `@app/` import problem.** `capture-demo-videos.js` never ran standalone because of path
  aliases. The new script imports nothing from `app/`, which removes the problem rather than
  working around it.
- **`behaviour-tests/` as the home for this.** These are not tests. A failed recording is not a
  failed build. It lives in `scripts/` with its own workflow.
- **`PLAN_DEMO_VIDEOS.md`.** Delete it when the build lands; this design and the skill replace it.

---

## 14. Sources

Accessibility and public-sector guidance
- https://guidance.publishing.service.gov.uk/formatting-content/videos/
- https://www.gov.uk/service-manual/helping-people-to-use-your-service/making-your-service-accessible-an-introduction
- https://accessibility.blog.gov.uk/2025/03/13/text-digitised-and-videotape-video-transcripts-help-everyone-not-just-people-with-access-needs/
- https://www.w3.org/WAI/WCAG22/Understanding/audio-only-and-video-only-prerecorded.html
- https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html
- https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html
- https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
- https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
- https://www.legislation.gov.uk/uksi/2018/952
- https://www.boia.org/blog/open-vs.-closed-captions-which-is-more-accessible
- https://www.w3.org/TR/saur/

Captions and reading speed
- https://www.clevercast.com/bbc-subtitling-guidelines/
- https://www.closedcaptioncreator.com/blog/articles/subtitle-reading-speed.html

YouTube
- https://support.google.com/youtube/answer/1722171
- https://support.google.com/youtube/answer/4603579
- https://support.google.com/youtube/answer/6375112
- https://support.google.com/youtube/answer/10059070

Demo-video conventions
- https://www.techsmith.com/learn/tutorials/camtasia/cursor-effects/
- https://www.techsmith.com/camtasia/features/ai-auto-zoom-and-pan/
- https://www.nngroup.com/articles/instructional-video-guidelines/
- https://sproutvideo.com/blog/exactly-how-to-make-a-professional-screencast-video.html

Playwright, CDP and ffmpeg
- https://playwright.dev/docs/videos
- https://playwright.dev/docs/api/class-browsertype
- https://github.com/microsoft/playwright/issues/17217 (frame rate not configurable)
- https://github.com/microsoft/playwright/issues/35776 (timestamp drift)
- https://github.com/microsoft/playwright/issues/33080 (no dropped-frame visibility)
- https://github.com/microsoft/playwright/issues/8936 (recordVideo unreliable under xvfb in CI)
- https://chromedevtools.github.io/devtools-protocol/tot/Page/
- https://github.com/ThePatriczek/playwright-recast
- https://github.com/Xetera/ghost-cursor
- https://github.com/prasanaworld/puppeteer-screen-recorder
- https://github.com/qawolf/playwright-video
- https://github.com/orgs/remotion-dev/discussions/4351
- https://justin.abrah.ms/blog/2026-02-12-generating-demo-videos-with-playwright.html
- https://svn.ffmpeg.org/ffmpeg-formats.html
- https://en.wikibooks.org/wiki/FFMPEG_An_Intermediate_Guide/image_sequence
- https://playwright.dev/docs/ci
