import { rejectForeign } from "@/lib/local-only";
import { runForge } from "@/lib/pipeline/forge";
import { MODES, type ForgeEvent, type ForgeRequest } from "@/lib/types";

export const maxDuration = 800;

// Streams the pipeline to the browser as newline-delimited JSON events.
export async function POST(request: Request) {
  const blocked = rejectForeign(request);
  if (blocked) return blocked;
  const req = (await request.json()) as ForgeRequest;
  if (!req.input?.trim() || !req.modelId || !MODES.includes(req.mode)) {
    return Response.json({ error: "mode, modelId and input are required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: ForgeEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runForge(req, emit);
      } catch (e) {
        emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
}
