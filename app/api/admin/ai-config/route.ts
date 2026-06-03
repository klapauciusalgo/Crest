import { getAiAdminConfig, maskProviderConfig, updateAiSettings, upsertAiProvider } from "@/lib/ai/config";
import { getErrorMessage } from "@/lib/error-message";
import { requireAdminServerUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminServerUser();
  if (admin instanceof Response) return admin;

  try {
    const config = await getAiAdminConfig();
    return Response.json({
      providers: config.providers.map(maskProviderConfig),
      settings: config.settings
    });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error, "Unknown AI config error.") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdminServerUser();
  if (admin instanceof Response) return admin;

  try {
    const payload = (await request.json()) as {
      provider?: {
        id?: string;
        providerName?: string;
        baseUrl?: string;
        model?: string;
        apiKey?: string;
        status?: "active" | "disabled";
        maxTokens?: number;
        temperature?: number;
      };
      settings?: {
        weeklyPromptLimit?: number;
        systemPrompt?: string;
      };
    };
    const response: Record<string, unknown> = {};

    if (payload.provider) {
      if (!payload.provider.providerName || !payload.provider.baseUrl || !payload.provider.model) {
        return Response.json({ error: "Provider name, base URL, and model are required." }, { status: 400 });
      }

      if (!payload.provider.id && !payload.provider.apiKey?.trim()) {
        return Response.json({ error: "API key is required for a new provider." }, { status: 400 });
      }

      const provider = await upsertAiProvider(
        {
          providerName: payload.provider.providerName,
          baseUrl: payload.provider.baseUrl,
          model: payload.provider.model,
          apiKey: payload.provider.apiKey,
          status: payload.provider.status || "disabled",
          maxTokens: payload.provider.maxTokens || 900,
          temperature: payload.provider.temperature ?? 0.2
        },
        payload.provider.id
      );
      response.provider = maskProviderConfig(provider);
    }

    if (payload.settings) {
      response.settings = await updateAiSettings({
        weeklyPromptLimit: payload.settings.weeklyPromptLimit ?? 5,
        systemPrompt: payload.settings.systemPrompt || ""
      });
    }

    return Response.json(response);
  } catch (error) {
    return Response.json({ error: getErrorMessage(error, "Unknown AI config error.") }, { status: 500 });
  }
}
