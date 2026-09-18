/* ============================================================
   MQ Popups — storefront runtime

   Vanilla JS on purpose: this file ships straight to shoppers'
   browsers from Shopify's CDN, so it stays framework-free and
   dependency-free. It mirrors the same Step/Block/PopupSettings
   shape produced by the admin popup builder
   (app/routes/app_.popups.new.tsx) and renders it live.
   ============================================================ */

(function () {
  "use strict";

  var root = document.getElementById("mq-popup-root");
  if (!root) {
    return;
  }

  var shop = root.dataset.shop;
  var pageType = root.dataset.pageType || "";
  var pageHandle = root.dataset.pageHandle || "";
  var proxyPath = root.dataset.proxyPath || "/apps/mq-popups";

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

  /* ------------------------------------------------------------
     PAGE / DEVICE / AUDIENCE MATCHING
  ------------------------------------------------------------ */

  function routeIdForPageType(type) {
    var map = {
      index: "route:index",
      product: "route:product",
      collection: "route:collection",
      cart: "route:cart",
      search: "route:search",
      article: "route:blog",
      blog: "route:blog",
    };
    return map[type] || null;
  }

  /* Normalised the same way the admin stores menu paths:
     lowercase, no query, no hash, no trailing slash. Anything
     else and a target picked from the store's own navigation
     would never match the page it came from. */

  function currentPath() {
    var path = (
      window.location.pathname || "/"
    ).toLowerCase();

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
    var routeId = routeIdForPageType(pageType);

    if (routeId && targets.indexOf(routeId) !== -1) {
      return true;
    }

    if (
      pageHandle &&
      targets.indexOf("page:" + pageHandle) !== -1
    ) {
      return true;
    }

    /* Targets chosen from the store's navigation, which can
       point at anything — a collection, the home page, a policy
       page — so they are matched by path rather than by type. */
    if (
      targets.indexOf("path:" + currentPath()) !==
      -1
    ) {
      return true;
    }

    return false;
  }

  function isReturningVisitor() {
    try {
      return (
        window.localStorage.getItem("mq_seen") === "1"
      );
    } catch (error) {
      return false;
    }
  }

  function markVisited() {
    try {
      window.localStorage.setItem("mq_seen", "1");
    } catch (error) {
      /* localStorage unavailable — skip visit tracking */
    }
  }

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

  /* New-vs-returning still lives on the popup. Device targeting
     used to live here too and no longer does — it is a campaign
     setting now, handled by matchesDevices below. Kept identical
     to public/mq-widget.js so the storefront and third-party
     sites never disagree about who sees what. */

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

  function viewCount(campaignId) {
    return (
      Number(
        safeGet("mq_views_" + campaignId),
      ) || 0
    );
  }

  function markViewed(campaignId) {
    safeSet(
      "mq_views_" + campaignId,
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

  /* 0 days means never show it to this visitor again, anything
     higher is a waiting period. */

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
      "mq_collected_" + campaign.campaignId,
      Number(campaign.reshowCollectedDays) || 0,
    );
  }

  function markCollected(campaignId) {
    safeSet(
      "mq_collected_" + campaignId,
      String(Date.now()),
    );
  }

  function dismissedBlocks(campaign) {
    return blockedSince(
      "mq_dismissed_" + campaign.campaignId,
      Number(campaign.reshowDismissedDays) || 0,
    );
  }

  function markDismissed(campaignId) {
    safeSet(
      "mq_dismissed_" + campaignId,
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
    var settings =
      (offer && offer.settings) || {};

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
      letterSpacing:
        (block.letterSpacing || 0) + "px",
      opacity: String(
        (block.opacity != null
          ? block.opacity
          : 100) / 100,
      ),
    };

    if (
      block.type === "button" ||
      block.type === "channel"
    ) {
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
      var inputTypeMap = {
        text: "text",
        number: "number",
        email: "email",
        phone: "tel",
      };
      var inputType =
        inputTypeMap[block.fieldType] || "text";

      var attrs = {
        type: inputType,
        placeholder:
          block.placeholder || block.text || "",
        "data-mq-field": block.id,
        "data-mq-field-type":
          block.fieldType || "text",
      };

      if (block.fieldRequired) {
        attrs.required = "required";
      }

      if (inputType === "number") {
        attrs.inputmode = "numeric";
      }

      if (inputType === "tel") {
        attrs.inputmode = "tel";
      }

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
            "1px solid " +
            (block.borderColor || "#D1D5DB"),
          borderRadius:
            (block.borderRadius != null
              ? block.borderRadius
              : 8) + "px",
        }),
        attrs,
      );
      return input;
    }

    var text = el("div", common);
    text.textContent = block.text || "";
    return text;
  }

  /* ------------------------------------------------------------
     WIDGET
  ------------------------------------------------------------ */

  function submitContact(
    campaign,
    fieldValues,
    emailValue,
    onDone,
  ) {
    var email = emailValue;
    if (!email) {
      for (var key in fieldValues) {
        if (/@/.test(fieldValues[key] || "")) {
          email = fieldValues[key];
          break;
        }
      }
    }

    fetch(proxyPath + "/popups?shop=" + encodeURIComponent(shop), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        popupId: campaign.popupId,
        popupName: campaign.popupName,
        campaignId: campaign.campaignId,
        email: email,
        fields: fieldValues,
        pageUrl: window.location.href,
      }),
    })
      .catch(function () {
        /* best-effort — the popup still moves to Success */
      })
      .then(function () {
        onDone();
      });
  }

  function buildWidget(campaign) {
    /* Counted once per page load, the moment the campaign is
       chosen — that is what "shown to this visitor" means for a
       frequency cap. */
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

    var teaserStep = findStep(
      campaign.steps,
      "teaser",
    );
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
    pillClose.addEventListener("click", function (
      event,
    ) {
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
        borderRadius:
          settings.popupBorderRadius + "px",
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
          if (
            campaign.steps[s].blocks[b].type ===
            "brand"
          ) {
            brandBlock =
              campaign.steps[s].blocks[b];
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
          borderRadius:
            settings.closeButtonRadius + "%",
          border: "none",
          background:
            settings.closeButtonBackground,
          color: settings.closeButtonColor,
          cursor: "pointer",
        },
        { type: "button" },
      );
      closeButton.textContent =
        settings.closeButtonText;
      closeButton.addEventListener(
        "click",
        function () {
          closeOverlay();
        },
      );
      header.appendChild(closeButton);

      var body = el("div", {
        padding: settings.bodyPadding + "px",
        boxSizing: "border-box",
      });

      var contentBlocks = step.blocks.filter(
        function (block) {
          return block.type !== "brand";
        },
      );

      contentBlocks.forEach(function (block) {
        body.appendChild(
          renderBlock(block, function () {
            if (stepId === "offer") {
              handleOfferSubmit(body);
            }
          }),
        );
      });

      if (
        settings.footerVisible &&
        stepId === "offer"
      ) {
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
        footer.addEventListener(
          "click",
          function () {
            closeOverlay();
          },
        );
        body.appendChild(footer);
      }

      card.appendChild(header);
      card.appendChild(body);
      return card;
    }

    function handleOfferSubmit(body) {
      var inputs = body.querySelectorAll(
        "[data-mq-field]",
      );
      var values = {};
      var emailValue = null;

      for (var i = 0; i < inputs.length; i += 1) {
        var input = inputs[i];

        if (
          input.hasAttribute("required") &&
          !input.value.trim()
        ) {
          input.style.borderColor = "#E0574F";
          input.focus();
          return;
        }

        var fieldKey = input.getAttribute(
          "data-mq-field",
        );
        values[fieldKey] = input.value;

        if (
          input.getAttribute(
            "data-mq-field-type",
          ) === "email"
        ) {
          emailValue = input.value;
        }
      }

      submitContact(
        campaign,
        values,
        emailValue,
        function () {
          /* They gave us their details, so the "if collected"
             cooldown starts now. */
          markCollected(campaign.campaignId);
          showStep("success");
        },
      );
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
      overlay.addEventListener(
        "click",
        function (event) {
          if (event.target === overlay) {
            closeOverlay();
          }
        },
      );
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

  markVisited();

  fetch(proxyPath + "/popups?shop=" + encodeURIComponent(shop))
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      var campaigns = data.campaigns || [];

      for (var i = 0; i < campaigns.length; i += 1) {
        var campaign = campaigns[i];

        if (!matchesPageTargets(campaign)) {
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

        var settings = popupSettingsFor(
          campaign.steps,
        );

        if (!matchesAudience(settings)) {
          continue;
        }

        buildWidget(campaign);
        break;
      }
    })
    .catch(function () {
      /* storefront should never break if this fails */
    });
})();
