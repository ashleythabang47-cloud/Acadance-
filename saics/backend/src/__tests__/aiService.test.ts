import { extractJson } from "../services/aiService";

describe("extractJson", () => {
  it("returns clean JSON unchanged", () => {
    const input = '[{"a":1}]';
    expect(extractJson(input)).toBe(input);
  });

  it("strips prose wrapped around a JSON array", () => {
    const input = 'Sure, here you go:\n[{"a":1}]\nHope that helps!';
    expect(extractJson(input)).toBe('[{"a":1}]');
  });

  it("strips markdown code fences", () => {
    const input = '```json\n[{"a":1}]\n```';
    expect(extractJson(input)).toBe('[{"a":1}]');
  });

  it("falls back to the raw text if no array is found", () => {
    const input = "no json here";
    expect(extractJson(input)).toBe("no json here");
  });
});
