# Publishing the demo videos

`videos/publish.json` holds the title, description, tags and caption file for each demo
video, read by `scripts/youtube-upload.js`. Three videos are `publish: true` and ready to
go: `view-obligations`, `submit-return`, `view-return`. `itsa-business-details` is
`publish: false` — it only exists as a ci recording, not a prod one, so it stays off the
channel until the ITSA activity leaves the environments gate.

## Steps

1. **Download the recordings** (the mp4s live under gitignored `target/`, so fetch them again):
   ```bash
   gh run download 33952515598 -n video-view-obligations-prod -D target/videos/video-view-obligations-prod
   gh run download 33953044775 -n video-submit-return-prod -D target/videos/video-submit-return-prod
   gh run download 34058244686 -n video-view-return-prod -D target/videos/video-view-return-prod
   ```
2. **Sign in once as the channel owner**, granting gcloud's own client the scopes this
   script needs — no OAuth client to create in the console:
   ```bash
   gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/youtube.upload,https://www.googleapis.com/auth/youtube.force-ssl
   ```
   This writes `~/.config/gcloud/application_default_credentials.json`, which the script
   reads automatically. It also carries `youtube.googleapis.com` quota to the
   `diyaccounting-ga4` Google Cloud project via an `x-goog-user-project` header (override
   with `GOOGLE_CLOUD_QUOTA_PROJECT` if needed).
3. **Check the credential works**, without uploading anything:
   ```bash
   npm run video:publish -- --check
   ```
   This prints the signed-in channel's title.
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
