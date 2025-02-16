/** @type {import('jest').Config} */
const config = {
  moduleFileExtensions: ["js", "json", "ts", "mts", "mjs"],
  collectCoverageFrom: ["<rootDir>/src/**/*.mts", "!<rootDir>/node_modules/"],
  transform: {
    "^.+\\.m?ts$": ["ts-jest", { isolatedModules: true }],
  },
  resolver: 'ts-jest-resolver',
  extensionsToTreatAsEsm: [".mts"],
  testMatch: ["<rootDir>/**/*.test.{mts,ts}"],
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.mts"],
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};

export default config;
