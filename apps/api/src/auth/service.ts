import { randomUUID } from "node:crypto";
import {
  DEFAULT_USER_PREFERENCES,
  type LoginRequest,
  loginRequestSchema,
  mergeUserPreferences,
  type RegisterRequest,
  registerRequestSchema,
  type UpdateUserPreferencesInput,
  type UserPreferences,
  userPreferencesSchema,
} from "@agenticf/domain";
import { eq } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { sessions, userPreferences, users } from "../db/schema/users.js";
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "./crypto.js";

export interface PublicUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly createdAt: string;
}

export interface StoredUser {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string | null;
  readonly displayName: string | null;
  readonly createdAt: Date;
}

export interface StoredSession {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface AuthSessionResult {
  readonly user: PublicUser;
  readonly preferences: UserPreferences;
  readonly sessionToken: string;
  readonly expiresAt: Date;
}

export interface AuthenticatedContext {
  readonly user: PublicUser;
  readonly preferences: UserPreferences;
  readonly sessionId: string;
  readonly expiresAt: Date;
}

export class EmailAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`An account with email "${email}" already exists`);
    this.name = "EmailAlreadyExistsError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<StoredUser | null>;
  findUserById(userId: string): Promise<StoredUser | null>;
  createUserWithPreferences(
    user: StoredUser,
    preferences: UserPreferences,
  ): Promise<void>;
  getPreferences(userId: string): Promise<UserPreferences | null>;
  upsertPreferences(
    userId: string,
    preferences: UserPreferences,
  ): Promise<void>;
  createSession(session: StoredSession): Promise<void>;
  findSessionById(sessionId: string): Promise<StoredSession | null>;
  deleteSessionById(sessionId: string): Promise<void>;
}

const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function toPublicUser(stored: StoredUser): PublicUser {
  return {
    id: stored.id,
    email: stored.email,
    displayName: stored.displayName,
    createdAt: stored.createdAt.toISOString(),
  };
}

export interface AuthServiceOptions {
  repository: AuthRepository;
  sessionTtlMs?: number;
  now?: () => Date;
}

export class AuthService {
  private readonly repository: AuthRepository;
  private readonly sessionTtlMs: number;
  private readonly now: () => Date;

  constructor(options: AuthServiceOptions) {
    this.repository = options.repository;
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.now = options.now ?? (() => new Date());
  }

  async register(input: RegisterRequest): Promise<AuthSessionResult> {
    const parsed = registerRequestSchema.parse(input);
    const existing = await this.repository.findUserByEmail(parsed.email);
    if (existing) {
      throw new EmailAlreadyExistsError(parsed.email);
    }

    const now = this.now();
    const passwordHash = await hashPassword(parsed.password);
    const storedUser: StoredUser = {
      id: randomUUID(),
      email: parsed.email,
      passwordHash,
      displayName: parsed.displayName ?? null,
      createdAt: now,
    };

    const preferences: UserPreferences = { ...DEFAULT_USER_PREFERENCES };
    await this.repository.createUserWithPreferences(storedUser, preferences);

    const { sessionToken, expiresAt } = await this.issueSession(storedUser.id);
    return {
      user: toPublicUser(storedUser),
      preferences,
      sessionToken,
      expiresAt,
    };
  }

  async login(input: LoginRequest): Promise<AuthSessionResult> {
    const parsed = loginRequestSchema.parse(input);
    const storedUser = await this.repository.findUserByEmail(parsed.email);

    if (!storedUser?.passwordHash) {
      throw new InvalidCredentialsError();
    }

    const valid = await verifyPassword(
      storedUser.passwordHash,
      parsed.password,
    );
    if (!valid) {
      throw new InvalidCredentialsError();
    }

    const preferences =
      (await this.repository.getPreferences(storedUser.id)) ??
      DEFAULT_USER_PREFERENCES;

    const { sessionToken, expiresAt } = await this.issueSession(storedUser.id);
    return {
      user: toPublicUser(storedUser),
      preferences,
      sessionToken,
      expiresAt,
    };
  }

  async authenticateSession(
    rawToken: string | undefined,
  ): Promise<AuthenticatedContext | null> {
    if (!rawToken || rawToken.trim().length === 0) {
      return null;
    }

    const sessionId = hashSessionToken(rawToken);
    const session = await this.repository.findSessionById(sessionId);
    if (!session) {
      return null;
    }

    const now = this.now();
    if (session.expiresAt.getTime() <= now.getTime()) {
      await this.repository.deleteSessionById(sessionId);
      return null;
    }

    const storedUser = await this.repository.findUserById(session.userId);
    if (!storedUser) {
      await this.repository.deleteSessionById(sessionId);
      return null;
    }

    const preferences =
      (await this.repository.getPreferences(storedUser.id)) ??
      DEFAULT_USER_PREFERENCES;

    return {
      user: toPublicUser(storedUser),
      preferences,
      sessionId,
      expiresAt: session.expiresAt,
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken || rawToken.trim().length === 0) {
      return;
    }
    const sessionId = hashSessionToken(rawToken);
    await this.repository.deleteSessionById(sessionId);
  }

