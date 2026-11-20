import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;

export function maskSecretPreview(rawSecret: string): string {
  const trimmed = rawSecret.trim();
  if (trimmed.length <= 8) {
    return "****";
  }
  const prefix = trimmed.startsWith("sk-") ? "sk-" : trimmed.slice(0, 3);
  const suffix = trimmed.slice(-4);
  return `${prefix}...${suffix}`;
}

export class SecretVault {
  private readonly keyBuffer: Buffer;

  constructor(keyBuffer: Buffer) {
    if (keyBuffer.length !== 32) {
      throw new Error("SecretVault requires a 32-byte (256-bit) key");
    }
    this.keyBuffer = keyBuffer;
  }

  static fromPassphrase(passphrase: string): SecretVault {
    const derived = createHash("sha256").update(passphrase, "utf8").digest();
    return new SecretVault(derived);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.keyBuffer, iv, {
      authTagLength: AUTH_TAG_LENGTH_BYTES,
    });
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return `v1.${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
  }

  decrypt(payload: string): string {
    const parts = payload.split(".");
    if (parts.length !== 4 || parts[0] !== "v1") {
      throw new Error("Invalid encrypted credential format");
    }
    const [, ivB64 = "", tagB64 = "", cipherB64 = ""] = parts;
    const iv = Buffer.from(ivB64, "base64url");
    const authTag = Buffer.from(tagB64, "base64url");
    const ciphertext = Buffer.from(cipherB64, "base64url");

    if (
      iv.length !== IV_LENGTH_BYTES ||
      authTag.length !== AUTH_TAG_LENGTH_BYTES
    ) {
      throw new Error("Invalid IV or AuthTag length");
    }

    const decipher = createDecipheriv(ALGORITHM, this.keyBuffer, iv, {
      authTagLength: AUTH_TAG_LENGTH_BYTES,
    });
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  }
}
