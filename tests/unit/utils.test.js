import { describe, it, expect } from "vitest";

// Simple function to test 
function calculateSustainabilityPercentage(decimal) {
  if (typeof decimal !== "number" || decimal < 0 || decimal > 1) {
    return 0;
  }
  return Math.round(decimal * 100);
}

describe("Sustainability Utils", () => {
  it("converts decimal to percentage correctly", () => {
    expect(calculateSustainabilityPercentage(0.8)).toBe(80);
    expect(calculateSustainabilityPercentage(0.456)).toBe(46);
    expect(calculateSustainabilityPercentage(1)).toBe(100);
    expect(calculateSustainabilityPercentage(0)).toBe(0);
  });

  it("handles invalid input gracefully", () => {
    expect(calculateSustainabilityPercentage(-0.1)).toBe(0);
    expect(calculateSustainabilityPercentage(1.1)).toBe(0);
    expect(calculateSustainabilityPercentage("invalid")).toBe(0);
    expect(calculateSustainabilityPercentage(null)).toBe(0);
  });
});
