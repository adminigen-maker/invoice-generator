import { describe, it, expect } from "vitest";
import { ilikeTerm } from "@/lib/list-query";

describe("ilikeTerm", () => {
  it("wraps a term in PostgREST wildcards", () => {
    expect(ilikeTerm("acme")).toBe("*acme*");
  });

  it("returns null for empty / missing input", () => {
    expect(ilikeTerm("")).toBeNull();
    expect(ilikeTerm("   ")).toBeNull();
    expect(ilikeTerm(undefined)).toBeNull();
    expect(ilikeTerm(null)).toBeNull();
  });

  it("strips characters that would break the .or() filter grouping", () => {
    // commas, parens, quotes, wildcards and backslash are all removed
    expect(ilikeTerm('a,b(c)"*%\\d')).toBe("*abcd*");
  });

  it("keeps spaces and dots inside the term", () => {
    expect(ilikeTerm("acme corp")).toBe("*acme corp*");
    expect(ilikeTerm("3.5")).toBe("*3.5*");
  });
});
