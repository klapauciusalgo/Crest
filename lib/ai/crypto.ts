import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { readServerEnv } from "@/lib/supabase/server";

const algorithm = "aes-256-gcm";

export function encryptSecret(value: string) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(".");
}

export function decryptSecret(payload: string) {
  const [version, ivValue, tagValue, ciphertextValue] = payload.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Unsupported encrypted secret payload.");
  }

  const key = getEncryptionKey();
  const decipher = createDecipheriv(algorithm, key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final()
  ]);

  return plaintext.toString("utf8");
}

export function getSecretHint(value: string) {
  const clean = value.trim();
  if (clean.length <= 8) return "set";
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

function getEncryptionKey() {
  const secret = readServerEnv("AI_CONFIG_ENCRYPTION_KEY");
  if (!secret) {
    throw new Error("AI_CONFIG_ENCRYPTION_KEY is required before storing AI provider keys.");
  }

  return createHash("sha256").update(secret).digest();
}
