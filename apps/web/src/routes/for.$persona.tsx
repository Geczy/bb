import { createFileRoute, notFound } from "@tanstack/react-router";

import { useInitAnalytics } from "../landing/analytics";
import { pageMeta, siteHeadLinks } from "../landing/page-head";
import { PersonaPage } from "../landing/persona-page";
import personaCss from "../landing/persona.css?url";
import { PERSONAS } from "../landing/personas";

export const Route = createFileRoute("/for/$persona")({
  loader: ({ params }) => {
    if (!PERSONAS[params.persona]) {
      throw notFound();
    }
    return { slug: params.persona };
  },
  head: ({ loaderData }) => {
    const persona = loaderData ? PERSONAS[loaderData.slug] : undefined;
    if (!persona) {
      return { meta: [{ title: "bb" }] };
    }
    return {
      meta: pageMeta(
        persona.seoTitle,
        persona.seoDescription,
        `/for/${persona.slug}`,
      ),
      links: siteHeadLinks(personaCss),
    };
  },
  component: PersonaRoute,
});

function PersonaRoute() {
  const { slug } = Route.useLoaderData();
  useInitAnalytics();
  const persona = PERSONAS[slug];
  if (!persona) {
    return null;
  }
  return <PersonaPage persona={persona} />;
}
