import { describe, expect, it } from "vitest";
import {
  type AiOauthStateRecord,
  type AiOauthStateRepository,
  ChatGptOAuthService,
  InvalidOAuthStateError,
} from "./oauth.js";
import { SecretVault } from "./vault.js";

describe("ChatGptOAuthService (OAuth 2.0 + PKCE S256 stateless flow for Plan Sharing)", () => {
  it("creates PKCE S256 authorization URL, validates state in PostgreSQL store, and exchanges code for token", async () => {
    const stateStore = new Map<string, AiOauthStateRecord>();
    const repo: AiOauthStateRepository = {
      async saveState(record) {
        stateStore.set(record.stateHash, record);
      },
      async consumeState(stateHash) {
        const found = stateStore.get(stateHash) ?? null;
        stateStore.delete(stateHash);
        return found;
      },
    };

    const vault = SecretVault.fromPassphrase("oauth-test-key");
    let capturedCodeVerifier = "";

    const oauth = new ChatGptOAuthService({
      repository: repo,
      vault,
      clientId: "agenticf-chatgpt-client",
      authorizeUrl: "https://auth.openai.com/oauth/authorize",
      tokenUrl: "https://auth.openai.com/oauth/token",
      redirectUri: "http://localhost:5173/oauth/chatgpt/callback",
      exchangeCodeFn: async ({ code, codeVerifier }) => {
        capturedCodeVerifier = codeVerifier;
        return {
          accessToken: `chatgpt-plan-token-for-${code}`,
          email: "plan-user@example.com",
          displayName: "Plan User",
          model: "gpt-4o-mini",
        };
      },
    });

    const started = await oauth.startAuthorization(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(started.authorizationUrl).toContain("code_challenge_method=S256");
    expect(started.authorizationUrl).toContain(
      "client_id=agenticf-chatgpt-client",
    );
    expect(started.state.length).toBeGreaterThan(20);

    const completed = await oauth.completeAuthorization({
      state: started.state,
      code: "auth-code-123",
    });

    expect(completed.userId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(completed.email).toBe("plan-user@example.com");
    expect(completed.accessToken).toBe("chatgpt-plan-token-for-auth-code-123");
    expect(capturedCodeVerifier.length).toBeGreaterThan(30);

    // Replaying the same state must fail (single-use state)
    await expect(
      oauth.completeAuthorization({
        state: started.state,
        code: "auth-code-123",
      }),
    ).rejects.toThrow(InvalidOAuthStateError);
  });
});
