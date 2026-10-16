jest.unmock("../services/proof-reader-openai");

import {
  buildProofReaderInstruction,
  getProofReaderModel,
  parseProofReaderResponse,
} from "../services/proof-reader-openai";

describe("proof reader openai helpers", () => {
  const originalModel = process.env.OPENAI_MODEL;

  afterEach(() => {
    if (originalModel === undefined) {
      delete process.env.OPENAI_MODEL;
    } else {
      process.env.OPENAI_MODEL = originalModel;
    }
  });

  it("defaults to the cheapest vision model and honors an override", () => {
    delete process.env.OPENAI_MODEL;
    expect(getProofReaderModel()).toBe("gpt-5-nano");
    process.env.OPENAI_MODEL = " gpt-5-mini ";
    expect(getProofReaderModel()).toBe("gpt-5-mini");
  });

  it("asks for the main prompt first, then each check in order", () => {
    const instruction = buildProofReaderInstruction("Check the brand colors.", [
      { label: "Logo", prompt: "Is the logo fully visible?" },
      { label: "Type", prompt: "Is the headline readable?" },
    ]);

    expect(instruction.indexOf("Check the brand colors.")).toBeLessThan(instruction.indexOf("1. Logo:"));
    expect(instruction.indexOf("1. Logo:")).toBeLessThan(instruction.indexOf("2. Type:"));
  });

  it("reads structured notes from the responses payload", () => {
    const notes = parseProofReaderResponse({
      output_text: JSON.stringify({
        results: [
          { label: "Main prompt", note: "The palette matches the brief." },
          { label: "Logo", note: "The logo is cut off on the right." },
        ],
      }),
    });

    expect(notes).toEqual([
      { label: "Main prompt", note: "The palette matches the brief." },
      { label: "Logo", note: "The logo is cut off on the right." },
    ]);
  });

  it("rejects an empty or incomplete review", () => {
    expect(() => parseProofReaderResponse({ output: [] })).toThrow("empty review");
    expect(() =>
      parseProofReaderResponse({
        output_text: JSON.stringify({ results: [{ label: "Logo", note: "  " }] }),
      })
    ).toThrow("incomplete review");
  });
});
