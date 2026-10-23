import { describe, expect, it } from "vitest";
import {
  followUpFields,
  surveyAnswers,
  validateSurvey,
  WORK_CHAT,
} from "./survey";

describe("community survey submission rules", () => {
  it("allows every question and follow-up to be omitted", () => {
    expect(validateSurvey({})).toEqual({});
    expect(validateSurvey({ role: ["Other"] })).toEqual({});
    expect(validateSurvey({ opt_in: [WORK_CHAT] })).toEqual({});
  });
  it("rejects a fourth merch pick, duplicate choices, invented options and oversized text", () => {
    expect(
      validateSurvey({ merch: ["T-shirt", "Hoodie", "Tote", "Mug"] }).merch,
    ).toBe("Pick up to 3");
    expect(validateSurvey({ merch: ["T-shirt", "Hoodie", "Tote"] })).toEqual(
      {},
    );
    expect(validateSurvey({ merch: ["Mug", "Mug"] }).merch).toBeTruthy();
    expect(validateSurvey({ role: ["Invented"] }).role).toBeTruthy();
    expect(validateSurvey({ city: ["x".repeat(251)] }).city).toBeTruthy();
  });
  it.each([
    [{}, { discord: false, company: false }],
    [
      { meetup: ["Yes, in person in my city"] },
      { discord: true, company: false },
    ],
    [{ meetup: ["Yes, a remote one"] }, { discord: true, company: false }],
    [
      { meetup: ["I'd help someone else run one"] },
      { discord: false, company: false },
    ],
    [{ opt_in: ["Early test builds"] }, { discord: true, company: false }],
    [{ opt_in: [WORK_CHAT] }, { discord: true, company: true }],
  ])(
    "collects follow-up details only with the matching opt-in",
    (values, expected) => {
      expect(followUpFields(values)).toEqual(expected);
      const answers = surveyAnswers({
        ...values,
        discord: ["tester"],
        company: ["Example"],
        submission_id: ["not-an-answer"],
      });
      expect(answers.discord).toEqual(
        expected.discord ? ["tester"] : undefined,
      );
      expect(answers.company).toEqual(
        expected.company ? ["Example"] : undefined,
      );
      expect(answers.submission_id).toBeUndefined();
    },
  );
});
