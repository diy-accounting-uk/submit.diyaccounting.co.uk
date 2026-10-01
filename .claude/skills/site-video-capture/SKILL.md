---
name: site-video-capture
description: Record a video of the real site for a human audience from a scene script. Invoke when asked to make, update or re-record a product demo or training video.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# site-video-capture — record a scene script into a video

A scene script (`videos/<name>.json`) is the edit surface. A UI change means editing the
script and rerunning, never editing the mp4. `scripts/site-video-capture.js` drives a real
browser through the script with Playwright, draws a pointer, trail and headlines with an
in-page overlay, captures the session with CDP screencast at 3840x2160, and encodes a
constant-frame-rate H.264 mp4 with ffmpeg. Every run also writes a `.vtt`, a `.transcript.md`
and per-scene stills alongside the mp4.

## Step 1 — read the scene script first

Open `videos/<name>.json` before touching anything else. Every target, caption and pacing
value lives there. `videos/tour.json` is the worked example: an unauthenticated walk
through the site. `videos/scene-script.schema.json` documents the format.

## Step 1a — the burned-in headline is not the caption

Every step's `caption` goes into the `.vtt` and the transcript — the full narration, read by a
screen reader or a viewer with sound off — and is never drawn into the frame, so YouTube's
caption track is the only place the words show. A step can also carry a `headline` (three to six
words) and an optional `keyWord`: a short, burned-in callout tag the video itself shows, styled
and positioned so it reads as a label, not a subtitle.

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
- **Style**: a compact dark tag left-accented in the
  overlay's own blue, bold white text with the key word in the timer pill's amber — reusing the
  two colours already in the overlay rather than adding a third. Static once shown: the only
  motion is the entrance fade, matching every other cue here (WCAG SC 2.3.1 — nothing flashes).
- **Prove it** by rendering a step's headline against a real target with
  `scripts/lib/video/overlay.js`'s `headline()` export and screenshotting after the fade settles
  (its CSS transition is ~220ms — a screenshot taken immediately after the call can catch it
  mid-fade; the real capture never does, because every step's own pacing already waits longer
  than that before anything else happens).

## Step 1b — a non-site target

A scene script's target is normally the submit site itself (`--base-url`). A script whose target
is a different local tool entirely — `videos/mcp-diya-gl.json` records MCP Inspector's web UI
driving diya-gl's MCP server — declares a top-level `localApp` instead: a `command` to start, the
`url` its web UI serves, and a `readyPattern` to match against the command's own stdout/stderr
before the run treats it as ready (`readyTimeoutMs` overrides the 30s default). The capture starts
it, uses its `url` as the base url when `--base-url` was not given, and stops it when the run
ends. `videos/mcp-diya-gl.json` also shows the pattern for a target whose interactive controls are
not plain HTML: a Mantine switch's accessible `role=switch` element sits under a track span that
intercepts a direct click, so that scene's target is a CSS selector on the label instead
(`.mantine-Switch-root`), with a `note` explaining why.

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

HMRC's sandbox answers "no data found" to the liabilities, payments and penalties reads unless
the request carries a `Gov-Test-Scenario` header. A `testScenario` step sets the page's hidden
`#testScenario` select (the developer panel stays closed) before the step that submits the
form; it fails when the page has no such option. The scenarios have fixed date windows, so the
form dates are the window HMRC documents for that scenario, not a period key:
`view-liabilities` uses `MULTIPLE_LIABILITIES_2018_19` (2018-04-05 to 2018-12-21),
`view-payments` uses `MULTIPLE_PAYMENTS_2018_19` (2018-02-27 to 2018-12-21), and
`view-penalties` uses `MULTIPLE_PENALTIES` (a late submission and a late payment penalty, no
dates). Obligations return data without a header.

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

## Step 2c — a fastForward preamble

