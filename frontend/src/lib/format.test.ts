import { describe, expect, it } from "vitest";

import { formatDate, formatNumber, formatPercent, formatPrice, toNumber } from "./format";

describe("toNumber", () => {
  it("coerces numeric strings", () => {
    expect(toNumber("100.5")).toBe(100.5);
    expect(toNumber(42)).toBe(42);
  });

  it("returns null for empty / invalid / nullish", () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber("")).toBeNull();
    expect(toNumber("abc")).toBeNull();
  });
});

describe("formatPrice", () => {
  it("fixes to 2 decimals by default", () => {
    expect(formatPrice("805")).toBe("805.00");
    expect(formatPrice(805.456, { digits: 1 })).toBe("805.5");
  });

  it("uses the fallback for invalid input", () => {
    expect(formatPrice(null)).toBe("—");
    expect(formatPrice("x", { fallback: "n/a" })).toBe("n/a");
  });
});

describe("formatPercent", () => {
  it("applies the multiplier", () => {
    expect(formatPercent("0.0215", { multiplier: 100 })).toBe("2.15%");
    expect(formatPercent("1.19")).toBe("1.19%");
  });

  it("falls back when invalid", () => {
    expect(formatPercent(null)).toBe("—");
  });
});

describe("formatNumber", () => {
  it("adds thousands separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("falls back when invalid", () => {
    expect(formatNumber(undefined)).toBe("—");
  });
});

describe("formatDate", () => {
  it("formats a valid ISO date", () => {
    expect(formatDate("2024-01-05T00:00:00Z", { locale: "en-US" })).toMatch(/2024/);
  });

  it("falls back on missing / invalid", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });
});
