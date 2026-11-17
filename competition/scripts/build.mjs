import { mkdir, readFile, readdir, writeFile, copyFile } from "node:fs/promises";
import { extname, join } from "node:path";

const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".webp": "image/webp", ".pdf": "application/pdf",
};
const assets = {};
for (const filename of await readdir("public", { recursive: true })) {
  const type = types[extname(filename)];
  if (!type) continue;
  assets["/" + filename] = [type, (await readFile(join("public", filename))).toString("base64")];
}
const paths = [
  "public/tournament.js", "public/standings.js", "worker/config.js", "worker/competition.mjs", "worker/index.js",
];
if (Object.hasOwn(assets, "/rosters.js")) paths.push("worker/roster-source.js", "worker/legacy.js");
const sources = await Promise.all(paths.map((filename) => readFile(filename, "utf8")));
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await writeFile("dist/server/index.js", "const assets = " + JSON.stringify(assets) + ";\n"
  + sources.map((source) => source.replace(/^export \{[^\n]+\};\s*$/gm, "")).join("\n"));
await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
