import { createHash, randomBytes } from "node:crypto";
import { hash, type Options, verify } from "@node-rs/argon2";

/** Argon2id numeric enum value in @node-rs/argon2 (safe with isolatedModules). */
const ARGON2ID_ALGORITHM = 2;

const ARGON2_OPTIONS: Options = {
  algorithm: ARGON2ID_ALGORITHM,
  memoryCost: 19_456, // 19 MiB (OWASP recommended baseline)
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, ARGON2_OPTIONS);
}

export async function verifyPassword(
  storedHash: string,
  candidatePassword: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, candidatePassword, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
