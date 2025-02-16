import { toMatchFile } from "jest-file-snapshot";
import { expect } from "@jest/globals";

expect.extend({ toMatchFile });

declare module "expect" {
  interface Matchers<R, T> {
    toMatchFile(filename: string): R;
  }
}
