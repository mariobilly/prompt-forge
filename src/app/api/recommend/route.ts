import { rejectForeign } from "@/lib/local-only";
import { runRecommend } from "@/lib/pipeline/recommend";
import { CATEGORIES, PLATFORMS, type RecommendEvent, type RecommendRequest } from "@/lib/types";

export const maxDuration = 800;

// Streams recommendation progress as newline-delimited JSON events.
export async function POST(request: Request) {
  const blocked = rejectForeign(request);
  if (blocked) return blocked;
  const req = (await request.json()) as RecommendRequest;
  if (!req.input?.trim()) return Response.json({ error: "input is required" }, { status: 400 });
  if (req.platform && !(req.platform in PLATFORMS)) return Response.json({ error: "unknown platform" }, { status: 400 });
  if (req.category && !CATEGORIES.includes(req.category)) return Response.json({ error: "unknown category" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: RecommendEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runRecommend(req, emit);
      } catch (e) {
        emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
}
