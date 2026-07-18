import { describe, expect, it } from "vitest";
import { chapterForCpt, chaptersForCpts, listNcciSections } from "./ncci";

describe("chapterForCpt — CPT/HCPCS → NCCI chapter router", () => {
  it("maps each CPT surgical range to its body-system chapter", () => {
    expect(chapterForCpt("00100")).toBe("02"); // anesthesia
    expect(chapterForCpt("01999")).toBe("02");
    expect(chapterForCpt("11042")).toBe("03"); // integumentary
    expect(chapterForCpt("27447")).toBe("04"); // musculoskeletal (knee arthroplasty)
    expect(chapterForCpt("33533")).toBe("05"); // respiratory/cv
    expect(chapterForCpt("45378")).toBe("06"); // digestive (colonoscopy)
    expect(chapterForCpt("52000")).toBe("07"); // urinary/genital
    expect(chapterForCpt("64483")).toBe("08"); // nervous
    expect(chapterForCpt("71046")).toBe("09"); // radiology
    expect(chapterForCpt("80053")).toBe("10"); // pathology/lab
    expect(chapterForCpt("99204")).toBe("11"); // E/M (medicine)
    expect(chapterForCpt("90471")).toBe("11"); // medicine
  });

  it("maps Category III (NNNNT) and HCPCS Level II codes", () => {
    expect(chapterForCpt("0512T")).toBe("13"); // Category III
    expect(chapterForCpt("G0444")).toBe("11"); // HCPCS screening → medicine
    expect(chapterForCpt("g0442")).toBe("11"); // case-insensitive
  });

  it("returns null for blank or unroutable codes", () => {
    expect(chapterForCpt("")).toBeNull();
    expect(chapterForCpt("   ")).toBeNull();
    expect(chapterForCpt("ABCDE")).toBeNull();
    expect(chapterForCpt("5")).toBeNull(); // below anesthesia range
  });
});

describe("chaptersForCpts — data-driven fan-out", () => {
  // These assertions also verify the knowledge-dir wiring fix: listNcciSections()
  // must find the repo-root ncci-knowledge/ chapters, or the filter returns nothing.
  it("finds the NCCI chapter files on disk", () => {
    const ids = listNcciSections().map((s) => s.id);
    expect(ids).toContain("01");
    expect(ids).toContain("11");
    expect(ids.length).toBeGreaterThanOrEqual(13);
  });

  it("always includes chapter 01 plus the chapters the codes hit", () => {
    const ids = chaptersForCpts(["99204", "G0444"]).map((s) => s.id);
    expect(ids).toContain("01"); // general policies always
    expect(ids).toContain("11"); // E/M + HCPCS → medicine
    expect(ids).not.toContain("04"); // no musculoskeletal code present
  });

  it("fans out to multiple body-system chapters for a mixed claim", () => {
    const ids = chaptersForCpts(["27447", "45378"]).map((s) => s.id).sort();
    expect(ids).toEqual(["01", "04", "06"]);
  });

  it("returns only chapter 01 when no code routes", () => {
    const ids = chaptersForCpts(["", "ZZZ"]).map((s) => s.id);
    expect(ids).toEqual(["01"]);
  });
});
