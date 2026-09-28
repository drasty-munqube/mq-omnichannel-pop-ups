/* ============================================================
   SETTINGS > CHANNELS > EMAIL > ADD DOMAIN

   Name and region. Submitting creates the domain in Resend
   (from the server) and goes straight to its page, where the
   DNS records to add are shown.
   ============================================================ */

import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";

import { Breadcrumbs, EMAIL_CHANNEL_PATH, Notice, domainPath } from "../components/domain-ui";
import { button, card, fieldHint, fieldLabel, input } from "../design/styles";
import { color, fontWeight, radius, space, text } from "../design/tokens";
import { actorName } from "../models/actor.server";
import { DEFAULT_REGION, DOMAIN_REGIONS, normalizeDomainInput } from "../models/email-domain";
import { addShopDomain } from "../models/email-domains.server";
import { isResendConfigured } from "../models/resend-domains.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return { configured: isResendConfigured() };
}

export async function action({ request }: ActionFunctionArgs) {
  const auth = await authenticate.admin(request);
  const form = await request.formData();
  const name = String(form.get("name") || "");
  const region = String(form.get("region") || DEFAULT_REGION);

  try {
    const result = await addShopDomain(auth.session.shop, actorName(auth), { name, region });
    if (result.ok) return redirect(`${domainPath(result.id)}?created=1`);
    return { error: result.error, field: result.field ?? null, name, region };
  } catch (error) {
    console.error("ADD DOMAIN ERROR:", error);
    return { error: "Something went wrong. Please try again.", field: null, name, region };
  }
}

export default function AddDomainPage() {
  const { configured } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle" && navigation.formMethod?.toLowerCase() === "post";

  const [name, setName] = useState(actionData?.name ?? "");
  const [region, setRegion] = useState(actionData?.region ?? DEFAULT_REGION);
  const [touched, setTouched] = useState(false);

  const local = normalizeDomainInput(name);
  const localError = touched && !local.ok ? local.error : null;
  const nameError = localError || (actionData?.field === "name" && actionData.name === name ? actionData.error : null);
  const generalError = actionData?.error && actionData.field !== "name" ? actionData.error : null;

  return (
    <s-section>
      <Breadcrumbs
        items={[
          { label: "Channels", to: "/app/settings/channels" },
          { label: "Email", to: EMAIL_CHANNEL_PATH },
          { label: "Add domain" },
        ]}
      />

      <div style={{ maxWidth: "620px" }}>
        <h2 style={{ margin: 0, ...text.h2, color: color.textStrong }}>Add domain</h2>
        <p style={{ margin: `${space[2]} 0 ${space[6]}`, ...text.body, color: color.textMuted }}>
          Use a domain you own. We recommend a subdomain such as <strong>mail.yourstore.com</strong>, so campaign email
          stays separate from your everyday email.
        </p>

        {!configured ? (
          <Notice tone="warning">
            Resend is not connected. Add <code>RESEND_DOMAINS_API_KEY</code> to the app&apos;s environment and restart
            the app before adding a domain.
          </Notice>
        ) : null}

        {generalError ? <Notice tone="danger">{generalError}</Notice> : null}

        <Form
          method="post"
          noValidate
          onSubmit={(event) => {
            setTouched(true);
            if (!local.ok) event.preventDefault();
          }}
          style={{ ...card({ padding: 7 }), display: "grid", gap: space[7] }}
        >
          <div>
            <label htmlFor="domain-name" style={fieldLabel()}>
              Domain
            </label>
            <input
              id="domain-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && setTouched(true)}
              placeholder="mail.yourstore.com"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={nameError ? true : undefined}
              aria-describedby="domain-name-hint"
              style={input({ invalid: Boolean(nameError) })}
            />
            <div id="domain-name-hint" style={{ ...fieldHint({ invalid: Boolean(nameError) }), marginTop: space[3] }}>
              {nameError || "Without https:// or a path. For you@mail.yourstore.com, enter mail.yourstore.com."}
            </div>
          </div>

          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend style={fieldLabel()}>Region</legend>
            <div style={{ ...fieldHint(), marginBottom: space[4] }}>
              Where Resend sends your email from. Pick the one closest to most of your shoppers. It cannot be changed
              later.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: space[4] }}>
              {DOMAIN_REGIONS.map((r) => {
                const on = region === r.value;
                return (
                  <label
                    key={r.value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: space[4],
                      padding: `${space[5]} ${space[5]}`,
                      border: `1px solid ${on ? color.primary : color.border}`,
                      background: on ? color.surfaceSelected : color.surface,
                      borderRadius: radius.md,
                      cursor: "pointer",
                      ...text.body,
                      fontWeight: on ? fontWeight.semibold : fontWeight.regular,
                      color: color.textStrong,
                    }}
                  >
                    <input type="radio" name="region" value={r.value} checked={on} onChange={() => setRegion(r.value)} />
                    {r.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: space[4], flexWrap: "wrap" }}>
            <Link to={EMAIL_CHANNEL_PATH} style={{ ...button("secondary", "md"), textDecoration: "none" }}>
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!configured || submitting}
              style={button("primary", "md", { disabled: !configured || submitting })}
            >
              {submitting ? "Adding…" : "Add domain"}
            </button>
          </div>
        </Form>
      </div>
    </s-section>
  );
}
