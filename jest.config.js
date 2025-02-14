/* eslint-env node */
// module.exports = {
//   testEnvironment: "node",
//   roots: ["<rootDir>/test"],
//   testMatch: ["**/*.test.ts"],
//   transform: {
//     "^.+\\.tsx?$": "ts-jest",
//   },
// };

export const testEnvironment = "node";
export const roots = ["<rootDir>/test"];
export const testMatch = ["**/*.test.ts"];
export const transform = {
  "^.+\\.tsx?$": "ts-jest",
};
