<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Publishing the demo videos

`videos/publish.json` holds the title, description, tags and caption file for each demo
video, read by `scripts/youtube-upload.js`. Three videos are `publish: true` and public on
the channel: `view-obligations`, `submit-return`, `view-return`. `itsa-business-details` is
`publish: false` — it only exists as a ci recording, not a prod one, so it stays off the
channel until the ITSA activity leaves the environments gate.

## Steps

1. **Download the recordings** (the mp4s live under gitignored `target/`, so fetch them again):
   ```bash
   gh run download 33952515598 -n video-view-obligations-prod -D target/videos/video-view-obligations-prod
   gh run download 33953044775 -n video-submit-return-prod -D target/videos/video-submit-return-prod
   gh run download 34058244686 -n video-view-return-prod -D target/videos/video-view-return-prod
   ```
2. **Create an OAuth client, once, in the Google Cloud console** (project `diyaccounting-ga4`,
   signed in as the channel owner). Google blocks gcloud's own client from asking for YouTube
   scopes, and a client created through the IAP API is locked to IAP, so this project needs
   its own. The section is **Google Auth Platform** in the left menu:
   - **Overview**: if there is a **Get started** button, App name `DIY Accounting Submit`, your
     support email, Audience **External**, your contact email, agree, **Create**.
   - **Audience**: publishing status stays **Testing**; under **Test users**, **Add users**,
     your own Google account, **Save**.
   - **Data Access**: **Add or remove scopes**, filter `youtube`, tick `.../auth/youtube.upload`
     and `.../auth/youtube.force-ssl`, **Update**, **Save**.
   - **Clients**: **Create client**, Application type **Desktop app**, Name `youtube-upload`,
     **Create**, then **Download JSON** on the "OAuth client created" dialog (or the download
     arrow on the client's row). Leave the file in Downloads; nothing is copied.
   The full walk-through, with what each screen shows, is `.claude/skills/video-publish/SKILL.md`.
3. **Store the downloaded client, then check the credential works**, without uploading
   anything (the shell expands the glob):
   ```bash
   node scripts/youtube-upload.js --store-client ~/Downloads/client_secret_*.json
   npm run video:publish -- --check
   ```
   `--store-client` writes the client id and secret into AWS Secrets Manager and prints the
   secret name — the downloaded JSON file can then be deleted. `--check` opens a browser once
   for consent (the loopback flow for Desktop clients), stores a refresh token in Secrets
   Manager for later runs, and prints the signed-in channel's title. `x-goog-user-project`
   carries `youtube.googleapis.com` quota to the `diyaccounting-ga4` Google Cloud project on
   every request (override with `GOOGLE_CLOUD_QUOTA_PROJECT` if needed).
4. **Run the upload**:
   ```bash
   npm run video:publish
   ```
   Uploads are unlisted by default. The script writes each returned video id into
   `videos/publish.json`, so a re-run only uploads what's still missing.
5. **Review the three unlisted videos**, then re-run with `--public` to publish them:
   ```bash
   npm run video:publish -- --public
   ```
