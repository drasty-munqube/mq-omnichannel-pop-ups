import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import type { CSSProperties } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
  useNavigate,
} from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import { actorName } from "../models/actor.server";

/* =========================================================
   TYPES
========================================================= */

type BlockType =
  | "brand"
  | "heading"
  | "text"
  | "image"
  | "button"
  | "field"
  | "channel"
  | "quiz"
  | "wheel"
  | "timer"
  | "product";

type Align = "left" | "center" | "right";

type FieldType =
  | "text"
  | "number"
  | "email"
  | "phone";

type Block = {
  id: string;
  type: BlockType;
  text: string;

  fontSize: number;
  color: string;
  align: Align;
  background: string;
  fontFamily: string;
  bold: boolean;
  italic: boolean;

  width: number;
  borderRadius: number;
  borderColor: string;
  borderWidth: number;

  paddingX: number;
  paddingY: number;
  marginTop: number;

  opacity: number;
  letterSpacing: number;

  imageUrl: string;
  placeholder: string;
  fieldType: FieldType;
  fieldRequired: boolean;

  buttonTextColor: string;
};

type PopupSettings = {
  bodyBackground: string;

  headerBackground: string;
  headerGradient: boolean;
  headerGradientEnd: string;

  popupBorderRadius: number;
  headerHeight: number;
  bodyPadding: number;

  closeButtonBackground: string;
  closeButtonColor: string;
  closeButtonText: string;
  closeButtonSize: number;
  closeButtonRadius: number;

  footerText: string;
  footerColor: string;
  footerVisible: boolean;

  audienceNewOnly: boolean;
  audienceReturningOnly: boolean;
  audienceDevice: "all" | "mobile" | "desktop";
};

type Step = {
  id: string;
  title: string;
  type: string;
  blocks: Block[];
  settings?: PopupSettings;
};

/* =========================================================
   DEFAULT POPUP SETTINGS
========================================================= */

