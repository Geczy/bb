import { describe, expect, it } from "vitest";
import { MEETUP_DECLINE, surveyAnswers, validateSurvey } from "./survey";

const contact = { name: ["Ada Lovelace"], email: ["ada@example.test"] };

describe("community survey submission rules", () => {
  it("allows all questions to be skipped but requires valid contact details", () => {
    expect(validateSurvey(contact)).toEqual({});
    expect(validateSurvey({})).toEqual({
      name: "Please enter your name.",
      email: "Please enter your email.",
    });
    expect(
      validateSurvey({ ...contact, email: ["invalid"] }).email,
    ).toBeTruthy();
    expect(validateSurvey({ ...contact, name: [" "] }).name).toBeTruthy();
    expect(
      validateSurvey({
        ...contact,
        email: ["a@example.test", "b@example.test"],
      }).email,
    ).toBeTruthy();
  });
  it("allows any involvement combination except the exclusive decline", () => {
    expect(
      validateSurvey({
        ...contact,
        meetup: [
          "I'd come",
          "I'd help host",
          "I'd give a short talk or demo",
          "I could offer a space",
        ],
      }),
    ).toEqual({});
    expect(validateSurvey({ ...contact, meetup: [MEETUP_DECLINE] })).toEqual(
      {},
    );
    expect(
      validateSurvey({ ...contact, meetup: ["I'd come", MEETUP_DECLINE] })
        .meetup,
    ).toBeTruthy();
    expect(
      validateSurvey({ ...contact, meetup: ["I'd come", "I'd come"] }).meetup,
    ).toBeTruthy();
    expect(
      validateSurvey({ ...contact, role: ["Invented"] }).role,
    ).toBeTruthy();
    expect(
      validateSurvey({ ...contact, city: ["x".repeat(251)] }).city,
    ).toBeTruthy();
  });
  it("stores contact and selected Other detail with answers, excluding unrelated fields", () => {
    expect(
      surveyAnswers({
        ...contact,
        discovery: ["Other"],
        discovery_other: ["Example"],
        role: ["Student"],
        role_other: ["Ignored"],
        submission_id: ["not-an-answer"],
        address: ["not-stored"],
      }),
    ).toEqual({
      ...contact,
      discovery: ["Other"],
      discovery_other: ["Example"],
      role: ["Student"],
    });
  });
});
