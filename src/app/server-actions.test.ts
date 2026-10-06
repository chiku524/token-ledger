import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const serverActionFiles = sourceFiles(SRC).filter((path) => /^\s*["']use server["'];/.test(readFileSync(path, "utf8")));

function exportedFunctions(path: string): string[] {
  return [...readFileSync(path, "utf8").matchAll(/^export async function (\w+)/gm)].map((match) => match[1]!);
}

describe("server action coverage", () => {
  it("finds the server action modules", () => {
    expect(serverActionFiles.length).toBeGreaterThanOrEqual(8);
  });

  it.each(serverActionFiles.map((path) => [relative(SRC, path), path]))("%s has a sibling test that exercises every action", (_name, path) => {
    const testPath = path.replace(/\.tsx?$/, ".test.ts");
    expect(existsSync(testPath), `missing ${relative(SRC, testPath)}`).toBe(true);
    const tests = readFileSync(testPath, "utf8");
    const actions = exportedFunctions(path);
    expect(actions.length).toBeGreaterThan(0);
    const untested = actions.filter((name) => !new RegExp(`\\b${name}\\(`).test(tests));
    expect(untested, `actions with no call in ${relative(SRC, testPath)}`).toEqual([]);
  });
});
