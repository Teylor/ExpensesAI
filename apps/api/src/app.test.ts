import { DOMAIN_CONTRACT_VERSION } from "@agenticf/domain";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";

describe("Fastify stateless app (/health, /ready, security headers, error handling)", () => {
  it("returns 200 on GET /health with stateless metadata and Helmet security headers", async () => {
    const app = await buildApp({
      corsOrigin: "http://localhost:5173",
      logLevel: "silent",
      checkDatabase: async () => true,
    });

    try {
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
      expect(response.headers["x-content-type-options"]).toBe("nosniff");

      const body = response.json();
      expect(body.status).toBe("ok");
      expect(body.service).toBe("agenticf-api");
      expect(body.stateless).toBe(true);
      expect(body.domainVersion).toBe(DOMAIN_CONTRACT_VERSION);
      expect(typeof body.timestamp).toBe("string");
    } finally {
      await app.close();
    }
  });

  it("returns 200 on GET /ready when database check passes", async () => {
    const app = await buildApp({
      corsOrigin: "http://localhost:5173",
      logLevel: "silent",
      checkDatabase: async () => true,
    });

    try {
      const response = await app.inject({ method: "GET", url: "/ready" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: "ready",
        database: "up",
      });
    } finally {
      await app.close();
    }
  });

  it("returns 503 on GET /ready when database check fails without leaking secrets", async () => {
    const app = await buildApp({
      corsOrigin: "http://localhost:5173",
      logLevel: "silent",
      checkDatabase: async () => {
        const simulatedUrl = [
          "postgresql://",
          "agenticf",
          ":",
          "topsecret",
          "@db:5432/agenticf",
        ].join("");
        throw new Error(`Connection refused for ${simulatedUrl}`);
      },
    });

    try {
      const response = await app.inject({ method: "GET", url: "/ready" });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        status: "not_ready",
        database: "down",
      });
      expect(response.body).not.toContain("topsecret");
      expect(response.body).not.toContain("postgresql://");
    } finally {
      await app.close();
    }
  });

  it("captures unexpected 500 errors via onError hook and hides internal details", async () => {
    const onError = vi.fn();
    const app = await buildApp({
      corsOrigin: "http://localhost:5173",
      logLevel: "silent",
      checkDatabase: async () => true,
      onError,
    });

    app.get("/test-boom", async () => {
      throw new Error("Sensitive internal failure password=supersecret");
    });

    try {
      const response = await app.inject({ method: "GET", url: "/test-boom" });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: "INTERNAL_SERVER_ERROR",
        message: "Unexpected internal error",
      });
      expect(response.body).not.toContain("supersecret");
      expect(onError).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
