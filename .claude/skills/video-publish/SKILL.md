---
name: video-publish
description: Publish the recorded product videos to the DIY Accounting Submit YouTube channel: fetch the recordings from their video-capture runs, check them, upload them unlisted with the stored credentials, and flip them public. Invoke when the operator asks to publish, re-publish or check the videos, or when a new recording needs to reach the channel.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# video-publish — from a video-capture run to the YouTube channel

Channel: https://www.youtube.com/@DIYAccountingSubmit. Recordings come from
`video-capture.yml` (skill `site-video-capture`); this skill takes them from there to the
channel. The source of truth for what is published is `videos/publish.json`; the script is
`scripts/youtube-upload.js` (`npm run video:publish`).

Everything here runs from this machine or a workflow with no ids copied by hand. The one thing
Google gives no API for is creating an OAuth client, so that is a once-per-project console
pass (Step 2), after which the client and the channel owner's refresh token live in AWS
Secrets Manager and nothing prompts again.

## Step 1 — fetch the recordings

`videos/publish.json` names, per video, the `sourceRun` (a `video-capture.yml` run id), the
artifact name, and the local `videoFile` and `captionFile` paths under `target/videos/`.
Download each artifact to that path:

```bash
gh run download <sourceRun> -n <sourceArtifact> -D target/videos/<sourceArtifact>
```

Artifacts keep for 30 days. If a run has expired, record again with `site-video-capture`
(`gh workflow run video-capture.yml -f script=<id> -f environment-name=prod`) and put the new
run id in `publish.json` and `videos/PUBLISH.md`.

`target/` is wiped by `./mvnw clean`; fetch again if the files are gone.

## Step 1a — check every recording before it goes anywhere

Follow `site-video-capture` Step 4: read the stills (`stills/contact-sheet.png` and each
scene still) for developer chrome, debug panels, cookie banners or a black final frame, and
run `node scripts/check-video-timings.js target/videos/<artifact>/<id>.timeline.json`. A
scene that shows the developer panel means the capture script left developer mode on; fix
the runner, not the video.

The operator has accepted the yellow sandbox banner and HMRC's 2017 sandbox periods in the
VAT videos (2026-09-06). Anything else that looks like a test artefact stops the publish.

## Step 2 — the once-per-project console pass (operator)

Needed only if Secrets Manager has no `prod/submit/youtube/oauth_client`. Check first:

```bash
aws --profile submit-prod secretsmanager describe-secret --secret-id prod/submit/youtube/oauth_client --query Name --output text
```

If it is missing, walk the operator through this, exactly. Google Cloud console,
https://console.cloud.google.com, project `diyaccounting-ga4`, signed in as the Google
account that owns the channel. The section is **Google Auth Platform** in the left menu
(Google moved it there from "APIs & Services, OAuth consent screen").

1. Left menu, **Google Auth Platform**, **Overview**. If there is a **Get started** button:
   App name `DIY Accounting Submit`, User support email: the operator's address, **Next**;
   Audience **External**, **Next**; Contact information: the operator's address, **Next**;
   agree, **Continue**, **Create**.
2. **Audience**: publishing status stays **Testing**. Under **Test users**, **Add users**, the
   operator's own Google account, **Save**.
3. **Data Access**: **Add or remove scopes**, filter `youtube`, tick
   `.../auth/youtube.upload` and `.../auth/youtube.force-ssl`, **Update**, then **Save**.
4. **Clients**: **Create client**. Application type **Desktop app**, Name `youtube-upload`,
   **Create**.
5. On the **OAuth client created** dialog, **Download JSON**. (Dismissed it? The client is
   listed under OAuth 2.0 Client IDs; the download arrow is at the right of its row.) The file
   is `client_secret_….json` in Downloads. Nothing is copied.

Why not an API: Google blocks its own gcloud client for the YouTube scopes ("This app is
blocked"), and OAuth clients made through the IAP API are locked to IAP. Backlog row 49
tracks a tool that would remove this pass.

## Step 3 — store the client (AWS write: show the command, wait for "yes")

```bash
node scripts/youtube-upload.js --store-client ~/Downloads/client_secret_*.json
```

Writes the file to Secrets Manager `prod/submit/youtube/oauth_client` (submit-prod). The
operator can delete the download afterwards.

## Step 4 — first consent, and the check

```bash
npm run video:publish -- --check
```

With no stored refresh token this opens the consent page in the operator's browser (it also
prints the URL); the operator approves as the channel owner. In Testing status Google shows
an "unverified app" screen for a sensitive scope; the operator continues through it because
they are the listed test user. The refresh token is stored as
`prod/submit/youtube/refresh_token` (an AWS write the script announces). `--check` then
prints the channel title and uploads nothing. Every later run reads the stored token and
never prompts.

## Step 5 — upload unlisted, review, then public

```bash
npm run video:publish
```

Uploads every entry with `publish: true` and no `videoId`, as **unlisted**, with the `.vtt`
captions attached, and writes each returned `videoId` into `videos/publish.json`, so a re-run
uploads only what is missing. Commit `publish.json` after a successful run (a `claude/*`
branch; it is JSON, not docs).

Give the operator the unlisted links to watch. Then:

```bash
npm run video:publish -- --public
```

flips the uploaded entries to public. Never run `--public` before the operator has watched
the unlisted uploads.

## Metadata rules

Titles under 70 characters, product name first ("DIY Accounting Submit: view your VAT
obligations"). Descriptions: three to six plain sentences, say it is a real recording, link
https://submit.diyaccounting.co.uk, and say "sandbox" when the recording is one. Captions
and the transcript travel with the mp4 (WCAG SC 1.2.1). Prose follows `plain-prose`.

A recording that must not go up yet (a ci-only activity) stays `publish: false` with the
reason in `publish.json`.

## Re-publishing a changed recording

A new recording of an existing video is a new YouTube video: set the entry's `videoId` back
to `null`, update `sourceRun`, run Steps 1, 1a and 5, then unlist or delete the old video by
hand in YouTube Studio and note its id in the commit message.
