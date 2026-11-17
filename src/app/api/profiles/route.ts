import { listProfiles } from "@/lib/db";
import { rejectForeign } from "@/lib/local-only";
import { MissingKeyError } from "@/lib/settings";
import { createCustomProfile } from "@/lib/pipeline/research";
import { CATEGORIES, type Category } from "@/lib/types";

export const maxDuration = 800;

export async function GET() {
  return Response.json(listProfiles());
}

// "Any model": research an unseen model and save a new profile.
export async function POST(request: Request) {
  const blocked = rejectForeign(request);
  if (blocked) return blocked;
  const body = (await request.json()) as { name?: string; vendor?: string; category?: Category; docsUrl?: string };
  if (!body.name?.trim() || !body.category || !CATEGORIES.includes(body.category)) {
    return Response.json({ error: "name and category are required" }, { status: 400 });
  }
  try {
    const r = await createCustomProfile({ name: body.name.trim(), vendor: body.vendor, category: body.category, docsUrl: body.docsUrl });
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: e instanceof MissingKeyError ? 400 : 500 });
  }
}
