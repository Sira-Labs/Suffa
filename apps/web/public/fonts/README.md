# Arabische Schriften (offline einbetten)

Damit die App auch ohne Internet eine hochwertige, voll vokalisierbare arabische
Typografie zeigt, werden die Schriften **lokal** ausgeliefert (nicht von einem CDN).

## Benötigte Dateien

Lege hier zwei WOFF2-Dateien ab (Namen exakt so):

- `amiri.woff2` — [Amiri](https://github.com/aliftype/amiri) (OFL-Lizenz)
- `scheherazade.woff2` — [Scheherazade New](https://software.sil.org/scheherazade/) (OFL-Lizenz)

Beide Schriften stehen unter der **SIL Open Font License** und dürfen
mitausgeliefert werden. Lade die TTF/WOFF2 von den offiziellen Quellen und
konvertiere sie ggf. mit `woff2_compress` oder einem Online-Tool zu WOFF2.

## Verhalten ohne diese Dateien

Die `@font-face`-Regeln in `src/styles/fonts.css` referenzieren diese Dateien.
Fehlen sie, fällt die App automatisch auf eine System-Serifenschrift zurück
(`font-family: ... , 'Times New Roman', serif`). Die App bleibt voll funktionsfähig,
nur die Typografie ist dann weniger fein. Der Build schlägt **nicht** fehl.
