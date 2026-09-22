/* ============================================================
   SETTINGS

   Covers the Shopify storefront, which does not use an embed
   snippet at all, and the rules that decide whether a popup
   actually appears.

   A campaign's embed snippet for other websites lives in the
   campaign itself, on the Websites step of the editor, so the
   code a merchant copies is always tied to the campaign they
   were looking at.
   ============================================================ */

export default function Settings() {
  return (
    <s-page
      heading="Settings"
      inlineSize="large"
    >
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
            that website. Campaigns run on all
            websites by default, and you can narrow
            that down in the campaign editor.
          </s-list-item>
          <s-list-item>
            Frequency rules apply. If a visitor has
            already seen it as many times as the
            campaign allows, or is inside a re-show
            cooldown, nothing appears for them.
          </s-list-item>
          <s-list-item>
            Device rules apply. A campaign limited
            to desktop will not appear on a narrow
            window, even on a desktop machine.
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
            reached. An exit-intent campaign waits
            for the visitor to look like they are
            leaving, so it will not appear at all
            on a page nobody scrolls or leaves.
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}
