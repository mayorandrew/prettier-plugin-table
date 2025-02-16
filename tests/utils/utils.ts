import { readFileSync } from "node:fs";
import * as path from "node:path";
import { URL, fileURLToPath } from "node:url";
import type { Options } from "prettier";
import { format } from "prettier";
import { expect } from "@jest/globals";
import * as plugin from "../../src/index.js";

export async function expectSnapshot(
  metaUrl: string,
  source: string,
  suffix?: string,
  formatOptions: Options = {},
): Promise<void> {
  const rootDir = fileURLToPath(new URL(".", metaUrl));

  const sourcePath = path.resolve(rootDir, source);
  const code = readFileSync(sourcePath, "utf8");

  const actual = await format(code, {
    parser: "typescript",
    plugins: [plugin],
    ...formatOptions,
  });

  const dirname = path.dirname(sourcePath);
  const basename = path.basename(sourcePath);

  suffix ??= '.formatted';

  expect(actual).toMatchFile(path.join(dirname, basename + suffix));
}
