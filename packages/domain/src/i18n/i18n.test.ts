import { describe, expect, it } from "vitest";
import { resolveLocale, t } from "./i18n.js";
import { messagesEn } from "./messages.en.js";
import { messagesEs } from "./messages.es.js";

describe("i18n engine (ES / EN typed catalogs and interpolation)", () => {
  it("resolves browser/user locale strings with safe fallback", () => {
    expect(resolveLocale("es")).toBe("es");
    expect(resolveLocale("es-ES")).toBe("es");
    expect(resolveLocale("EN_US")).toBe("en");
    expect(resolveLocale("fr-FR")).toBe("es");
    expect(resolveLocale(undefined, "en")).toBe("en");
  });

  it("maintains strict 1:1 key parity and non-empty translations across ES and EN", () => {
    const esKeys = Object.keys(messagesEs).sort();
    const enKeys = Object.keys(messagesEn).sort();

    expect(esKeys).toEqual(enKeys);
    expect(esKeys.length).toBeGreaterThan(15);

    for (const key of esKeys) {
      expect(
        messagesEs[key as keyof typeof messagesEs].trim().length,
      ).toBeGreaterThan(0);
      expect(
        messagesEn[key as keyof typeof messagesEn].trim().length,
      ).toBeGreaterThan(0);
    }
  });

  it("interpolates agent impact confirmation messages accurately in ES and EN", () => {
    expect(
      t("es", "agent.confirm.income", {
        amount: "2.000,00 €",
        balanceBefore: "3.000,00 €",
        balanceAfter: "5.000,00 €",
        description: "Pago de Y por trabajo X",
      }),
    ).toBe(
      "Nuevo ingreso de 2.000,00 €: tu saldo pasará de 3.000,00 € a 5.000,00 € (Pago de Y por trabajo X).",
    );

    expect(
      t("en", "agent.confirm.income", {
        amount: "$2,000.00",
        balanceBefore: "$3,000.00",
        balanceAfter: "$5,000.00",
        description: "Payment from Y for job X",
      }),
    ).toBe(
      "New income of $2,000.00: your balance will change from $3,000.00 to $5,000.00 (Payment from Y for job X).",
    );
  });

  it("provides financial guardrail and offline fallback messages in both locales", () => {
    expect(t("es", "agent.guardrail.outOfScope")).toContain("finanzas");
    expect(t("en", "agent.guardrail.outOfScope")).toContain("finance");
    expect(t("es", "sync.offlineManualOnly").length).toBeGreaterThan(10);
    expect(t("en", "sync.offlineManualOnly").length).toBeGreaterThan(10);
  });

  it("never renders literal 'undefined' when a template param is omitted", () => {
    const output = t("es", "agent.confirm.expense", {
      amount: "50,00 €",
      balanceBefore: "500,00 €",
      balanceAfter: "450,00 €",
    });

    expect(output).not.toContain("undefined");
    expect(output).toContain("{{description}}");
  });
});
