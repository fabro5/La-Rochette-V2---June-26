# Générateur vidéo "Nouveaux clients" — Raysun

Reproduit le style de la vidéo exemple (story Instagram duckmotion) :
fond blanc, titre Poppins bold, sous-titre manuscrit avec effet machine à
écrire, puis logos clients qui s'enchaînent au centre, et le logo Raysun
en fin de vidéo. Format 1080×1920 (9:16), 30 i/s.

## Utilisation

```bash
npm install
node render.mjs raysun-clients.mp4
```

## Remplacer les placeholders par les vrais logos

L'environnement de génération n'a pas pu accéder à raysun.solar (accès
réseau restreint), les logos sont donc des placeholders texte. Pour la
version finale :

1. Déposer les fichiers logos (PNG/SVG, fond transparent de préférence)
   dans `logos/`.
2. Créer un fichier `slides.json` listant les diapos dans l'ordre —
   la dernière entrée est le logo final (Raysun, affiché plus longtemps) :

```json
[
  { "img": "logos/brasserie-du-bocq.png" },
  { "img": "logos/buzzypark.png" },
  { "img": "logos/fico-energy.png" },
  { "img": "logos/raysun.png" }
]
```

3. Relancer `node render.mjs`.

## Réglages

- Textes du titre : dans `template.html` (`#headline`).
- Mots de l'effet machine à écrire : `CONFIG.typeWords`.
- Durées (frappe, tenue, durée par logo, logo final) : `CONFIG.timings`.
