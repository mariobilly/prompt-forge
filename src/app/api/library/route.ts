import { listHistory } from "@/lib/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return Response.json(listHistory({ savedOnly: url.searchParams.get("saved") === "1", q: url.searchParams.get("q") ?? undefined }));
}
