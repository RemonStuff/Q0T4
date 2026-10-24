import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { root } from "./support";

const read = (file: string) => readFileSync(join(root, file), "utf8");
const manifest = JSON.parse(read("package.json")) as {
  displayName: string;
  version: string;
  license?: string;
  icon?: string;
  categories?: string[];
  repository?: { url?: string };
  bugs?: { url?: string };
  engines: { vscode: string };
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  contributes: {
    configuration: { properties: Record<string, unknown> };
    commands: { command: string; title: string }[];
    chatParticipants: { commands: { name: string }[] }[];
  };
};
const readme = read("README.md");

describe("marketplace metadata in package.json", () => {
  it("has the display name, an icon, categories and a repository URL", () => {
    expect(manifest.displayName).toBe("Q0T4");
    expect(manifest.categories?.length).toBeGreaterThan(0);
    expect(manifest.repository?.url).toMatch(/^https:\/\/github\.com\/RemonStuff\/Q0T4/);
    expect(manifest.bugs?.url).toMatch(/issues$/);
    expect(manifest.license).toBe("MIT");
  });

  it("points at a 128x128 PNG icon that exists", () => {
    expect(manifest.icon).toBe("images/icon.png");
    const png = readFileSync(join(root, "images", "icon.png"));
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(128);
    expect(png.readUInt32BE(20)).toBe(128);
  });

  it("requires a VS Code version that matches @types/vscode", () => {
    expect(manifest.engines.vscode).toBe(`^${manifest.devDependencies["@types/vscode"]}`);
  });

  it("is version 0.1.x", () => {
    expect(manifest.version).toMatch(/^0\.1\.\d+$/);
  });

  it("packages with the license included", () => {
    expect(manifest.scripts["package"]).not.toContain("--skip-license");
    expect(existsSync(join(root, "LICENSE"))).toBe(true);
    expect(read("LICENSE")).toContain("MIT License");
  });
});

describe("README documents what package.json contributes", () => {
  it("documents every q0t4.* setting", () => {
    for (const key of Object.keys(manifest.contributes.configuration.properties)) {
      expect(readme, key).toContain(`\`${key}\``);
    }
  });

  it("documents every contributed command by its title", () => {
    for (const { title, command } of manifest.contributes.commands) {
      expect(readme, command).toContain(`Q0T4: ${title}`);
    }
  });

  it("documents every chat command", () => {
    for (const { name } of manifest.contributes.chatParticipants.flatMap((p) => p.commands)) {
      expect(readme, name).toContain(`/${name}`);
    }
  });

  it("states the known limits", () => {
    for (const phrase of [
      "Inline completions",
      "won't exactly match",
      "overshoot",
      "git remote",
      "per machine",
    ]) {
      expect(readme, phrase).toContain(phrase);
    }
  });
});

describe("CHANGELOG", () => {
  const changelog = read("CHANGELOG.md");

  it("follows Keep a Changelog and has the current version", () => {
    expect(changelog).toContain("keepachangelog.com");
    expect(changelog).toContain("## [Unreleased]");
    expect(changelog).toMatch(new RegExp(`## \\[${manifest.version.replaceAll(".", "\\.")}\\]`));
  });
});

describe("release workflow", () => {
  const workflow = read(".github/workflows/release.yml");

  it("runs on version tags and can be dry-run by hand", () => {
    expect(workflow).toMatch(/tags:\s*\n\s*- "v\*"/);
    expect(workflow).toContain("workflow_dispatch");
  });

  it("runs the full CI first, then packages and creates the release with the .vsix", () => {
    expect(workflow).toContain("uses: ./.github/workflows/ci.yml");
    expect(workflow).toContain("needs: ci");
    expect(workflow).toContain("vsce package");
    expect(workflow).toContain("gh release create");
    expect(workflow).toContain("q0t4-*.vsix");
  });

  it("marks a tag with a pre-release suffix as a GitHub pre-release", () => {
    expect(workflow).toContain("--prerelease");
  });

  it("checks that the tag matches package.json before releasing", () => {
    expect(workflow).toMatch(/package\.json/);
    expect(workflow).toContain("GITHUB_REF_NAME");
  });

  it("never publishes to a marketplace in v0.1", () => {
    expect(workflow).not.toMatch(/vsce publish|ovsx publish/);
  });

  it("is callable CI: ci.yml accepts workflow_call", () => {
    expect(read(".github/workflows/ci.yml")).toContain("workflow_call");
  });
});
