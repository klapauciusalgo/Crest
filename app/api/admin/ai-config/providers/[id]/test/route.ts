import { getAiProviderById, updateAiProviderTestResult } from "@/lib/ai/config";
import { testOpenAiCompatibleProvider } from "@/lib/ai/provider";
import { requireAdminServerUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdminServerUser();
  if (admin instanceof Response) return admin;

  try {
    const provider = await getAiProviderById(params.id);
    if (!provider) {
      return Response.json({ error: "Provider config not found." }, { status: 404 });
    }

    const result = await testOpenAiCompatibleProvider(provider);
    await updateAiProviderTestResult(provider.id, result.ok ? "ok" : "failed", result.ok ? null : "Provider returned an empty test response.");

    return Response.json({
      ok: result.ok,
      latencyMs: result.latencyMs,
      testedAt: new Date().toISOString()
    });
  } catch (error) {
    await updateAiProviderTestResult(params.id, "failed", getErrorMessage(error)).catch(() => null);
    return Response.json({ error: getErrorMessage(error), ok: false }, { status: 502 });
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown provider test error.";
}
