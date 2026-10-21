import type { CompareFaqGroup } from "../compare-types";
import {
  CLOSER,
  FAQ_AGENTS,
  FAQ_CUSTOMIZE,
  FAQ_GET_STARTED,
  FAQ_LAPTOP,
  FAQ_PRIVACY,
  FAQ_REVIEW,
  FAQ_SUBSCRIPTIONS,
  faqFree,
  faqPhone,
  faqPlatforms,
  faqSchedule,
  faqScript,
  faqUsageLimit,
} from "../compare-content";
import { FAQ_PLUGIN_TRUST } from "../plugin-trust";

const FAQ: CompareFaqGroup[] = [
  {
    title: "Working in bb",
    items: [
      FAQ_GET_STARTED,
      FAQ_CUSTOMIZE,
      FAQ_PLUGIN_TRUST,
      faqScript(null),
      FAQ_REVIEW,
      faqSchedule(null),
      FAQ_AGENTS,
    ],
  },
  {
    title: "Price, platforms, and privacy",
    items: [
      faqFree(""),
      FAQ_SUBSCRIPTIONS,
      faqUsageLimit(null),
      faqPhone(null),
      FAQ_LAPTOP,
      faqPlatforms(null),
      FAQ_PRIVACY,
    ],
  },
];

export const COMPARISON_COPY = {
  title: (competitor: string) =>
    `bb vs ${competitor}: The Free, Open-Source Alternative`,
  description: (competitor: string) =>
    `bb is a free, open-source ${competitor} alternative you can change without forking. Add panels, commands, and agents from the plugin marketplace, or have your agent build them.`,
  headline: (competitor: string) =>
    `The free, open-source ${competitor} alternative`,
  sub: "Add what you need from the plugin marketplace, or have your agent build it and share it with your team. Free and open source.",
  faqTitle: "FAQ",
  faq: FAQ,
  closer: CLOSER,
};
