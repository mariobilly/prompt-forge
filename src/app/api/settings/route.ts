import { rejectForeign } from "@/lib/local-only";
import { publicSettings, updateSettings, type SettingsPatch } from "@/lib/settings";

// Your keys are masked here: the full key is never sent back to the browser.
export async function GET() {
  return Response.json(publicSettings());
}

export async function PUT(request: Request) {
  const blocked = rejectForeign(request);
  if (blocked) return blocked;
  const body = (await request.json().catch(() => null)) as SettingsPatch | null;
  if (!body || typeof body !== "object") return Response.json({ error: "Expected a JSON object" }, { status: 400 });
  const patch: SettingsPatch = {};
  for (const k of ["anthropicApiKey", "perplexityApiKey"] as const) {
    if (k in body) {
      const v = body[k];
      if (v !== null && typeof v !== "string") return Response.json({ error: `${k} must be a string` }, { status: 400 });
      patch[k] = v;
    }
  }
  if (body.claudeProvider !== undefined) patch.claudeProvider = body.claudeProvider;
  try {
    updateSettings(patch);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  return Response.json(publicSettings());
}
