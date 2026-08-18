#!/usr/bin/env bash
# Assemble la version staging du site dans _staging/, prête à être servie
# à la racine de https://staging.gitelarochette.com/
#
# Le dépôt est un miroir du site déployé : le HTML référence css/ et js/ en
# relatif, mais le bundle JS appelle les photos en absolu (/lovable-uploads/…
# et /assets/…). Ce script remet les fichiers aux chemins que le bundle attend,
# puis vérifie qu'aucune référence ne pointe dans le vide.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/_staging"
DOMAIN="staging.gitelarochette.com"

rm -rf "$OUT"
mkdir -p "$OUT"

echo "==> Copie du site"
cp "$ROOT/index.html" "$OUT/"
cp -r "$ROOT/css" "$ROOT/js" "$ROOT/fonts" "$OUT/"

echo "==> Retrait des mouchards Lovable (le trafic de test ne doit pas"
echo "    remonter dans les statistiques du site en ligne)"
rm -f "$OUT/js/events.js" "$OUT/js/~flock.js"

echo "==> Mise en place des images aux chemins attendus par le bundle"
mkdir -p "$OUT/lovable-uploads" "$OUT/assets" "$OUT/images"
if [ -d "$ROOT/images" ]; then
  # Toutes les photos de contenu sont appelées via /lovable-uploads/
  cp "$ROOT"/images/*.jpg "$OUT/lovable-uploads/" 2>/dev/null || true
  # Une image de fond est appelée via /assets/
  cp "$ROOT/images/cantal-landscape--1MLpSPL.jpg" "$OUT/assets/" 2>/dev/null || true
  # preview.jpg sert aux aperçus Open Graph, référencé en /images/
  cp "$ROOT/images/preview.jpg" "$OUT/images/" 2>/dev/null || true
fi
# Si l'export fournit déjà ces dossiers, ils font autorité sur images/
if [ -d "$ROOT/lovable-uploads" ]; then
  cp -r "$ROOT/lovable-uploads/." "$OUT/lovable-uploads/"
fi
if [ -d "$ROOT/assets" ]; then
  cp -r "$ROOT/assets/." "$OUT/assets/"
fi

echo "==> Neutralisation du référencement (le staging ne doit pas être indexé)"
cat > "$OUT/robots.txt" <<'ROBOTS'
User-agent: *
Disallow: /
ROBOTS
# noindex dans le HTML, et les métas pointent vers le staging et non la prod
python3 - "$OUT/index.html" "$DOMAIN" <<'PY'
import re, sys
path, domain = sys.argv[1], sys.argv[2]
html = open(path, encoding='utf-8').read()
html = html.replace(
    '<meta name="robots" content="index, follow, max-image-preview:large">',
    '<meta name="robots" content="noindex, nofollow">')
# Les scripts d'analytics ont ete retires du build : on enleve leurs balises
html = re.sub(r'\s*<script[^>]+src="js/(events|~flock)\.js"[^>]*></script>', '', html)
html = html.replace('https://gitelarochette.com/', f'https://{domain}/')
# Bandeau visuel pour ne jamais confondre staging et production.
# Place en bas de page : l'en-tete du site est fixe en haut, un bandeau
# superieur le masquerait.
banner = '''<div id="staging-banner" style="position:fixed;z-index:99999;bottom:0;left:0;right:0;
  background:#b45309;color:#fff;font:600 13px/1.4 system-ui,sans-serif;
  text-align:center;padding:6px 12px;letter-spacing:.02em;pointer-events:none">
  Version de test &mdash; ceci n\'est pas le site en ligne
</div>'''
html = html.replace('<div id="root"></div>', '<div id="root"></div>' + banner)
open(path, 'w', encoding='utf-8').write(html)
PY

echo "==> Domaine personnalisé et repli SPA"
printf '%s\n' "$DOMAIN" > "$OUT/CNAME"
# GitHub Pages sert 404.html sur les URL inconnues ; le routeur React
# prend alors la main sur /reservation et les autres routes.
cp "$OUT/index.html" "$OUT/404.html"
touch "$OUT/.nojekyll"

echo "==> Vérification des références"
missing=0
refs=$(grep -ohoE '"/?(lovable-uploads|assets|images|css|js|fonts)/[^"]+"' \
         "$OUT/index.html" "$OUT"/js/*.js "$OUT"/css/*.css 2>/dev/null \
       | tr -d '"' | sed 's#^/##' | sort -u)
for ref in $refs; do
  if [ ! -f "$OUT/$ref" ]; then
    echo "   MANQUANT: /$ref"
    missing=$((missing + 1))
  fi
done
if [ "$missing" -gt 0 ]; then
  echo "ÉCHEC : $missing fichier(s) référencé(s) mais absent(s) du build." >&2
  exit 1
fi
echo "   $(echo "$refs" | wc -l) références vérifiées, toutes présentes."
echo "==> Staging prêt dans _staging/ ($(du -sh "$OUT" | cut -f1))"
