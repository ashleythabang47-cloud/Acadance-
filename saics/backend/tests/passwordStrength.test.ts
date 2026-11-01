import { getPasswordStrength } from "../src/utils/passwordStrength";

describe("getPasswordStrength", () => {
  it.each([
    ["abc", "weak"],
    ["Password1", "decent"],
    ["Tr0ub4dor&Horse-92", "strong"],
  ])("classifies the required password example", (password, level) => {
    expect(getPasswordStrength(password).level).toBe(level);
  });
});
