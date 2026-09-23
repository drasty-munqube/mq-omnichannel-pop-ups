/* ============================================================
   MQ Popups — universal embed script

   Drop this on ANY website (not just Shopify):

     <script
       src="https://<your-app-domain>/mq-widget.js"
       data-shop="your-shop.myshopify.com"
       async
     ></script>

   Add data-campaign="<id>" to run only one campaign on that
   website. It narrows the choice; it does not override the
   campaign's own device, frequency or cooldown rules.

   "data-shop" is the Shopify store this app is installed on —
   that's what identifies which campaigns/popups to load. It
   works on any domain because it talks to /api/widget, a public
   CORS-open endpoint (app/routes/api.widget.tsx), instead of
   Shopify's App Proxy (which only works from inside a Shopify
   storefront — see extensions/mq-popup-embed for that version).

   Vanilla JS, no dependencies, safe to fail silently: nothing
   here should ever break the host page.

   "Specific pages" targeting works here as far as it can. A
   target saved as a pathname is compared against this page's
   path. Targets that name a Shopify page type or handle cannot
   exist on another website, so a campaign carrying only those
   runs here only when the merchant pointed it at this website
   by name. See matchesPageTargets below.
   ============================================================ */

(function () {
  "use strict";

  var thisScript = document.currentScript;
  if (!thisScript) {
    return;
  }

  var shop = thisScript.getAttribute("data-shop");
  if (!shop) {
    console.warn(
      "[MQ Popups] missing data-shop attribute on the embed script tag.",
    );
    return;
  }

  var apiOrigin = (function () {
    try {
      return new URL(thisScript.src).origin;
    } catch (error) {
      return "";
    }
  })();

  if (!apiOrigin) {
    return;
  }

  var apiUrl = apiOrigin + "/api/widget";

  /* A plain website has no idea who is logged in, so "Customers"
     targeting is off unless the host page declares it:
       <script ... data-customer="true">
     The Shopify theme embed knows this natively and sets it from
     Liquid. */
  var isLoggedInCustomer =
    thisScript.getAttribute("data-customer") ===
    "true";

  var DEFAULT_SETTINGS = {
    bodyBackground: "#FFFFFF",
    headerBackground: "#1F2937",
    headerGradient: true,
    headerGradientEnd: "#111827",
    popupBorderRadius: 18,
    headerHeight: 145,
    bodyPadding: 24,
    closeButtonBackground: "#F3F4F6",
    closeButtonColor: "#374151",
    closeButtonText: "×",
    closeButtonSize: 38,
    closeButtonRadius: 50,
    footerText: "No thanks",
    footerColor: "#6B7280",
    footerVisible: true,
    audienceNewOnly: false,
    audienceReturningOnly: false,
    audienceDevice: "all",
  };

  var STORAGE_PREFIX = "mq_widget_";

  /* ------------------------------------------------------------
     AUDIENCE / DISMISS STATE
  ------------------------------------------------------------ */

  function safeGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      /* localStorage unavailable — degrade silently */
    }
  }

  /* Read ONCE, before markVisited() runs. Reading it later would
     always say "returning", because boot marks this visit as
     seen — which silently made "New visitors" targeting match
     nobody at all. */
  var wasReturningVisitor =
    safeGet(STORAGE_PREFIX + "seen") === "1";

  function markVisited() {
    safeSet(STORAGE_PREFIX + "seen", "1");
  }

  /* The popup's own Logic tab can also narrow new-vs-returning.
     Device targeting used to live here too and no longer does —
     it is a campaign setting now, handled by matchesDevices. */

  function matchesAudience(settings) {
    if (
      settings.audienceNewOnly &&
      wasReturningVisitor
    ) {
      return false;
    }

    if (
      settings.audienceReturningOnly &&
      !wasReturningVisitor
    ) {
      return false;
    }

    return true;
  }

  /* ----------------------------------------------------------
     CAMPAIGN AUDIENCE

     The Target step's audience choice, enforced here for the
     first time. "Customers" cannot be established on a site
     that is not the Shopify storefront, so such a campaign
     stays hidden rather than showing to the wrong people.
     ---------------------------------------------------------- */

  function matchesCampaignAudience(campaign) {
    var audience = campaign.audience || "";

    if (audience === "New visitors") {
      return !wasReturningVisitor;
    }

    if (audience === "Returning visitors") {
      return wasReturningVisitor;
    }

    if (audience === "Customers") {
      return isLoggedInCustomer;
    }

    /* "All visitors", empty, or anything unrecognised. */
    return true;
  }

  /* ----------------------------------------------------------
     PAGES

     A campaign set to "Specific pages" used to be dropped
     outright on any non-Shopify website, which took every other
     condition down with it: its trigger, its frequency cap, its
     cooldowns and its device rules never ran anywhere except
     the storefront.

     The targets are not all Shopify-shaped, though. A target
     saved as path:/pricing is just a pathname and compares
     perfectly well on any website. Only route: targets (whole
     Shopify sections such as every product page) and page:
     targets (a Shopify page handle) describe things that do not
     exist here.

     So: a matching path wins anywhere. If the campaign has
     nothing but Shopify-shaped targets, the rule cannot be
     judged on this website, and what happens next depends on
     how deliberate the merchant was. A campaign pointed at this
     website by name in the Websites step runs, because the
     merchant chose this website knowing the page rule came from
     their store. A campaign running on every website does not,
     because nothing about it said it belonged here.
     ---------------------------------------------------------- */

  /* Normalised the same way the admin stores menu paths:
     lowercase, no query, no hash, no trailing slash. */

  function currentPath() {
    var path;

    try {
      path = (
        window.location.pathname || "/"
      ).toLowerCase();
    } catch (error) {
      return "/";
    }

    if (path.length > 1) {
      path = path.replace(/\/+$/, "");
    }

    return path || "/";
  }

  function matchesPageTargets(campaign) {
    if (campaign.pageTargetMode !== "specific") {
      return true;
    }

    var targets = campaign.pageTargets || [];

    /* "Specific pages" with nothing picked is a half-finished
       campaign. It shows nowhere on the storefront, so it shows
       nowhere here either rather than quietly meaning
       "everywhere" on one surface and "nowhere" on the other. */
    if (!targets.length) {
      return false;
    }

    var shopifyOnly = true;

    for (var i = 0; i < targets.length; i += 1) {
      var target = String(targets[i]);

      if (target.indexOf("path:") !== 0) {
        continue;
      }

      shopifyOnly = false;

      if (target === "path:" + currentPath()) {
        return true;
      }
    }

    /* Nothing here but Shopify page types and handles. */
    if (shopifyOnly) {
      return (
        campaign.siteTargetMode === "selected"
      );
    }

    return false;
  }

  /* ----------------------------------------------------------
     DEVICE

     Width buckets rather than user-agent sniffing: what decides
     whether a popup fits is how much room it has, and a resized
     desktop window should behave like the size it actually is.
     ---------------------------------------------------------- */

  /* A ?previewMode=mobile|tablet|desktop parameter on the page
     wins over the measured width. Kept identical to the Shopify
     theme embed, where it exists because the theme editor's
     mobile preview can still report a desktop width — here it
     doubles as a way to test a campaign's device rules without
     resizing anything. */

  function previewModeDevice() {
    var search = "";

    try {
      search = window.location.search || "";
    } catch (error) {
      return null;
    }

    var match = /[?&]previewMode=([a-zA-Z]+)/.exec(
      search,
    );

    if (!match) {
      return null;
    }

    var mode = match[1].toLowerCase();

    if (mode === "mobile") {
      return "mobile";
    }

    if (mode === "tablet") {
      return "tablet";
    }

    if (mode === "desktop" || mode === "full") {
      return "desktop";
    }

    return null;
  }

  function currentDevice() {
    var previewed = previewModeDevice();

    if (previewed) {
      return previewed;
    }

    var width =
      window.innerWidth ||
      (document.documentElement || {}).clientWidth ||
      0;

    if (width < 768) {
      return "mobile";
    }

    if (width < 1024) {
      return "tablet";
    }

    return "desktop";
  }

  function matchesDevices(campaign) {
    var devices = campaign.devices;

    /* Missing or empty means no device targeting at all, which
       is every device — never nothing. */
    if (!devices || !devices.length) {
      return true;
    }

    /* Counted after removing repeats. "All three are selected"
       has to mean three different buckets: on raw length,
       ["mobile","mobile","mobile"] read as no targeting at all
       and showed a mobile-only campaign on every device. */
    var unique = [];

    for (var d = 0; d < devices.length; d += 1) {
      if (unique.indexOf(devices[d]) === -1) {
        unique.push(devices[d]);
      }
    }

    if (unique.length >= 3) {
      return true;
    }

    return (
      unique.indexOf(currentDevice()) !== -1
    );
  }

  /* ----------------------------------------------------------
     FREQUENCY

     How many times this visitor has already been shown the
     campaign, counted in this browser only. Clearing site data
     resets it, which is the same caveat every frontend
     frequency cap carries.
     ---------------------------------------------------------- */

  function viewCount(campaignId) {
    return (
      Number(
        safeGet(
          STORAGE_PREFIX + "views_" + campaignId,
        ),
      ) || 0
    );
  }

  function markViewed(campaignId) {
    safeSet(
      STORAGE_PREFIX + "views_" + campaignId,
      String(viewCount(campaignId) + 1),
    );
  }

  function withinFrequencyCap(campaign) {
    var seen = viewCount(campaign.campaignId);

    if (campaign.frequencyMode === "once") {
      return seen < 1;
    }

    if (campaign.frequencyMode === "limited") {
      var limit =
        Number(campaign.frequencyLimit) || 0;

      return limit > 0 && seen < limit;
    }

    return true;
  }

  /* ----------------------------------------------------------
     COOLDOWNS

     One rule for both "they submitted" and "they closed it":
     0 days means never show it to this visitor again, anything
     higher is a waiting period.
     ---------------------------------------------------------- */

  function blockedSince(key, days) {
    var raw = safeGet(key);

    if (!raw) {
      return false;
    }

    var at = Number(raw);

    if (!at) {
      return false;
    }

    if (days <= 0) {
      return true;
    }

    return (
      Date.now() - at <
      days * 24 * 60 * 60 * 1000
    );
  }

  function collectedBlocks(campaign) {
    return blockedSince(
      STORAGE_PREFIX +
        "collected_" +
        campaign.campaignId,
      Number(campaign.reshowCollectedDays) || 0,
    );
  }

  function markCollected(campaignId) {
    safeSet(
      STORAGE_PREFIX + "collected_" + campaignId,
      String(Date.now()),
    );
  }

  function dismissedBlocks(campaign) {
    return blockedSince(
      STORAGE_PREFIX +
        "dismissed_" +
        campaign.campaignId,
      Number(campaign.reshowDismissedDays) || 0,
    );
  }

  function markDismissed(campaignId) {
    safeSet(
      STORAGE_PREFIX + "dismissed_" + campaignId,
      String(Date.now()),
    );
  }

  /* Deliberately no "already submitted" memory here: a past
     submission should never permanently lock this campaign to
     the Success step on later visits — see openOffer() below,
     which always opens on the real Offer step. */

  /* ------------------------------------------------------------
     STEP / SETTINGS HELPERS
  ------------------------------------------------------------ */

  function findStep(steps, id) {
    for (var i = 0; i < steps.length; i += 1) {
      if (steps[i].id === id) {
        return steps[i];
      }
    }
    return null;
  }

  function popupSettingsFor(steps) {
    var offer = findStep(steps, "offer");
    var settings = (offer && offer.settings) || {};

    var merged = {};
    for (var key in DEFAULT_SETTINGS) {
      if (
        Object.prototype.hasOwnProperty.call(
          DEFAULT_SETTINGS,
          key,
        )
      ) {
        merged[key] =
          settings[key] !== undefined
            ? settings[key]
            : DEFAULT_SETTINGS[key];
      }
    }
    return merged;
  }

  /* ------------------------------------------------------------
     DOM BUILDING
  ------------------------------------------------------------ */

  function el(tag, styles, attrs) {
    var node = document.createElement(tag);
    if (styles) {
      for (var prop in styles) {
        if (
          Object.prototype.hasOwnProperty.call(
            styles,
            prop,
          )
        ) {
          node.style[prop] = styles[prop];
        }
      }
    }
    if (attrs) {
      for (var attr in attrs) {
        if (
          Object.prototype.hasOwnProperty.call(
            attrs,
            attr,
          )
        ) {
          node.setAttribute(attr, attrs[attr]);
        }
      }
    }
    return node;
  }

  function renderBlock(block, onAction) {
    var common = {
      marginTop: (block.marginTop || 0) + "px",
      fontSize: (block.fontSize || 14) + "px",
      color: block.color || "#111827",
      textAlign: block.align || "left",
      fontFamily: block.fontFamily || "inherit",
      fontWeight: block.bold ? "700" : "400",
      fontStyle: block.italic ? "italic" : "normal",
      letterSpacing: (block.letterSpacing || 0) + "px",
      opacity: String(
        (block.opacity != null ? block.opacity : 100) /
          100,
      ),
    };

    if (block.type === "button" || block.type === "channel") {
      var button = el(
        "button",
        Object.assign({}, common, {
          width: "100%",
          background: block.background || "#1F2937",
          color: block.buttonTextColor || "#FFFFFF",
          border: block.borderWidth
            ? block.borderWidth +
              "px solid " +
              (block.borderColor || "#E5E7EB")
            : "none",
          borderRadius:
            (block.borderRadius != null
              ? block.borderRadius
              : 10) + "px",
          padding:
            (block.paddingY != null
              ? block.paddingY
              : 14) +
            "px " +
            (block.paddingX != null
              ? block.paddingX
              : 18) +
            "px",
          cursor: "pointer",
        }),
        { type: "button" },
      );
      button.textContent = block.text || "";
      button.addEventListener("click", function () {
        onAction();
      });
      return button;
    }

    if (block.type === "field") {
      var input = el(
        "input",
        Object.assign({}, common, {
          width: "100%",
          boxSizing: "border-box",
          padding:
            (block.paddingY != null
              ? block.paddingY
              : 10) +
            "px " +
            (block.paddingX != null
              ? block.paddingX
              : 12) +
            "px",
          border:
            "1px solid " + (block.borderColor || "#D1D5DB"),
          borderRadius:
            (block.borderRadius != null
              ? block.borderRadius
              : 8) + "px",
        }),
        {
          type:
            block.fieldType === "number"
              ? "number"
              : block.fieldType === "phone"
                ? "tel"
                : block.fieldType === "email"
                  ? "email"
                  : /email/i.test(
                        block.placeholder ||
                          block.text ||
                          "",
                      )
                    ? "email"
                    : "text",
          placeholder:
            block.placeholder || block.text || "",
          "data-mq-field": block.id,
        },
      );
      if (block.fieldRequired) {
        input.setAttribute("required", "required");
      }
      return input;
    }

    var text = el("div", common);
    text.textContent = block.text || "";
    return text;
  }

  /* ------------------------------------------------------------
     EVENTS

     Views and dismissals are reported so the admin can work out
     a conversion rate. Submissions are not reported from here:
     the server writes that event itself when it saves the
     contact, which is the only moment it can be sure one really
     happened.

     sendBeacon is tried first because a dismissal is often the
     last thing to happen before the page goes away, and a normal
     fetch gets cancelled at that point. Everything is wrapped so
     that a blocked request, a missing API or a content security
     policy can never surface on the host page.
  ------------------------------------------------------------ */

  function sendEvent(campaign, type) {
    var body;

    try {
      body = JSON.stringify({
        shop: shop,
        type: type,
        campaignId: campaign.campaignId,
        popupId: campaign.popupId,
        device: currentDevice(),
        pageUrl: window.location.href,
      });
    } catch (error) {
      return;
    }

    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], {
          type: "application/json",
        });

        if (navigator.sendBeacon(apiUrl, blob)) {
          return;
        }
      }
    } catch (error) {
      /* fall through to fetch */
    }

    try {
      fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: body,
        keepalive: true,
      }).catch(function () {});
    } catch (error) {
      /* reporting is never worth an error on someone's site */
    }
  }

  /* ------------------------------------------------------------
     EXIT INTENT

     Two gestures mean "I am leaving", depending on what the
     visitor is holding. With a mouse it is the pointer crossing
     the top edge of the window on its way to the address bar or
     the tab strip. On a touch screen there is no pointer to
     watch, so the signal is a fast upward flick after they have
     already read some way down the page.

     It fires once and then stops listening, so someone whose
     mouse wanders in and out of the window does not get the
     popup over and over.
  ------------------------------------------------------------ */

  function onExitIntent(run) {
    var fired = false;
    var samples = [];

    function cleanup() {
      document.removeEventListener(
        "mouseout",
        onMouseOut,
      );
      window.removeEventListener(
        "scroll",
        onScroll,
      );
    }

    function fire() {
      if (fired) {
        return;
      }
      fired = true;
      cleanup();
      run();
    }

    function onMouseOut(event) {
      /* clientY above the viewport means the pointer left over
         the top edge. A relatedTarget means it merely moved
         onto another element, which is not leaving at all. */
      if (event.clientY > 0) {
        return;
      }
      if (event.relatedTarget) {
        return;
      }
      fire();
    }

    function onScroll() {
      var y =
        window.pageYOffset ||
        (document.documentElement || {})
          .scrollTop ||
        0;

      var now = Date.now();

      samples.push({ y: y, at: now });

      while (
        samples.length &&
        now - samples[0].at > 600
      ) {
        samples.shift();
      }

      if (samples.length < 2) {
        return;
      }

      var oldest = samples[0];

      /* Went at least a screen into the page, then flicked back
         up more than 150px inside 600ms. A slow scroll back to
         the top reads as browsing, not leaving. */
      if (
        oldest.y > 200 &&
        oldest.y - y > 150
      ) {
        fire();
      }
    }

    document.addEventListener(
      "mouseout",
      onMouseOut,
    );
    window.addEventListener("scroll", onScroll);

    /* Handed back so a widget removed on a resize can stop
       listening. Without it the handlers would outlive the
       popup and fire against a campaign that is no longer on
       screen. */
    return cleanup;
  }

  /* ------------------------------------------------------------
     SUBMIT
  ------------------------------------------------------------ */

  function submitContact(campaign, fieldValues, onDone) {
    var email = null;
    for (var key in fieldValues) {
      if (/@/.test(fieldValues[key] || "")) {
        email = fieldValues[key];
        break;
      }
    }

    fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shop: shop,
        popupId: campaign.popupId,
        popupName: campaign.popupName,
        campaignId: campaign.campaignId,
        email: email,
        fields: fieldValues,
        device: currentDevice(),
        pageUrl: window.location.href,
      }),
    })
      .catch(function () {
        /* best-effort — the widget still advances to Success */
      })
      .then(function () {
        onDone();
      });
  }

  /* ------------------------------------------------------------
     WIDGET
  ------------------------------------------------------------ */

  var countedCampaigns = [];

  function buildWidget(campaign, isPreview) {
    var settings = popupSettingsFor(campaign.steps);
    var overlay = null;

    /* Someone who filled the form in has converted, so closing
       the Success step afterwards is not a dismissal. And a
       dismissal is reported at most once per page load, however
       many ways there are to close the thing. */
    var submitted = false;
    var dismissSent = false;

    function reportDismiss() {
      if (submitted || dismissSent || isPreview) {
        return;
      }
      dismissSent = true;
      sendEvent(campaign, "dismiss");
    }

    var pill = el("div", {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: "2147483000",
      display: "flex",
      alignItems: "center",
      gap: "2px",
      borderRadius: "999px",
      background: settings.headerGradient
        ? "linear-gradient(135deg, " +
          settings.headerBackground +
          ", " +
          settings.headerGradientEnd +
          ")"
        : settings.headerBackground,
      boxShadow: "0 12px 28px rgba(0,0,0,.32)",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, sans-serif",
    });

    var teaserStep = findStep(campaign.steps, "teaser");
    var teaserText =
      (teaserStep &&
        teaserStep.blocks[0] &&
        teaserStep.blocks[0].text) ||
      "Get an offer";

    var pillLabel = el(
      "button",
      {
        maxWidth: "240px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        padding: "13px 8px 13px 20px",
        border: "none",
        background: "transparent",
        color: "#FFFFFF",
        fontSize: "14px",
        fontWeight: "700",
        cursor: "pointer",
      },
      { type: "button" },
    );
    pillLabel.textContent = teaserText;
    pillLabel.addEventListener("click", function () {
      openOffer();
    });

    var pillClose = el(
      "button",
      {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "22px",
        height: "22px",
        marginRight: "10px",
        borderRadius: "50%",
        border: "none",
        background: "rgba(255,255,255,0.18)",
        color: "#FFFFFF",
        fontSize: "13px",
        cursor: "pointer",
        flexShrink: "0",
      },
      { type: "button", "aria-label": "Dismiss" },
    );
    pillClose.textContent = "×";
    pillClose.addEventListener("click", function (event) {
      event.stopPropagation();
      markDismissed(campaign.campaignId);
      reportDismiss();
      pill.remove();
    });

    pill.appendChild(pillLabel);
    pill.appendChild(pillClose);

    function renderStep(stepId) {
      var step = findStep(campaign.steps, stepId);
      if (!step) {
        return null;
      }

      var card = el("div", {
        width: "100%",
        maxWidth: "360px",
        borderRadius: settings.popupBorderRadius + "px",
        overflow: "hidden",
        background: settings.bodyBackground,
        boxShadow: "0 20px 50px rgba(0,0,0,.4)",
      });

      var header = el("div", {
        position: "relative",
        minHeight: settings.headerHeight + "px",
        padding: "20px",
        boxSizing: "border-box",
        background: settings.headerGradient
          ? "linear-gradient(135deg, " +
            settings.headerBackground +
            ", " +
            settings.headerGradientEnd +
            ")"
          : settings.headerBackground,
      });

      var brandBlock = null;
      for (var s = 0; s < campaign.steps.length; s += 1) {
        for (
          var b = 0;
          b < campaign.steps[s].blocks.length;
          b += 1
        ) {
          if (campaign.steps[s].blocks[b].type === "brand") {
            brandBlock = campaign.steps[s].blocks[b];
          }
        }
      }

      if (brandBlock) {
        header.appendChild(
          renderBlock(brandBlock, function () {}),
        );
      }

      var closeButton = el(
        "button",
        {
          position: "absolute",
          right: "14px",
          top: "12px",
          width: settings.closeButtonSize + "px",
          height: settings.closeButtonSize + "px",
          borderRadius: settings.closeButtonRadius + "%",
          border: "none",
          background: settings.closeButtonBackground,
          color: settings.closeButtonColor,
          cursor: "pointer",
        },
        { type: "button" },
      );
      closeButton.textContent = settings.closeButtonText;
      closeButton.addEventListener("click", function () {
        closeOverlay();
      });
      header.appendChild(closeButton);

      var body = el("div", {
        padding: settings.bodyPadding + "px",
        boxSizing: "border-box",
      });

      var contentBlocks = step.blocks.filter(function (
        block,
      ) {
        return block.type !== "brand";
      });

      contentBlocks.forEach(function (block) {
        body.appendChild(
          renderBlock(block, function () {
            if (stepId === "offer") {
              handleOfferSubmit(body);
            }
          }),
        );
      });

      if (settings.footerVisible && stepId === "offer") {
        var footer = el(
          "div",
          {
            marginTop: "16px",
            textAlign: "center",
            color: settings.footerColor,
            fontSize: "12px",
            textDecoration: "underline",
            cursor: "pointer",
          },
          { type: "button" },
        );
        footer.textContent = settings.footerText;
        footer.addEventListener("click", function () {
          closeOverlay();
        });
        body.appendChild(footer);
      }

      card.appendChild(header);
      card.appendChild(body);
      return card;
    }

    function handleOfferSubmit(body) {
      var inputs = body.querySelectorAll("[data-mq-field]");
      var values = {};
      for (var i = 0; i < inputs.length; i += 1) {
        values[inputs[i].getAttribute("data-mq-field")] =
          inputs[i].value;
      }

      submitContact(campaign, values, function () {
        /* They gave us their details, so the "if collected"
           cooldown starts now. */
        submitted = true;
        markCollected(campaign.campaignId);
        showStep("success");
      });
    }

    function showStep(stepId) {
      if (!overlay) {
        return;
      }
      overlay.innerHTML = "";
      var card = renderStep(stepId);
      if (card) {
        overlay.appendChild(card);
      }
    }

    function closeOverlay() {
      if (overlay) {
        reportDismiss();
        overlay.remove();
        overlay = null;
      }
    }

    function openOffer() {
      if (overlay) {
        return;
      }

      /* Hide the teaser while the offer is open — otherwise
         both are visible stacked on top of each other. */
      pill.remove();

      overlay = el("div", {
        position: "fixed",
        inset: "0",
        zIndex: "2147483001",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        boxSizing: "border-box",
        background: "rgba(20,23,28,0.45)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, sans-serif",
      });
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
          closeOverlay();
        }
      });
      document.body.appendChild(overlay);

      /* Always open on the real Offer step. Success only shows
         right after an actual submission in this same visit —
         it should never be "stuck" from a past visit. */
      showStep("offer");
    }

    /* ---------------- TRIGGER ---------------- */

    var delayTimer = null;
    var scrollHandler = null;
    var cancelExitIntent = null;

    function showTeaser() {
      /* The view is counted here, when the popup actually
         reaches the screen — not when the campaign was picked.
         A delay or scroll trigger may never fire, and a visitor
         who never saw anything must not have it charged against
         their frequency cap.

         Guarded so a re-entrant trigger cannot double count,
         and skipped entirely for the ?mq_campaign= preview so a
         merchant testing their own popup does not burn the cap
         they are trying to test. */

      if (
        !isPreview &&
        countedCampaigns.indexOf(
          campaign.campaignId,
        ) === -1
      ) {
        countedCampaigns.push(
          campaign.campaignId,
        );
        markViewed(campaign.campaignId);
        sendEvent(campaign, "view");
      }

      document.body.appendChild(pill);
    }

    /* Everything this widget attached to the page, undone. The
       timers and listeners matter as much as the elements: a
       pending delay or a live scroll handler would otherwise
       put the popup back after the campaign stopped being
       allowed on this screen size. */

    function destroy() {
      if (delayTimer) {
        window.clearTimeout(delayTimer);
        delayTimer = null;
      }

      if (scrollHandler) {
        window.removeEventListener(
          "scroll",
          scrollHandler,
        );
        scrollHandler = null;
      }

      if (cancelExitIntent) {
        cancelExitIntent();
        cancelExitIntent = null;
      }

      pill.remove();

      if (overlay) {
        overlay.remove();
        overlay = null;
      }
    }

    if (campaign.trigger === "Exit intent") {
      cancelExitIntent = onExitIntent(showTeaser);
    } else if (campaign.trigger === "After delay") {
      delayTimer = window.setTimeout(
        showTeaser,
        campaign.triggerDelaySeconds * 1000,
      );
    } else if (campaign.trigger === "Scroll depth") {
      var handled = false;

      scrollHandler = function () {
        if (handled) {
          return;
        }
        var doc = document.documentElement;
        var scrolled =
          (doc.scrollTop /
            (doc.scrollHeight - doc.clientHeight)) *
          100;
        if (scrolled >= campaign.triggerScrollPercent) {
          handled = true;
          showTeaser();
        }
      };

      window.addEventListener(
        "scroll",
        scrollHandler,
      );
    } else {
      showTeaser();
    }

    return {
      campaign: campaign,
      isOpen: function () {
        return Boolean(overlay);
      },
      destroy: destroy,
    };
  }

  /* ------------------------------------------------------------
     BOOT
  ------------------------------------------------------------ */

  /* Two different things, deliberately kept apart.

     forcedCampaignId is a preview: ?mq_campaign=<id> on the page
     URL shows that campaign immediately and skips every check,
     so a merchant can look at their own work. It only happens
     when someone deliberately visits such a link.

     pinnedCampaignId is production: data-campaign on the script
     tag means "this website runs only this campaign". It is a
     filter, not an override — device, frequency and cooldown
     rules all still apply, exactly as they would without it.
     Confusing the two would let a pinned snippet ignore the
     caps the merchant set. */

  function forcedCampaignId() {
    try {
      return (
        new URL(
          window.location.href,
        ).searchParams.get("mq_campaign") || null
      );
    } catch (error) {
      return null;
    }
  }

  function pinnedCampaignId() {
    return thisScript.getAttribute(
      "data-campaign",
    );
  }

  /* ------------------------------------------------------------
     SELECTION, AND KEEPING IT TRUE

     Device targeting used to be decided once, at page load, and
     never looked at again. Someone who resized their window,
     rotated a tablet, or opened dev tools wide enough to cross
     768px kept whatever had been decided for the width they
     happened to load at: a desktop-only campaign stayed on
     screen down at phone width, and a mobile-only one never
     appeared however narrow the window got until the page was
     reloaded.

     So the width is watched, and when it crosses into another
     bucket the choice is made again from the campaigns already
     fetched. Nothing is re-requested; only the decision is
     redone.
     ------------------------------------------------------------ */

  var loadedCampaigns = [];
  var activeWidget = null;
  var lastDevice = null;

  function pickCampaign() {
    var pinnedId = pinnedCampaignId();

    for (
      var i = 0;
      i < loadedCampaigns.length;
      i += 1
    ) {
      var campaign = loadedCampaigns[i];

      /* A pinned snippet narrows this website down to one
         campaign, then every normal rule below still runs. */
      if (
        pinnedId &&
        campaign.campaignId !== pinnedId
      ) {
        continue;
      }

      if (!matchesPageTargets(campaign)) {
        continue;
      }

      if (!matchesDevices(campaign)) {
        continue;
      }

      if (!matchesCampaignAudience(campaign)) {
        continue;
      }

      if (!withinFrequencyCap(campaign)) {
        continue;
      }

      if (collectedBlocks(campaign)) {
        continue;
      }

      if (dismissedBlocks(campaign)) {
        continue;
      }

      var settings = popupSettingsFor(
        campaign.steps,
      );

      if (!matchesAudience(settings)) {
        continue;
      }

      return campaign;
    }

    return null;
  }

  function applySelection() {
    if (activeWidget) {
      /* Somebody part-way through the form is never
         interrupted, whatever the window is doing. Their
         submission matters more than a targeting rule, and
         yanking the popup mid-typing would lose what they had
         entered. */
      if (activeWidget.isOpen()) {
        return;
      }

      if (
        matchesDevices(activeWidget.campaign)
      ) {
        return;
      }

      activeWidget.destroy();
      activeWidget = null;
    }

    var campaign = pickCampaign();

    if (campaign) {
      activeWidget = buildWidget(campaign);
    }
  }

  function watchViewport() {
    var pending = null;

    function onChange() {
      /* Debounced: dragging a window edge fires this dozens of
         times a second, and rebuilding on each one would flash
         the popup in and out. */
      if (pending) {
        window.clearTimeout(pending);
      }

      pending = window.setTimeout(function () {
        pending = null;

        var device = currentDevice();

        /* Only a move into a different bucket matters. Every
           other resize leaves the answer unchanged. */
        if (device === lastDevice) {
          return;
        }

        lastDevice = device;
        applySelection();
      }, 200);
    }

    window.addEventListener("resize", onChange);
    window.addEventListener(
      "orientationchange",
      onChange,
    );
  }

  function boot() {
    markVisited();

    var forcedId = forcedCampaignId();

    /* The hostname decides which campaigns this website is
       allowed to run. Sending it lets a merchant scope a
       campaign to one site instead of every site carrying the
       snippet. Campaigns set to "all websites" ignore it. */

    fetch(
      apiUrl +
        "?shop=" +
        encodeURIComponent(shop) +
        "&host=" +
        encodeURIComponent(
          window.location.hostname || "",
        ),
    )
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        var campaigns = data.campaigns || [];

        if (forcedId) {
          for (var f = 0; f < campaigns.length; f += 1) {
            if (campaigns[f].campaignId === forcedId) {
              buildWidget(campaigns[f], true);
              return;
            }
          }
          console.warn(
            "[MQ Popups] mq_campaign=" +
              forcedId +
              " did not match any live campaign for this shop.",
          );
          return;
        }

        loadedCampaigns = campaigns;
        lastDevice = currentDevice();

        applySelection();
        watchViewport();
      })
      .catch(function () {
        /* the host page should never see this fail */
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      boot,
    );
  } else {
    boot();
  }
})();
