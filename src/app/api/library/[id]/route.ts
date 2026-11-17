import { deleteHistory, updateHistory } from "@/lib/db";
import { rejectForeign } from "@/lib/local-only";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = rejectForeign(request);
  if (blocked) return blocked;
  const body = (await request.json()) as { saved?: boolean; title?: string; tags?: string };
  updateHistory(Number((await ctx.params).id), body);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = rejectForeign(request);
  if (blocked) return blocked;
  deleteHistory(Number((await ctx.params).id));
  return Response.json({ ok: true });
}
