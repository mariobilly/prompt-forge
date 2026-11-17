import { spendThisMonth } from "@/lib/db";
import { claudeProvider, claudeReady, perplexityReady } from "@/lib/settings";

export async function GET() {
  return Response.json({
    spend: spendThisMonth(),
    claudeProvider: claudeProvider(),
    // Only whether each service is ready; keys never leave the server.
    keys: { anthropic: claudeReady(), perplexity: perplexityReady() },
  });
}
