# SeamSheet Studio

Turn a garment photo into front, back, side and detail mockups, then build the full tech pack around
them: sizing with grading, fabrics and trims, construction, colours and artwork, labels and packing,
fit and samples, and a printable one-page summary.

**Numbered callouts on your drawings.** On the Construction page, pick a row and click your technical flat to
pin it. Drag a pin to move it (arrow keys nudge a focused pin, Delete removes it). Pin numbers are the row numbers
in the table, so they stay in step as you edit, and the Project Summary prints the pinned drawings above the
numbered construction table.

**It runs entirely in your browser.** No account, no server, no database, no hosting platform to depend
on. It is a static site you can put anywhere.

## How your data is stored

- Projects, tech pack data and images live in your browser's IndexedDB, on your device.
- **Export a backup** (Settings & backup) now and then. It is one `.zip` you can keep, move to another
  browser or computer, and restore from. Clearing site data or switching browsers would otherwise lose your work.
- Backups never contain your API key.

## Mockup generation (your own Google AI key)

Mockups use Google's Gemini API, called **directly from your browser** with your own key.

1. Get a key from [Google AI Studio](https://aistudio.google.com/apikey). Image generation may require
   billing to be enabled on your Google account.
2. Open **Settings & backup**, paste the key, and press **Test key**.

The key is saved in this browser only and sent only to `generativelanguage.googleapis.com`. Anyone with
access to your browser profile can read it, so don't add it on a shared computer. Photos you generate
from are sent to Google to be processed. Everything except mockup generation (all seven tech pack
sections and the summary) works with no key and no internet.

Google renames models often. The defaults are `gemini-3-flash-preview` (reads the photo) and
`gemini-3.1-flash-image` (draws the views). If generation fails with a "model" error, update the names
under **Model names** in Settings.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run build    # static site in dist/
```

## Put it online

`npm run build` produces a plain static site in `dist/` (paths are relative, so any folder or sub-path works).

- **GitHub Pages:** the included workflow (`.github/workflows/pages.yml`) builds and deploys on every push to
  `main`. In the repo go to Settings, Pages, and set Source to "GitHub Actions".
- **Netlify, Cloudflare Pages, Vercel, any web host:** build command `npm run build`, publish directory `dist`.

Because data lives in each visitor's browser, a hosted copy gives every person their own private workspace.

## Project layout

- `src/model/` pure logic with tests: tech pack data model, size grading, prompts, view planning.
- `src/lib/` IndexedDB storage, Gemini client, generation pipeline, backup.
- `src/components/` the interface (generator and the section pages).
