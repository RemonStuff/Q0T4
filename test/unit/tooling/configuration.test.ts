import { COMMAND_IDS } from "../../../src/core/commands";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseConfig } from "../../../src/core/subjects/parseConfig";
import { root } from "./support";

interface Property {
  type?: string;
  default?: unknown;
  scope?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  markdownDescription?: string;
  description?: string;
}

const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  contributes: {
    configuration: { title: string; properties: Record<string, Property> };
    commands: { command: string; title: string; category: string }[];
  };
};
const properties = manifest.contributes.configuration.properties;

const SETTINGS = [
  "subjects",
  "defaultLimit",
  "fallbackSubject",
  "resetDay",
  "warnAtPercent",
  "dailyPaceWarning",
  "includeHistory",
] as const;

describe("package.json configuration", () => {
  it("declares every no-pool setting under q0t4.*", () => {
    expect(Object.keys(properties).sort()).toEqual(SETTINGS.map((key) => `q0t4.${key}`).sort());
    expect(manifest.contributes.configuration.title).toBe("Q0T4");
  });

  it("has defaults that match the core defaults", () => {
    for (const key of SETTINGS) {
      expect(properties[`q0t4.${key}`]?.default, key).toEqual(DEFAULT_CONFIG[key]);
    }
  });

  it("the declared defaults parse to the default config without warnings", () => {
    const raw = Object.fromEntries(
      SETTINGS.map((key) => [key, properties[`q0t4.${key}`]?.default]),
    );
    expect(parseConfig(raw)).toEqual({ config: DEFAULT_CONFIG, warnings: [] });
  });

  it("describes every setting and gives subjects an owner/repo example", () => {
    for (const key of SETTINGS) {
      const property = properties[`q0t4.${key}`];
      expect(property?.markdownDescription ?? property?.description, key).toBeTruthy();
    }
    expect(properties["q0t4.subjects"]?.markdownDescription).toContain("RemonStuff/Q0T4");
  });

  it("can only be set by the user, so a cloned repo cannot raise its own budget", () => {
    for (const key of SETTINGS) expect(properties[`q0t4.${key}`]?.scope, key).toBe("application");
  });

  it("limits the enum and ranges to what parseConfig accepts", () => {
    expect(properties["q0t4.resetDay"]?.enum).toEqual([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]);
    for (const key of ["warnAtPercent", "dailyPaceWarning"]) {
      expect(properties[`q0t4.${key}`]).toMatchObject({ type: "number", minimum: 1, maximum: 100 });
    }
    expect(properties["q0t4.defaultLimit"]).toMatchObject({ type: "number", minimum: 0 });
  });
});

describe("palette commands in package.json", () => {
  it("declares the three commands with the Q0T4 category", () => {
    expect(manifest.contributes.commands).toEqual([
      { command: COMMAND_IDS.showUsage, title: "Show Usage", category: "Q0T4" },
      { command: COMMAND_IDS.resetWeek, title: "Reset This Week", category: "Q0T4" },
      { command: COMMAND_IDS.editSubjects, title: "Edit Subjects", category: "Q0T4" },
    ]);
  });
});
