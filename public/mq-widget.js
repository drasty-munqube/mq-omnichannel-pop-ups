/* ============================================================
   MQ Popups — universal embed script

   Drop this on ANY website (not just Shopify):

     <script
       src="https://<your-app-domain>/mq-widget.js"
       data-shop="your-shop.myshopify.com"
       async
     ></script>

   "data-shop" is the Shopify store this app is installed on —
   that's what identifies which campaigns/popups to load. It
   works on any domain because it talks to /api/widget, a public
   CORS-open endpoint (app/routes/api.widget.tsx), instead of
   Shopify's App Proxy (which only works from inside a Shopify
   storefront — see extensions/mq-popup-embed for that version).

   Vanilla JS, no dependencies, safe to fail silently: nothing
   here should ever break the host page.

   KNOWN LIMIT: "Specific pages" campaign targeting only
   understands Shopify page types (home/product/collection/…),
   so on a non-Shopify site those campaigns are skipped — only
   "All pages" campaigns show here for now.
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

  function isReturningVisitor() {
    return safeGet(STORAGE_PREFIX + "seen") === "1";
  }

  function markVisited() {
    safeSet(STORAGE_PREFIX + "seen", "1");
  }

  /* New-vs-returning still lives on the popup. Device targeting
     used to live here too and no longer does — it is a campaign
     setting now, handled by matchesDevices below. */

  function matchesAudience(settings) {
    var returning = isReturningVisitor();

    if (settings.audienceNewOnly && returning) {
      return false;
    }

    if (settings.audienceReturningOnly && !returning) {
      return false;
    }

    return true;
  }

  /* ----------------------------------------------------------
     DEVICE

     Width buckets rather than user-agent sniffing: what decides
     whether a popup fits is how much room it has, and a resized
     desktop window should behave like the size it actually is.
     ---------------------------------------------------------- */

  function currentDevice() {
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
    if (
      !devices ||
      !devices.length ||
      devices.length === 3
    ) {
      return true;
    }

    return (
      devices.indexOf(currentDevice()) !== -1
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

  function buildWidget(campaign) {
    /* Counted once per page load, the moment the campaign is
       chosen — that is what "shown to this visitor" means for a
       frequency cap. Re-renders inside the same popup (teaser to
       offer to success) must not count again. */
    markViewed(campaign.campaignId);

    var settings = popupSettingsFor(campaign.steps);
    var overlay = null;

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

    function showTeaser() {
      document.body.appendChild(pill);
    }

    if (campaign.trigger === "After delay") {
      window.setTimeout(
        showTeaser,
        campaign.triggerDelaySeconds * 1000,
      );
    } else if (campaign.trigger === "Scroll depth") {
      var handled = false;
      window.addEventListener("scroll", function () {
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
      });
    } else {
      showTeaser();
    }
  }

  /* ------------------------------------------------------------
     BOOT
  ------------------------------------------------------------ */

  function forcedCampaignId() {
    /* Demo/testing convenience: ?mq_campaign=<id> on the page
       URL, or a data-campaign attribute on the script tag,
       skips targeting/audience/dismiss checks and shows that
       exact campaign. Never used in normal production traffic
       unless a merchant deliberately links to it. */
    try {
      var fromUrl = new URL(window.location.href)
        .searchParams.get("mq_campaign");
      if (fromUrl) {
        return fromUrl;
      }
    } catch (error) {
      /* ignore */
    }

    return thisScript.getAttribute("data-campaign");
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
              buildWidget(campaigns[f]);
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

        for (var i = 0; i < campaigns.length; i += 1) {
          var campaign = campaigns[i];

          if (campaign.pageTargetMode === "specific") {
            /* Shopify-specific page rules don't translate to
               an arbitrary site — see file header. */
            continue;
          }

          if (!matchesDevices(campaign)) {
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

          var settings = popupSettingsFor(campaign.steps);

          if (!matchesAudience(settings)) {
            continue;
          }

          buildWidget(campaign);
          break;
        }
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
