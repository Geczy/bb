export const SURVEY_TITLE = "bb Community Survey";
export const SURVEY_DESCRIPTION =
  "hey 👋 we want to build the bb community around the people actually in it — what you're building, where you are, and whether you'd want a meetup nearby. 8 quick questions, ~2 min, all optional. it's anonymous unless you leave your Discord. we'll share what we learn with everyone, and you get a bb sticker pack for finishing (US for now).";
export const WORK_CHAT = "A chat with the team about bb at work";
export const SOLD_OUT =
  "we've given out all the sticker packs for now — thank you anyway 🙏";

type Question = {
  name: string;
  label: string;
  type: "radio" | "checkbox" | "text";
  options: readonly string[];
  shuffle: boolean;
  maxChoices: number | null;
  placeholder: string;
};

export const surveyQuestions: readonly Question[] = [
  {
    name: "discovery",
    label: "How did you first hear about bb?",
    type: "radio",
    options: [
      "X/Twitter",
      "A friend or coworker",
      "Discord",
      "GitHub",
      "Hacker News",
      "Reddit",
      "A newsletter",
      "YouTube or a podcast",
      "A conference or meetup",
      "Google search",
      "An ad",
      "Other",
    ],
    shuffle: true,
    maxChoices: null,
    placeholder: "",
  },
  {
    name: "work",
    label: "Who uses bb where you work?",
    type: "radio",
    options: [
      "Just me, for side projects",
      "Just me, at work",
      "Me and 1–4 teammates",
      "5+ people at my company",
      "Not sure",
    ],
    shuffle: false,
    maxChoices: null,
    placeholder: "",
  },
  {
    name: "role",
    label: "Which best describes you?",
    type: "radio",
    options: [
      "Professional software engineer",
      "Founder or indie builder who codes",
      "PM, designer or analyst who builds with agents",
      "Non-technical builder (rarely writes code)",
      "Student",
      "Other",
    ],
    shuffle: false,
    maxChoices: null,
    placeholder: "",
  },
  {
    name: "meetup",
    label:
      "If we sent you a kit (merch and a how-to), would you run a bb meetup?",
    type: "radio",
    options: [
      "Yes, in person in my city",
      "Yes, a remote one",
      "I'd help someone else run one",
      "I'd come to one",
      "Not right now",
    ],
    shuffle: false,
    maxChoices: null,
    placeholder: "",
  },
  {
    name: "city",
    label: "What city are you in?",
    type: "text",
    options: [],
    shuffle: false,
    maxChoices: null,
    placeholder: "city, country",
  },
  {
    name: "merch",
    label: "What should we make next? (pick up to 3)",
    type: "checkbox",
    options: ["T-shirt", "Hoodie", "Tote", "Desk mat", "Socks", "Mug", "Other"],
    shuffle: true,
    maxChoices: 3,
    placeholder: "",
  },
  {
    name: "miss",
    label: "What would you miss most if you couldn't use bb anymore?",
    type: "text",
    options: [],
    shuffle: false,
    maxChoices: null,
    placeholder: "",
  },
  {
    name: "opt_in",
    label: "Want in on any of these?",
    type: "checkbox",
    options: ["Early test builds", WORK_CHAT],
    shuffle: false,
    maxChoices: null,
    placeholder: "",
  },
];

export type FormValues = Record<string, string[]>;
export type FormErrors = Record<string, string>;

export function followUpFields(values: FormValues) {
  const company = values.opt_in?.includes(WORK_CHAT) ?? false;
  const discord =
    Boolean(values.opt_in?.length) ||
    (values.meetup ?? []).some(
      (value) =>
        value === "Yes, in person in my city" || value === "Yes, a remote one",
    );
  return { discord, company };
}

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
      question.maxChoices !== null &&
      selected.length > question.maxChoices
    ) {
      errors[question.name] = "Pick up to 3";
    }
  }
  for (const name of ["discord", "company"]) {
    const selected = values[name] ?? [];
    if (selected.length > 1 || selected.some((value) => value.length > 250)) {
      errors[name] = "Please use one answer of up to 250 characters.";
    }
  }
  return errors;
}

export function surveyAnswers(values: FormValues): FormValues {
  const fields = followUpFields(values);
  const names = [
    ...surveyQuestions.map((question) => question.name),
    ...(fields.discord ? ["discord"] : []),
    ...(fields.company ? ["company"] : []),
  ];
  const answers: FormValues = {};
  for (const name of names) {
    const selected = values[name]?.filter(Boolean) ?? [];
    if (selected.length) answers[name] = selected;
  }
  return answers;
}
