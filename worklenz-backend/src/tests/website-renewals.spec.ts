jest.unmock("../shared/website-renewals");

import {
  daysBefore,
  daysRemainingColor,
  nearerExpiry,
  normalizeDomain,
  parseIntervals,
  parseManagedBy,
  parseOptionalDate,
} from "../shared/website-renewals";

describe("website renewals helpers", () => {
  it("treats Wecypher as the us ownership value", () => {
    expect(parseManagedBy("Wecypher")).toBe("us");
    expect(parseManagedBy("us")).toBe("us");
    expect(parseManagedBy("client")).toBe("client");
    expect(parseManagedBy("other")).toBeUndefined();
  });

  it("normalizes a URL down to a hostname", () => {
    expect(normalizeDomain(" HTTPS://WWW.Example.com/path?q=1 ")).toBe("example.com");
    expect(normalizeDomain("not a domain")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
  });

  it("rejects impossible calendar dates", () => {
    expect(parseOptionalDate("2026-02-31")).toBeUndefined();
    expect(parseOptionalDate("2026-02-28")).toBe("2026-02-28");
    expect(parseOptionalDate("")).toBeNull();
  });

  it("counts whole days until expiry, including the expiry day and month boundaries", () => {
    expect(daysBefore("2026-03-01", "2026-02-28")).toBe(1);
    expect(daysBefore("2026-10-06", "2026-10-06")).toBe(0);
    expect(daysBefore("2026-10-05", "2026-10-06")).toBe(-1);
  });

  it("uses the sooner of the two expiry dates", () => {
    expect(nearerExpiry("2026-12-01", "2026-11-01")).toBe("2026-11-01");
    expect(nearerExpiry(null, "2026-11-01")).toBe("2026-11-01");
    expect(nearerExpiry(null, null)).toBeNull();
  });

  it("color bands match the list rules", () => {
    expect(daysRemainingColor(-1)).toBe("error");
    expect(daysRemainingColor(6)).toBe("error");
    expect(daysRemainingColor(7)).toBe("warning");
    expect(daysRemainingColor(29)).toBe("warning");
    expect(daysRemainingColor(30)).toBe("gold");
    expect(daysRemainingColor(59)).toBe("gold");
    expect(daysRemainingColor(60)).toBe("success");
    expect(daysRemainingColor(null)).toBeNull();
  });

  it("keeps reminder intervals unique and sorted", () => {
    expect(parseIntervals([7, 30, 7, 0])).toEqual([30, 7, 0]);
    expect(parseIntervals([])).toBeUndefined();
    expect(parseIntervals([400])).toBeUndefined();
  });
});
