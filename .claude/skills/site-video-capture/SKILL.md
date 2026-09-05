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

Set `"auth": "user"` and four journey actions unlock: `login`, `consent`, `ensureBundle` and
`hmrcAuthorise`. Each runs the behaviour tests' own step function, so the sign-in and HMRC flows
have one implementation and a markup change is fixed once for both.

**The script never names an identity provider.** It comes from `TEST_AUTH_PROVIDER` at run time,
the same way the behaviour tests pick one: the simulator and proxy variants sign in through the
mock provider on screen, ci and prod through the Cognito Hosted UI with a password and a one-time
code. One script therefore proves locally and records on a deployment with no edit.

**No credential ever appears in a scene script.** `login` reads `TEST_AUTH_USERNAME`,
`TEST_AUTH_PASSWORD` and `TEST_AUTH_TOTP_SECRET`. `hmrcAuthorise` reads `TEST_HMRC_USERNAME`,
`TEST_HMRC_PASSWORD` and `TEST_HMRC_VAT_NUMBER`, or mints a fresh HMRC sandbox test user when
those are unset and `HMRC_ACCOUNT=sandbox`. The sign-in and authorise pages stay on camera,
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
- Only the first HMRC call of a journey redirects, so a script has at most one `hmrcAuthorise`,
  placed directly after the click that triggers the redirect. A run whose account already holds
  an HMRC token fails that step by design, rather than recording a journey with the authorise
  chapter silently missing.
- Type into text fields and `fill` date pickers. Typing digits into an `input type="date"` lands
  them in the browser's own segment order and produces a different date.

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

## Reference

- `videos/scene-script.schema.json` — the format: scenes, steps, targets, pacing, captions.
- `scripts/lib/video/behaviourSteps.js` — the bridge to the behaviour tests' step functions,
  including the two things that stand between plain `node` and them.
- `scripts/lib/video/journey.js` — local services, the HMRC test user, the one-time code mask.
- `scripts/lib/video/secrets.js` / `values.js` — the credential scan and the `{{...}}` values.
- `scripts/lib/video/pacing.js` — the three pacing groups, wait subtraction, time
  compression for a wait past six seconds, caption minimum hold.
- `scripts/lib/video/overlay-runtime.js` / `overlay.js` — the in-page pointer, trail,
  caption box, timer pill and chapter label.
- `scripts/lib/video/capture.js` / `encode.js` — CDP screencast capture and the ffmpeg
  concat-demuxer encode (constant 60fps, H.264 High, closed GOP, faststart).
- `.github/workflows/video-capture.yml` — the real recording, dispatched by hand.
