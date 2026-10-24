import { z } from "zod";

export const SURVEY_TITLE = "bb community survey";
export const SURVEY_DESCRIPTION =
  "Thanks for being part of the bb community. We'd like to send you a bb hat and stickers as a thank-you.";
export const SURVEY_PURPOSE =
  "It takes about 2 minutes, and it tells us who uses bb and where to start bb meetups.";
export const MEETUP_FRAMING =
  "We're starting bb meetups: small get-togethers to build with agents and see how other people work. Tell us where you are so we know where to start.";
export const MEETUP_DECLINE = "Not for me right now";
export const SOLD_OUT =
  "We've given out all the hats and stickers for now. Thank you for answering.";

type Question = {
  name: string;
  label: string;
  type: "radio" | "checkbox" | "text";
  options: readonly string[];
  placeholder: string;
};

export const surveyQuestions: readonly Question[] = [
  {
    name: "discovery",
    label: "How did you first hear about bb?",
    type: "radio",
    options: [
      "A friend or coworker",
      "X (Twitter)",
      "Google or another search engine",
      "GitHub",
      "Hacker News",
      "Product Hunt",
      "A newsletter or blog post",
      "I don't remember",
      "Other",
    ],
    placeholder: "",
  },
  {
    name: "work",
    label: "How many people use bb where you work, including you?",
    type: "radio",
    options: [
      "I don't use bb for work",
      "Just me",
      "2–4 people",
      "5 or more",
      "I'm not sure",
    ],
    placeholder: "",
  },
  {
    name: "role",
    label: "Which of these best describes your current job?",
    type: "radio",
    options: [
      "Developer or engineer",
      "Engineering manager",
      "Founder or executive",
      "Product manager",
      "Designer",
      "Data or business analyst",
      "Student",
      "Other",
    ],
    placeholder: "",
  },
  {
    name: "city",
    label: "What city do you live in or near?",
    type: "text",
    options: [],
    placeholder: "City, country",
  },
  {
    name: "meetup",
    label:
      "If there were a bb meetup near you, how would you like to be involved?",
    type: "checkbox",
    options: [
      "I'd come",
      "I'd help host",
      "I'd give a short talk or demo",
      "I could offer a space",
      MEETUP_DECLINE,
    ],
    placeholder: "",
  },
];

export type FormValues = Record<string, string[]>;
export type FormErrors = Record<string, string>;
export const surveyFields = [
  ...surveyQuestions.map((question) => question.name),
  "discovery_other",
  "role_other",
  "name",
  "email",
];

export function validateSurvey(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  for (const question of surveyQuestions) {
    const selected = values[question.name] ?? [];
    if (question.type !== "checkbox" && selected.length > 1) {
      errors[question.name] = "Choose one answer.";
    } else if (selected.some((value) => value.length > 250)) {
      errors[question.name] = "Please shorten your answer.";
    } else if (
      question.options.length &&
      selected.some((value) => !question.options.includes(value))
    ) {
      errors[question.name] = "Choose one of the listed answers.";
    } else if (new Set(selected).size !== selected.length) {
      errors[question.name] = "Choose each answer only once.";
    } else if (
      question.name === "meetup" &&
      selected.includes(MEETUP_DECLINE) &&
      selected.length > 1
    ) {
      errors.meetup = 'Choose involvement options or "Not for me right now".';
    }
  }
  for (const name of ["discovery_other", "role_other", "name", "email"]) {
    const selected = values[name] ?? [];
    if (selected.length > 1 || selected.some((value) => value.length > 250)) {
      errors[name] = "Please use one answer of up to 250 characters.";
    }
  }
  if (!values.name?.[0]?.trim()) errors.name = "Please enter your name.";
  if (!values.email?.[0]?.trim()) errors.email = "Please enter your email.";
  else if (!z.email().safeParse(values.email[0]).success)
    errors.email = "Please enter a valid email.";
  return errors;
}

export function surveyAnswers(values: FormValues): FormValues {
  const answers: FormValues = {};
  for (const name of surveyFields) {
    if (
      name.endsWith("_other") &&
      !values[name.slice(0, -6)]?.includes("Other")
    )
      continue;
    const selected = values[name]?.filter(Boolean) ?? [];
    if (selected.length) answers[name] = selected;
  }
  return answers;
}
