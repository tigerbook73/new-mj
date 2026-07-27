import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listLayoutFiles,
  readLayoutFile,
  validateLayoutFilename,
  writeLayoutFile,
} from "./layoutFilesPlugin";

describe("layout files dev API", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "layout-files-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("rejects filenames with path separators or the wrong extension", () => {
    expect(validateLayoutFilename("../evil.table-layout.json", dir)).toBeUndefined();
    expect(validateLayoutFilename("sub/dir.table-layout.json", dir)).toBeUndefined();
    expect(validateLayoutFilename("evil.json", dir)).toBeUndefined();
    expect(validateLayoutFilename("1starts-with-digit.table-layout.json", dir)).toBeUndefined();
    expect(validateLayoutFilename("desktop.table-layout.json", dir)).toBe(
      path.join(dir, "desktop.table-layout.json"),
    );
  });

  it("lists an empty (or missing) layouts directory as no files", async () => {
    expect(await listLayoutFiles(dir)).toEqual([]);
    expect(await listLayoutFiles(path.join(dir, "does-not-exist"))).toEqual([]);
  });

  it("writes a new file, then lists and reads it back", async () => {
    const written = await writeLayoutFile(dir, "desktop.table-layout.json", '{"name":"desktop"}');
    expect(written).toMatchObject({ name: "desktop.table-layout.json" });
    expect(typeof written?.mtimeMs).toBe("number");

    const files = await listLayoutFiles(dir);
    expect(files).toEqual([{ name: "desktop.table-layout.json", mtimeMs: written!.mtimeMs }]);

    expect(await readLayoutFile(dir, "desktop.table-layout.json")).toBe('{"name":"desktop"}');
  });

  it("overwrites an existing file rather than erroring", async () => {
    await writeLayoutFile(dir, "draft1.table-layout.json", "first");
    const second = await writeLayoutFile(dir, "draft1.table-layout.json", "second");
    expect(second).toBeDefined();
    expect(await readLayoutFile(dir, "draft1.table-layout.json")).toBe("second");
  });

  it("ignores files in the directory that don't match the naming pattern", async () => {
    await fs.writeFile(path.join(dir, "notes.txt"), "hello");
    await writeLayoutFile(dir, "draft1.table-layout.json", "content");
    expect((await listLayoutFiles(dir)).map((entry) => entry.name)).toEqual([
      "draft1.table-layout.json",
    ]);
  });

  it("returns undefined instead of reading/writing outside the layouts directory", async () => {
    expect(await readLayoutFile(dir, "../evil.table-layout.json")).toBeUndefined();
    expect(await writeLayoutFile(dir, "../evil.table-layout.json", "x")).toBeUndefined();
    expect(await fs.readdir(path.dirname(dir))).not.toContain("evil.table-layout.json");
  });

  it("returns undefined for a read of a file that doesn't exist", async () => {
    expect(await readLayoutFile(dir, "missing.table-layout.json")).toBeUndefined();
  });
});
