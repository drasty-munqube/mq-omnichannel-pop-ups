import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";

import {
  buildSnippet,
  CodeBlock,
  CopyButton,
} from "../components/copy-snippet";
import { authenticate } from "../shopify.server";

/* ============================================================
   LOADER

   Everything on this page is a copy-paste install snippet, so
   the only two things it needs are the merchant's own shop
   domain (that's the public identifier the widget sends to
   /api/widget) and this app's public origin (where
   mq-widget.js is served from).

   SHOPIFY_APP_URL is set in the deploy environment. If it's
   ever missing we fall back to the origin of the incoming
   request, so the snippet is never rendered with a blank host.
   ============================================================ */

export async function loader({
  request,
}: LoaderFunctionArgs) {
  const { session } =
    await authenticate.admin(request);

  const appUrl = (
    process.env.SHOPIFY_APP_URL ||
    new URL(request.url).origin
  ).replace(/\/+$/, "");

  return {
    shop: session.shop,
    appUrl,
  };
}

/* ============================================================
   PLATFORM STEPS
   ============================================================ */

const PLATFORMS: {
  name: string;
  steps: string[];
}[] = [
  {
    name: "WordPress",
    steps: [
      "Install any headers-and-footers plugin, for example WPCode or Insert Headers and Footers.",
      "Open its settings and find the Footer (or Body) box.",
      "Paste the snippet there and save.",
    ],
  },
  {
    name: "Google Tag Manager",
    steps: [
      "In GTM, create a new Tag and choose Custom HTML.",
      "Paste the snippet into the HTML box.",
      "Set the trigger to All Pages, then Save and Publish.",
    ],
  },
  {
    name: "Wix",
    steps: [
      "Go to Settings, then Custom Code, under the Advanced section.",
      "Add code to Body - end, and apply it to All pages.",
      "Paste the snippet and apply.",
    ],
  },
  {
    name: "Squarespace",
    steps: [
      "Go to Settings, then Advanced, then Code Injection.",
      "Paste the snippet into the Footer box.",
      "Save.",
    ],
  },
  {
    name: "Another Shopify store",
    steps: [
      "From the Shopify admin open Online Store, Themes, then Edit code.",
      "Open layout/theme.liquid.",
      "Paste the snippet just above the closing body tag and save.",
    ],
  },
  {
    name: "Custom or hand-built site",
    steps: [
      "Open the page template or layout file.",
      "Paste the snippet just above the closing body tag.",
      "Deploy the change.",
    ],
  },
];

/* ============================================================
   SETTINGS
   ============================================================ */

export default function Settings() {
  const { shop, appUrl } =
    useLoaderData<typeof loader>();

  const snippet = buildSnippet(appUrl, shop);
  const demoUrl = `${appUrl}/demo.html`;

  return (
    <s-page
      heading="Settings"
      inlineSize="large"
    >
      {/* ---------- install snippet ---------- */}

      <s-section>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 6,
          }}
        >
          <div>
            <s-heading>
              Install on any website
            </s-heading>
            <s-paragraph>
              Paste this one line just above the
              closing body tag of any site, and
              your live campaigns will run there.
              It works on any platform, Shopify or
              not.
            </s-paragraph>
          </div>

          <CopyButton value={snippet} />
        </div>

        <div style={{ marginTop: 12 }}>
          <CodeBlock code={snippet} />
        </div>

        <div style={{ marginTop: 12 }}>
          <s-paragraph>
            The code already carries your store
            identifier, so nothing in it needs to
            be edited. To see it working right
            now, open{" "}
            <s-link
              href={demoUrl}
              target="_blank"
            >
              the demo page
            </s-link>{" "}
            and scroll down.
          </s-paragraph>
        </div>

        <div style={{ marginTop: 10 }}>
          <s-paragraph>
            To control which campaign runs on
            which website, open{" "}
            <Link to="/app/websites">
              Websites
            </Link>
            .
          </s-paragraph>
        </div>
      </s-section>

      {/* ---------- platform steps ---------- */}

      <s-section heading="Where to paste it">
        <s-paragraph>
          Pick whichever matches the site you are
          installing on. The snippet is the same
          every time, only the place you paste it
          changes.
        </s-paragraph>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
            marginTop: 14,
          }}
        >
          {PLATFORMS.map((platform) => (
            <div
              key={platform.name}
              style={{
                padding: 14,
                border: "1px solid #E5E7EB",
                borderRadius: 10,
                background: "#FFFFFF",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#111827",
                  marginBottom: 8,
                }}
              >
                {platform.name}
              </div>

              <ol
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: 13,
                  lineHeight: 1.7,
                  color: "#4B5563",
                }}
              >
                {platform.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </s-section>

      {/* ---------- shopify storefront ---------- */}

      <s-section heading="This Shopify store">
        <s-paragraph>
          Your own storefront does not need the
          snippet. It uses the theme app embed
          instead, which is faster and keeps
          working if this app moves to a new
          domain.
        </s-paragraph>

        <s-unordered-list>
          <s-list-item>
            Open Online Store, then Themes, then
            Customize.
          </s-list-item>
          <s-list-item>
            Open App embeds from the left sidebar.
          </s-list-item>
          <s-list-item>
            Turn on MQ Popups and press Save.
          </s-list-item>
        </s-unordered-list>
      </s-section>

      {/* ---------- what to expect ---------- */}

      <s-section heading="Before you test">
        <s-unordered-list>
          <s-list-item>
            A campaign only shows if both the
            campaign and the popup it is linked to
            are set to Live.
          </s-list-item>
          <s-list-item>
            A campaign also has to be allowed on
            that website. Campaigns are set to run
            on all websites by default.
          </s-list-item>
          <s-list-item>
            On non-Shopify sites, only campaigns
            targeting All pages run. Campaigns
            targeting specific Shopify page types,
            such as product or collection, are
            skipped because those page types do
            not exist there.
          </s-list-item>
          <s-list-item>
            Triggers still apply. If a campaign
            waits for a scroll depth or a delay,
            the popup appears only once that is
            reached.
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}
