---
name: site-video-capture
description: Record a video of the real site for a human audience from a scene script. Invoke when asked to make, update or re-record a product demo or training video.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# site-video-capture — record a scene script into a video

A scene script (`videos/<name>.json`) is the edit surface. A UI change means editing the
script and rerunning, never editing the mp4. `scripts/site-video-capture.js` drives a real
browser through the script with Playwright, draws a pointer, trail and captions with an
in-page overlay, captures the session with CDP screencast at 3840x2160, and encodes a
constant-frame-rate H.264 mp4 with ffmpeg. Every run also writes a `.vtt`, a `.transcript.md`
and per-scene stills alongside the mp4.

## Step 1 — read the scene script first

Open `videos/<name>.json` before touching anything else. Every target, caption and pacing
value lives there. `videos/tour.json` is the worked example: an unauthenticated walk
through the site. `videos/scene-script.schema.json` documents the format.

## Step 1a — the burned-in headline is not the caption

Every step's `caption` goes into the `.vtt` and the transcript — the full narration, read by a
screen reader or a viewer with sound off. A step can also carry a `headline` (three to six
words) and an optional `keyWord`: a short, burned-in callout tag the video itself shows, styled
and positioned so it never reads as the same thing as the caption twice.

- **Write it or leave it out.** A step with no `headline` shows no burned-in line — there is no
  fallback to the caption text. Keep it to three to six words; the tag is a single line.
- **`keyWord` names one word already in the headline**, matched whole-word and
  case-insensitively (not a substring), and shown in the tag's accent colour. Omit it for a
  headline with nothing to single out.
- **Placement is automatic.** For a step whose action resolves a real target on the page
  (`click`, `point`, `type`, `fill`, `select`, `highlight`), the tag places itself above or below
  that target's box — never over it — once the pointer has actually arrived there
  (`scripts/lib/video/headlinePlacement.js`, unit-tested). Every other step's headline (`goto`,
  `await`, `login`, `hmrcAuthorise`, a bare `caption` step, …) shows against no target, in a
  fixed band below the chapter label.
