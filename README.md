# La Rochette V2 — archive (juin 2026)

Copie de l'ancienne version du site du Gîte de la Rochette, construite avec
Lovable et aspirée telle qu'elle était déployée. **Ce dépôt n'est plus le site
en ligne et n'est plus maintenu** : il est conservé pour son contenu et pour
le travail de référencement qui y avait été fait.

## Où se trouve le projet aujourd'hui

| Projet | Dépôt | En ligne |
|--------|-------|----------|
| Site du gîte | `fabro5/gite-la-rochette` | gitelarochette.com |
| Carnet d'hôte | `fabro5/carnet-dhote` | carnet-dhote.vercel.app |

Le site actuel a été reconstruit de zéro en Vite + React + TypeScript ; il ne
partage aucun fichier avec cette archive. Le générateur de carnet d'accueil,
qui vivait ici dans `carnet-dhote/`, en a été extrait avec l'historique de ses
28 commits.

## Ce qui reste utile ici

Le travail de référencement de juin, absent du site actuel : données
structurées Schema.org (`LodgingBusiness`), balises Open Graph et Twitter
Card, balises de géolocalisation, `sitemap.xml` et `robots.txt`. Tout se
trouve dans `index.html`, à la racine.

Les photos de `images/` sont les versions compressées en juin (30 Mo → 6 Mo).
