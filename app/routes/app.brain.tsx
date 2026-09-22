/* ============================================================
   MQ BRAIN

   A placeholder, and deliberately an honest one. The nav has
   linked here for a while with nothing behind it, so every
   click returned a 404. A page that says "not yet" is a better
   answer than a broken one.

   It carries no loader: there is nothing to load, and adding a
   Shopify admin call for an empty screen would only make it
   slower to say nothing.
   ============================================================ */

export default function Brain() {
  return (
    <s-page
      heading="MQ Brain"
      inlineSize="large"
    >
      <s-section heading="Not available yet">
        <s-paragraph>
          MQ Brain is still being built. Nothing is
          missing from your account and nothing is
          switched off, this part of the app simply
          does not exist yet.
        </s-paragraph>

        <s-paragraph>
          Everything you need to run campaigns works
          without it.
        </s-paragraph>
      </s-section>

      <s-section heading="What to use in the meantime">
        <s-unordered-list>
          <s-list-item>
            Popups is where you design what a
            shopper sees.
          </s-list-item>
          <s-list-item>
            Campaigns is where you decide who sees
            it, when, how often and on which
            websites.
          </s-list-item>
          <s-list-item>
            Analytics shows how many people saw each
            campaign and how many submitted.
          </s-list-item>
          <s-list-item>
            Contacts lists every submission, and
            exports the whole lot as a CSV.
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}
