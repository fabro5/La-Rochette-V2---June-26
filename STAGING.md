# Version de test (staging)

Un double du site, déployé sur **https://staging.gitelarochette.com/**, pour
travailler sans jamais toucher au site en ligne. `gitelarochette.com` reste
hébergé par Lovable et n'est pas concerné par ce qui suit.

## Mise en route (à faire une seule fois)

**1. Ajouter l'enregistrement DNS** chez le registrar du domaine
`gitelarochette.com` :

| Type  | Nom       | Valeur              |
|-------|-----------|---------------------|
| CNAME | `staging` | `fabro5.github.io.` |

Ne touchez pas aux enregistrements de `gitelarochette.com` lui-même : seul le
sous-domaine `staging` est ajouté, le site en ligne continue de pointer vers
Lovable.

**2. Activer GitHub Pages** : dépôt → *Settings* → *Pages* → *Build and
deployment* → *Source* : **GitHub Actions**.

**3. Pousser une modification** (ou lancer le workflow « Déploiement staging »
à la main depuis l'onglet *Actions*). Le domaine personnalisé se règle tout
seul : le fichier `CNAME` est généré par le build.

**4. Cocher *Enforce HTTPS*** dans *Settings* → *Pages*, une fois le certificat
émis par GitHub (quelques minutes après la propagation DNS).

## Fonctionnement

À chaque push sur la branche `staging` ou sur une branche `claude/**`, le
workflow `.github/workflows/deploy-staging.yml` assemble le site et le publie.
Le staging reflète donc toujours la dernière version poussée.

## Pourquoi un script de build

Le dépôt est un **miroir** du site déployé, pas son code source. Le HTML
appelle `css/` et `js/` en relatif, mais le bundle JavaScript appelle les
photos en absolu, sur des chemins qui ne correspondent pas au rangement du
dépôt :

| Le bundle demande            | Le dépôt contient |
|------------------------------|-------------------|
| `/lovable-uploads/*.jpg` (18) | `images/*.jpg`    |
| `/assets/cantal-landscape--1MLpSPL.jpg` | `images/cantal-landscape--1MLpSPL.jpg` |

`scripts/build-staging.sh` remet chaque fichier là où le bundle le cherche,
puis **échoue si une seule référence pointe dans le vide** — servi tel quel,
sans ce remappage, le site s'afficherait sans aucune photo.

Le script applique aussi quatre garde-fous propres à une version de test :

- `robots.txt` en `Disallow: /` et `<meta name="robots" content="noindex,
  nofollow">`, pour que Google n'indexe jamais le double du site ;
- les métas `canonical`, Open Graph et Twitter repointées vers le sous-domaine
  de test au lieu de la production ;
- les mouchards Lovable (`js/events.js`, `js/~flock.js`) retirés, pour que le
  trafic de test ne remonte pas dans les statistiques du site en ligne ;
- un bandeau orange en bas de page : « Version de test ».

Enfin, `404.html` est une copie de `index.html` : GitHub Pages le sert sur les
URL inconnues, ce qui laisse le routeur React prendre la main sur `/reservation`
et les autres routes.

## Commandes

```sh
npm install                  # installe Playwright, pour la vérification
npm run build:staging        # assemble _staging/
npm run check:staging        # sert _staging/ et contrôle le rendu dans Chromium
```

`check:staging` charge `/`, `/reservation` et `/en`, signale toute requête en
erreur, toute image cassée et toute erreur JavaScript, et dépose des captures
d'écran dans `/tmp`.

## Importer la version actuelle du site en ligne

Le miroir présent dans le dépôt date du **26 juin** et contient encore le
formulaire de réservation, que le site en ligne n'a plus : la production a donc
évolué depuis. Pour aligner le staging sur le vrai site actuel :

1. Exporter le projet depuis Lovable
   (projet `89ef97d5-b68a-476f-bc94-b9c4342aaf91`), ou récupérer une copie
   du site en ligne.
2. Remplacer à la racine du dépôt : `index.html`, `css/`, `js/`, `fonts/`, et
   les photos.
3. Si l'export fournit déjà des dossiers `lovable-uploads/` ou `assets/`, le
   script les reprend tels quels — ils font autorité sur `images/`.
4. `npm run build:staging && npm run check:staging` : le build refuse de passer
   s'il manque un fichier, la vérification confirme le rendu.
5. Pousser. Le staging se met à jour tout seul.

## Hors périmètre

`carnet-dhote/` est un projet distinct (générateur de carnet d'accueil, avec
une fonction serverless et une clé d'API). Il n'est pas inclus dans ce
déploiement et garde son propre hébergement.