  async updatePreferences(
    userId: string,
    patch: UpdateUserPreferencesInput,
  ): Promise<UserPreferences> {
    const current =
      (await this.repository.getPreferences(userId)) ??
      DEFAULT_USER_PREFERENCES;
    const merged = mergeUserPreferences(current, patch);
    await this.repository.upsertPreferences(userId, merged);
    return merged;
  }

  private async issueSession(
    userId: string,
  ): Promise<{ sessionToken: string; expiresAt: Date }> {
    const now = this.now();
    const sessionToken = generateSessionToken();
    const sessionId = hashSessionToken(sessionToken);
    const expiresAt = new Date(now.getTime() + this.sessionTtlMs);

    await this.repository.createSession({
      id: sessionId,
      userId,
      expiresAt,
      createdAt: now,
    });

    return { sessionToken, expiresAt };
  }
}

function isPgUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly dbClient: DbClient) {}

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const rows = await this.dbClient.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      displayName: row.displayName,
      createdAt: row.createdAt,
    };
  }

  async findUserById(userId: string): Promise<StoredUser | null> {
    const rows = await this.dbClient.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      displayName: row.displayName,
      createdAt: row.createdAt,
    };
  }

  async createUserWithPreferences(
    user: StoredUser,
    preferences: UserPreferences,
  ): Promise<void> {
    try {
      await this.dbClient.db.transaction(async (tx) => {
        await tx.insert(users).values({
          id: user.id,
          email: user.email,
          passwordHash: user.passwordHash,
          displayName: user.displayName,
          createdAt: user.createdAt,
          updatedAt: user.createdAt,
        });

        await tx.insert(userPreferences).values({
          userId: user.id,
          baseCurrency: preferences.baseCurrency,
          timezone: preferences.timezone,
          locale: preferences.locale,
          thousandsSeparator: preferences.thousandsSeparator,
          decimalSeparator: preferences.decimalSeparator,
          symbolPosition: preferences.symbolPosition,
          agentConfirmEnabled: preferences.agentConfirmEnabled,
          updatedAt: user.createdAt,
        });
      });
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new EmailAlreadyExistsError(user.email);
      }
      throw error;
    }
  }

  async getPreferences(userId: string): Promise<UserPreferences | null> {
    const rows = await this.dbClient.db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return userPreferencesSchema.parse({
      baseCurrency: row.baseCurrency,
      timezone: row.timezone,
      locale: row.locale,
      thousandsSeparator: row.thousandsSeparator,
      decimalSeparator: row.decimalSeparator,
      symbolPosition: row.symbolPosition,
      agentConfirmEnabled: row.agentConfirmEnabled,
    });
  }

  async upsertPreferences(
    userId: string,
    preferences: UserPreferences,
  ): Promise<void> {
    const now = new Date();
    await this.dbClient.db
      .insert(userPreferences)
      .values({
        userId,
        baseCurrency: preferences.baseCurrency,
        timezone: preferences.timezone,
        locale: preferences.locale,
        thousandsSeparator: preferences.thousandsSeparator,
        decimalSeparator: preferences.decimalSeparator,
        symbolPosition: preferences.symbolPosition,
        agentConfirmEnabled: preferences.agentConfirmEnabled,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          baseCurrency: preferences.baseCurrency,
          timezone: preferences.timezone,
          locale: preferences.locale,
          thousandsSeparator: preferences.thousandsSeparator,
          decimalSeparator: preferences.decimalSeparator,
          symbolPosition: preferences.symbolPosition,
          agentConfirmEnabled: preferences.agentConfirmEnabled,
          updatedAt: now,
        },
      });
  }

  async createSession(session: StoredSession): Promise<void> {
    await this.dbClient.db.insert(sessions).values({
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      lastSeenAt: session.createdAt,
    });
  }

  async findSessionById(sessionId: string): Promise<StoredSession | null> {
    const rows = await this.dbClient.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      userId: row.userId,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  }

  async deleteSessionById(sessionId: string): Promise<void> {
    await this.dbClient.db.delete(sessions).where(eq(sessions.id, sessionId));
  }
}
