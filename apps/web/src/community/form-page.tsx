import { renderToStaticMarkup } from "react-dom/server";
import { siteHeadLinks } from "../landing/page-head";
import { THEME_INIT } from "../lib/theme";
import css from "./forms.css?url";
import {
  SURVEY_DESCRIPTION,
  SURVEY_TITLE,
  SOLD_OUT,
  WORK_CHAT,
  followUpFields,
  surveyQuestions,
  type FormErrors,
  type FormValues,
} from "./survey";

export type FormKind = "survey" | "merch";

const FORM_SCRIPT = `
const form = document.querySelector('form');
const scheme = matchMedia('(prefers-color-scheme: dark)');
scheme.addEventListener('change', e => document.documentElement.classList.toggle('dark', e.matches));
if (form) {
  const validate = () => {
    for (const group of form.querySelectorAll('[data-max]')) {
      const checks = [...group.querySelectorAll('input[type="checkbox"]')];
      const checked = checks.filter(el => el.checked);
      const error = checked.length > Number(group.dataset.max) ? 'Pick up to 3' : '';
      if (checks[0]) checks[0].setCustomValidity(error);
      const message = group.querySelector('[data-live-error]');
      if (message) message.textContent = error;
    }
    const optIn = [...form.querySelectorAll('[name="opt_in"]:checked')].map(el => el.value);
    const meetup = form.querySelector('[name="meetup"]:checked')?.value;
    const visible = { discord: optIn.length > 0 || ['Yes, in person in my city', 'Yes, a remote one'].includes(meetup), company: optIn.includes(${JSON.stringify(WORK_CHAT)}) };
    for (const field of form.querySelectorAll('[data-follow-up]')) {
      field.hidden = !visible[field.dataset.followUp];
      field.querySelector('input').disabled = field.hidden;
    }
  };
  form.addEventListener('change', validate);
  form.addEventListener('submit', e => {
    validate();
    if (!form.reportValidity()) e.preventDefault();
  });
  validate();
}
`;

