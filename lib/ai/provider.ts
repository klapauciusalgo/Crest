import { decryptSecret } from "@/lib/ai/crypto";
import type { AiProviderConfigWithSecret } from "@/lib/ai/types";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type OllamaChatResponse = {
  error?: string;
  message?: {
    content?: string;
  };
};

export async function testOpenAiCompatibleProvider(config: AiProviderConfigWithSecret) {
  const started = Date.now();
  const answer = await requestOpenAiCompatibleChat(config, [
    {
      role: "system",
      content: "Return exactly: CREST_OK"
    },
    {
      role: "user",
      content: "Test connection."
    }
  ]);

  return {
    latencyMs: Date.now() - started,
    ok: /CREST_OK/i.test(answer) || answer.trim().length > 0
  };
}

export async function requestOpenAiCompatibleChat(config: AiProviderConfigWithSecret, messages: ChatMessage[]) {
  if (isOllamaNativeApi(config.baseUrl)) {
    return requestOllamaNativeChat(config, messages);
  }

  const apiKey = decryptSecret(config.encryptedApiKey);
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const response = await fetch(endpoint, {
    body: JSON.stringify({
      messages,
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: false
    }),
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  const payload = (await response.json().catch(() => ({}))) as ChatCompletionResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || `Provider returned ${response.status}`);
  }

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Provider returned an empty completion.");
  }

  return content;
}

async function requestOllamaNativeChat(config: AiProviderConfigWithSecret, messages: ChatMessage[]) {
  const apiKey = decryptSecret(config.encryptedApiKey);
  const endpoint = getOllamaNativeChatEndpoint(config.baseUrl);
  const response = await fetch(endpoint, {
    body: JSON.stringify({
      messages,
      model: config.model,
      options: {
        num_predict: config.maxTokens,
        temperature: config.temperature
      },
      stream: false
    }),
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  const payload = (await response.json().catch(() => ({}))) as OllamaChatResponse;

  if (!response.ok) {
    throw new Error(payload.error || `Provider returned ${response.status}`);
  }

  const content = payload.message?.content?.trim();
  if (!content) {
    throw new Error("Provider returned an empty completion.");
  }

  return content;
}

function isOllamaNativeApi(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    return url.pathname.replace(/\/+$/, "") === "/api" || (url.hostname === "ollama.com" && url.pathname === "/");
  } catch {
    return baseUrl.replace(/\/+$/, "").endsWith("/api");
  }
}

function getOllamaNativeChatEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/api") ? `${normalized}/chat` : `${normalized}/api/chat`;
}
