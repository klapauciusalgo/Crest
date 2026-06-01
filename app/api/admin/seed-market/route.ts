import { getMockMarketSnapshot } from "@/lib/market/mock-provider";
import { writeMarketSnapshotToSupabase } from "@/lib/market/supabase-writer";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const seedSecret = process.env.CREST_INGEST_SECRET;

  if (!seedSecret || authHeader !== `Bearer ${seedSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshots = [getMockMarketSnapshot("30m"), getMockMarketSnapshot("4h")];
  const results = await Promise.all(snapshots.map((snapshot) => writeMarketSnapshotToSupabase(snapshot)));

  return Response.json({
    ok: true,
    results
  });
}
