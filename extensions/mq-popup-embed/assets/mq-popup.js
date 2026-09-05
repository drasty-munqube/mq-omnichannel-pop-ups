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

  function matchesAudience(settings) {
    var returning = isReturningVisitor();

    if (settings.audienceNewOnly && returning) {
      return false;
    }

    if (settings.audienceReturningOnly && !returning) {
      return false;
    }

    var isMobile = window.innerWidth < 768;

    if (
      settings.audienceDevice === "mobile" &&
      !isMobile
    ) {
      return false;
    }

    if (
      settings.audienceDevice === "desktop" &&
      isMobile
    ) {
      return false;
    }

    return true;
  }

  function dismissedRecently(campaignId) {
    try {
      var raw = window.localStorage.getItem(
        "mq_dismissed_" + campaignId,
      );
      if (!raw) {
        return false;
      }
      var dismissedAt = Number(raw);
      var dayMs = 24 * 60 * 60 * 1000;
      return Date.now() - dismissedAt < dayMs;
    } catch (error) {
      return false;
    }
  }

  function markDismissed(campaignId) {
    try {
      window.localStorage.setItem(
        "mq_dismissed_" + campaignId,
        String(Date.now()),
      );
    } catch (error) {
      /* localStorage unavailable */
    }
  }

  function markSubmitted(campaignId) {
    try {
      window.localStorage.setItem(
        "mq_submitted_" + campaignId,
        "1",
      );
    } catch (error) {
      /* localStorage unavailable */
    }
  }

  function alreadySubmitted(campaignId) {
    try {
      return (
        window.localStorage.getItem(
          "mq_submitted_" + campaignId,
        ) === "1"
      );
    } catch (error) {
      return false;
    }
  }

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
        markSubmitted(campaign.campaignId);
        onDone();
      });
  }

  function buildWidget(campaign) {
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
      showStep(
        alreadySubmitted(campaign.campaignId)
          ? "success"
          : "offer",
      );
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

        if (dismissedRecently(campaign.campaignId)) {
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