function shuffled(options: readonly string[]): string[] {
  const result = [...options];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

function Survey({
  values,
  errors,
}: {
  values: FormValues;
  errors: FormErrors;
}) {
  const followUp = followUpFields(values);
  return (
    <>
      {surveyQuestions.map((question, index) => (
        <fieldset
          key={question.name}
          id={`question-${question.name}`}
          data-question={question.name}
          data-max={question.maxChoices ?? undefined}
          aria-describedby={
            errors[question.name] ? `${question.name}-error` : undefined
          }
        >
          <legend>
            <span className="community-number">{index + 1}.</span>{" "}
            {question.label}
          </legend>
          {question.options.length ? (
            <div className="community-options">
              {(question.shuffle
                ? shuffled(question.options)
                : question.options
              ).map((option) => (
                <label key={option} className="community-option">
                  <input
                    type={question.type === "checkbox" ? "checkbox" : "radio"}
                    name={question.name}
                    value={option}
                    defaultChecked={values[question.name]?.includes(option)}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          ) : (
            <input
              type="text"
              name={question.name}
              aria-label={question.label}
              placeholder={question.placeholder}
              maxLength={250}
              defaultValue={values[question.name]?.[0] ?? ""}
            />
          )}
          <p className="community-error" data-live-error aria-live="polite" />
          {errors[question.name] && (
            <p className="community-error" id={`${question.name}-error`}>
              {errors[question.name]}
            </p>
          )}
        </fieldset>
      ))}
      {(["discord", "company"] as const).map((name) => (
        <div
          key={name}
          className="community-field"
          id={`question-${name}`}
          data-follow-up={name}
          hidden={!followUp[name]}
        >
          <label htmlFor={name}>
            {name === "discord" ? "Discord handle" : "Company name"}{" "}
            <span className="community-optional">(optional)</span>
          </label>
          <input
            type="text"
            name={name}
            id={name}
            maxLength={250}
            disabled={!followUp[name]}
            defaultValue={values[name]?.[0] ?? ""}
            aria-describedby={errors[name] ? `${name}-error` : undefined}
          />
          {errors[name] && (
            <p className="community-error" id={`${name}-error`}>
              {errors[name]}
            </p>
          )}
        </div>
      ))}
    </>
  );
}

export function formPage({
  kind,
  id,
  enabled,
  values = {},
  errors = {},
  message = "",
  complete = false,
  status = 200,
  unavailable = false,
  stickerCode = null,
  duplicate = false,
  jotform = null,
}: {
  kind: FormKind;
  id: string;
  enabled: boolean;
  values?: FormValues;
  errors?: FormErrors;
  message?: string;
  complete?: boolean;
  status?: number;
  unavailable?: boolean;
  stickerCode?: string | null;
  duplicate?: boolean;
  jotform?: string | null;
}): Response {
  const nonce = crypto.randomUUID();
  const title = kind === "survey" ? SURVEY_TITLE : "thank you 🧡";
  const html = renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
        <link rel="icon" href="/favicon-32x32.png" />
        {siteHeadLinks(css).map((link, index) => (
          <link key={index} {...link} />
        ))}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: THEME_INIT }}
        />
      </head>
      <body className="community-page">
        <div className="community-wrap">
          <header className="community-header">
            <a className="logo" href="/" aria-label="bb home">
              <span className="community-wordmark" role="img" aria-label="bb" />
            </a>
          </header>
          <main>
            {complete ? (
              <section className="community-thanks">
                {duplicate ? (
                  <p>
                    we already have your answers — thank you 🙏 if you saved
                    your sticker code, you can still use its claim link.
                  </p>
                ) : (
                  <p>
                    {stickerCode ? (
                      <>
                        thank you 🙏 here's a free bb sticker pack →{" "}
                        <a
                          href={`/community/merch?c=${encodeURIComponent(stickerCode)}`}
                        >
                          claim stickers
                        </a>{" "}
                        (code: <code>{stickerCode}</code>, one use, US only for
                        now). it opens a short private form for your mailing
                        address. only the person packing your envelope can read
                        it, it isn't linked to these answers, and we delete it
                        once your stickers ship.
                      </>
                    ) : (
                      SOLD_OUT
                    )}{" "}
                    outside the US? we're working on it and will post in
                    Discord. we'll share the results in Discord too, and if you
                    said you'd host, we'll DM you.
                  </p>
                )}
              </section>
            ) : unavailable ? (
              <section className="community-thanks">
                <p>
                  hmm, this link isn't working. DM brsbl on discord and we'll
                  sort it out.
                </p>
              </section>
            ) : (
              <>
                <div className="community-intro">
                  <h1>{title}</h1>
                  <p>
                    {kind === "survey"
                      ? SURVEY_DESCRIPTION
                      : "you've helped people in the discord, built cool stuff, and told friends about bb. we notice, and it means a lot. so we made some merch and want you to have some first."}
                  </p>
                  {kind === "merch" && <p>— brsbl &amp; the bb team</p>}
                </div>
                {!enabled && (
                  <p className="community-notice">
                    Preview for review. Responses are not being collected yet.
                  </p>
                )}
                {(message || Object.keys(errors).length > 0) && (
                  <div className="community-notice" role="alert">
                    <strong>
                      {message || "Please check the marked questions."}
                    </strong>
                    {Object.entries(errors).map(([name, error]) => (
                      <p key={name}>
                        <a href={`#question-${name}`}>
                          {surveyQuestions.find(
                            (question) => question.name === name,
                          )?.label ?? name}
                          : {error}
                        </a>
                      </p>
                    ))}
                  </div>
                )}
                {kind === "survey" ? (
                  <form
                    method="post"
                    action="/community/survey"
                    autoComplete="off"
                  >
                    <input type="hidden" name="submission_id" value={id} />
                    <Survey values={values} errors={errors} />
                    <div className="community-submit">
                      <button
                        className="btn primary"
                        type="submit"
                        disabled={!enabled}
                      >
                        Send my answers
                      </button>
                    </div>
                  </form>
                ) : (
                  <section className="community-merch">
                    <h2>where should we send it?</h2>
                    {jotform ? (
                      <>
                        <iframe
                          title="Private merch mailing form"
                          src={jotform}
                          referrerPolicy="no-referrer"
                        />
                        <p>
                          <a
                            href={jotform}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            open the private form
                          </a>
                        </p>
                      </>
                    ) : (
                      <p className="community-notice">
                        The private mailing form isn't open yet. Please keep
                        this link and check back later.
                      </p>
                    )}
                    <p className="community-help">
                      Only the person packing your envelope can read this, plus
                      Pirate Ship, the service that prints the shipping label.
                      Once it ships, we delete it from our form and ask Pirate
                      Ship to delete its copy.
                    </p>
                  </section>
                )}
              </>
            )}
          </main>
          <footer className="community-footer">
            <span>From the people building bb.</span>
            <a href="/privacy">Privacy</a>
          </footer>
        </div>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: FORM_SCRIPT }}
        />
      </body>
    </html>,
  );
  const frameSource = jotform ? new URL(jotform).origin : "'none'";
  return new Response(`<!doctype html>${html}`, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow",
      "x-content-type-options": "nosniff",
      "content-security-policy": `default-src 'self'; script-src 'nonce-${nonce}'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'none'; frame-src ${frameSource}; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
    },
  });
}
