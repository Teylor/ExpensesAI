import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { aiOauthStates } from "../db/schema/ai.js";
import type { SecretVault } from "./vault.js";

export interface AiOauthStateRecord {
  readonly stateHash: string;
  readonly encryptedCodeVerifier: string;
  readonly userId: string | null;
  readonly expiresAt: Date;
}

export interface AiOauthStateRepository {
  saveState(record: AiOauthStateRecord): Promise<void>;
  consumeState(stateHash: string): Promise<AiOauthStateRecord | null>;
}

export interface ChatGptTokenExchangeResult {
  readonly accessToken: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly model: string;
}

export class InvalidOAuthStateError extends Error {
  constructor() {
    super("Invalid or expired OAuth 2.0 state");
    this.name = "InvalidOAuthStateError";
  }
}

export interface ChatGptOAuthServiceOptions {
  repository: AiOauthStateRepository;
  vault: SecretVault;
  clientId?: string;
  authorizeUrl?: string;
  tokenUrl?: string;
  redirectUri?: string;
  stateTtlMs?: number;
  now?: () => Date;
  exchangeCodeFn?: (params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    clientId: string;
    tokenUrl: string;
  }) => Promise<ChatGptTokenExchangeResult>;
}

function sha256Base64Url(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("base64url");
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function decodeJwtPayload(jwtToken: string): Record<string, unknown> | null {
  const parts = jwtToken.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export class ChatGptOAuthService {
  private readonly repository: AiOauthStateRepository;
  private readonly vault: SecretVault;
  private readonly clientId: string;
  private readonly authorizeUrl: string;
  private readonly tokenUrl: string;
  private readonly redirectUri: string;
  private readonly stateTtlMs: number;
  private readonly now: () => Date;
  private readonly exchangeCodeFn?: ChatGptOAuthServiceOptions["exchangeCodeFn"];

  constructor(options: ChatGptOAuthServiceOptions) {
    this.repository = options.repository;
    this.vault = options.vault;
    this.clientId = options.clientId ?? "dynamic_agent_client";
    this.authorizeUrl =
      options.authorizeUrl ?? "https://auth.openai.com/api/accounts/authorize";
    this.tokenUrl =
      options.tokenUrl ?? "https://auth.openai.com/api/accounts/oauth/token";
    this.redirectUri =
      options.redirectUri ?? "http://localhost:5173/oauth/chatgpt/callback";
    this.stateTtlMs = options.stateTtlMs ?? 10 * 60 * 1000;
    this.now = options.now ?? (() => new Date());
    if (options.exchangeCodeFn) {
      this.exchangeCodeFn = options.exchangeCodeFn;
    }
  }

  async startAuthorization(
    userId?: string | null,
    redirectUriOverride?: string,
  ): Promise<{
    authorizationUrl: string;
    state: string;
  }> {
    const state = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = sha256Base64Url(codeVerifier);
    const effectiveRedirectUri = redirectUriOverride ?? this.redirectUri;

    const now = this.now();
    await this.repository.saveState({
      stateHash: sha256Hex(state),
      encryptedCodeVerifier: this.vault.encrypt(codeVerifier),
      userId: userId ?? null,
      expiresAt: new Date(now.getTime() + this.stateTtlMs),
    });

    const url = new URL(this.authorizeUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", effectiveRedirectUri);
    url.searchParams.set(
      "scope",
      "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
    );
    url.searchParams.set("resource", "https://api.openai.com/v1");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    return {
      authorizationUrl: url.toString(),
      state,
    };
  }

  async completeAuthorization(input: {
    state: string;
    code: string;
    redirectUri?: string;
  }): Promise<ChatGptTokenExchangeResult & { userId: string | null }> {
    const stateHash = sha256Hex(input.state);
    const stored = await this.repository.consumeState(stateHash);
    if (!stored || stored.expiresAt.getTime() <= this.now().getTime()) {
      throw new InvalidOAuthStateError();
    }

    const codeVerifier = this.vault.decrypt(stored.encryptedCodeVerifier);
    const effectiveRedirectUri = input.redirectUri ?? this.redirectUri;

    if (this.exchangeCodeFn) {
      const exchanged = await this.exchangeCodeFn({
        code: input.code,
        codeVerifier,
        redirectUri: effectiveRedirectUri,
        clientId: this.clientId,
        tokenUrl: this.tokenUrl,
      });
      return {
        ...exchanged,
        userId: stored.userId,
      };
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.clientId,
      code: input.code,
      redirect_uri: effectiveRedirectUri,
      code_verifier: codeVerifier,
    });

    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `OpenAI OAuth token exchange failed (${response.status}): ${errText.slice(0, 200)}`,
      );
    }

    const tokenPayload = (await response.json()) as {
      access_token?: string;
      id_token?: string;
    };

    if (!tokenPayload.access_token) {
      throw new Error("OpenAI OAuth response missing access_token");
    }

    const claims = tokenPayload.id_token
      ? decodeJwtPayload(tokenPayload.id_token)
      : null;
    const email =
      typeof claims?.email === "string"
        ? claims.email
        : "chatgpt-user@openai.local";
    const displayName =
      typeof claims?.name === "string" ? claims.name : "ChatGPT Plan Sharing";

    return {
      accessToken: tokenPayload.access_token,
      email,
      displayName,
      model: "gpt-4o-mini",
      userId: stored.userId,
    };
  }
}

export class PostgresAiOauthStateRepository implements AiOauthStateRepository {
  constructor(private readonly dbClient: DbClient) {}

  async saveState(record: AiOauthStateRecord): Promise<void> {
    await this.dbClient.db.insert(aiOauthStates).values({
      stateHash: record.stateHash,
      encryptedCodeVerifier: record.encryptedCodeVerifier,
      userId: record.userId,
      expiresAt: record.expiresAt,
    });
  }

  async consumeState(stateHash: string): Promise<AiOauthStateRecord | null> {
    const rows = await this.dbClient.db
      .delete(aiOauthStates)
      .where(eq(aiOauthStates.stateHash, stateHash))
      .returning();

    const row = rows[0];
    if (!row) return null;

    return {
      stateHash: row.stateHash,
      encryptedCodeVerifier: row.encryptedCodeVerifier,
      userId: row.userId,
      expiresAt: row.expiresAt,
    };
  }
}
