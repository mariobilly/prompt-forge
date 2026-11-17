// The server only listens on 127.0.0.1, but a web page you visit could still send requests to it.
// Requests that spend money or change settings must come from the app itself.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function hostname(host: string): string {
  return host.replace(/:\d+$/, "").toLowerCase();
}

export function rejectForeign(request: Request): Response | null {
  const host = request.headers.get("host") ?? "";
  if (!LOCAL_HOSTS.has(hostname(host))) return Response.json({ error: "PromptForge only accepts requests to localhost." }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      // fall through: a malformed Origin is rejected below
    }
    if (originHost !== host) return Response.json({ error: "Requests from other sites are blocked." }, { status: 403 });
  }
  return null;
}