- **Style**: a compact dark tag (not the caption's wide bottom bar), left-accented in the
  overlay's own blue, bold white text with the key word in the timer pill's amber — reusing the
  two colours already in the overlay rather than adding a third. Static once shown: the only
  motion is the entrance fade, matching every other cue here (WCAG SC 2.3.1 — nothing flashes).
- **Prove it** by rendering a step's headline against a real target with
  `scripts/lib/video/overlay.js`'s `headline()` export and screenshotting after the fade settles
  (its CSS transition is ~220ms — a screenshot taken immediately after the call can catch it
  mid-fade; the real capture never does, because every step's own pacing already waits longer
  than that before anything else happens).

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
`auth` is `user` needs a real site behind it. Prove it on the simulator variant instead, which
runs the whole journey locally with no Docker and no AWS:

```bash
npm run video:view-obligations-simulator -- --stills-only
```

The capture starts dynalite, the HTTP simulator and the site in its own process whenever the
environment says `TEST_SERVER_HTTP=run`, so there is no second terminal and no port to look up.
The simulator answers HMRC's create-test-user, OAuth and obligations endpoints and serves
stand-ins for HMRC's own authorise pages, so the journey runs end to end. Everything the run
prints, including the site's own log, is teed to `videoCapture-simulator.log`.

The simulator's obligations are canned 2017 periods and it ignores the date range, so it proves
the journey and the targets, not the data. The real HMRC sandbox proves the data, and that is
what the workflow records against.

## Step 2a — a logged-in scene script

Set `"auth": "user"` and five journey actions unlock: `login`, `consent`, `ensureBundle`,
`hmrcAuthorise` and `submitReturn`. Each runs the behaviour tests' own step function, so the
sign-in and HMRC flows have one implementation and a markup change is fixed once for both.

**The script never names an identity provider.** It comes from `TEST_AUTH_PROVIDER` at run time,
the same way the behaviour tests pick one: the simulator and proxy variants sign in through the
mock provider on screen, ci and prod through the Cognito Hosted UI with a password and a one-time
code. One script therefore proves locally and records on a deployment with no edit.

**No credential ever appears in a scene script.** `login` reads `TEST_AUTH_USERNAME`,
`TEST_AUTH_PASSWORD` and `TEST_AUTH_TOTP_SECRET`. `hmrcAuthorise` reads `TEST_HMRC_USERNAME`,
`TEST_HMRC_PASSWORD` and `TEST_HMRC_VAT_NUMBER`, or mints a fresh HMRC sandbox test user when
those are unset and `HMRC_ACCOUNT=synthetic`. The sign-in and authorise pages stay on camera,
because a customer sees them, but the run refuses to finish if a credential reached the `.vtt`,
the transcript, the timeline or the overlay event log, and the Cognito one-time code field is
masked on screen. A `type` or `fill` step that has to carry a credential of its own marks itself
`"secret": true`, which keeps the value out of the transcript and the timeline.

Two values a logged-in script cannot hard-code come from `{{...}}` placeholders.
`{{hmrcVatNumber}}` is the VAT registration number of the test user this run actually got.
`{{today}}`, `{{daysAgo:N}}`, `{{monthsAgo:N}}` and `{{yearsAgo:N}}` are dates from one clock
fixed at the start of the run. `videos/view-obligations.json` asks for `{{monthsAgo:11}}` to
`{{today}}`, which stays inside HMRC's 366-day limit without naming a period.

Three things to know before writing the next one:

- Run `ensureBundle` while the browser is on the bundles page. Navigate there with an ordinary
  `click` step so the pointer and the ripple stay on camera, then let the action grant the
  bundle.
- HMRC redirects once per scope tier, so a script has one `hmrcAuthorise` per tier, each placed
  directly after the click that triggers its redirect: a read-only journey has one; a journey
  that queries obligations (`read:vat`) and then submits (`write:vat read:vat`) has two, as
  `videos/submit-return.json` shows. A run whose account already holds a token for that tier
  fails the step by design, rather than recording a journey with the authorise chapter silently
  missing.
- Type into text fields and `fill` date pickers. Typing digits into an `input type="date"` lands
  them in the browser's own segment order and produces a different date.

## Step 2b — an off-camera scene

Mark a scene `"offCamera": true` when a real step has to happen but a viewer never needs to see
it — for instance, submitting a return before viewing one, so the account has something on file
to show. The scene runs at zero pacing, shows no caption and no chapter label, takes no still,
and pauses frame capture for its whole duration: nothing from it reaches the encoded video, the
`.vtt` or the `.transcript.md`. Its steps still land in the timeline, each carrying
`offCamera: true`, so the acceptance checks can see what ran; `check-video-timings.js` skips
timer and residual expectations for them, since a step run at zero pacing has neither.

`submitReturn` is built for this: it submits a VAT return the way `getVatReturn.behaviour.test.js`
does — the home nav, the submit VAT form's own date fields, fill the nine boxes with round
figures, tick the declaration, the write:vat scope authorise with HMRC, and the receipt — with
`allowSyntheticObligations` so the server resolves the period from HMRC's own open obligation,
never a hard-coded period key. `videos/view-return.json` uses it between an on-camera obligations
query and a second one, so the return it then opens on camera is real.

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
stills all travel together. A script whose `auth` is `user` runs against **prod with the HMRC
sandbox account**, writing rows as the synthetic test user — never point it at a real customer
account. The workflow turns Cognito native auth on for the run and off again afterwards, and
rotates the synthetic user's password and one-time code device first.

## Step 6 — publish accessibly

The mp4, the `.vtt` and the `.transcript.md` ship together, always. The transcript is what
satisfies WCAG SC 1.2.1 for a silent video — burned-in captions alone do not, because they
are pixels, unreadable by assistive tech. Embed the mp4 with player controls and without
autoplay, so SC 1.4.2 and 2.2.2 stay out of the embedder's problem.

Captions and the video title follow `plain-prose`: short sentences, read aloud before
committing.

## Capture and encode settings

Frames render at the CSS viewport (1920x1080) times `deviceScaleFactor`, default 2, so a script
captures 3840x2160 frames unless it sets its own value. The browser lays out the page at the same
CSS size either way; only the backing store gets denser, so every caption and form field stays
sharp once YouTube re-encodes a 4K upload instead of stretching a 1080p one.

`fps` is a required field on every script. 30 is the default across the published scripts; a
script sets 60 only when a scene's own motion needs it. The captured frame count is set by the
page's actual redraws, not by this field — it only controls the constant-rate timeline the encode
resamples onto.

The encode is H.264 High, yuv420p, faststart, at the frames' own captured resolution (never
downscaled to a fixed target). `crf 12` with `-tune animation` is the measured default: on a
3840x2160, 30fps, 3492-frame capture (`videos/view-obligations.json` against the simulator), it
gave the smallest file of the four combinations tried (crf 10/12 × stillimage/animation) at an
SSIM against the source frames indistinguishable from the other three — every combination was
already visually lossless at this content's motion level, so file size decided.

## Reference

- `videos/scene-script.schema.json` — the format: scenes, steps, targets, pacing, captions.
- `scripts/lib/video/behaviourSteps.js` — the bridge to the behaviour tests' step functions,
  including the two things that stand between plain `node` and them.
- `scripts/lib/video/journey.js` — local services, the HMRC test user, the one-time code mask.
- `scripts/lib/video/secrets.js` / `values.js` — the credential scan and the `{{...}}` values.
- `scripts/lib/video/pacing.js` — the three pacing groups, wait subtraction, time
  compression for a wait past six seconds, caption minimum hold.
- `scripts/lib/video/overlay-runtime.js` / `overlay.js` — the in-page pointer, trail,
  caption box, headline tag, timer pill and chapter label.
- `scripts/lib/video/headlinePlacement.js` — pure placement math for the headline tag (above
  or below its target, clear of it, inside the frame), unit-tested with no browser.
- `scripts/lib/video/capture.js` / `encode.js` — CDP screencast capture and the ffmpeg
  concat-demuxer encode (constant frame rate, H.264 High, closed GOP, faststart). See
  "Capture and encode settings" above for the resolution, frame rate and CRF defaults.
- `.github/workflows/video-capture.yml` — the real recording, dispatched by hand.
