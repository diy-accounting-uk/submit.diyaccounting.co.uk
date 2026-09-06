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
2. **Create an OAuth client** in the Google Cloud console for the project behind the
   channel: APIs & Services → Credentials → Create Credentials → OAuth client ID → type
   "Desktop app". Enable the YouTube Data API v3 and the
   `https://www.googleapis.com/auth/youtube.upload` scope for it.
3. **Export the client id and secret**:
   ```bash
   export YOUTUBE_CLIENT_ID=...
   export YOUTUBE_CLIENT_SECRET=...
   ```
4. **Run the upload**:
   ```bash
   npm run video:publish
   ```
   First run prints a consent URL. Open it, sign in, and grant access — the browser then
   redirects to a localhost address that refuses the connection, which is expected. Paste
   the address (or just the `code` value) back into the terminal. The script stores the
   refresh token at `~/.config/diyaccounting/youtube-token.json` and writes each returned
   video id into `videos/publish.json`, so a re-run only uploads what's still missing.
5. **Review the three unlisted videos**, then re-run with `--public` to publish them:
   ```bash
   npm run video:publish -- --public
   ```
