import { test } from "@jest/globals";
import { expectSnapshot } from "./utils/utils.js";
import { glob } from "glob";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = await glob("**/*.fixture", { cwd: __dirname });
// const fixtures = ['array_simple_table.js.fixture'];

test.each(fixtures)("%s", async (path) => {
  await expectSnapshot(import.meta.url, path);
});