const defaultPopupSettings: PopupSettings = {
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

/* =========================================================
   CREATE BLOCK
========================================================= */

function createBlock(type: BlockType): Block {
  let text = "Add your content";

  switch (type) {
    case "brand":
      text = "Your brand";
      break;

    case "heading":
      text = "This is your popup heading";
      break;

    case "text":
      text = "Add your popup message here.";
      break;

    case "image":
      text = "Image placeholder";
      break;

    case "button":
      text = "Continue";
      break;

    case "field":
      text = "Email address";
      break;

    case "channel":
      text = "Continue on WhatsApp";
      break;

    case "quiz":
      text = "Which style do you prefer?";
      break;

    case "wheel":
      text = "Spin to win";
      break;

    case "timer":
      text = "Offer ends soon";
      break;

    case "product":
      text = "Featured product";
      break;
  }

  const isBrand = type === "brand";
  const isHeading = type === "heading";
  const isButton =
    type === "button" || type === "channel";

  return {
    id: `${type}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,

    type,
    text,

    fontSize: isHeading ? 28 : isBrand ? 13 : 14,

    color: isBrand
      ? "#FFFFFF"
      : isButton
        ? "#FFFFFF"
        : "#111827",

    align: isBrand ? "left" : "center",

    background: isButton
      ? "#1F2937"
      : "transparent",

    fontFamily: isHeading ? "Georgia" : "Arial",

    bold: isHeading || isButton || isBrand,

    italic: false,

    width: 100,

    borderRadius: isButton ? 10 : 8,

    borderColor: "#E5E7EB",

    borderWidth: isButton ? 0 : 1,

    paddingX: isButton ? 18 : 6,

    paddingY: isButton ? 14 : 6,

    marginTop: isButton ? 14 : 0,

    opacity: 100,

    letterSpacing: isBrand ? 3.5 : 0,

    imageUrl: "",

    placeholder:
      type === "field"
        ? "Email address"
        : "",

    fieldType: "email",
    fieldRequired: type === "field",

    buttonTextColor: "#FFFFFF",
  };
}

/* =========================================================
   TEMPLATES
========================================================= */

type TemplateId =
  | "whatsapp-welcome"
  | "spin-the-wheel-luxe"
  | "quiz-learn-to-earn"
  | "exit-intent-cart-saver";

const TEMPLATE_CONTENT: Record<
  TemplateId,
  {
    popupName: string;
    teaserText: string;
    offerHeading: string;
    offerText: string;
    offerButtonText: string;
    offerBlockType: "text" | "quiz" | "wheel";
    successHeading: string;
    successText: string;
    headerBackground: string;
    headerGradientEnd: string;
  }
> = {
  "whatsapp-welcome": {
    popupName: "WhatsApp welcome",
    teaserText: "🟢 Get updates on WhatsApp",
    offerHeading: "Join our WhatsApp list",
    offerText:
      "Get restock alerts, styling tips, and a welcome code — straight to WhatsApp.",
    offerButtonText: "Continue on WhatsApp",
    offerBlockType: "text",
    successHeading: "You're on the list!",
    successText:
      "Check WhatsApp for your welcome code.",
    headerBackground: "#1B7A57",
    headerGradientEnd: "#0E4A34",
  },
  "spin-the-wheel-luxe": {
    popupName: "Spin the wheel — luxe",
    teaserText: "🎡 Spin to win a prize",
    offerHeading: "Spin to unlock your offer",
    offerText:
      "Every spin wins a reward — enter your email for a chance at 20% off.",
    offerButtonText: "Spin now",
    offerBlockType: "wheel",
    successHeading: "You won!",
    successText:
      "Your prize code is on its way to your inbox.",
    headerBackground: "#2B2620",
    headerGradientEnd: "#4B3F2E",
  },
  "quiz-learn-to-earn": {
    popupName: "Quiz — learn to earn",
    teaserText: "🧠 Take our style quiz",
    offerHeading: "Find your perfect match",
    offerText:
      "Answer 3 quick questions and we'll send you a personalized discount.",
    offerButtonText: "Start the quiz",
    offerBlockType: "quiz",
    successHeading: "Thanks for sharing!",
    successText:
      "We've emailed your personalized picks and discount.",
    headerBackground: "#5B3FCF",
    headerGradientEnd: "#3A2790",
  },
  "exit-intent-cart-saver": {
    popupName: "Exit-intent cart saver",
    teaserText: "🛒 Wait — don't leave yet",
    offerHeading:
      "Don't leave empty-handed",
    offerText:
      "Here's 10% off to complete your order — just for the next 15 minutes.",
    offerButtonText: "Apply my discount",
    offerBlockType: "text",
    successHeading: "Discount applied!",
    successText:
      "Head back to your cart to complete your order.",
    headerBackground: "#B4780A",
    headerGradientEnd: "#7A4F04",
  },
};

/* =========================================================
   DEFAULT STEPS
========================================================= */

function createDefaultSteps(
  templateId?: TemplateId,
): Step[] {
  const template = templateId
    ? TEMPLATE_CONTENT[templateId]
    : null;

  const brand = createBlock("brand");
  brand.id = "brand-default";
  brand.text = "Your brand";

  const heading = createBlock("heading");
  heading.id = "heading-default";
  heading.text =
    template?.offerHeading ||
    "Your headline goes here";

  const text = createBlock("text");
  text.id = "text-default";
  text.text =
    template?.offerText ||
    "Add a short line describing your offer.";

  const button = createBlock("button");
  button.id = "button-default";
  button.text =
    template?.offerButtonText || "Subscribe";

  const extraOfferBlocks: Block[] = [];

  if (template?.offerBlockType === "quiz") {
    const quiz = createBlock("quiz");
    quiz.id = "quiz-default";
    extraOfferBlocks.push(quiz);
  }

  if (template?.offerBlockType === "wheel") {
    const wheel = createBlock("wheel");
    wheel.id = "wheel-default";
    extraOfferBlocks.push(wheel);
  }

  const successHeading = createBlock("heading");
  successHeading.id = "success-heading-default";
  successHeading.text =
    template?.successHeading ||
    "Thanks for signing up!";

  const successText = createBlock("text");
  successText.id = "success-text-default";
  successText.text =
    template?.successText ||
    "Add a short confirmation message here.";

  const teaserHeading = createBlock("heading");
  teaserHeading.id = "teaser-heading-default";
  teaserHeading.text =
    template?.teaserText || "Your teaser text";

  const teaserText = createBlock("text");
  teaserText.id = "teaser-text-default";
  teaserText.text =
    "Add a short line to invite a tap.";

  const offerSettings = template
    ? {
        ...defaultPopupSettings,
        headerBackground:
          template.headerBackground,
        headerGradientEnd:
          template.headerGradientEnd,
      }
    : {
        ...defaultPopupSettings,
      };

  return [
    {
      id: "teaser",
      title: "1 · Teaser",
      type: "teaser",
      blocks: [
        teaserHeading,
        teaserText,
      ],
    },

    {
      id: "offer",
      title: "2 · Offer",
      type: "offer",
      blocks: [
        brand,
        heading,
        text,
        ...extraOfferBlocks,
        button,
      ],
      settings: offerSettings,
    },

    {
      id: "success",
      title: "3 · Success",
      type: "success",
      blocks: [
        successHeading,
        successText,
      ],
    },
  ];
}

/* =========================================================
   NORMALIZE
========================================================= */

function normalizeBlock(
  raw: Partial<Block>,
): Block {
  const type =
    (raw.type || "text") as BlockType;

  const defaults =
    createBlock(type);

  return {
    ...defaults,
    ...raw,
    id: raw.id || defaults.id,
    type,
  };
}

function normalizeStep(
  raw: Partial<Step>,
): Step {
  return {
    id:
      raw.id ||
      `step-${Date.now()}`,

    title:
      raw.title ||
      "New step",

    type:
      raw.type ||
      "custom",

    blocks:
      Array.isArray(raw.blocks)
        ? raw.blocks.map(
            (block) =>
              normalizeBlock(block),
          )
        : [],

    settings:
      raw.settings
        ? {
            ...defaultPopupSettings,
            ...raw.settings,
          }
        : undefined,
  };
}

function getPopupSettings(
  steps: Step[],
): PopupSettings {
  const offer =
    steps.find(
      (step) =>
        step.id === "offer",
    );

  return {
    ...defaultPopupSettings,
    ...(offer?.settings || {}),
  };
}

/* =========================================================
   LOADER
========================================================= */

export async function loader({
  request,
}: LoaderFunctionArgs) {
  const { session } =
    await authenticate.admin(request);

  const url =
    new URL(request.url);

  const id =
    url.searchParams.get("id");

  const templateId =
    url.searchParams.get(
      "template",
    ) as TemplateId | null;

  if (!id) {
    const template =
      templateId &&
      templateId in TEMPLATE_CONTENT
        ? templateId
        : null;

    return {
      ok: true,
      popup: template
        ? {
            id: null,
            name: TEMPLATE_CONTENT[
              template
            ].popupName,
            status: "draft",
            steps:
              createDefaultSteps(
                template,
              ),
          }
        : null,
    };
  }

  const popup =
    await db.popup.findFirst({
      where: {
        id,
        shop: session.shop,
      },
    });

  if (!popup) {
    return {
      ok: false,
      popup: null,
      error:
        "Popup not found.",
    };
  }

  const loadedSteps: Step[] =
    Array.isArray(
      popup.steps,
    )
      ? (
          popup.steps as unknown as Partial<Step>[]
        ).map((step) =>
          normalizeStep(step),
        )
      : createDefaultSteps();

  const hasSuccessStep =
    loadedSteps.some(
      (step) =>
        step.id === "success",
    );

  const stepsWithSuccess = hasSuccessStep
    ? loadedSteps
    : [
        ...loadedSteps,
        createDefaultSteps().find(
          (step) =>
            step.id === "success",
        )!,
      ];

  const steps = stepsWithSuccess.map(
    (step) =>
      step.id === "teaser" &&
      step.blocks.length === 0
        ? createDefaultSteps().find(
            (defaultStep) =>
              defaultStep.id === "teaser",
          )!
        : step,
  );

  return {
    ok: true,
    popup: {
      id: popup.id,
      name: popup.name,
      status: popup.status,
      steps,
    },
  };
}

/* =========================================================
   ACTION
========================================================= */

export async function action({
  request,
}: ActionFunctionArgs) {
  const auth = await authenticate.admin(request);
  const { session } = auth;
  /* Saved as createdBy / updatedBy on every write below. */
  const actor = actorName(auth);

  const formData =
    await request.formData();

  const name =
    String(
      formData.get("name") || "",
    ).trim();

  const stepsRaw =
    String(
      formData.get("steps") || "[]",
    );

  const popupId =
    String(
      formData.get("popupId") || "",
    ).trim();

  const statusRaw =
    String(
      formData.get("status") || "draft",
    ).trim();

  const status =
    (
      [
        "draft",
        "active",
      ] as const
    ).includes(statusRaw as any)
      ? statusRaw
      : "draft";

  if (!name) {
    return {
      ok: false,
      error:
        "Please enter popup name.",
    };
  }

  let steps: unknown;

  try {
    steps =
      JSON.parse(stepsRaw);
  } catch {
    return {
      ok: false,
      error:
        "Popup data is invalid.",
    };
  }

  if (!Array.isArray(steps)) {
    return {
      ok: false,
      error:
        "Popup steps are invalid.",
    };
  }

  try {
    if (popupId) {
      const existing =
        await db.popup.findFirst({
          where: {
            id: popupId,
            shop: session.shop,
          },
        });

      if (!existing) {
        return {
          ok: false,
          error:
            "Popup not found.",
        };
      }

      const popup =
        await db.popup.update({
          where: {
            id: popupId,
          },
          data: {
            name,
            status,
            steps: steps as any,
            updatedBy: actor,
          },
        });

      return {
        ok: true,
        popupId: popup.id,
      };
    }

    const popup =
      await db.popup.create({
        data: {
          shop: session.shop,
          name,
          status,
          priority: 1,
          steps: steps as any,
          createdBy: actor,
          updatedBy: actor,
        },
      });

    return {
      ok: true,
      popupId: popup.id,
    };
  } catch (error) {
    console.error(
      "CREATE POPUP ERROR:",
      error,
    );

    return {
      ok: false,
      error:
        "Unable to save popup.",
    };
  }
}

/* =========================================================
   COMPONENT
========================================================= */

export default function NewPopup() {
  const loaderData =
    useLoaderData<typeof loader>();

  const editingPopup =
    loaderData.popup;

  const navigate =
    useNavigate();

  const actionData =
    useActionData<typeof action>();

  const navigation =
    useNavigation();

  const submit =
    useSubmit();

  const [
    popupId,
  ] = useState<
    string | null
  >(
    editingPopup?.id || null,
  );

  const [
    popupName,
    setPopupName,
  ] = useState(
    editingPopup?.name ||
      "Untitled popup",
  );

  const [
    status,
    setStatus,
  ] = useState(
    editingPopup?.status ||
      "draft",
  );

  const [
    steps,
    setSteps,
  ] = useState<Step[]>(
    editingPopup?.steps ||
      createDefaultSteps(),
  );

  const [
    selectedStepId,
    setSelectedStepId,
  ] = useState("offer");

  const [
    selectedBlockId,
    setSelectedBlockId,
  ] = useState<
    string | null
  >("heading-default");

  const [
    activeTab,
    setActiveTab,
  ] = useState<
    "content" |
      "style" |
      "logic"
  >("content");

  const [
    previewStage,
    setPreviewStage,
  ] = useState<
    "closed" |
      "teaser" |
      "offer" |
      "success"
  >("closed");

  const [
    device,
    setDevice,
  ] = useState<
    "mobile" |
      "desktop"
  >("mobile");

  const [
    savedMessage,
    setSavedMessage,
  ] = useState("");

  /* =======================================================
     DRAG & DROP STATE
  ======================================================= */

  const [
    draggedBlockId,
    setDraggedBlockId,
  ] = useState<string | null>(
    null,
  );

  const [
    dragOverBlockId,
    setDragOverBlockId,
  ] = useState<string | null>(
    null,
  );

  const saving =
    navigation.state ===
    "submitting";

  /* =======================================================
     SELECTED STEP
  ======================================================= */

  const selectedStep =
    steps.find(
      (step) =>
        step.id ===
        selectedStepId,
    ) || steps[0];

  /* =======================================================
     SELECTED BLOCK
  ======================================================= */

  const selectedBlock =
    selectedStep?.blocks.find(
      (block) =>
        block.id ===
        selectedBlockId,
    ) || null;

  /* =======================================================
     BRAND BLOCK
  ======================================================= */

  const brandBlock =
    steps
      .flatMap(
        (step) =>
          step.blocks,
      )
      .find(
        (block) =>
          block.type ===
          "brand",
      ) || null;

  /* =======================================================
     POPUP SETTINGS
  ======================================================= */

  const popupSettings =
    useMemo(
      () =>
        getPopupSettings(
          steps,
        ),
      [steps],
    );

  /* =======================================================
     SAVE MESSAGE + REDIRECT
  ======================================================= */

  useEffect(() => {
    if (!actionData?.ok) {
      return;
    }

    setSavedMessage(
      "Saved successfully",
    );

    const timer =
      window.setTimeout(() => {
        navigate(
          "/app/popups",
          {
            replace: true,
          },
        );
      }, 800);

    return () =>
      window.clearTimeout(
        timer,
      );
  }, [
    actionData,
    navigate,
  ]);

  /* =======================================================
     UPDATE BLOCK
  ======================================================= */

  function updateBlock(
    blockId: string,
    changes: Partial<Block>,
  ) {
    setSteps(
      (currentSteps) =>
        currentSteps.map(
          (step) => ({
            ...step,

            blocks:
              step.blocks.map(
                (block) =>
                  block.id ===
                  blockId
                    ? {
                        ...block,
                        ...changes,
                      }
                    : block,
              ),
          }),
        ),
    );
  }

  /* =======================================================
     UPDATE POPUP SETTINGS
  ======================================================= */

  function updatePopupSettings(
    changes: Partial<PopupSettings>,
  ) {
    setSteps(
      (currentSteps) =>
        currentSteps.map(
          (step) =>
            step.id ===
            "offer"
              ? {
                  ...step,

                  settings: {
                    ...defaultPopupSettings,
                    ...(step.settings ||
                      {}),
                    ...changes,
                  },
                }
              : step,
        ),
    );
  }

  /* =======================================================
     ADD BLOCK
     Image + Wheel intentionally removed from UI.
  ======================================================= */

  function addBlock(
    type: BlockType,
  ) {
    const block =
      createBlock(type);

    setSteps(
      (currentSteps) =>
        currentSteps.map(
          (step) =>
            step.id ===
            selectedStepId
              ? {
                  ...step,

                  blocks: [
                    ...step.blocks,
                    block,
                  ],
                }
              : step,
        ),
    );

    setSelectedBlockId(
      block.id,
    );

    setActiveTab(
      "content",
    );
  }

  /* =======================================================
     DELETE BLOCK
  ======================================================= */

  function deleteBlock() {
    if (!selectedBlockId) {
      return;
    }

    setSteps(
      (currentSteps) =>
        currentSteps.map(
          (step) => ({
            ...step,

            blocks:
              step.blocks.filter(
                (block) =>
                  block.id !==
                  selectedBlockId,
              ),
          }),
        ),
    );

    setSelectedBlockId(
      null,
    );
  }

  /* =======================================================
     DUPLICATE BLOCK
  ======================================================= */

  function duplicateBlock() {
    if (!selectedBlock) {
      return;
    }

    const copy: Block = {
      ...selectedBlock,

      id: `${selectedBlock.type}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
    };

    setSteps(
      (currentSteps) =>
        currentSteps.map(
          (step) =>
            step.id ===
            selectedStepId
              ? {
                  ...step,

                  blocks: [
                    ...step.blocks,
                    copy,
                  ],
                }
              : step,
        ),
    );

    setSelectedBlockId(
      copy.id,
    );
  }

  /* =======================================================
     SELECT BLOCK
  ======================================================= */

  function selectBlock(
    blockId: string,
  ) {
    setSelectedBlockId(
      blockId,
    );

    setActiveTab(
      "content",
    );
  }

  /* =======================================================
     DRAG & DROP - REORDER OFFER CONTENT
  ======================================================= */

  function reorderOfferBlocks(
    fromBlockId: string,
    toBlockId: string,
  ) {
    if (
      !fromBlockId ||
      !toBlockId ||
      fromBlockId === toBlockId
    ) {
      return;
    }

    setSteps(
      (currentSteps) =>
        currentSteps.map(
          (step) => {
            if (
              step.id !== "offer"
            ) {
              return step;
            }

            const blocks =
              [...step.blocks];

            const fromIndex =
              blocks.findIndex(
                (block) =>
                  block.id ===
                  fromBlockId,
              );

            const toIndex =
              blocks.findIndex(
                (block) =>
                  block.id ===
                  toBlockId,
              );

            if (
              fromIndex === -1 ||
              toIndex === -1
            ) {
              return step;
            }

            const [
              movedBlock,
            ] =
              blocks.splice(
                fromIndex,
                1,
              );

            blocks.splice(
              toIndex,
              0,
              movedBlock,
            );

            return {
              ...step,
              blocks,
            };
          },
        ),
    );
  }

  function handleBlockDragStart(
    event: DragEvent<HTMLDivElement>,
    blockId: string,
  ) {
    event.dataTransfer.effectAllowed =
      "move";

    event.dataTransfer.setData(
      "text/plain",
      blockId,
    );

    setDraggedBlockId(
      blockId,
    );

    setSelectedBlockId(
      blockId,
    );
  }

  function handleBlockDragOver(
    event: DragEvent<HTMLDivElement>,
    blockId: string,
  ) {
    event.preventDefault();

    event.dataTransfer.dropEffect =
      "move";

    if (
      draggedBlockId &&
      draggedBlockId !==
        blockId
    ) {
      setDragOverBlockId(
        blockId,
      );
    }
  }

  function handleBlockDrop(
    event: DragEvent<HTMLDivElement>,
    blockId: string,
  ) {
    event.preventDefault();

    const fromBlockId =
      draggedBlockId ||
      event.dataTransfer.getData(
        "text/plain",
      );

    if (
      fromBlockId &&
      fromBlockId !==
        blockId
    ) {
      reorderOfferBlocks(
        fromBlockId,
        blockId,
      );
    }

    setDraggedBlockId(
      null,
    );

    setDragOverBlockId(
      null,
    );
  }

  function handleBlockDragEnd() {
    setDraggedBlockId(
      null,
    );

    setDragOverBlockId(
      null,
    );
  }

  /* =======================================================
     SELECT BRAND
  ======================================================= */

  function selectBrand() {
    if (!brandBlock) {
      return;
    }

    const brandStep =
      steps.find(
        (step) =>
          step.blocks.some(
            (block) =>
              block.id ===
              brandBlock.id,
          ),
      );

    if (brandStep) {
      setSelectedStepId(
        brandStep.id,
      );
    }

    setSelectedBlockId(
      brandBlock.id,
    );

    setActiveTab(
      "content",
    );
  }

  /* =======================================================
     SELECT POPUP
  ======================================================= */

  function selectPopup() {
    setSelectedBlockId(
      null,
    );

    setActiveTab(
      "style",
    );
  }

  /* =======================================================
     SELECT CLOSE BUTTON
  ======================================================= */

  function selectCloseButton() {
    setSelectedBlockId(
      null,
    );

    setActiveTab(
      "style",
    );
  }

  /* =======================================================
     SAVE
  ======================================================= */

  function savePopup() {
    setSavedMessage("");

    const formData =
      new FormData();

    formData.append(
      "name",
      popupName,
    );

    formData.append(
      "steps",
      JSON.stringify(
        steps,
      ),
    );

    formData.append(
      "status",
      status,
    );

    if (popupId) {
      formData.append(
        "popupId",
        popupId,
      );
    }

    submit(
      formData,
      {
        method: "post",
      },
    );
  }

  /* =======================================================
     COLOR CONTROL
  ======================================================= */

  function colorControl(
    label: string,
    value: string,
    onChange: (
      value: string,
    ) => void,
  ) {
    return (
      <div
        style={{
          marginTop:
            "16px",
        }}
      >
        <label
          style={{
            display:
              "block",
            fontSize:
              "12px",
            fontWeight:
              700,
            color:
              "#536274",
            marginBottom:
              "7px",
          }}
        >
          {label}
        </label>

        <div
          style={{
            display:
              "flex",
            gap:
              "8px",
          }}
        >
          <input
            type="color"
            value={
              value || "#FFFFFF"
            }
            onChange={(
              event,
            ) =>
              onChange(
                event.target.value,
              )
            }
            style={{
              width:
                "46px",
              height:
                "40px",
              padding:
                "3px",
              border:
                "1px solid #D5DCE5",
              borderRadius:
                "8px",
              background:
                "#FFFFFF",
              cursor:
                "pointer",
            }}
          />

          <input
            value={
              value
            }
            onChange={(
              event,
            ) =>
              onChange(
                event.target.value,
              )
            }
            style={{
              flex:
                1,
              minWidth:
                0,
              padding:
                "10px",
              border:
                "1px solid #D5DCE5",
              borderRadius:
                "8px",
              boxSizing:
                "border-box",
            }}
          />
        </div>
      </div>
    );
  }

  /* =======================================================
     NUMBER CONTROL
  ======================================================= */

  function numberControl(
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (
      value: number,
    ) => void,
  ) {
    return (
      <div
        style={{
          marginTop:
            "18px",
        }}
      >
        <div
          style={{
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "space-between",
          }}
        >
          <label
            style={{
              fontSize:
                "12px",
              fontWeight:
                700,
              color:
                "#536274",
            }}
          >
            {label}
          </label>

          <span
            style={{
              fontSize:
                "12px",
              color:
                "#718096",
            }}
          >
            {value}
          </span>
        </div>

        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(
            event,
          ) =>
            onChange(
              Number(
                event.target.value,
              ),
            )
          }
          style={{
            width:
              "100%",
            marginTop:
              "8px",
          }}
        />
      </div>
    );
  }

  /* =======================================================
     RENDER BLOCK
  ======================================================= */

  function renderBlock(
    block: Block,
  ) {
    const isSelected =
      selectedBlockId ===
      block.id;

    const isDragging =
      draggedBlockId ===
      block.id;

    const isDragOver =
      dragOverBlockId ===
      block.id;

    const dragWrapperStyle: CSSProperties =
      {
        position:
          "relative",

        width:
          "100%",

        marginTop:
          `${block.marginTop}px`,

        padding:
          "4px 0",

        boxSizing:
          "border-box",

        borderRadius:
          "10px",

        border:
          isDragOver
            ? "2px dashed #1677FF"
            : "2px solid transparent",

        opacity:
          isDragging
            ? 0.45
            : 1,

        transition:
          "border-color 120ms ease, opacity 120ms ease",

        cursor:
          "grab",
      };

    const dragHandleStyle: CSSProperties =
      {
        position:
          "absolute",

        left:
          "-24px",

        top:
          "50%",

        transform:
          "translateY(-50%)",

        width:
          "20px",

        height:
          "32px",

        display:
          "flex",

        alignItems:
          "center",

        justifyContent:
          "center",

        color:
          "#9AA4B2",

        fontSize:
          "17px",

        lineHeight:
          1,

        userSelect:
          "none",

        cursor:
          "grab",

        zIndex:
          5,
      };

    const commonStyle: CSSProperties =
      {
        border: isSelected
          ? "2px solid #1677FF"
          : "2px solid transparent",

        borderRadius:
          "8px",

        padding:
          "6px",

        cursor:
          "pointer",

        background:
          block.background,

        textAlign:
          block.align,

        fontFamily:
          block.fontFamily,

        color:
          block.color,

        fontSize:
          `${block.fontSize}px`,

        fontWeight:
          block.bold
            ? 700
            : 400,

        fontStyle:
          block.italic
            ? "italic"
            : "normal",

        lineHeight:
          "1.4",

        boxSizing:
          "border-box",

        width:
          `${block.width}%`,

        marginLeft:
          block.align ===
          "center"
            ? "auto"
            : block.align ===
                "right"
              ? "auto"
              : "0",

        marginRight:
          block.align ===
          "center"
            ? "auto"
            : block.align ===
                "left"
              ? "0"
              : "0",

        opacity:
          block.opacity /
          100,

        letterSpacing:
          `${block.letterSpacing}px`,
      };

    /* -------------------------------------------------------
       BRAND
    ------------------------------------------------------- */

    if (
      block.type ===
      "brand"
    ) {
      return (
        <div
          key={
            block.id
          }
          draggable
          onDragStart={(event) =>
            handleBlockDragStart(
              event,
              block.id,
            )
          }
          onDragOver={(event) =>
            handleBlockDragOver(
              event,
              block.id,
            )
          }
          onDrop={(event) =>
            handleBlockDrop(
              event,
              block.id,
            )
          }
          onDragEnd={
            handleBlockDragEnd
          }
          onClick={
            selectBrand
          }
          style={{
            ...dragWrapperStyle,
          }}
        >
          <div
            style={
              dragHandleStyle
            }
            title="Drag to reorder"
            aria-label="Drag to reorder"
          >
            ⋮⋮
          </div>

          <div
            style={{
              ...commonStyle,

            padding:
              "4px 6px",

            fontSize:
              `${block.fontSize}px`,

            fontWeight:
              700,

            letterSpacing:
              `${block.letterSpacing || 3.5}px`,

            textTransform:
              "uppercase",

            textAlign:
              block.align,

            color:
              block.color,
          }}
        >
          {
            block.text
          }
        </div>
        </div>
      );
    }

    /* -------------------------------------------------------
       IMAGE
    ------------------------------------------------------- */

    if (
      block.type ===
      "image"
    ) {
      return (
        <div
          key={
            block.id
          }
          draggable
          onDragStart={(event) =>
            handleBlockDragStart(
              event,
              block.id,
            )
          }
          onDragOver={(event) =>
            handleBlockDragOver(
              event,
              block.id,
            )
          }
          onDrop={(event) =>
            handleBlockDrop(
              event,
              block.id,
            )
          }
          onDragEnd={
            handleBlockDragEnd
          }
          onClick={() =>
            selectBlock(
              block.id,
            )
          }
          style={{
            ...dragWrapperStyle,
          }}
        >
          <div
            style={
              dragHandleStyle
            }
            title="Drag to reorder"
            aria-label="Drag to reorder"
          >
            ⋮⋮
          </div>

          <div
            style={{
              ...commonStyle,

            minHeight:
              "80px",

            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "center",

            border:
              isSelected
                ? "2px solid #1677FF"
                : "1px dashed #B8AEA3",

            background:
              block.background ===
              "transparent"
                ? "#F2ECE2"
                : block.background,
          }}
        >
          {block.imageUrl ? (
            <img
              src={
                block.imageUrl
              }
              alt=""
              style={{
                maxWidth:
                  "100%",
                display:
                  "block",
              }}
            />
          ) : (
            block.text
          )}
        </div>
        </div>
      );
    }

    /* -------------------------------------------------------
       FIELD
    ------------------------------------------------------- */

    if (
      block.type ===
      "field"
    ) {
      return (
        <div
          key={
            block.id
          }
          draggable
          onDragStart={(event) =>
            handleBlockDragStart(
              event,
              block.id,
            )
          }
          onDragOver={(event) =>
            handleBlockDragOver(
              event,
              block.id,
            )
          }
          onDrop={(event) =>
            handleBlockDrop(
              event,
              block.id,
            )
          }
          onDragEnd={
            handleBlockDragEnd
          }
          onClick={() =>
            selectBlock(
              block.id,
            )
          }
          style={{
            ...dragWrapperStyle,
          }}
        >
          <div
            style={
              dragHandleStyle
            }
            title="Drag to reorder"
            aria-label="Drag to reorder"
          >
            ⋮⋮
          </div>

          <div
            style={{
              ...commonStyle,

            background:
              "#FFFFFF",

            color:
              "#777777",

            border:
              isSelected
                ? "2px solid #1677FF"
                : "1px solid #D8D0C6",

            padding:
              `${block.paddingY}px ${block.paddingX}px`,
          }}
        >
          {
            block.placeholder ||
            block.text
          }
        </div>
        </div>
      );
    }

    /* -------------------------------------------------------
       BUTTON / CHANNEL
    ------------------------------------------------------- */

    if (
      block.type ===
        "button" ||
      block.type ===
        "channel"
    ) {
      return (
        <div
          key={
            block.id
          }
          draggable
          onDragStart={(event) =>
            handleBlockDragStart(
              event,
              block.id,
            )
          }
          onDragOver={(event) =>
            handleBlockDragOver(
              event,
              block.id,
            )
          }
          onDrop={(event) =>
            handleBlockDrop(
              event,
              block.id,
            )
          }
          onDragEnd={
            handleBlockDragEnd
          }
          onClick={() =>
            selectBlock(
              block.id,
            )
          }
          style={{
            ...dragWrapperStyle,
          }}
        >
          <div
            style={
              dragHandleStyle
            }
            title="Drag to reorder"
            aria-label="Drag to reorder"
          >
            ⋮⋮
          </div>

          <div
            style={{
              ...commonStyle,

            background:
              block.background,

            color:
              block.buttonTextColor,

            border:
              isSelected
                ? "2px solid #1677FF"
                : `${block.borderWidth}px solid ${block.borderColor}`,

            borderRadius:
              `${block.borderRadius}px`,

            padding:
              `${block.paddingY}px ${block.paddingX}px`,

            marginTop:
              `${block.marginTop}px`,

            fontWeight:
              block.bold
                ? 700
                : 600,
          }}
        >
          {
            block.text
          }
        </div>
        </div>
      );
    }

    /* -------------------------------------------------------
       OTHER BLOCKS
    ------------------------------------------------------- */

    return (
      <div
        key={
          block.id
        }
        draggable
        onDragStart={(event) =>
          handleBlockDragStart(
            event,
            block.id,
          )
        }
        onDragOver={(event) =>
          handleBlockDragOver(
            event,
            block.id,
          )
        }
        onDrop={(event) =>
          handleBlockDrop(
            event,
            block.id,
          )
        }
        onDragEnd={
          handleBlockDragEnd
        }
        onClick={() =>
          selectBlock(
            block.id,
          )
        }
        style={{
          ...dragWrapperStyle,
        }}
      >
        <div
          style={
            dragHandleStyle
          }
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          ⋮⋮
        </div>

        <div
          style={{
            ...commonStyle,

          border:
            isSelected
              ? "2px solid #1677FF"
              : `${block.borderWidth}px solid ${block.borderColor}`,

          borderRadius:
            `${block.borderRadius}px`,

          padding:
            `${block.paddingY}px ${block.paddingX}px`,

          marginTop:
            `${block.marginTop}px`,
        }}
      >
        {
          block.text
        }
      </div>
        </div>
    );
  }

  /* =======================================================
     LIVE PREVIEW BLOCK (no editor chrome)
  ======================================================= */

  function renderPreviewBlock(
    block: Block,
    onAdvance: () => void,
  ) {
    const commonStyle: CSSProperties =
      {
        marginTop:
          `${block.marginTop}px`,

        fontSize:
          `${block.fontSize}px`,

        color:
          block.color,

        textAlign:
          block.align,

        fontFamily:
          block.fontFamily ||
          "inherit",

        fontWeight:
          block.bold
            ? 700
            : 400,

        fontStyle:
          block.italic
            ? "italic"
            : "normal",

        letterSpacing:
          `${block.letterSpacing}px`,

        opacity:
          block.opacity,
      };

    if (
      block.type === "button" ||
      block.type === "channel"
    ) {
      return (
        <button
          key={block.id}
          type="button"
          onClick={onAdvance}
          style={{
            ...commonStyle,

            width:
              "100%",

            background:
              block.background,

            color:
              block.buttonTextColor,

            border:
              block.borderWidth
                ? `${block.borderWidth}px solid ${block.borderColor}`
                : "none",

            borderRadius:
              `${block.borderRadius}px`,

            padding:
              `${block.paddingY}px ${block.paddingX}px`,

            cursor:
              "pointer",
          }}
        >
          {block.text}
        </button>
      );
    }

    if (block.type === "field") {
      return (
        <input
          key={block.id}
          disabled
          placeholder={
            block.placeholder ||
            block.text
          }
          style={{
            width:
              "100%",

            marginTop:
              `${block.marginTop}px`,

            boxSizing:
              "border-box",

            padding:
              `${block.paddingY}px ${block.paddingX}px`,

            borderRadius:
              `${block.borderRadius}px`,

            border:
              `1px solid ${block.borderColor || "#D5DCE5"}`,

            fontSize:
              `${block.fontSize}px`,
          }}
        />
      );
    }

    if (block.type === "brand") {
      return (
        <div
          key={block.id}
          style={commonStyle}
        >
          {block.text}
        </div>
      );
    }

    return (
      <div
        key={block.id}
        style={commonStyle}
      >
        {block.text}
      </div>
    );
  }

  /* =======================================================
     OFFER BLOCKS FOR STYLE EDITOR
  ======================================================= */

  const offerStep =
    steps.find(
      (step) =>
        step.id ===
        "offer",
    );

  const offerBlocks =
    offerStep?.blocks ||
    [];

  /* =========================================================
     UI
  ========================================================= */

  return (
    <>
    <div
      style={{
        height:
          "100vh",

        display:
          "grid",

        gridTemplateRows:
          "72px minmax(0, 1fr)",

        overflow:
          "hidden",

        background:
          "#FFFFFF",

        fontFamily:
          "Arial, sans-serif",

        color:
          "#172033",
      }}
    >
      {/* ==================================================
          TOP BAR
      ================================================== */}

      <header
        style={{
          display:
            "flex",

          alignItems:
            "center",

          justifyContent:
            "space-between",

          padding:
            "0 18px 0 26px",

          borderBottom:
            "1px solid #DDE2E8",

          background:
            "#FFFFFF",

          boxSizing:
            "border-box",
        }}
      >
        <div
          style={{
            display:
              "flex",

            alignItems:
              "center",

            gap:
              "16px",

            minWidth:
              0,
          }}
        >
          <button
            type="button"
            onClick={() =>
              navigate(
                "/app/popups",
              )
            }
            style={{
              border:
                "none",

              background:
                "transparent",

              fontSize:
                "28px",

              cursor:
                "pointer",

              lineHeight:
                1,

              color:
                "#172033",
            }}
          >
            ←
          </button>

          <input
            value={
              popupName
            }
            onChange={(
              event,
            ) =>
              setPopupName(
                event.target.value,
              )
            }
            style={{
              width:
                "250px",

              border:
                "none",

              outline:
                "none",

              fontSize:
                "18px",

              fontWeight:
                700,

              color:
                "#172033",
            }}
          />

          <select
            value={status}
            onChange={(event) =>
              setStatus(
                event.target.value,
              )
            }
            style={{
              border:
                "1px solid #D5DCE5",

              borderRadius:
                "7px",

              padding:
                "6px 10px",

              fontSize:
                "12px",

              fontWeight:
                700,

              color:
                status === "active"
                  ? "#157A50"
                  : "#657080",

              background:
                status === "active"
                  ? "#E7F7EF"
                  : "#F1F3F5",

              cursor:
                "pointer",
            }}
          >
            <option value="draft">
              Draft
            </option>

            <option value="active">
              Live
            </option>
          </select>

          {savedMessage && (
            <span
              style={{
                color:
                  "#20A464",

                fontSize:
                  "13px",

                fontWeight:
                  600,
              }}
            >
              {
                savedMessage
              }
            </span>
          )}
        </div>

        <div
          style={{
            display:
              "flex",

            alignItems:
              "center",

            gap:
              "10px",
          }}
        >
          {/* DEVICE SWITCH */}

          <div
            style={{
              display:
                "flex",

              border:
                "1px solid #D5DCE5",

              borderRadius:
                "8px",

              overflow:
                "hidden",
            }}
          >
            {(
              [
                "mobile",
                "desktop",
              ] as const
            ).map(
              (
                item,
              ) => (
                <button
                  key={
                    item
                  }
                  type="button"
                  onClick={() =>
                    setDevice(
                      item,
                    )
                  }
                  style={{
                    padding:
                      "9px 14px",

                    border:
                      "none",

                    background:
                      device ===
                      item
                        ? "#0B4775"
                        : "#FFFFFF",

                    color:
                      device ===
                      item
                        ? "#FFFFFF"
                        : "#536274",

                    cursor:
                      "pointer",
                  }}
                >
                  {item ===
                  "mobile"
                    ? "Mobile"
                    : "Desktop"}
                </button>
              ),
            )}
          </div>

          {/* PREVIEW BUTTON */}

          <button
            type="button"
            onClick={() =>
              setPreviewStage(
                "teaser",
              )
            }
            style={{
              border:
                "1px solid #D5DCE5",

              background:
                "#FFFFFF",

              color:
                "#0B3D66",

              borderRadius:
                "8px",

              padding:
                "9px 16px",

              fontSize:
                "13px",

              fontWeight:
                600,

              cursor:
                "pointer",
            }}
          >
            Preview live flow
          </button>

          <button
            type="button"
            onClick={
              savePopup
            }
            disabled={
              saving
            }
            style={{
              padding:
                "10px 22px",

              border:
                "none",

              borderRadius:
                "8px",

              background:
                saving
                  ? "#8AA0B2"
                  : "#0B4775",

              color:
                "#FFFFFF",

              cursor:
                saving
                  ? "not-allowed"
                  : "pointer",

              fontWeight:
                700,
            }}
          >
            {saving
              ? "Saving..."
              : "Save"}
          </button>
        </div>
      </header>

      {/* ==================================================
          MAIN GRID
      ================================================== */}

      <div
        style={{
          minHeight:
            0,

          display:
            "grid",

          gridTemplateColumns:
            "270px minmax(0, 1fr) 410px",

          overflow:
            "hidden",
        }}
      >
        {/* ==================================================
            LEFT
        ================================================== */}

        <aside
          style={{
            background:
              "#FFFFFF",

            borderRight:
              "1px solid #DDE2E8",

            overflowY:
              "auto",

            minHeight:
              0,

            padding:
              "18px 14px",

            boxSizing:
              "border-box",
          }}
        >
          <div
            style={{
              fontSize:
                "11px",

              fontWeight:
                700,

              color:
                "#8A94A6",

              letterSpacing:
                ".08em",

              marginBottom:
                "12px",
            }}
          >
            STEPS
          </div>

          <p
            style={{
              margin:
                "0 0 14px",

              fontSize:
                "12px",

              lineHeight: 1.5,

              color:
                "#7B8795",
            }}
          >
            Click a step to edit it. Shoppers
            see Teaser first, then Offer,
            then Success after they act.
          </p>

          {/* POPUP STEPS */}

          {steps
            .filter(
              (step) =>
                step.id ===
                  "teaser" ||
                step.id ===
                  "offer" ||
                step.id ===
                  "success",
            )
            .map(
              (
                step,
              ) => (
                <button
                  key={
                    step.id
                  }
                  type="button"
                  onClick={() => {
                    setSelectedStepId(
                      step.id,
                    );

                    const firstEditableBlock =
                      step.blocks.find(
                        (block) =>
                          block.type !==
                          "brand",
                      );

                    setSelectedBlockId(
                      firstEditableBlock?.id ||
                        null,
                    );
                  }}
                  style={{
                    width:
                      "100%",

                    textAlign:
                      "left",

                    padding:
                      "14px",

                    marginBottom:
                      "10px",

                    border:
                      selectedStepId ===
                      step.id
                        ? "2px solid #0B4775"
                        : "1px solid #DDE2E8",

                    borderRadius:
                      "10px",

                    background:
                      selectedStepId ===
                      step.id
                        ? "#F8FAFC"
                        : "#FFFFFF",

                    cursor:
                      "pointer",
                  }}
                >
                  <div
                    style={{
                      fontWeight:
                        700,

                      fontSize:
                        "15px",
                    }}
                  >
                    {
                      step.title
                    }
                  </div>

                  <div
                    style={{
                      marginTop:
                        "6px",

                      fontSize:
                        "12px",

                      color:
                        "#7A8699",
                    }}
                  >
                    {
                      step.blocks.length
                    }{" "}
                    block
                    {step.blocks
                      .length !==
                    1
                      ? "s"
                      : ""}
                  </div>
                </button>
              ),
            )}

          {/* ADD BLOCK */}

          <div
            style={{
              marginTop:
                "24px",
            }}
          >
            <div
              style={{
                fontSize:
                  "11px",

                fontWeight:
                  700,

                color:
                  "#8A94A6",

                letterSpacing:
                  ".08em",

                marginBottom:
                  "12px",
              }}
            >
              ADD BLOCK
            </div>

            <p
              style={{
                margin:
                  "0 0 12px",

                fontSize:
                  "12px",

                lineHeight: 1.5,

                color:
                  "#7B8795",
              }}
            >
              Click any item below to add it
              to the step you're editing.
            </p>

            <div
              style={{
                display:
                  "grid",

                gridTemplateColumns:
                  "1fr 1fr",

                gap:
                  "8px",
              }}
            >
              {(
                [
                  [
                    "heading",
                    "Heading",
                  ],
                  [
                    "text",
                    "Text",
                  ],
                  [
                    "button",
                    "Button",
                  ],
                  [
                    "field",
                    "Field",
                  ],
                  [
                    "channel",
                    "Channel",
                  ],
                  [
                    "quiz",
                    "Quiz",
                  ],
                  [
                    "timer",
                    "Timer",
                  ],
                  [
                    "product",
                    "Product",
                  ],
                ] as const
              ).map(
                ([
                  type,
                  label,
                ]) => (
                  <button
                    key={
                      type
                    }
                    type="button"
                    onClick={() =>
                      addBlock(
                        type,
                      )
                    }
                    style={{
                      padding:
                        "11px 7px",

                      border:
                        "1px solid #D5DCE5",

                      borderRadius:
                        "8px",

                      background:
                        "#FFFFFF",

                      cursor:
                        "pointer",

                      fontSize:
                        "12px",

                      fontWeight:
                        600,
                    }}
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
          </div>
        </aside>

        {/* ==================================================
            CENTER PREVIEW
        ================================================== */}

        <main
          style={{
            position:
              "relative",

            background:
              "#EEF1F5",

            display:
              "flex",

            alignItems:
              "flex-start",

            justifyContent:
              "center",

            padding:
              "55px",

            overflow:
              "auto",

            boxSizing:
              "border-box",
          }}
        >
          <div
            style={{
              position:
                "absolute",

              top:
                "20px",

              left:
                "20px",

              padding:
                "9px 12px",

              borderRadius:
                "8px",

              background:
                "#FFFFFF",

              border:
                "1px solid #D5DCE5",

              color:
                "#4B5565",

              fontSize:
                "12px",

              fontWeight:
                600,

              boxShadow:
                "0 1px 2px rgba(23, 32, 51, 0.06)",
            }}
          >
            Preview — this is how shoppers will see it
          </div>

          {/* POPUP */}

          {selectedStep?.id ===
          "teaser" ? (
            <div
              onClick={
                selectPopup
              }
              style={{
                marginTop:
                  device ===
                  "mobile"
                    ? "440px"
                    : "260px",

                display:
                  "flex",

                alignItems:
                  "center",

                gap:
                  "2px",

                borderRadius:
                  "999px",

                background:
                  popupSettings.headerGradient
                    ? `linear-gradient(135deg, ${popupSettings.headerBackground}, ${popupSettings.headerGradientEnd})`
                    : popupSettings.headerBackground,

                boxShadow:
                  "0 12px 28px rgba(0,0,0,.32)",

                cursor:
                  "pointer",
              }}
            >
              <div
                onClick={(event) => {
                  event.stopPropagation();

                  if (
                    selectedStep.blocks[0]
                  ) {
                    selectBlock(
                      selectedStep
                        .blocks[0].id,
                    );
                  }
                }}
                style={{
                  maxWidth:
                    "240px",

                  whiteSpace:
                    "nowrap",

                  overflow:
                    "hidden",

                  textOverflow:
                    "ellipsis",

                  padding:
                    "13px 8px 13px 20px",

                  outline:
                    selectedBlockId ===
                    selectedStep
                      .blocks[0]?.id
                      ? "2px solid #1677FF"
                      : "none",

                  outlineOffset:
                    "-2px",

                  borderRadius:
                    "999px",

                  color:
                    selectedStep
                      .blocks[0]
                      ?.color ||
                    "#FFFFFF",

                  fontSize: `${
                    selectedStep
                      .blocks[0]
                      ?.fontSize || 14
                  }px`,

                  fontFamily:
                    selectedStep
                      .blocks[0]
                      ?.fontFamily ||
                    "inherit",

                  fontWeight:
                    selectedStep
                      .blocks[0]?.bold ??
                    true
                      ? 700
                      : 400,

                  fontStyle:
                    selectedStep
                      .blocks[0]
                      ?.italic
                      ? "italic"
                      : "normal",

                  letterSpacing: `${
                    selectedStep
                      .blocks[0]
                      ?.letterSpacing || 0
                  }px`,
                }}
              >
                {selectedStep.blocks[0]
                  ?.text ||
                  "Get an offer"}
              </div>

              <div
                style={{
                  display:
                    "flex",

                  alignItems:
                    "center",

                  justifyContent:
                    "center",

                  width:
                    "22px",

                  height:
                    "22px",

                  marginRight:
                    "10px",

                  borderRadius:
                    "50%",

                  background:
                    "rgba(255,255,255,0.18)",

                  color:
                    "#FFFFFF",

                  fontSize:
                    "13px",

                  lineHeight:
                    1,

                  flexShrink:
                    0,
                }}
              >
                ×
              </div>
            </div>
          ) : (
          <div
            onClick={
              selectPopup
            }
            style={{
              width:
                device ===
                "mobile"
                  ? "390px"
                  : "520px",

              maxWidth:
                "100%",

              minHeight:
                "500px",

              marginTop:
                "10px",

              borderRadius:
                `${popupSettings.popupBorderRadius}px`,

              overflow:
                "hidden",

              background:
                popupSettings.bodyBackground,

              boxShadow:
                "0 24px 70px rgba(0,0,0,.35)",

              cursor:
                "pointer",
            }}
          >
            {/* HEADER */}

            <div
              style={{
                position:
                  "relative",

                minHeight:
                  `${popupSettings.headerHeight}px`,

                padding:
                  "20px",

                boxSizing:
                  "border-box",

                background:
                  popupSettings.headerGradient
                    ? `linear-gradient(135deg, ${popupSettings.headerBackground}, ${popupSettings.headerGradientEnd})`
                    : popupSettings.headerBackground,

                display:
                  "flex",

                alignItems:
                  "flex-start",

                justifyContent:
                  "flex-start",
              }}
            >
              {brandBlock &&
                renderBlock(
                  brandBlock,
                )}

              <button
                type="button"
                onClick={(
                  event,
                ) => {
                  event.stopPropagation();

                  selectCloseButton();
                }}
                style={{
                  position:
                    "absolute",

                  right:
                    "14px",

                  top:
                    "12px",

                  width:
                    `${popupSettings.closeButtonSize}px`,

                  height:
                    `${popupSettings.closeButtonSize}px`,

                  borderRadius:
                    `${popupSettings.closeButtonRadius}%`,

                  border:
                    "none",

                  background:
                    popupSettings.closeButtonBackground,

                  color:
                    popupSettings.closeButtonColor,

                  fontSize:
                    `${Math.max(
                      16,
                      popupSettings.closeButtonSize *
                        0.52,
                    )}px`,

                  cursor:
                    "pointer",

                  display:
                    "flex",

                  alignItems:
                    "center",

                  justifyContent:
                    "center",
                }}
              >
                {
                  popupSettings.closeButtonText
                }
              </button>
            </div>

            {/* BODY */}

            <div
              style={{
                padding:
                  `${popupSettings.bodyPadding}px`,

                boxSizing:
                  "border-box",
              }}
            >
              {selectedStep?.blocks.filter(
                (block) =>
                  block.type !==
                  "brand",
              ).length ===
                0 && (
                <div
                  style={{
                    minHeight:
                      "250px",

                    display:
                      "flex",

                    alignItems:
                      "center",

                    justifyContent:
                      "center",

                    textAlign:
                      "center",

                    color:
                      "#91877C",

                    border:
                      "1px dashed #C9BDAE",

                    borderRadius:
                      "10px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize:
                          "16px",

                        fontWeight:
                          700,
                      }}
                    >
                      Empty step
                    </div>

                    <div
                      style={{
                        marginTop:
                          "7px",

                        fontSize:
                          "13px",
                      }}
                    >
                      Add a block
                      from the
                      left panel.
                    </div>
                  </div>
                </div>
              )}

              {selectedStep?.blocks
                .filter(
                  (block) =>
                    block.type !==
                    "brand",
                )
                .length > 0 && (
                <div
                  style={{
                    marginBottom:
                      "10px",
                    fontSize:
                      "10px",
                    color:
                      "#91877C",
                    textAlign:
                      "center",
                    letterSpacing:
                      ".04em",
                  }}
                >
                  Drag ⋮⋮ to reorder
                </div>
              )}

              {selectedStep?.blocks
                .filter(
                  (block) =>
                    block.type !==
                    "brand",
                )
                .map(
                  (block) =>
                    renderBlock(
                      block,
                    ),
                )}

              {/* FOOTER ONLY — PROGRESS REMOVED */}

              {popupSettings.footerVisible && (
                <div
                  onClick={(
                    event,
                  ) => {
                    event.stopPropagation();
                  }}
                  style={{
                    marginTop:
                      "16px",

                    textAlign:
                      "center",

                    color:
                      popupSettings.footerColor,

                    fontSize:
                      "12px",

                    textDecoration:
                      "underline",

                    cursor:
                      "pointer",
                  }}
                >
                  {
                    popupSettings.footerText
                  }
                </div>
              )}
            </div>
          </div>
          )}
        </main>

        {/* ==================================================
            RIGHT
        ================================================== */}

        <aside
          style={{
            background:
              "#FFFFFF",

            borderLeft:
              "1px solid #DDE2E8",

            minHeight:
              0,

            overflowY:
              "auto",
          }}
        >
          {/* TABS */}

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "1fr 1fr 1fr",

              borderBottom:
                "1px solid #DDE2E8",
            }}
          >
            {(
              [
                [
                  "content",
                  "Content",
                ],
                [
                  "style",
                  "Style",
                ],
                [
                  "logic",
                  "Logic",
                ],
              ] as const
            ).map(
              ([
                tab,
                label,
              ]) => (
                <button
                  key={
                    tab
                  }
                  type="button"
                  onClick={() =>
                    setActiveTab(
                      tab,
                    )
                  }
                  style={{
                    padding:
                      "15px 8px",

                    border:
                      "none",

                    borderBottom:
                      activeTab ===
                      tab
                        ? "3px solid #0B4775"
                        : "3px solid transparent",

                    background:
                      "#FFFFFF",

                    fontWeight:
                      700,

                    cursor:
                      "pointer",
                  }}
                >
                  {
                    label
                  }
                </button>
              ),
            )}
          </div>

          <div
            style={{
              padding:
                "20px",

              boxSizing:
                "border-box",
            }}
          >
            <p
              style={{
                margin:
                  "0 0 18px",

                fontSize:
                  "12px",

                lineHeight: 1.5,

                color:
                  "#7B8795",
              }}
            >
              {activeTab === "content" &&
                "Click any element in the preview, then edit its text and content here."}
              {activeTab === "style" &&
                "Fine-tune colors, spacing and appearance for the selected element or the whole popup."}
              {activeTab === "logic" &&
                "Control when and to whom this popup is shown."}
            </p>

            {/* =================================================
                CONTENT
            ================================================= */}

            {activeTab ===
              "content" && (
              <>
                {selectedBlock ? (
                  <>
                    <div
                      style={{
                        fontSize:
                          "11px",

                        fontWeight:
                          700,

                        color:
                          "#8A94A6",

                        letterSpacing:
                          ".08em",

                        marginBottom:
                          "16px",
                      }}
                    >
                      SELECTED ·{" "}
                      {
                        selectedBlock.type.toUpperCase()
                      }
                    </div>

                    {/* TEXT EDITOR */}

                    <label
                      style={{
                        display:
                          "block",

                        fontSize:
                          "12px",

                        fontWeight:
                          700,

                        color:
                          "#536274",

                        marginBottom:
                          "7px",
                      }}
                    >
                      Content
                    </label>

                    <textarea
                      value={
                        selectedBlock.text
                      }
                      onChange={(
                        event,
                      ) =>
                        updateBlock(
                          selectedBlock.id,
                          {
                            text:
                              event
                                .target
                                .value,
                          },
                        )
                      }
                      rows={
                        selectedBlock.type ===
                        "text"
                          ? 5
                          : 3
                      }
                      style={{
                        width:
                          "100%",

                        boxSizing:
                          "border-box",

                        padding:
                          "10px",

                        border:
                          "1px solid #D5DCE5",

                        borderRadius:
                          "8px",

                        resize:
                          "vertical",

                        fontFamily:
                          "inherit",

                        fontSize:
                          "14px",
                      }}
                    />

                    {selectedBlock.type ===
                      "field" && (
                      <div
                        style={{
                          marginTop:
                            "14px",
                        }}
                      >
                        <label
                          style={{
                            display:
                              "block",

                            fontSize:
                              "12px",

                            fontWeight:
                              700,

                            color:
                              "#536274",

                            marginBottom:
                              "7px",
                          }}
                        >
                          Placeholder
                        </label>

                        <input
                          value={
                            selectedBlock.placeholder
                          }
                          onChange={(
                            event,
                          ) =>
                            updateBlock(
                              selectedBlock.id,
                              {
                                placeholder:
                                  event
                                    .target
                                    .value,
                              },
                            )
                          }
                          style={{
                            width:
                              "100%",

                            boxSizing:
                              "border-box",

                            padding:
                              "10px",

                            border:
                              "1px solid #D5DCE5",

                            borderRadius:
                              "8px",
                          }}
                        />

                        <label
                          style={{
                            display:
                              "block",

                            fontSize:
                              "12px",

                            fontWeight:
                              700,

                            color:
                              "#536274",

                            marginTop:
                              "14px",

                            marginBottom:
                              "7px",
                          }}
                        >
                          Answer type
                        </label>

                        <select
                          value={
                            selectedBlock.fieldType
                          }
                          onChange={(
                            event,
                          ) =>
                            updateBlock(
                              selectedBlock.id,
                              {
                                fieldType:
                                  event
                                    .target
                                    .value as FieldType,
                              },
                            )
                          }
                          style={{
                            width:
                              "100%",

                            boxSizing:
                              "border-box",

                            padding:
                              "10px",

                            border:
                              "1px solid #D5DCE5",

                            borderRadius:
                              "8px",

                            background:
                              "#FFFFFF",
                          }}
                        >
                          <option value="text">
                            Text
                          </option>

                          <option value="email">
                            Email
                          </option>

                          <option value="number">
                            Number
                          </option>

                          <option value="phone">
                            Phone
                          </option>
                        </select>

                        <label
                          style={{
                            display:
                              "flex",

                            alignItems:
                              "center",

                            gap:
                              "9px",

                            marginTop:
                              "14px",

                            fontSize:
                              "13px",

                            color:
                              "#374151",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={
                              selectedBlock.fieldRequired
                            }
                            onChange={(
                              event,
                            ) =>
                              updateBlock(
                                selectedBlock.id,
                                {
                                  fieldRequired:
                                    event
                                      .target
                                      .checked,
                                },
                              )
                            }
                          />
                          Required — shoppers
                          must fill this in
                          before continuing
                        </label>
                      </div>
                    )}

                    {selectedBlock.type ===
                      "image" && (
                      <div
                        style={{
                          marginTop:
                            "14px",
                        }}
                      >
                        <label
                          style={{
                            display:
                              "block",

                            fontSize:
                              "12px",

                            fontWeight:
                              700,

                            color:
                              "#536274",

                            marginBottom:
                              "7px",
                          }}
                        >
                          Image URL
                        </label>

                        <input
                          value={
                            selectedBlock.imageUrl
                          }
                          onChange={(
                            event,
                          ) =>
                            updateBlock(
                              selectedBlock.id,
                              {
                                imageUrl:
                                  event
                                    .target
                                    .value,
                              },
                            )
                          }
                          style={{
                            width:
                              "100%",

                            boxSizing:
                              "border-box",

                            padding:
                              "10px",

                            border:
                              "1px solid #D5DCE5",

                            borderRadius:
                              "8px",
                          }}
                        />
                      </div>
                    )}

                    {/* ACTIONS */}

                    <div
                      style={{
                        display:
                          "flex",

                        gap:
                          "8px",

                        marginTop:
                          "20px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={
                          duplicateBlock
                        }
                        style={{
                          flex:
                            1,

                          padding:
                            "10px",

                          border:
                            "1px solid #D5DCE5",

                          borderRadius:
                            "8px",

                          background:
                            "#FFFFFF",

                          cursor:
                            "pointer",
                        }}
                      >
                        Duplicate
                      </button>

                      <button
                        type="button"
                        onClick={
                          deleteBlock
                        }
                        style={{
                          flex:
                            1,

                          padding:
                            "10px",

                          border:
                            "1px solid #F0B9B9",

                          borderRadius:
                            "8px",

                          background:
                            "#FFF5F5",

                          color:
                            "#C62828",

                          cursor:
                            "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      padding:
                        "50px 10px",

                      textAlign:
                        "center",

                      color:
                        "#8A94A6",
                    }}
                  >
                    Click an element
                    inside the popup
                    to edit it.
                  </div>
                )}
              </>
            )}

            {/* =================================================
                STYLE
            ================================================= */}

            {activeTab ===
              "style" && (
              <>
                {/* OFFER ELEMENT SELECTOR + CONTENT EDIT */}

                {offerBlocks.length >
                  0 && (
                  <div
                    style={{
                      padding:
                        "16px",

                      border:
                        "1px solid #DDE2E8",

                      borderRadius:
                        "12px",

                      background:
                        "#FAFBFC",

                      marginBottom:
                        "14px",
                    }}
                  >
                    <div
                      style={{
                        fontSize:
                          "14px",

                        fontWeight:
                          700,

                        marginBottom:
                          "12px",
                      }}
                    >
                      Offer content
                    </div>

                    {offerBlocks.map(
                      (
                        block,
                      ) => (
                        <button
                          key={
                            block.id
                          }
                          type="button"
                          onClick={() => {
                            setSelectedStepId(
                              "offer",
                            );

                            setSelectedBlockId(
                              block.id,
                            );
                          }}
                          style={{
                            width:
                              "100%",

                            textAlign:
                              "left",

                            padding:
                              "10px",

                            marginBottom:
                              "7px",

                            border:
                              selectedBlockId ===
                              block.id
                                ? "2px solid #1677FF"
                                : "1px solid #D5DCE5",

                            borderRadius:
                              "8px",

                            background:
                              "#FFFFFF",

                            cursor:
                              "pointer",
                          }}
                        >
                          <div
                            style={{
                              fontSize:
                                "11px",

                              fontWeight:
                                700,

                              color:
                                "#8A94A6",

                              textTransform:
                                "uppercase",
                            }}
                          >
                            {
                              block.type
                            }
                          </div>

                          <div
                            style={{
                              marginTop:
                                "3px",

                              fontSize:
                                "13px",

                              fontWeight:
                                600,

                              whiteSpace:
                                "nowrap",

                              overflow:
                                "hidden",

                              textOverflow:
                                "ellipsis",
                            }}
                          >
                            {
                              block.text
                            }
                          </div>
                        </button>
                      ),
                    )}

                    {selectedBlock &&
                      selectedStepId ===
                        "offer" && (
                        <>
                          <label
                            style={{
                              display:
                                "block",

                              marginTop:
                                "14px",

                              fontSize:
                                "12px",

                              fontWeight:
                                700,

                              color:
                                "#536274",

                              marginBottom:
                                "7px",
                            }}
                          >
                            Edit content
                          </label>

                          <textarea
                            value={
                              selectedBlock.text
                            }
                            onChange={(
                              event,
                            ) =>
                              updateBlock(
                                selectedBlock.id,
                                {
                                  text:
                                    event
                                      .target
                                      .value,
                                },
                              )
                            }
                            rows={
                              selectedBlock.type ===
                              "text"
                                ? 4
                                : 2
                            }
                            style={{
                              width:
                                "100%",

                              boxSizing:
                                "border-box",

                              padding:
                                "10px",

                              border:
                                "1px solid #D5DCE5",

                              borderRadius:
                                "8px",

                              resize:
                                "vertical",

                              fontFamily:
                                "inherit",
                            }}
                          />
                        </>
                      )}
                  </div>
                )}

                {/* POPUP */}

                <div
                  style={{
                    fontSize:
                      "11px",

                    fontWeight:
                      700,

                    color:
                      "#8A94A6",

                    letterSpacing:
                      ".08em",

                    marginBottom:
                      "12px",
                  }}
                >
                  POPUP
                </div>

                <div
                  style={{
                    padding:
                      "16px",

                    border:
                      "1px solid #DDE2E8",

                    borderRadius:
                      "12px",

                    background:
                      "#FAFBFC",
                  }}
                >
                  <div
                    style={{
                      fontSize:
                        "14px",

                      fontWeight:
                        700,
                    }}
                  >
                    Popup appearance
                  </div>

                  {colorControl(
                    "Background color",
                    popupSettings.bodyBackground,
                    (value) =>
                      updatePopupSettings(
                        {
                          bodyBackground:
                            value,
                        },
                      ),
                  )}

                  {numberControl(
                    "Corner radius",
                    popupSettings.popupBorderRadius,
                    0,
                    40,
                    (value) =>
                      updatePopupSettings(
                        {
                          popupBorderRadius:
                            value,
                        },
                      ),
                  )}

                  {numberControl(
                    "Body padding",
                    popupSettings.bodyPadding,
                    8,
                    60,
                    (value) =>
                      updatePopupSettings(
                        {
                          bodyPadding:
                            value,
                        },
                      ),
                  )}
                </div>

                {/* HEADER */}

                <div
                  style={{
                    marginTop:
                      "14px",

                    padding:
                      "16px",

                    border:
                      "1px solid #DDE2E8",

                    borderRadius:
                      "12px",

                    background:
                      "#FFFFFF",
                  }}
                >
                  <div
                    style={{
                      fontSize:
                        "14px",

                      fontWeight:
                        700,
                    }}
                  >
                    Header
                  </div>

                  {colorControl(
                    "Background",
                    popupSettings.headerBackground,
                    (value) =>
                      updatePopupSettings(
                        {
                          headerBackground:
                            value,
                        },
                      ),
                  )}

                  <label
                    style={{
                      display:
                        "flex",

                      alignItems:
                        "center",

                      gap:
                        "9px",

                      marginTop:
                        "14px",

                      fontSize:
                        "13px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        popupSettings.headerGradient
                      }
                      onChange={(
                        event,
                      ) =>
                        updatePopupSettings(
                          {
                            headerGradient:
                              event
                                .target
                                .checked,
                          },
                        )
                      }
                    />

                    Gradient
                  </label>

                  {popupSettings.headerGradient &&
                    colorControl(
                      "Gradient end",
                      popupSettings.headerGradientEnd,
                      (value) =>
                        updatePopupSettings(
                          {
                            headerGradientEnd:
                              value,
                          },
                        ),
                    )}

                  {numberControl(
                    "Header height",
                    popupSettings.headerHeight,
                    80,
                    260,
                    (value) =>
                      updatePopupSettings(
                        {
                          headerHeight:
                            value,
                        },
                      ),
                  )}
                </div>

                {/* CLOSE BUTTON */}

                <div
                  style={{
                    marginTop:
                      "14px",

                    padding:
                      "16px",

                    border:
                      "1px solid #DDE2E8",

                    borderRadius:
                      "12px",

                    background:
                      "#FFFFFF",
                  }}
                >
                  <div
                    style={{
                      fontSize:
                        "14px",

                      fontWeight:
                        700,
                    }}
                  >
                    Close button
                  </div>

                  <div
                    style={{
                      marginTop:
                        "16px",
                    }}
                  >
                    <label
                      style={{
                        display:
                          "block",

                        fontSize:
                          "12px",

                        fontWeight:
                          700,

                        color:
                          "#536274",

                        marginBottom:
                          "7px",
                      }}
                    >
                      Icon
                    </label>

                    <input
                      value={
                        popupSettings.closeButtonText
                      }
                      onChange={(
                        event,
                      ) =>
                        updatePopupSettings(
                          {
                            closeButtonText:
                              event
                                .target
                                .value,
                          },
                        )
                      }
                      style={{
                        width:
                          "100%",

                        boxSizing:
                          "border-box",

                        padding:
                          "10px",

                        border:
                          "1px solid #D5DCE5",

                        borderRadius:
                          "8px",
                      }}
                    />
                  </div>

                  {colorControl(
                    "Background",
                    popupSettings.closeButtonBackground,
                    (value) =>
                      updatePopupSettings(
                        {
                          closeButtonBackground:
                            value,
                        },
                      ),
                  )}

                  {colorControl(
                    "Icon color",
                    popupSettings.closeButtonColor,
                    (value) =>
                      updatePopupSettings(
                        {
                          closeButtonColor:
                            value,
                        },
                      ),
                  )}

                  {numberControl(
                    "Size",
                    popupSettings.closeButtonSize,
                    24,
                    60,
                    (value) =>
                      updatePopupSettings(
                        {
                          closeButtonSize:
                            value,
                        },
                      ),
                  )}

                  {numberControl(
                    "Radius",
                    popupSettings.closeButtonRadius,
                    0,
                    50,
                    (value) =>
                      updatePopupSettings(
                        {
                          closeButtonRadius:
                            value,
                        },
                      ),
                  )}
                </div>

                {/* FOOTER */}

                <div
                  style={{
                    marginTop:
                      "14px",

                    padding:
                      "16px",

                    border:
                      "1px solid #DDE2E8",

                    borderRadius:
                      "12px",

                    background:
                      "#FFFFFF",
                  }}
                >
                  <div
                    style={{
                      fontSize:
                        "14px",

                      fontWeight:
                        700,
                    }}
                  >
                    Footer
                  </div>

                  <div
                    style={{
                      marginTop:
                        "16px",
                    }}
                  >
                    <label
                      style={{
                        display:
                          "block",

                        fontSize:
                          "12px",

                        fontWeight:
                          700,

                        color:
                          "#536274",

                        marginBottom:
                          "7px",
                      }}
                    >
                      Footer text
                    </label>

                    <input
                      value={
                        popupSettings.footerText
                      }
                      onChange={(
                        event,
                      ) =>
                        updatePopupSettings(
                          {
                            footerText:
                              event
                                .target
                                .value,
                          },
                        )
                      }
                      style={{
                        width:
                          "100%",

                        boxSizing:
                          "border-box",

                        padding:
                          "10px",

                        border:
                          "1px solid #D5DCE5",

                        borderRadius:
                          "8px",
                      }}
                    />
                  </div>

                  {colorControl(
                    "Footer color",
                    popupSettings.footerColor,
                    (value) =>
                      updatePopupSettings(
                        {
                          footerColor:
                            value,
                        },
                      ),
                  )}

                  <label
                    style={{
                      display:
                        "flex",

                      alignItems:
                        "center",

                      gap:
                        "9px",

                      marginTop:
                        "16px",

                      fontSize:
                        "13px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        popupSettings.footerVisible
                      }
                      onChange={(
                        event,
                      ) =>
                        updatePopupSettings(
                          {
                            footerVisible:
                              event
                                .target
                                .checked,
                          },
                        )
                      }
                    />

                    Show footer
                  </label>

                  {/* PROGRESS COLOR + SHOW PROGRESS REMOVED */}
                </div>

                {/* SELECTED ELEMENT STYLE */}

                {selectedBlock && (
                  <div
                    style={{
                      marginTop:
                        "14px",

                      padding:
                        "16px",

                      border:
                        "1px solid #DDE2E8",

                      borderRadius:
                        "12px",

                      background:
                        "#FFFFFF",
                    }}
                  >
                    <div
                      style={{
                        fontSize:
                          "14px",

                        fontWeight:
                          700,
                      }}
                    >
                      Selected element
                    </div>

                    {colorControl(
                      "Text color",
                      selectedBlock.color,
                      (value) =>
                        updateBlock(
                          selectedBlock.id,
                          {
                            color:
                              value,
                          },
                        ),
                    )}

                    {colorControl(
                      "Background",
                      selectedBlock.background,
                      (value) =>
                        updateBlock(
                          selectedBlock.id,
                          {
                            background:
                              value,
                          },
                        ),
                    )}

                    {numberControl(
                      "Font size",
                      selectedBlock.fontSize,
                      10,
                      60,
                      (value) =>
                        updateBlock(
                          selectedBlock.id,
                          {
                            fontSize:
                              value,
                          },
                        ),
                    )}

                    {numberControl(
                      "Width",
                      selectedBlock.width,
                      20,
                      100,
                      (value) =>
                        updateBlock(
                          selectedBlock.id,
                          {
                            width:
                              value,
                          },
                        ),
                    )}

                    {numberControl(
                      "Border radius",
                      selectedBlock.borderRadius,
                      0,
                      40,
                      (value) =>
                        updateBlock(
                          selectedBlock.id,
                          {
                            borderRadius:
                              value,
                          },
                        ),
                    )}

                    {numberControl(
                      "Padding X",
                      selectedBlock.paddingX,
                      0,
                      40,
                      (value) =>
                        updateBlock(
                          selectedBlock.id,
                          {
                            paddingX:
                              value,
                          },
                        ),
                    )}

                    {numberControl(
                      "Padding Y",
                      selectedBlock.paddingY,
                      0,
                      40,
                      (value) =>
                        updateBlock(
                          selectedBlock.id,
                          {
                            paddingY:
                              value,
                          },
                        ),
                    )}

                    {numberControl(
                      "Margin top",
                      selectedBlock.marginTop,
                      0,
                      50,
                      (value) =>
                        updateBlock(
                          selectedBlock.id,
                          {
                            marginTop:
                              value,
                          },
                        ),
                    )}

                    <label
                      style={{
                        display:
                          "flex",

                        alignItems:
                          "center",

                        gap:
                          "9px",

                        marginTop:
                          "16px",

                        fontSize:
                          "13px",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={
                          selectedBlock.bold
                        }
                        onChange={(
                          event,
                        ) =>
                          updateBlock(
                            selectedBlock.id,
                            {
                              bold:
                                event
                                  .target
                                  .checked,
                            },
                          )
                        }
                      />

                      Bold
                    </label>

                    <label
                      style={{
                        display:
                          "flex",

                        alignItems:
                          "center",

                        gap:
                          "9px",

                        marginTop:
                          "10px",

                        fontSize:
                          "13px",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={
                          selectedBlock.italic
                        }
                        onChange={(
                          event,
                        ) =>
                          updateBlock(
                            selectedBlock.id,
                            {
                              italic:
                                event
                                  .target
                                  .checked,
                            },
                          )
                        }
                      />

                      Italic
                    </label>

                    <div
                      style={{
                        marginTop:
                          "16px",
                      }}
                    >
                      <label
                        style={{
                          display:
                            "block",

                          fontSize:
                            "12px",

                          fontWeight:
                            700,

                          color:
                            "#536274",

                          marginBottom:
                            "7px",
                        }}
                      >
                        Alignment
                      </label>

                      <select
                        value={
                          selectedBlock.align
                        }
                        onChange={(
                          event,
                        ) =>
                          updateBlock(
                            selectedBlock.id,
                            {
                              align:
                                event
                                  .target
                                  .value as Align,
                            },
                          )
                        }
                        style={{
                          width:
                            "100%",

                          padding:
                            "10px",

                          border:
                            "1px solid #D5DCE5",

                          borderRadius:
                            "8px",

                          background:
                            "#FFFFFF",
                        }}
                      >
                        <option value="left">
                          Left
                        </option>

                        <option value="center">
                          Center
                        </option>

                        <option value="right">
                          Right
                        </option>
                      </select>
                    </div>

                    <div
                      style={{
                        marginTop:
                          "16px",
                      }}
                    >
                      <label
                        style={{
                          display:
                            "block",

                          fontSize:
                            "12px",

                          fontWeight:
                            700,

                          color:
                            "#536274",

                          marginBottom:
                            "7px",
                        }}
                      >
                        Font family
                      </label>

                      <select
                        value={
                          selectedBlock.fontFamily
                        }
                        onChange={(
                          event,
                        ) =>
                          updateBlock(
                            selectedBlock.id,
                            {
                              fontFamily:
                                event
                                  .target
                                  .value,
                            },
                          )
                        }
                        style={{
                          width:
                            "100%",

                          padding:
                            "10px",

                          border:
                            "1px solid #D5DCE5",

                          borderRadius:
                            "8px",

                          background:
                            "#FFFFFF",
                        }}
                      >
                        <option value="Arial">
                          Arial
                        </option>

                        <option value="Georgia">
                          Georgia
                        </option>

                        <option value="Helvetica">
                          Helvetica
                        </option>

                        <option value="Times New Roman">
                          Times New Roman
                        </option>

                        <option value="Verdana">
                          Verdana
                        </option>
                      </select>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* =================================================
                LOGIC
            ================================================= */}

            {activeTab ===
              "logic" && (
              <>
                <div
                  style={{
                    fontSize:
                      "11px",

                    fontWeight:
                      700,

                    color:
                      "#8A94A6",

                    letterSpacing:
                      ".08em",

                    marginBottom:
                      "12px",
                  }}
                >
                  DISPLAY LOGIC
                </div>

                <div
                  style={{
                    padding:
                      "16px",

                    border:
                      "1px solid #DDE2E8",

                    borderRadius:
                      "12px",

                    background:
                      "#FFFFFF",
                  }}
                >
                  <div
                    style={{
                      fontSize:
                        "14px",

                      fontWeight:
                        700,
                    }}
                  >
                    Audience
                  </div>

                  <label
                    style={{
                      display:
                        "flex",

                      alignItems:
                        "center",

                      gap:
                        "9px",

                      marginTop:
                        "14px",

                      fontSize:
                        "13px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        popupSettings.audienceNewOnly
                      }
                      onChange={(event) =>
                        updatePopupSettings({
                          audienceNewOnly:
                            event.target
                              .checked,
                          audienceReturningOnly:
                            event.target
                              .checked
                              ? false
                              : popupSettings.audienceReturningOnly,
                        })
                      }
                    />
                    New visitors only
                  </label>

                  <label
                    style={{
                      display:
                        "flex",

                      alignItems:
                        "center",

                      gap:
                        "9px",

                      marginTop:
                        "10px",

                      fontSize:
                        "13px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        popupSettings.audienceReturningOnly
                      }
                      onChange={(event) =>
                        updatePopupSettings({
                          audienceReturningOnly:
                            event.target
                              .checked,
                          audienceNewOnly:
                            event.target
                              .checked
                              ? false
                              : popupSettings.audienceNewOnly,
                        })
                      }
                    />
                    Returning visitors only
                  </label>

                  <div
                    style={{
                      marginTop:
                        "16px",

                      fontSize:
                        "14px",

                      fontWeight:
                        700,
                    }}
                  >
                    Device
                  </div>

                  <div
                    style={{
                      display:
                        "flex",

                      gap:
                        "8px",

                      marginTop:
                        "10px",
                    }}
                  >
                    {(
                      [
                        ["all", "All devices"],
                        ["desktop", "Desktop only"],
                        ["mobile", "Mobile only"],
                      ] as const
                    ).map(
                      ([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            updatePopupSettings({
                              audienceDevice:
                                value,
                            })
                          }
                          style={{
                            flex: 1,

                            padding:
                              "8px 6px",

                            border:
                              popupSettings.audienceDevice ===
                              value
                                ? "1px solid #0B4775"
                                : "1px solid #D5DCE5",

                            borderRadius:
                              "7px",

                            background:
                              popupSettings.audienceDevice ===
                              value
                                ? "#EEF3F8"
                                : "#FFFFFF",

                            color:
                              popupSettings.audienceDevice ===
                              value
                                ? "#0B3D66"
                                : "#657080",

                            fontSize:
                              "11px",

                            fontWeight:
                              600,

                            cursor:
                              "pointer",
                          }}
                        >
                          {label}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>

    {/* ====================================================
        LIVE PREVIEW OVERLAY
    ==================================================== */}

    {previewStage !== "closed" && (
      <div
        onClick={() =>
          setPreviewStage("closed")
        }
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 20, 30, 0.72)",
          backdropFilter: "blur(2px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "18px",
          zIndex: 999,
          padding: "24px",
          boxSizing: "border-box",
        }}
      >
        {/* CAPTION BAR */}

        <div
          onClick={(event) =>
            event.stopPropagation()
          }
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            color: "#E5E7EB",
            fontSize: "13px",
          }}
        >
          <span style={{ fontWeight: 700 }}>
            Live preview
          </span>

          <span style={{ color: "#9CA3AF" }}>
            {previewStage === "teaser" &&
              "Tap the teaser to open the offer"}
            {previewStage === "offer" &&
              "Tap the button to see the success screen"}
            {previewStage === "success" &&
              "This is the last screen shoppers see"}
          </span>

          <button
            type="button"
            onClick={() =>
              setPreviewStage("closed")
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              border: "1px solid rgba(255,255,255,0.24)",
              background: "rgba(255,255,255,0.08)",
              color: "#FFFFFF",
              borderRadius: "999px",
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Close preview ×
          </button>
        </div>

        {/* DEVICE FRAME */}

        <div
          onClick={(event) =>
            event.stopPropagation()
          }
          style={
            device === "mobile"
              ? {
                  width: "360px",
                  padding: "14px",
                  background: "#14171C",
                  borderRadius: "44px",
                  boxShadow:
                    "0 30px 70px rgba(0,0,0,.5)",
                }
              : {
                  width: "min(960px, 92vw)",
                  background: "#E5E7EB",
                  borderRadius: "14px",
                  overflow: "hidden",
                  boxShadow:
                    "0 30px 70px rgba(0,0,0,.5)",
                }
          }
        >
          {device === "desktop" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 16px",
              }}
            >
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: "#F87171",
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: "#FBBF24",
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: "#34D399",
                  display: "inline-block",
                }}
              />

              <div
                style={{
                  flex: 1,
                  marginLeft: "10px",
                  background: "#FFFFFF",
                  borderRadius: "999px",
                  padding: "6px 14px",
                  fontSize: "12px",
                  color: "#6B7280",
                }}
              >
                your-store.myshopify.com
              </div>
            </div>
          )}

          {/* SCREEN */}

          <div
            style={{
              position: "relative",
              width:
                device === "mobile"
                  ? "332px"
                  : "100%",

              height:
                device === "mobile"
                  ? "680px"
                  : "min(600px, 78vh)",

              margin:
                device === "mobile"
                  ? "0 auto"
                  : undefined,

              borderRadius:
                device === "mobile"
                  ? "30px"
                  : "0",

              overflow:
                device === "mobile"
                  ? "hidden"
                  : "auto",

              background: "#FBFAF8",
            }}
          >
            {/* MOCK STOREFRONT CONTENT */}

            {device === "mobile" ? (
              <div
                style={{
                  padding: "18px",
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    height: "14px",
                    width: "40%",
                    borderRadius: "4px",
                    background: "#E9E4DC",
                  }}
                />

                <div
                  style={{
                    marginTop: "18px",
                    height: "140px",
                    borderRadius: "10px",
                    background: "#EFEAE1",
                  }}
                />

                <div
                  style={{
                    marginTop: "16px",
                    height: "10px",
                    width: "80%",
                    borderRadius: "4px",
                    background: "#E9E4DC",
                  }}
                />

                <div
                  style={{
                    marginTop: "10px",
                    height: "10px",
                    width: "55%",
                    borderRadius: "4px",
                    background: "#E9E4DC",
                  }}
                />
              </div>
            ) : (
              <div
                style={{
                  boxSizing: "border-box",
                }}
              >
                {/* NAV BAR */}

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent:
                      "space-between",
                    padding: "16px 32px",
                    borderBottom:
                      "1px solid #EFEAE1",
                  }}
                >
                  <div
                    style={{
                      height: "14px",
                      width: "90px",
                      borderRadius: "4px",
                      background: "#E9E4DC",
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      gap: "22px",
                    }}
                  >
                    {[1, 2, 3, 4].map(
                      (item) => (
                        <div
                          key={item}
                          style={{
                            height: "9px",
                            width: "48px",
                            borderRadius: "3px",
                            background: "#EFEAE1",
                          }}
                        />
                      ),
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                    }}
                  >
                    {[1, 2].map((item) => (
                      <div
                        key={item}
                        style={{
                          height: "18px",
                          width: "18px",
                          borderRadius: "50%",
                          background: "#EFEAE1",
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* HERO */}

                <div
                  style={{
                    margin: "24px 32px 0",
                    height: "220px",
                    borderRadius: "12px",
                    background: "#EFEAE1",
                  }}
                />

                {/* PRODUCT GRID */}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(4, 1fr)",
                    gap: "18px",
                    padding: "24px 32px",
                  }}
                >
                  {[1, 2, 3, 4].map(
                    (item) => (
                      <div key={item}>
                        <div
                          style={{
                            height: "110px",
                            borderRadius: "8px",
                            background: "#EFEAE1",
                          }}
                        />

                        <div
                          style={{
                            marginTop: "10px",
                            height: "8px",
                            width: "70%",
                            borderRadius: "3px",
                            background: "#E9E4DC",
                          }}
                        />

                        <div
                          style={{
                            marginTop: "6px",
                            height: "8px",
                            width: "40%",
                            borderRadius: "3px",
                            background: "#E9E4DC",
                          }}
                        />
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}

            {/* TEASER BUBBLE */}

            {previewStage === "teaser" && (
              <div
                style={{
                  position: "absolute",
                  right: "16px",
                  bottom: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "2px",
                  borderRadius: "999px",
                  background:
                    popupSettings.headerGradient
                      ? `linear-gradient(135deg, ${popupSettings.headerBackground}, ${popupSettings.headerGradientEnd})`
                      : popupSettings.headerBackground,
                  boxShadow:
                    "0 12px 28px rgba(0,0,0,.32)",
                  animation:
                    "mq-teaser-pop 260ms ease",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setPreviewStage("offer")
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    maxWidth: "240px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    textAlign: "left",
                    border: "none",
                    background: "transparent",
                    padding: "13px 8px 13px 20px",
                    color: "#FFFFFF",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {(() => {
                    const teaserBlocks =
                      steps.find(
                        (step) =>
                          step.id === "teaser",
                      )?.blocks || [];

                    return (
                      teaserBlocks[0]?.text ||
                      "Get an offer"
                    );
                  })()}
                </button>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPreviewStage("closed");
                  }}
                  aria-label="Dismiss teaser"
                  style={{
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
                    lineHeight: 1,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            )}

            {/* OFFER / SUCCESS POPUP */}

            {(previewStage === "offer" ||
              previewStage === "success") && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "16px",
                  boxSizing: "border-box",
                  background: "rgba(20,23,28,0.45)",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    maxWidth:
                      device === "mobile"
                        ? "290px"
                        : "380px",

                    maxHeight: "100%",

                    overflowY: "auto",

                    borderRadius: `${popupSettings.popupBorderRadius}px`,

                    background:
                      popupSettings.bodyBackground,

                    boxShadow:
                      "0 20px 50px rgba(0,0,0,.4)",

                    animation:
                      "mq-popup-pop 220ms ease",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      minHeight: `${popupSettings.headerHeight}px`,
                      padding: "20px",
                      boxSizing: "border-box",
                      borderRadius: `${popupSettings.popupBorderRadius}px ${popupSettings.popupBorderRadius}px 0 0`,
                      background:
                        popupSettings.headerGradient
                          ? `linear-gradient(135deg, ${popupSettings.headerBackground}, ${popupSettings.headerGradientEnd})`
                          : popupSettings.headerBackground,
                    }}
                  >
                    {brandBlock &&
                      renderPreviewBlock(
                        brandBlock,
                        () => {},
                      )}

                    <button
                      type="button"
                      onClick={() =>
                        setPreviewStage("teaser")
                      }
                      style={{
                        position: "absolute",
                        right: "14px",
                        top: "12px",
                        width: `${popupSettings.closeButtonSize}px`,
                        height: `${popupSettings.closeButtonSize}px`,
                        borderRadius: `${popupSettings.closeButtonRadius}%`,
                        border: "none",
                        background:
                          popupSettings.closeButtonBackground,
                        color:
                          popupSettings.closeButtonColor,
                        cursor: "pointer",
                      }}
                    >
                      {popupSettings.closeButtonText}
                    </button>
                  </div>

                  <div
                    style={{
                      padding: `${popupSettings.bodyPadding}px`,
                      boxSizing: "border-box",
                    }}
                  >
                    {steps
                      .find(
                        (step) =>
                          step.id ===
                          previewStage,
                      )
                      ?.blocks.filter(
                        (block) =>
                          block.type !==
                          "brand",
                      )
                      .map((block) =>
                        renderPreviewBlock(
                          block,
                          () =>
                            setPreviewStage(
                              "success",
                            ),
                        ),
                      )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <style>
          {`
            @keyframes mq-teaser-pop {
              from { opacity: 0; transform: translateY(10px) scale(0.96); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes mq-popup-pop {
              from { opacity: 0; transform: scale(0.94); }
              to { opacity: 1; transform: scale(1); }
            }
          `}
        </style>
      </div>
    )}
    </>
  );
}