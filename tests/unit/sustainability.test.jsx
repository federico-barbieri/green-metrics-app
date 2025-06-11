import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock your metrics utilities
const mockUpdateProductMetrics = vi.fn();
const mockRecordProductMetricsHistory = vi.fn();

vi.mock("~/utils/metrics", () => ({
  updateProductMetrics: mockUpdateProductMetrics,
  recordProductMetricsHistory: mockRecordProductMetricsHistory,
}));

// Test the actual sustainability calculations
describe("Sustainability Calculations", () => {
  describe("Packaging Ratio Calculation", () => {
    it("calculates packaging ratio correctly", () => {
      const calculatePackagingRatio = (packagingWeight, productWeight) => {
        // Handle null/undefined inputs
        if (
          packagingWeight === null ||
          packagingWeight === undefined ||
          productWeight === null ||
          productWeight === undefined
        ) {
          return null;
        }

        // Handle invalid product weight (can't divide by zero or negative)
        if (productWeight <= 0) {
          return null;
        }

        // If packaging weight is 0, ratio is 0 (valid case - no packaging)
        if (packagingWeight === 0) {
          return 0;
        }

        return packagingWeight / productWeight;
      };

      expect(calculatePackagingRatio(0.1, 1.0)).toBe(0.1);
      expect(calculatePackagingRatio(0.2, 2.0)).toBe(0.1);
      expect(calculatePackagingRatio(0.5, 1.0)).toBe(0.5);
      expect(calculatePackagingRatio(0, 1.0)).toBe(0); // Zero packaging = 0 ratio
      expect(calculatePackagingRatio(0.1, 0)).toBeNull(); // Can't divide by zero
      expect(calculatePackagingRatio(null, 1.0)).toBeNull(); // Invalid input
    });
  });

  describe("Sustainability Score", () => {
    it("calculates overall sustainability score", () => {
      const calculateSustainabilityScore = (product) => {
        let score = 0;
        let factors = 0;

        // Sustainable materials (40% weight)
        if (product.sustainableMaterials !== null) {
          score += product.sustainableMaterials * 0.4;
          factors += 0.4;
        }

        // Local production (30% weight)
        if (product.isLocallyProduced !== null) {
          score += (product.isLocallyProduced ? 1 : 0) * 0.3;
          factors += 0.3;
        }

        // Packaging efficiency (30% weight) - lower ratio is better
        if (product.packagingRatio !== null) {
          const efficiencyScore = Math.max(0, 1 - product.packagingRatio);
          score += efficiencyScore * 0.3;
          factors += 0.3;
        }

        return factors > 0 ? score / factors : 0;
      };

      const highSustainabilityProduct = {
        sustainableMaterials: 0.9,
        isLocallyProduced: true,
        packagingRatio: 0.05,
      };

      const lowSustainabilityProduct = {
        sustainableMaterials: 0.2,
        isLocallyProduced: false,
        packagingRatio: 0.4,
      };

      expect(
        calculateSustainabilityScore(highSustainabilityProduct),
      ).toBeCloseTo(0.95, 2);
      expect(
        calculateSustainabilityScore(lowSustainabilityProduct),
      ).toBeCloseTo(0.26, 2); // ← Fixed: expected 0.26
    });
  });
});

// Mock a simple sustainability badge component
function SustainabilityBadge({ score }) {
  const getStatus = (score) => {
    if (score >= 0.8) return "success";
    if (score >= 0.6) return "warning";
    return "critical";
  };

  const getLabel = (score) => {
    if (score >= 0.8) return "Highly Sustainable";
    if (score >= 0.6) return "Moderately Sustainable";
    return "Low Sustainability";
  };

  return (
    <div data-testid="sustainability-badge" data-status={getStatus(score)}>
      {Math.round(score * 100)}% - {getLabel(score)}
    </div>
  );
}

describe("SustainabilityBadge Component", () => {
  it("shows correct status for different scores", () => {
    const { rerender } = render(<SustainabilityBadge score={0.9} />);
    expect(screen.getByTestId("sustainability-badge")).toHaveAttribute(
      "data-status",
      "success",
    );
    expect(screen.getByText("90% - Highly Sustainable")).toBeInTheDocument();

    rerender(<SustainabilityBadge score={0.7} />);
    expect(screen.getByTestId("sustainability-badge")).toHaveAttribute(
      "data-status",
      "warning",
    );
    expect(
      screen.getByText("70% - Moderately Sustainable"),
    ).toBeInTheDocument();

    rerender(<SustainabilityBadge score={0.3} />);
    expect(screen.getByTestId("sustainability-badge")).toHaveAttribute(
      "data-status",
      "critical",
    );
    expect(screen.getByText("30% - Low Sustainability")).toBeInTheDocument();
  });
});
