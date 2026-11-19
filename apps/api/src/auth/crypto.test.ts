import { describe, expect, it } from "vitest";
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "./crypto.js";

describe("auth cryptographic primitives (Argon2id + opaque session tokens)", () => {
  it("hashes passwords with Argon2id using unique random salts and verifies accurately", async () => {
    const plain = "correct-horse-battery-staple";
    const hash1 = await hashPassword(plain);
    const hash2 = await hashPassword(plain);

    expect(hash1.startsWith("$argon2id$")).toBe(true);
    expect(hash1).not.toBe(hash2);

    expect(await verifyPassword(hash1, plain)).toBe(true);
    expect(await verifyPassword(hash1, "wrong-password-attempt")).toBe(false);
    expect(await verifyPassword("not-a-valid-hash", plain)).toBe(false);
  });

  it("generates high-entropy unique session tokens and hashes them deterministically with SHA-256", () => {
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();

    expect(token1.length).toBeGreaterThanOrEqual(43);
    expect(token1).not.toBe(token2);

    const digest1 = hashSessionToken(token1);
    const digest2 = hashSessionToken(token1);

    expect(digest1).toMatch(/^[a-f0-9]{64}$/);
    expect(digest1).toBe(digest2);
    expect(digest1).not.toBe(token1);
  });
});
