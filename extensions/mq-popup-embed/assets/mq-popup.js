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

  /* Liquid knows whether a customer is signed in, so "Customers"
     targeting can be honoured properly on the storefront. */
  var isLoggedInCustomer =
    root.dataset.customer === "true";

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

  /* ----------------------------------------------------------
     TEST LINKS FOR MERCHANTS

     This browser remembers each campaign: how often it was seen,
     that the shopper signed up, that they closed it. That is what
     keeps a popup from nagging real shoppers, and it is also why
     a merchant who tested their own popup once stops seeing it.
     Three links on any storefront page help:

       ?mq_campaign=<id>  Preview: show that campaign right away,
                          skipping every rule. Nothing is
                          remembered and nothing is counted.
       ?mq_reset=1        Forget what this browser remembers about
                          campaigns, then run normally.
       ?mq_debug=1        Log to the console why each campaign was
                          or was not shown.
     ---------------------------------------------------------- */

  function urlParam(name) {
    try {
      return new URL(window.location.href).searchParams.get(name);
    } catch (error) {
      return null;
    }
  }

  var previewCampaignId = urlParam("mq_campaign");
  var debugMode = urlParam("mq_debug") === "1";

  function debugLog(message) {
    if (debugMode && window.console) {
      window.console.info("[MQ Popups] " + message);
    }
  }

  if (urlParam("mq_reset") === "1") {
    try {
      var memoryKeys = [];
      for (var mk = 0; mk < window.localStorage.length; mk += 1) {
        var memoryKey = window.localStorage.key(mk);
        if (
          /^mq_(views|collected|dismissed)_/.test(memoryKey) ||
          memoryKey === "mq_seen" ||
          memoryKey === "mq_first_visit" ||
          memoryKey === "mq_last_active"
        ) {
          memoryKeys.push(memoryKey);
        }
      }
      for (var rk = 0; rk < memoryKeys.length; rk += 1) {
        window.localStorage.removeItem(memoryKeys[rk]);
      }
      if (window.console) {
        window.console.info(
          "[MQ Popups] This browser's popup memory was reset (" +
            memoryKeys.length +
            " items).",
        );
      }
    } catch (error) {
      /* storage blocked: nothing to reset */
    }
  }

  /* Nothing is written or counted in the theme editor or in a
     preview, so testing never changes what real visits see. */
  function memoryOff() {
    return inThemeEditor() || Boolean(previewCampaignId);
  }

  /* ----------------------------------------------------------
     NEW OR RETURNING VISITOR

     A visit is a run of page views with no gap longer than 30
     minutes, the usual analytics definition. A shopper counts as
     new for their whole first visit, so a first-visit (welcome)
     popup can still show on the second or third page they open,
     and as returning from their next visit on. Browsers that only
     have the older mq_seen flag count as returning.

     Read ONCE, before markVisited() runs. Reading it later would
     always say "returning", because boot marks this visit as
     seen, which silently made "New visitors" targeting match
     nobody at all.
     ---------------------------------------------------------- */

  var VISIT_GAP_MS = 30 * 60 * 1000;

  var wasReturningVisitor = (function () {
    if (safeGet("mq_seen") !== "1") {
      return false;
    }

    var lastActive = Number(safeGet("mq_last_active") || 0);
    var inFirstVisit =
      safeGet("mq_first_visit") === "1" &&
      lastActive > 0 &&
      Date.now() - lastActive < VISIT_GAP_MS;

    return !inFirstVisit;
  })();

  /* ------------------------------------------------------------
     THE EDITOR IS NOT A SHOPPER

     Everything below remembers something about the person
     looking at the page: that they have been here, how many
     times they have seen a campaign, that they closed it, that
     they submitted it. All of it is read back later to decide
     whether the popup may appear again.

     A merchant designing in the theme editor is looking at the
     same origin as the storefront, so anything written there
     lands in the same browser storage the real preview reads.
     Closing the popup once while styling it therefore wrote a
     real dismissal, and a campaign set to wait nine days before
     showing again then stayed hidden on the storefront for nine
     days. The merchant had done nothing wrong and had no way to
     see why: the editor kept showing the popup, because the
     editor is where they kept opening it from.

     So the editor reads this state but never writes it.
     Frequency caps and cooldowns still demonstrably apply
     there, because a real visit can still have written them;
     what can no longer happen is a merchant quietly spending
     their own campaign's budget while looking at it.
     ------------------------------------------------------------ */

  function markVisited() {
    if (memoryOff()) {
      return;
    }

    /* safeSet swallows a blocked localStorage. */
    safeSet("mq_seen", "1");
    safeSet("mq_first_visit", wasReturningVisitor ? "0" : "1");
    safeSet("mq_last_active", String(Date.now()));
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
     first time. On the storefront "Customers" is knowable —
     Liquid tells us whether someone is logged in.
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
     DEVICE DETECTION

     Real visitors are judged purely on width. Shopify's theme
     editor is the exception: it renders the mobile preview at a
     narrow size on screen while the preview iframe can still
     report a desktop width, so width alone mis-detects there and
     a desktop-only campaign would wrongly appear in the mobile
     preview.

     The editor carries the chosen device in the admin URL as
     previewMode=mobile (desktop preview carries no parameter at
     all). That URL belongs to admin.shopify.com, which this
     iframe cannot read directly — cross-origin. So we look at
     the two places the value can legitimately reach us: our own
     query string, and document.referrer (the admin page that
     framed us). Every lookup is wrapped, because a blocked
     referrer policy must never break the widget.
     ---------------------------------------------------------- */

  function inThemeEditor() {
    try {
      return Boolean(
        window.Shopify && window.Shopify.designMode,
      );
    } catch (error) {
      return false;
    }
  }

  function previewModeDevice() {
    var sources = [];

    try {
      sources.push(window.location.search || "");
    } catch (error) {
      /* ignore */
    }

    /* The referrer is read only inside the theme editor. On a
       live storefront it is whatever page the shopper arrived
       from, so a single link carrying previewMode=mobile would
       pin that shopper to mobile for the rest of their visit
       and quietly break device targeting for them. */
    if (inThemeEditor()) {
      try {
        sources.push(document.referrer || "");
      } catch (error) {
        /* ignore */
      }
    }

    for (var i = 0; i < sources.length; i += 1) {
      var match = /[?&]previewMode=([a-zA-Z]+)/.exec(
        sources[i],
      );

      if (!match) {
        continue;
      }

      var mode = match[1].toLowerCase();

      if (mode === "mobile") {
        return "mobile";
      }

      if (mode === "tablet") {
        return "tablet";
      }

      if (
        mode === "desktop" ||
        mode === "full"
      ) {
        return "desktop";
      }
    }

    return null;
  }

  function widthDevice() {
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

  function currentDevice() {
    /* An explicit ?previewMode= wins, because it is the only
       signal somebody deliberately set. */
    var previewed = previewModeDevice();

    if (previewed) {
      return previewed;
    }

    /* Everything else is decided by width, the theme editor
       included.

       This used to return a hard "desktop" whenever the editor
       was open and no previewMode had been found. The idea was
       that the editor's preview iframe reports a desktop width
       even in the mobile preview, so width could not be
       trusted. It does not: switching the preview resizes the
       iframe, and the iframe's own innerWidth follows it.

       What the parameter lookup could not do was follow that
       switch. It lives on the admin URL, which this iframe
       cannot read cross-origin, and the referrer is captured
       once at load and never changes when the merchant clicks
       between desktop and mobile. So the lookup returned null
       on every toggle, the hard "desktop" took over, and the
       width measurement that was already correct never ran.
       Device targeting therefore reported "desktop" for every
       preview: a mobile-only campaign never appeared, and a
       desktop-only one always did. */
    return widthDevice();
  }

  function matchesDevices(campaign) {
    var devices = campaign.devices;

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

    var device = currentDevice();
    var allowed = unique.indexOf(device) !== -1;

    /* Only ever noisy inside the editor, where a merchant is
       actively checking why a popup did or didn't appear. */
    if (inThemeEditor()) {
      console.log(
        "[MQ Popups] device=" +
          device +
          " campaign=" +
          (campaign.popupName || campaign.campaignId) +
          " allows=" +
          unique.join(",") +
          " -> " +
          (allowed ? "shown" : "hidden"),
      );
    }

    return allowed;
  }

  function viewCount(campaignId) {
    return (
      Number(
        safeGet("mq_views_" + campaignId),
      ) || 0
    );
  }

  function markViewed(campaignId) {
    if (memoryOff()) {
      return;
    }

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
    /* "No limit" means no conditions at all: the popup shows every
       time, whether or not this browser signed up or closed it. */
    if (campaign.frequencyMode === "unlimited") {
      return false;
    }

    return blockedSince(
      "mq_collected_" + campaign.campaignId,
      Number(campaign.reshowCollectedDays) || 0,
    );
  }

  function markCollected(campaignId) {
    if (memoryOff()) {
      return;
    }

    safeSet(
      "mq_collected_" + campaignId,
      String(Date.now()),
    );
  }

  function dismissedBlocks(campaign) {
    /* "No limit" means no conditions at all: the popup shows every
       time, whether or not this browser signed up or closed it. */
    if (campaign.frequencyMode === "unlimited") {
      return false;
    }

    return blockedSince(
      "mq_dismissed_" + campaign.campaignId,
      Number(campaign.reshowDismissedDays) || 0,
    );
  }

  function markDismissed(campaignId) {
    if (memoryOff()) {
      return;
    }

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

  /* Where visitor events go. Nothing is tracked from the theme
     editor, and consent follows the store's own cookie banner
     (see watchShopifyConsent). */
  var TRACK_URL =
    proxyPath + "/popups/track?shop=" + encodeURIComponent(shop);
  var CONSENT_MODE = "shopify";
  var TRACKING_OFF = memoryOff();

  /* ------------------------------------------------------------
     ANONYMOUS VISITOR

     Every visitor to a page with a live campaign gets a random id
     (a UUID made in this browser), kept in a first-party cookie
     (mq_aid) with localStorage as a backup, so the same person is
     recognised on later visits. Nothing else is stored in either:
     no email, no name, nothing personal.

     The id travels with page views, popup shown / closed events
     and the signup itself. When the visitor submits their email,
     the server links this id to their contact and gives the
     contact the whole journey so far.

     Consent: tracking starts only once it is allowed. See
     CONSENT_MODE above; MQPopups.grantConsent() and
     MQPopups.revokeConsent() let a site's own cookie banner turn
     it on and off. Popups keep working either way.

     Events are queued and sent in small batches with sendBeacon
     (as text/plain, so no CORS preflight), never awaited, so the
     page and the popup are never slowed down by them.
  ------------------------------------------------------------ */

  var AID_NAME = "mq_aid";
  var CONSENT_KEY = "mq_consent";
  var AID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  var ONE_YEAR = 60 * 60 * 24 * 365;

  function makeUuid() {
    try {
      if (window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID();
      }
    } catch (error) {
      /* fall back below */
    }

    var bytes = new Uint8Array(16);
    try {
      window.crypto.getRandomValues(bytes);
    } catch (error) {
      for (var r = 0; r < 16; r += 1) {
        bytes[r] = Math.floor(Math.random() * 256);
      }
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    var hex = [];
    for (var h = 0; h < 16; h += 1) {
      hex.push((bytes[h] + 0x100).toString(16).slice(1));
    }
    return (
      hex.slice(0, 4).join("") + "-" +
      hex.slice(4, 6).join("") + "-" +
      hex.slice(6, 8).join("") + "-" +
      hex.slice(8, 10).join("") + "-" +
      hex.slice(10, 16).join("")
    );
  }

  function readCookie(name) {
    try {
      var match = document.cookie.match(
        new RegExp("(?:^|; )" + name + "=([^;]*)"),
      );
      return match ? decodeURIComponent(match[1]) : null;
    } catch (error) {
      return null;
    }
  }

  function writeCookie(name, value, maxAge) {
    try {
      document.cookie =
        name + "=" + encodeURIComponent(value) +
        "; Max-Age=" + maxAge +
        "; Path=/; SameSite=Lax" +
        (window.location.protocol === "https:" ? "; Secure" : "");
    } catch (error) {
      /* cookies blocked: localStorage still works */
    }
  }

  function storeGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      /* storage blocked */
    }
  }

  function storeRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      /* storage blocked */
    }
  }

  /* "granted" | "pending" | "denied" */
  var consentState =
    CONSENT_MODE === "required"
      ? storeGet(CONSENT_KEY) === "granted"
        ? "granted"
        : "pending"
      : CONSENT_MODE === "shopify"
        ? "pending"
        : "granted";

  var anonymousId = null;

  /* The visitor's id, created on first use. Null while tracking is
     not allowed, so nothing is written before consent. */
  function currentVisitorId() {
    if (TRACKING_OFF || consentState !== "granted") {
      return null;
    }
    if (anonymousId) {
      return anonymousId;
    }

    var id = readCookie(AID_NAME);
    if (!id || !AID_RE.test(id)) {
      id = storeGet(AID_NAME);
    }
    if (!id || !AID_RE.test(id)) {
      id = makeUuid();
    }

    /* Written back every time, which also refreshes the cookie's
       one-year lifetime and restores it from the backup. */
    writeCookie(AID_NAME, id, ONE_YEAR);
    storeSet(AID_NAME, id);
    anonymousId = id;
    return id;
  }

  var trackQueue = [];
  var trackTimer = null;

  function sendTrackBody(body) {
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: "text/plain" });
        if (navigator.sendBeacon(TRACK_URL, blob)) {
          return;
        }
      }
    } catch (error) {
      /* fall through to fetch */
    }

    try {
      fetch(TRACK_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: body,
        keepalive: true,
      }).catch(function () {});
    } catch (error) {
      /* tracking is never worth an error on someone's page */
    }
  }

  function flushTrack() {
    if (trackTimer) {
      window.clearTimeout(trackTimer);
      trackTimer = null;
    }
    if (!trackQueue.length) {
      return;
    }

    var id = currentVisitorId();
    if (!id) {
      return;
    }

    var batch = trackQueue.splice(0, 20);
    var body;

    try {
      body = JSON.stringify({
        shop: shop,
        anonymousId: id,
        context: {
          pageUrl: window.location.href,
          referrer: document.referrer || "",
          device: currentDevice(),
        },
        events: batch,
      });
    } catch (error) {
      return;
    }

    sendTrackBody(body);

    if (trackQueue.length) {
      scheduleTrack();
    }
  }

  function scheduleTrack() {
    if (trackTimer || consentState !== "granted") {
      return;
    }
    trackTimer = window.setTimeout(flushTrack, 1000);
  }

  function trackVisitorEvent(type, campaign, label) {
    if (TRACKING_OFF || consentState === "denied") {
      return;
    }

    trackQueue.push({
      eventId: makeUuid(),
      type: type,
      campaignId: campaign ? campaign.campaignId : undefined,
      popupId: campaign ? campaign.popupId : undefined,
      pageUrl: window.location.href,
      occurredAt: new Date().toISOString(),
      label: label || undefined,
    });

    /* Held while consent is still being decided, but never more
       than a handful. */
    if (trackQueue.length > 40) {
      trackQueue.shift();
    }

    scheduleTrack();
  }

  function setConsent(state) {
    consentState = state;

    if (state === "granted") {
      if (CONSENT_MODE === "required") {
        storeSet(CONSENT_KEY, "granted");
      }
      flushTrack();
      return;
    }

    /* Withdrawn: forget the id and anything not yet sent. */
    trackQueue = [];
    anonymousId = null;
    writeCookie(AID_NAME, "", 0);
    storeRemove(AID_NAME);
    storeRemove(CONSENT_KEY);
  }

  try {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        flushTrack();
      }
    });
    window.addEventListener("pagehide", flushTrack);
  } catch (error) {
    /* nothing to flush on */
  }

  window.MQPopups = window.MQPopups || {};
  window.MQPopups.grantConsent = function () {
    setConsent("granted");
  };
  window.MQPopups.revokeConsent = function () {
    setConsent("denied");
  };
  window.MQPopups.getAnonymousId = function () {
    return currentVisitorId();
  };

  /* The storefront follows Shopify's own cookie consent (the
     Customer Privacy API behind the store's cookie banner). Where
     the store has no banner, or the API is not there, tracking is
     allowed, the same as for any other website. */
  function watchShopifyConsent() {
    if (TRACKING_OFF) {
      return;
    }

    function decide() {
      try {
        var privacy =
          window.Shopify && window.Shopify.customerPrivacy;
        if (
          privacy &&
          typeof privacy.analyticsProcessingAllowed === "function"
        ) {
          setConsent(
            privacy.analyticsProcessingAllowed() ? "granted" : "denied",
          );
          return true;
        }
      } catch (error) {
        /* treated as unavailable */
      }
      return false;
    }

    try {
      document.addEventListener(
        "visitorConsentCollected",
        function (event) {
          var detail = event && event.detail;
          setConsent(
            detail && detail.analyticsAllowed ? "granted" : "denied",
          );
        },
      );
    } catch (error) {
      /* no consent events on this page */
    }

    if (decide()) {
      return;
    }

    try {
      if (
        window.Shopify &&
        typeof window.Shopify.loadFeatures === "function"
      ) {
        window.Shopify.loadFeatures(
          [{ name: "consent-tracking-api", version: "0.1" }],
          function (error) {
            if (error || !decide()) {
              setConsent("granted");
            }
          },
        );
        return;
      }
    } catch (error) {
      /* fall through */
    }

    setConsent("granted");
  }

  watchShopifyConsent();

  /* ------------------------------------------------------------
     EVENTS

     Views and dismissals are reported so the admin can work out
     a conversion rate. Submissions are not reported from here:
     the server writes that event itself when it saves the
     contact, which is the only moment it can be sure one really
     happened.

     sendBeacon is tried first because a dismissal is often the
     last thing to happen before the page goes away, and a normal
     fetch gets cancelled at that point.

     Nothing is reported from the theme editor. A merchant
     opening Customize to look at their own popup would otherwise
     show up as real storefront traffic and drag the conversion
     rate down.
  ------------------------------------------------------------ */

  var eventUrl =
    proxyPath +
    "/popups?shop=" +
    encodeURIComponent(shop);

  function sendEvent(campaign, type) {
    if (memoryOff()) {
      return;
    }

    var body;

    try {
      body = JSON.stringify({
        anonymousId: currentVisitorId() || undefined,
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

        if (navigator.sendBeacon(eventUrl, blob)) {
          return;
        }
      }
    } catch (error) {
      /* fall through to fetch */
    }

    try {
      fetch(eventUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: body,
        keepalive: true,
      }).catch(function () {});
    } catch (error) {
      /* the storefront never breaks over a analytics ping */
    }
  }

  /* ------------------------------------------------------------
     EXIT INTENT

     Two gestures mean "I am leaving", depending on what the
     shopper is holding. With a mouse it is the pointer crossing
     the top edge of the window on its way to the address bar or
     the tab strip. On a phone there is no pointer to watch, so
     the signal is a fast upward flick after they have already
     read some way down the page.

     It fires once and then stops listening, so a mouse that
     wanders in and out of the window does not reopen the popup
     again and again.
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
     WIDGET
  ------------------------------------------------------------ */

  function submitContact(
    campaign,
    fieldValues,
    emailValue,
    phoneValue,
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
        anonymousId: currentVisitorId() || undefined,
        popupId: campaign.popupId,
        popupName: campaign.popupName,
        campaignId: campaign.campaignId,
        email: email,
        phone: phoneValue || null,
        fields: fieldValues,
        device: currentDevice(),
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

  var countedCampaigns = [];

  function buildWidget(campaign) {
    var settings = popupSettingsFor(campaign.steps);
    var overlay = null;

    /* A shopper who filled the form in has converted, so closing
       the Success step afterwards is not a dismissal. And a
       dismissal is reported at most once per page load, however
       many ways there are to close the thing. */
    var submitted = false;
    var dismissSent = false;
    var openSent = false;

    function reportDismiss() {
      if (submitted || dismissSent) {
        return;
      }
      dismissSent = true;
      sendEvent(campaign, "dismiss");
    }

    /* Any button or link the shopper clicks in the teaser or the
       popup lands in their visitor history with its text, so the
       merchant can see who clicked what. Capture phase, so a
       handler that stops the click (the teaser's close button)
       is still counted. Only the visible label is kept, never
       what was typed into a field. */
    function trackPopupClick(event) {
      if (memoryOff()) {
        return;
      }

      var target = event.target;
      var control =
        target && target.closest
          ? target.closest("button, a, [type='button']")
          : null;

      if (!control) {
        return;
      }

      var label = (
        control.getAttribute("aria-label") ||
        control.textContent ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);

      trackVisitorEvent("popup_clicked", campaign, label);
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
    pill.addEventListener("click", trackPopupClick, true);


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
      reportDismiss();
      pill.remove();
    });

    pill.appendChild(pillLabel);
    pill.appendChild(pillClose);

    /* ---------------- FLOATING BUTTON POSITION ----------------
       Chosen per campaign in the campaign wizard: a pill in a bottom
       corner, a slim tab in the middle of the left or right edge, or
       "none" to open the offer by itself. On the left edge the tab is turned so its
       text reads from the bottom up, like a book spine. */

    var floatingPosition = [
      "bottom_right",
      "bottom_left",
      "left_wall",
      "right_wall",
      "none",
    ].indexOf(campaign.floatingButton) === -1
      ? "bottom_right"
      : campaign.floatingButton;

    if (
      floatingPosition === "left_wall" ||
      floatingPosition === "right_wall"
    ) {
      var onLeft = floatingPosition === "left_wall";
      pill.style.right = onLeft ? "auto" : "0";
      pill.style.left = onLeft ? "0" : "auto";
      pill.style.bottom = "auto";
      pill.style.top = "50%";
      pill.style.writingMode = "vertical-rl";
      pill.style.transform = onLeft
        ? "translateY(-50%) rotate(180deg)"
        : "translateY(-50%)";
      pill.style.borderRadius = "12px 0 0 12px";
      pillLabel.style.maxWidth = "none";
      pillLabel.style.maxHeight = "260px";
      pillLabel.style.padding = "18px 12px 8px";
      pillClose.style.marginRight = "0";
      pillClose.style.marginBottom = "10px";
    } else if (floatingPosition === "bottom_left") {
      pill.style.right = "auto";
      pill.style.left = "16px";
    }

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
      var phoneValue = null;

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

        var fieldType = input.getAttribute(
          "data-mq-field-type",
        );

        if (fieldType === "email") {
          emailValue = input.value;
        }

        if (fieldType === "phone") {
          phoneValue = input.value;
        }
      }

      submitContact(
        campaign,
        values,
        emailValue,
        phoneValue,
        function () {
          /* They gave us their details, so the "if collected"
             cooldown starts now. */
          submitted = true;
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
        reportDismiss();
        overlay.remove();
        overlay = null;

        /* The floating button comes back, so a shopper who closed
           the offer can still open it again later on this page.
           Not after a signup, and not when there is no button. */
        if (!submitted && floatingPosition !== "none") {
          document.body.appendChild(pill);
        }
      }
    }

    function openOffer() {
      if (overlay) {
        return;
      }

      /* Hide the teaser while the offer is open — otherwise
         both are visible stacked on top of each other. */
      pill.remove();

      /* Step 2 of the popup funnel: the shopper opened the offer.
         Counted once per page load. */
      if (!openSent) {
        openSent = true;
        sendEvent(campaign, "open");
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
      overlay.addEventListener("click", trackPopupClick, true);

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

    var delayTimer = null;
    var scrollHandler = null;
    var cancelExitIntent = null;

    function showTeaser() {
      /* The view is counted here, when the popup actually
         reaches the screen — not when the campaign was picked.
         A delay or scroll trigger may never fire, and a visitor
         who never saw anything must not have it charged against
         their frequency cap. Guarded so a re-entrant trigger
         cannot double count. */

      if (
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

      /* No floating button: the offer opens by itself. */
      if (floatingPosition === "none") {
        openOffer();
        return;
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

    if (previewCampaignId) {
      /* Preview: no waiting for the trigger. */
      showTeaser();
    } else if (campaign.trigger === "Exit intent") {
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
     SELECTION, AND KEEPING IT TRUE

     Device targeting used to be decided once, when the page
     loaded, and never looked at again. A shopper who rotated a
     tablet, or a merchant who dragged the theme editor between
     the desktop and mobile previews, kept whatever had been
     decided for the width they started at: a desktop-only
     campaign stayed on screen at phone width, and a
     mobile-only one never appeared however narrow the view
     became, until the page was reloaded.

     So the width is watched, and when it crosses into another
     bucket the choice is made again from the campaigns already
     fetched. Nothing is re-requested; only the decision is
     redone.
     ------------------------------------------------------------ */

  var loadedCampaigns = [];
  var activeWidget = null;
  var lastDevice = null;

  function pickCampaign() {
    for (
      var i = 0;
      i < loadedCampaigns.length;
      i += 1
    ) {
      var campaign = loadedCampaigns[i];
      var settings = popupSettingsFor(
        campaign.steps,
      );

      /* The first rule that says no, in the order they are
         checked. Named so ?mq_debug=1 can say why. */
      var reason = !matchesPageTargets(campaign)
        ? "this page is not one of its target pages"
        : !matchesDevices(campaign)
          ? "it is not set to show on " + currentDevice()
          : !matchesCampaignAudience(campaign)
            ? "this visitor is not in its audience (" + (campaign.audience || "All visitors") + ")"
            : !withinFrequencyCap(campaign)
              ? "this browser already saw it the maximum number of times"
              : collectedBlocks(campaign)
                ? "this browser already signed up (After they submit: " +
                  (Number(campaign.reshowCollectedDays) > 0
                    ? campaign.reshowCollectedDays + " days)"
                    : "never show again)")
                : dismissedBlocks(campaign)
                  ? "this browser closed it (After they close it: " +
                    (Number(campaign.reshowDismissedDays) > 0
                      ? campaign.reshowDismissedDays + " days)"
                      : "never show again)")
                  : !matchesAudience(settings)
                    ? "the popup's own new / returning visitor setting excludes this visitor"
                    : null;

      if (reason) {
        debugLog('Skipped "' + (campaign.popupName || campaign.campaignId) + '": ' + reason + ".");
        continue;
      }

      debugLog(
        'Showing "' +
          (campaign.popupName || campaign.campaignId) +
          '" (trigger: ' +
          (campaign.trigger || "Immediately") +
          ").",
      );
      return campaign;
    }

    return null;
  }

  function applySelection() {
    if (activeWidget) {
      /* A shopper part-way through the form is never
         interrupted, whatever the window is doing. Their
         submission matters more than a targeting rule, and
         taking the popup away mid-typing would lose what they
         had entered. */
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

      /* One page view per page load, and only on pages where a
         campaign is actually live. */
      if (!pageViewTracked) {
        pageViewTracked = true;
        trackVisitorEvent("page_view", campaign);
      }
    }
  }

  var pageViewTracked = false;

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

  /* ------------------------------------------------------------
     BOOT
  ------------------------------------------------------------ */

  markVisited();

  fetch(proxyPath + "/popups?shop=" + encodeURIComponent(shop))
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      loadedCampaigns = data.campaigns || [];
      lastDevice = currentDevice();

      debugLog(loadedCampaigns.length + " live campaign(s) for this store.");

      if (previewCampaignId) {
        for (var f = 0; f < loadedCampaigns.length; f += 1) {
          if (loadedCampaigns[f].campaignId === previewCampaignId) {
            activeWidget = buildWidget(loadedCampaigns[f]);
            return;
          }
        }
        if (window.console) {
          window.console.warn(
            "[MQ Popups] mq_campaign=" +
              previewCampaignId +
              " is not a live campaign for this store.",
          );
        }
        return;
      }

      applySelection();
      watchViewport();
    })
    .catch(function () {
      /* storefront should never break if this fails */
    });
})();
