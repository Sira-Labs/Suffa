# Arabic fonts (embedded for offline use)

So that the app shows high-quality, fully vocalisable Arabic typography even
without internet, the fonts are served **locally** (not from a CDN).

## Required files

Place two WOFF2 files here (names exactly as shown):

- `amiri.woff2` — [Amiri](https://github.com/aliftype/amiri) (OFL license)
- `scheherazade.woff2` — [Scheherazade New](https://software.sil.org/scheherazade/) (OFL license)

Both fonts are licensed under the **SIL Open Font License** and may be
redistributed with the app. Download the TTF/WOFF2 from the official sources and
convert them to WOFF2 if needed, using `woff2_compress` or an online tool.

## Behaviour without these files

The `@font-face` rules in `src/styles/fonts.css` reference these files.
If they are missing, the app automatically falls back to a system serif font
(`font-family: ... , 'Times New Roman', serif`). The app stays fully functional;
only the typography is less refined. The build does **not** fail.
