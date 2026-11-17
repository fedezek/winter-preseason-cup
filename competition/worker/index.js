const handleCup = cupHandler(cupConfig);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const matchApi = await handleCup(request, env);
    if (matchApi) return matchApi;
    if (typeof legacyHandler === "function") {
      const legacy = await legacyHandler(request, env);
      if (legacy) return legacy;
    }
    if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405 });
    let path = url.pathname === "/" ? "/index.html" : url.pathname;
    if (["/organizzatori", "/organizzatori.html"].includes(path)) {
      if (!organizer(request, env).allowed) {
        if (!organizer(request, env).signedIn) {
          return Response.redirect(new URL("/signin-with-chatgpt?return_to=%2Forganizzatori", url), 302);
        }
        return new Response("Accesso riservato agli organizzatori.", { status: 403, headers: { "Cache-Control": "no-store" } });
      }
      path = "/organizzatori.html";
    }
    const file = Object.hasOwn(assets, path) ? assets[path] : null;
    if (!file) return new Response("Pagina non trovata.", { status: 404 });
    const [type, base64] = file;
    const body = request.method === "HEAD" ? null : Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    return new Response(body, { headers: {
      "Content-Type": type,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
      "Cache-Control": path.startsWith("/assets/") ? "public, max-age=300" : "no-cache",
    } });
  },
};
