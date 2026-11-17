import { deleteProfile, getProfile, saveProfile } from "@/lib/db";
import { rejectForeign } from "@/lib/local-only";
import { refreshProfile } from "@/lib/pipeline/research";
import { MissingKeyError } from "@/lib/settings";
import { ProfileBodySchema, type Profile } from "@/lib/types";

export const maxDuration = 800;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const p = getProfile((await ctx.params).id);
  return p ? Response.json(p) : Response.json({ error: "not found" }, { status: 404 });
}

// Manual edits from the profile editor.
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = rejectForeign(request);
  if (blocked) return blocked;
  const cur = getProfile((await ctx.params).id);
  if (!cur) return Response.json({ error: "not found" }, { status: 404 });
  const parsed = ProfileBodySchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const next: Profile = { ...cur, ...parsed.data };
  saveProfile(next);
  return Response.json(next);
}

// Refresh from the web. ?deep=1 uses Perplexity deep research (slower, more thorough).
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = rejectForeign(request);
  if (blocked) return blocked;
  const cur = getProfile((await ctx.params).id);
  if (!cur) return Response.json({ error: "not found" }, { status: 404 });
  try {
    const deep = new URL(request.url).searchParams.get("deep") === "1";
    return Response.json(await refreshProfile(cur, { deep }));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: e instanceof MissingKeyError ? 400 : 500 });
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = rejectForeign(request);
  if (blocked) return blocked;
  const cur = getProfile((await ctx.params).id);
  if (!cur?.custom) return Response.json({ error: "Only custom profiles can be deleted" }, { status: 400 });
  deleteProfile(cur.id);
  return Response.json({ ok: true });
}
