import { test } from "@jest/globals";
import { expectSnapshot } from "./utils/utils.mjs";
import { glob } from "glob";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = await glob("**/*.fixture", { cwd: __dirname });
// const fixtures = ['fn_different_widths.js.fixture'];

test.each(fixtures)("%s", async (path) => {
  await expectSnapshot(import.meta.url, path);
});
