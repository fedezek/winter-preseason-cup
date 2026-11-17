#!/usr/bin/env bash
set -euo pipefail
source_dir=$(cd -- "$(dirname -- "$0")/../.." && pwd)
target=${1:?Indicare una copia di lavoro del sito Winter}
mkdir -p "$target"/{public,worker,scripts,drizzle/meta,.openai}
cp "$source_dir"/{index.html,rose.html,roster-page.js,app.js,tournament.js,standings.js,style.css,competition.css,cup-public.js,cup-admin.js,organizzatori.html} "$target/public/"
cp -R "$source_dir/assets" "$target/public/"
sed -i '/<meta name="cup-api"/d' "$target/public/index.html" "$target/public/rose.html"
cp "$source_dir/competition/worker/"* "$target/worker/"
cp "$source_dir/competition/scripts/build.mjs" "$target/scripts/"
cp "$source_dir/competition/drizzle/0002_competitions.sql" "$target/drizzle/"
cp "$source_dir/competition/drizzle/meta/_journal.json" "$target/drizzle/meta/"
cp "$source_dir/competition/package.json" "$target/"
cat > "$target/.openai/hosting.json" <<'JSON'
{
  "project_id": "appgprj_6af187970bf4819185bec931964b133a",
  "d1": "DB",
  "r2": null
}
JSON
