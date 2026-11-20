import { describe, expect, it } from "vitest";
import { maskSecretPreview, SecretVault } from "./vault.js";

describe("SecretVault (AES-256-GCM encryption for OAuth & BYOK credentials)", () => {
  it("encrypts with random IV, decrypts accurately, masks preview safely, and rejects tampered ciphertext or wrong key", () => {
    const vaultA = SecretVault.fromPassphrase("test-master-secret-key-a");
    const vaultB = SecretVault.fromPassphrase("test-master-secret-key-b");
    const rawCredential = ["sk", "live", "sample", "9a2f"].join("-");

    const enc1 = vaultA.encrypt(rawCredential);
    const enc2 = vaultA.encrypt(rawCredential);

    // Random 96-bit IV ensures two encryptions of the same secret never match
    expect(enc1).not.toBe(enc2);
    expect(enc1.includes(rawCredential)).toBe(false);
    expect(vaultA.decrypt(enc1)).toBe(rawCredential);
    expect(vaultA.decrypt(enc2)).toBe(rawCredential);

    // Wrong key or tampered tag MUST fail authentication
    expect(() => vaultB.decrypt(enc1)).toThrow();
    const tampered = `${enc1.slice(0, -4)}AAAA`;
    expect(() => vaultA.decrypt(tampered)).toThrow();

    // Masked preview never leaks middle characters
    const masked = maskSecretPreview(rawCredential);
    expect(masked).toBe("sk-...9a2f");
    expect(masked.includes("sample")).toBe(false);
  });
});