Mark a scene `"fastForward": true` when every video repeats it and a viewer has already seen it
in full — signing in, taking out a day pass or a subscription. The scene stays on camera (unlike
`offCamera`, it never leaves the viewer wondering what happened): frames keep capturing, and its
chapter label, captions and headlines still show, each held at its minimum instead of its full
reading time. It is the same zero-pacing treatment a CLI `--scene` run gives a scene it did not
select, just switched on by the script itself rather than by the command line, so it applies on
every recording, not just this one run. `videos/sign-in.json` is the canonical, full-pace video
for the walkthrough itself; every other signed-in script fast-forwards the same three scenes and
carries one caption pointing at it (`"See the full sign-in ... walkthrough in our sign-in
video."`).

The HMRC authorisation repeats the same way. `videos/hmrc-authorise.json` is the canonical,
full-pace video for it (sign-in and day pass fast-forwarded, then the authorise scene at full
pace). Every other script fast-forwards its own `hmrcAuthorise`: a scene that holds only the
authorisation is marked `fastForward`; an authorisation inside a scene that keeps its pace
carries `"fastForward": true` on the `hmrcAuthorise` step itself. Either carries one caption
pointing at the HMRC authorisation video. A step-level `fastForward` runs that step at zero
pacing and leaves the rest of the scene alone. Each recording is its own browser session, so a
later video cannot start after an earlier one; the repeated stretch is sped through instead.

A scene marked `fastForward` still has to leave the page in a state the *next* scene can rely on
— ensureBundle's grant, for instance, is asynchronous, and a plain `click` step never waits for
its target to exist (a missing target is a hard failure, immediately, not a retry). Close a
fast-forwarded scene that unlocks something with an `await` for the thing the next scene's first
click needs, so the real backend catches up before the pacing gets zeroed away under it.

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

## Step 4a — narration

Every captioned step is spoken by an Amazon Polly neural British English voice (`Amy` by
default — `aws polly describe-voices --language-code en-GB` lists the others), synthesised
during the capture itself through `@aws-sdk/client-polly`'s `PollyClient`: the scene holds each
caption for the clip's own duration, not the reading-speed estimate `pacing.js`'s `captionMinMs`
uses when narration is off. The audio is mixed onto one continuous track (silence everywhere
nothing is speaking) and muxed onto the mp4 as its AAC stream, so the mp4 alone carries sound —
no separate audio file ships. `--no-narration` skips it for a fast local loop (`--stills-only`
always skips it too, since there is no video to hold open or mux onto). Credentials and region
are resolved by the SDK's own default provider chain — env vars, or the assumed role
`video-capture.yml`'s OIDC steps put there, which already carries `polly:SynthesizeSpeech` — so
the capture container needs no `aws` CLI binary.

A fast-forwarded or off-camera step is never narrated — nothing holds it open regardless, so
there is no line to speak for it.

## Step 5a — YouTube chapters

```bash
node scripts/video-chapters.mjs target/videos/<name>/<name>.timeline.json videos/<name>.json
```

Prints one `HH:MM:SS Chapter name` line per on-camera scene, from the run's own
`timeline.json` — never hand-typed, so it cannot drift from what the video actually shows after
a re-recording changes a scene's order or timing. Paste the lines under the video's description
in `videos/publish.json` (see `videos/PUBLISH.md`).

## Step 6 — publish accessibly

The mp4, the `.vtt` and the `.transcript.md` ship together, always. The transcript is what
satisfies WCAG SC 1.2.1 for a silent video; the video draws no caption text, only the headline tag. Embed the mp4 with player controls and without
autoplay, so SC 1.4.2 and 2.2.2 stay out of the embedder's problem.

Captions and the video title follow `plain-prose`: short sentences, read aloud before
committing.

## Capture and encode settings

Frames render at the CSS viewport (1920x1080) times `deviceScaleFactor`, default 2, so a script
captures 3840x2160 frames unless it sets its own value. The browser lays out the page at the same
CSS size either way; only the backing store gets denser, so every caption and form field stays
sharp once YouTube re-encodes a 4K upload instead of stretching a 1080p one.

YouTube serves a 4K upload as VP9 at every tier. The H.264 3840x2160 test upload
(capture run 36334326190) played on 2026-09-28 as VP9 profile 0,
8-bit, bt709, with opus audio, at both 1080p (itag 248, 1920x1080@30) and 2160p (itag 313,
3840x2160@30), with 0 and 1 dropped frames. Keep the 3840x2160 capture and the H.264 encode
below; YouTube's VP9 re-encode serves both tiers.

`fps` is a required field on every script. 30 is the default across the published scripts; a
script sets 60 only when a scene's own motion needs it. The captured frame count is set by the
page's actual redraws, not by this field — it only controls the constant-rate timeline the encode
resamples onto.

The encode is H.264 High, yuv420p, faststart, at the frames' own captured resolution (never
downscaled to a fixed target), a closed GOP of half the frame rate and BT.709 tags, which is
YouTube's recommended upload profile. The default is `crf 22`, `-preset medium`, `-tune animation`,
measured on the first 30 seconds of a 3840x2160, 30fps capture of `videos/view-liabilities.json`
against the simulator:

| Setting | Size | SSIM against crf 12 slow | Encode time |
|---|---|---|---|
| crf 12 slow | 14.4 MB | reference | 184 s |
| crf 18 slow | 9.7 MB | 0.99955 | 101 s |
| crf 22 slow | 7.2 MB | 0.99915 | 29 s |
| crf 22 medium | 7.4 MB | 0.99914 | 18 s |
| crf 26 medium | 5.4 MB | 0.99847 | 16 s |

Size target: 2 Mbps of video for this screen content, about 30 MB per two minutes, half the
crf 12 output. YouTube suggests 35 to 45 Mbps for 4K camera footage and re-encodes every upload
to VP9 anyway; a UI recording at SSIM above 0.999 gives that re-encode a clean source without
the upload cost.

## Reference

- `videos/scene-script.schema.json` — the format: scenes, steps, targets, pacing, captions.
- `scripts/lib/video/behaviourSteps.js` — the bridge to the behaviour tests' step functions,
  including the two things that stand between plain `node` and them.
- `scripts/lib/video/journey.js` — local services, the HMRC test user, the one-time code mask.
- `scripts/lib/video/secrets.js` / `values.js` — the credential scan and the `{{...}}` values.
- `scripts/lib/video/pacing.js` — the three pacing groups, wait subtraction, time
  compression for a wait past six seconds, caption minimum hold.
- `scripts/lib/video/overlay-runtime.js` / `overlay.js` — the in-page pointer, trail,
  headline tag, timer pill and chapter label.
- `scripts/lib/video/headlinePlacement.js` — pure placement math for the headline tag (above
  or below its target, clear of it, inside the frame), unit-tested with no browser.
- `scripts/lib/video/capture.js` / `encode.js` — CDP screencast capture and the ffmpeg
  concat-demuxer encode (constant frame rate, H.264 High, closed GOP, faststart), plus the
  narration mix (`adelay`/`amix`) and mux (`-c:v copy`, AAC audio). See "Capture and encode
  settings" above for the resolution, frame rate and CRF defaults.
- `scripts/lib/video/narration.js` — Amazon Polly synthesis and the ffmpeg duration probe
  behind Step 4a, both shelled through the `aws` and `ffmpeg` binaries rather than an SDK
  package, since `node_modules` here is shared across every worktree.
- `scripts/lib/video/chapters.js` / `scripts/video-chapters.mjs` — Step 5a's chapter lines,
  built from a run's own `timeline.json` and the scene script's chapter labels.
- `scripts/lib/video/videoCoverageAllowList.js` / `app/unit-tests/video/videoCoverage.test.js`
  — the reasoned exceptions to "every prod-listed activity has a scene script", and the check
  itself.
- `.github/workflows/video-capture.yml` — the real recording, dispatched by hand.
