import { useMemo, useState ,useEffect} from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useNavigate, useNavigation, useRevalidator, useSubmit } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/* ============================================================
   LOADER
   ============================================================ */

export async function loader({
  request,
}: LoaderFunctionArgs) {
  const { session } =
    await authenticate.admin(request);

  const popups = await db.popup.findMany({
    where: {
      shop: session.shop,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return {
    popups,
  };
}



/* ============================================================
   ACTION
   ============================================================ */

export async function action({
  request,
}: ActionFunctionArgs) {
  const { session } =
    await authenticate.admin(request);

  const formData =
    await request.formData();

  const intent =
    String(
      formData.get("intent") || "",
    ).trim();

  if (intent === "delete") {
    const popupId =
      String(
        formData.get("popupId") || "",
      ).trim();

    if (!popupId) {
      return {
        ok: false,
        error: "Popup ID is required.",
      };
    }

    try {
      const popup =
        await db.popup.findFirst({
          where: {
            id: popupId,
            shop: session.shop,
          },
          select: {
            id: true,
          },
        });

      if (!popup) {
        return {
          ok: false,
          error: "Popup not found.",
        };
      }

      await db.popup.delete({
        where: {
          id: popup.id,
        },
      });

      return {
        ok: true,
        popupId,
        intent: "delete" as const,
      };
    } catch (error) {
      console.error(
        "DELETE POPUP ERROR:",
        error,
      );

      return {
        ok: false,
        error: "Unable to delete popup.",
      };
    }
  }

  if (intent === "bulkDelete") {
    const popupIds =
      String(
        formData.get("popupIds") || "",
      )
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

    if (popupIds.length === 0) {
      return {
        ok: false,
        error: "No popups selected.",
      };
    }

    try {
      await db.popup.deleteMany({
        where: {
          id: { in: popupIds },
          shop: session.shop,
        },
      });

      return {
        ok: true,
        intent: "bulkDelete" as const,
      };
    } catch (error) {
      console.error(
        "BULK DELETE POPUP ERROR:",
        error,
      );

      return {
        ok: false,
        error: "Unable to delete popups.",
      };
    }
  }

  if (intent === "toggleStatus") {
    const popupId =
      String(
        formData.get("popupId") || "",
      ).trim();

    const nextStatus =
      String(
        formData.get("status") || "",
      ).trim();

    if (
      !popupId ||
      (nextStatus !== "active" &&
        nextStatus !== "draft")
    ) {
      return {
        ok: false,
        error: "Invalid status update.",
      };
    }

    try {
      const popup =
        await db.popup.findFirst({
          where: {
            id: popupId,
            shop: session.shop,
          },
          select: {
            id: true,
          },
        });

      if (!popup) {
        return {
          ok: false,
          error: "Popup not found.",
        };
      }

      await db.popup.update({
        where: {
          id: popup.id,
        },
        data: {
          status: nextStatus,
        },
      });

      return {
        ok: true,
        intent: "toggleStatus" as const,
      };
    } catch (error) {
      console.error(
        "TOGGLE STATUS ERROR:",
        error,
      );

      return {
        ok: false,
        error: "Unable to update status.",
      };
    }
  }

  if (intent === "reorder") {
    const orderRaw =
      String(
        formData.get("order") || "",
      );

    const orderedIds =
      orderRaw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

    if (orderedIds.length === 0) {
      return {
        ok: false,
        error: "Nothing to reorder.",
      };
    }

    try {
      await Promise.all(
        orderedIds.map((id, index) =>
          db.popup.updateMany({
            where: {
              id,
              shop: session.shop,
            },
            data: {
              priority: index + 1,
            },
          }),
        ),
      );

      return {
        ok: true,
        intent: "reorder" as const,
      };
    } catch (error) {
      console.error(
        "REORDER POPUP ERROR:",
        error,
      );

      return {
        ok: false,
        error: "Unable to save order.",
      };
    }
  }

  return {
    ok: false,
    error: "Invalid action.",
  };
}

/* ============================================================
   TYPES
   ============================================================ */

type PopupStatus =
  | "all"
  | "active"
  | "draft";

type TemplateCategory =
  | "all"
  | "list-growth"
  | "whatsapp"
  | "spin"
  | "quiz"
  | "exit-intent";

const POPUP_TEMPLATES: {
  id: string;
  name: string;
  tag: string;
  tagColor: string;
  metric: string;
  category: TemplateCategory;
  swatch: string;
}[] = [
  {
    id: "whatsapp-welcome",
    name: "WhatsApp welcome",
    tag: "WhatsApp",
    tagColor: "#1FAF6E",
    metric: "11.2% median",
    category: "whatsapp",
    swatch: "#F3EEE4",
  },
  {
    id: "spin-the-wheel-luxe",
    name: "Spin the wheel — luxe",
    tag: "Email",
    tagColor: "#0B3D66",
    metric: "13.8% median",
    category: "spin",
    swatch: "#EEF3EC",
  },
  {
    id: "quiz-learn-to-earn",
    name: "Quiz — learn to earn",
    tag: "Zero-party",
    tagColor: "#6D4AFF",
    metric: "9.4% median",
    category: "quiz",
    swatch: "#FFFFFF",
  },
  {
    id: "exit-intent-cart-saver",
    name: "Exit-intent cart saver",
    tag: "Recovery",
    tagColor: "#B4780A",
    metric: "6.1% median",
    category: "exit-intent",
    swatch: "#EEF1F6",
  },
];

const TEMPLATE_FILTERS: {
  value: TemplateCategory;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "list-growth", label: "List growth" },
  { value: "whatsapp", label: "WhatsApp-first" },
  { value: "spin", label: "Spin & win" },
  { value: "quiz", label: "Quiz" },
  { value: "exit-intent", label: "Exit intent" },
];

type PopupRecord = {
  id: string;
  name: string;
  status: string;
  priority: number;
  steps: unknown;
  createdAt: string | Date;
  updatedAt: string | Date;
};


/* ============================================================
   MAIN COMPONENT
   ============================================================ */

export default function Popups() {
  const { popups } =
    useLoaderData<typeof loader>();

  const navigate = useNavigate();

  const submit = useSubmit();

  const navigation = useNavigation();

  const actionData =
    useActionData<typeof action>();

  const revalidator =
    useRevalidator();

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState<PopupStatus>("all");

  const [sortBy, setSortBy] =
    useState("newest");

  const [hoveredPopupId, setHoveredPopupId] =
    useState<string | null>(null);

  const [popupPendingDelete, setPopupPendingDelete] =
    useState<{ id: string; name: string } | null>(null);

  const [createHovered, setCreateHovered] =
    useState(false);

  const [currentPage, setCurrentPage] =
    useState(1);

  const pageSize = 8;

  const [selectedIds, setSelectedIds] =
    useState<Set<string>>(new Set());

  const [bulkMenuOpen, setBulkMenuOpen] =
    useState(false);

  const [draggedPopupId, setDraggedPopupId] =
    useState<string | null>(null);

  const [dragOverPopupId, setDragOverPopupId] =
    useState<string | null>(null);

  const [showTemplateGallery, setShowTemplateGallery] =
    useState(false);

  const [templateFilter, setTemplateFilter] =
    useState<TemplateCategory>("all");

  const filteredTemplates =
    templateFilter === "all"
      ? POPUP_TEMPLATES
      : POPUP_TEMPLATES.filter(
          (template) =>
            template.category ===
            templateFilter
        );

  const deleting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "delete";

  const deletingPopupId =
    deleting
      ? String(
          navigation.formData?.get("popupId") || "",
        )
      : "";

  useEffect(() => {
    if (!actionData?.ok) {
      return;
    }

    if (
      actionData.intent === "delete" ||
      actionData.intent === "bulkDelete" ||
      actionData.intent === "toggleStatus" ||
      actionData.intent === "reorder"
    ) {
      if (actionData.intent === "bulkDelete") {
        setSelectedIds(new Set());
      }

      revalidator.revalidate();
    }
  }, [actionData]);


  /* ==========================================================
     FILTER POPUPS
     ========================================================== */

  const filteredPopups =
    useMemo(() => {
      let result = [...popups];

      /* SEARCH */

      if (search.trim()) {
        const query =
          search
            .trim()
            .toLowerCase();

        result =
          result.filter((popup) =>
            popup.name
              .toLowerCase()
              .includes(query)
          );
      }

      /* STATUS */

      if (
        statusFilter !==
        "all"
      ) {
        result =
          result.filter(
            (popup) =>
              popup.status
                .toLowerCase() ===
              statusFilter
          );
      }

      /* SORT */

      if (sortBy === "newest") {
        result.sort(
          (a, b) =>
            new Date(
              b.createdAt
            ).getTime() -
            new Date(
              a.createdAt
            ).getTime()
        );
      }

      if (sortBy === "oldest") {
        result.sort(
          (a, b) =>
            new Date(
              a.createdAt
            ).getTime() -
            new Date(
              b.createdAt
            ).getTime()
        );
      }

      if (sortBy === "priority") {
        result.sort(
          (a, b) =>
            a.priority -
            b.priority
        );
      }

      return result;
    }, [
      popups,
      search,
      statusFilter,
      sortBy,
    ]);

  const statusCounts =
    useMemo(
      () => ({
        all: popups.length,
        active: popups.filter(
          (popup) =>
            popup.status.toLowerCase() ===
            "active"
        ).length,
        draft: popups.filter(
          (popup) =>
            popup.status.toLowerCase() !==
            "active"
        ).length,
      }),
      [popups]
    );


  /* ==========================================================
     PAGINATION
     ========================================================== */

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredPopups.length /
          pageSize
      )
    );

  const safeCurrentPage =
    Math.min(
      currentPage,
      totalPages
    );

  const paginatedPopups =
    useMemo(() => {
      const start =
        (safeCurrentPage - 1) *
        pageSize;

      return filteredPopups.slice(
        start,
        start + pageSize
      );
    }, [
      filteredPopups,
      safeCurrentPage,
    ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    search,
    statusFilter,
    sortBy,
  ]);


  /* ==========================================================
     CREATE POPUP
     ========================================================== */

  const handleCreatePopup =
    () => {
      setTemplateFilter("all");
      setShowTemplateGallery(true);
    };

  const handleStartBlank =
    () => {
      setShowTemplateGallery(false);
      navigate(
        "/app/popups/new"
      );
    };

  const handleSelectTemplate =
    (templateId: string) => {
      setShowTemplateGallery(false);
      navigate(
        `/app/popups/new?template=${encodeURIComponent(templateId)}`
      );
    };


  /* ==========================================================
     OPEN POPUP
     ========================================================== */

  const handleOpenPopup =
    (id: string) => {
      navigate(
        `/app/popups/new?id=${encodeURIComponent(id)}`
      );
    };

  /* ==========================================================
     DELETE POPUP
     ========================================================== */

  const handleDeletePopup =
    (id: string, name: string) => {
      setPopupPendingDelete({
        id,
        name,
      });
    };

  const cancelDeletePopup =
    () => {
      setPopupPendingDelete(null);
    };

  const confirmDeletePopup =
    () => {
      if (!popupPendingDelete) {
        return;
      }

      const formData =
        new FormData();

      formData.append(
        "intent",
        "delete",
      );

      formData.append(
        "popupId",
        popupPendingDelete.id,
      );

      submit(
        formData,
        {
          method: "post",
        },
      );

      setPopupPendingDelete(null);
    };


  /* ==========================================================
     BULK SELECTION
     ========================================================== */

  const toggleSelected =
    (id: string) => {
      setSelectedIds((current) => {
        const next = new Set(current);

        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }

        return next;
      });
    };

  const toggleSelectAll =
    () => {
      setSelectedIds((current) =>
        current.size ===
        paginatedPopups.length &&
        paginatedPopups.length > 0
          ? new Set()
          : new Set(
              paginatedPopups.map(
                (popup) => popup.id
              )
            )
      );
    };

  const handleBulkDelete =
    () => {
      if (selectedIds.size === 0) {
        return;
      }

      const confirmed =
        window.confirm(
          `Delete ${selectedIds.size} popup${
            selectedIds.size !== 1 ? "s" : ""
          }? This action cannot be undone.`
        );

      if (!confirmed) {
        return;
      }

      const formData = new FormData();

      formData.append(
        "intent",
        "bulkDelete"
      );

      formData.append(
        "popupIds",
        Array.from(selectedIds).join(",")
      );

      submit(formData, {
        method: "post",
      });

      setBulkMenuOpen(false);
    };


  /* ==========================================================
     STATUS TOGGLE
     ========================================================== */

  const handleToggleStatus =
    (popup: PopupRecord) => {
      const nextStatus =
        popup.status.toLowerCase() ===
        "active"
          ? "draft"
          : "active";

      const formData = new FormData();

      formData.append(
        "intent",
        "toggleStatus"
      );

      formData.append("popupId", popup.id);
      formData.append("status", nextStatus);

      submit(formData, {
        method: "post",
      });
    };


  /* ==========================================================
     DRAG REORDER (PRIORITY)
     ========================================================== */

  const handleDropReorder =
    (targetId: string) => {
      if (
        !draggedPopupId ||
        draggedPopupId === targetId
      ) {
        setDraggedPopupId(null);
        setDragOverPopupId(null);
        return;
      }

      const ids = paginatedPopups.map(
        (popup) => popup.id
      );

      const fromIndex = ids.indexOf(
        draggedPopupId
      );

      const toIndex =
        ids.indexOf(targetId);

      if (fromIndex === -1 || toIndex === -1) {
        setDraggedPopupId(null);
        setDragOverPopupId(null);
        return;
      }

      const reordered = [...ids];
      reordered.splice(fromIndex, 1);
      reordered.splice(
        toIndex,
        0,
        draggedPopupId
      );

      const formData = new FormData();

      formData.append("intent", "reorder");
      formData.append(
        "order",
        reordered.join(",")
      );

      submit(formData, {
        method: "post",
      });

      setSortBy("priority");
      setDraggedPopupId(null);
      setDragOverPopupId(null);
    };


  /* ==========================================================
     STATUS HELPERS
     ========================================================== */

  const getStatusLabel = (
    status: string
  ) => {
    if (
      status === "active"
    ) {
      return "LIVE";
    }

    return "DRAFT";
  };


  const getStatusStyle = (
    status: string
  ) => {
    if (
      status === "active"
    ) {
      return {
        background:
          "#E7F7EF",
        color:
          "#157A50",
      };
    }

    return {
      background:
        "#F0F2F5",
      color:
        "#657080",
    };
  };

  const getStatusAccent = (
    status: string
  ) => {
    if (status === "active") {
      return "#1FAF6E";
    }

    return "#C9D2DD";
  };


  /* ==========================================================
     STEP COUNT
     ========================================================== */

  const getStepCount = (
    steps: unknown
  ) => {
    if (
      Array.isArray(steps)
    ) {
      return steps.length;
    }

    return 0;
  };


  /* ==========================================================
     DATE
     ========================================================== */

  const formatDate = (
    value: string | Date
  ) => {
    return new Date(
      value
    ).toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  };


  return (
    <>
    <s-page heading="Popups" inlineSize="large">

      {/* =====================================================
          PAGE HEADER
      ===================================================== */}

      <s-section>

        <div
          style={{
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "space-between",
            gap:
              "20px",
            padding:
              "4px 0 18px",
            flexWrap:
              "wrap",
          }}
        >

          {/* TITLE */}

          <div>

            <h1
              style={{
                margin: 0,
                fontSize:
                  "28px",
                fontWeight:
                  700,
                color:
                  "#172033",
              }}
            >
              Popups
            </h1>

            <p
              style={{
                margin:
                  "7px 0 0",
                fontSize:
                  "14px",
                color:
                  "#6B7280",
              }}
            >
              Create, manage and
              optimize your popups.
            </p>

          </div>


          {/* CREATE */}

          <button
            type="button"
            onClick={
              handleCreatePopup
            }
            onMouseEnter={() =>
              setCreateHovered(true)
            }
            onMouseLeave={() =>
              setCreateHovered(false)
            }
            style={{
              border: "none",
              background:
                createHovered
                  ? "#0F4D80"
                  : "#0B3D66",
              color:
                "#FFFFFF",
              borderRadius:
                "8px",
              padding:
                "11px 20px",
              fontSize:
                "13px",
              fontWeight:
                600,
              cursor:
                "pointer",
              boxShadow:
                createHovered
                  ? "0 6px 14px rgba(11, 61, 102, 0.28)"
                  : "0 1px 2px rgba(11, 61, 102, 0.15)",
              transform:
                createHovered
                  ? "translateY(-1px)"
                  : "translateY(0)",
              transition:
                "background 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease",
            }}
          >
            + Create popup
          </button>

        </div>

      </s-section>


      {/* =====================================================
          MAIN CARD
      ===================================================== */}

      <s-section>

        <div
          style={{
            background:
              "#FFFFFF",
            border:
              "1px solid #D8DEE6",
            borderRadius:
              "12px",
            boxShadow:
              "0 1px 2px rgba(23, 32, 51, 0.04)",
            overflow:
              "hidden",
          }}
        >

          {/* =================================================
              TOOLBAR
          ================================================= */}

          <div
            style={{
              display:
                "flex",
              alignItems:
                "center",
              justifyContent:
                "space-between",
              gap:
                "14px",
              padding:
                "15px 18px",
              borderBottom:
                "1px solid #E7EBEF",
              flexWrap:
                "wrap",
            }}
          >

            {/* SEARCH + COUNT */}

            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                gap:
                  "12px",
                flexWrap:
                  "wrap",
              }}
            >

            {/* SEARCH */}

            <div
              style={{
                position:
                  "relative",
                width:
                  "280px",
                maxWidth:
                  "100%",
              }}
            >

              <span
                style={{
                  position:
                    "absolute",
                  left:
                    "11px",
                  top:
                    "50%",
                  transform:
                    "translateY(-50%)",
                  color:
                    "#8D98A7",
                  fontSize:
                    "14px",
                }}
              >
                ⌕
              </span>

              <input
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target.value
                  )
                }
                placeholder="Search popups..."
                style={{
                  width:
                    "100%",
                  boxSizing:
                    "border-box",
                  border:
                    "1px solid #D7DEE7",
                  borderRadius:
                    "7px",
                  padding:
                    "9px 10px 9px 31px",
                  outline:
                    "none",
                  fontSize:
                    "12px",
                  color:
                    "#273142",
                }}
              />

            </div>

            {popups.length > 0 && (
              <span
                style={{
                  fontSize:
                    "11px",
                  fontWeight:
                    600,
                  color:
                    "#8A95A5",
                  whiteSpace:
                    "nowrap",
                }}
              >
                {filteredPopups.length}{" "}
                of {popups.length}
              </span>
            )}

            </div>


            {/* FILTERS */}

            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                gap:
                  "8px",
                flexWrap:
                  "wrap",
              }}
            >

              {(
                [
                  "all",
                  "active",
                  "draft",
                ] as PopupStatus[]
              ).map(
                (status) => {

                  const selected =
                    statusFilter ===
                    status;

                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() =>
                        setStatusFilter(
                          status
                        )
                      }
                      style={{
                        border:
                          selected
                            ? "1px solid #0B3D66"
                            : "1px solid #D8DEE7",
                        background:
                          selected
                            ? "#EEF3F8"
                            : "#FFFFFF",
                        color:
                          selected
                            ? "#0B3D66"
                            : "#657080",
                        borderRadius:
                          "7px",
                        padding:
                          "8px 11px",
                        fontSize:
                          "11px",
                        fontWeight:
                          selected
                            ? 700
                            : 500,
                        cursor:
                          "pointer",
                        textTransform:
                          "capitalize",
                      }}
                    >
                      {status === "active"
                        ? "Live"
                        : status.charAt(0).toUpperCase() +
                          status.slice(1)}{" "}
                      {statusCounts[status]}
                    </button>
                  );
                }
              )}


              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value
                  )
                }
                style={{
                  border:
                    "1px solid #D8DEE7",
                  background:
                    "#FFFFFF",
                  borderRadius:
                    "7px",
                  padding:
                    "8px 10px",
                  color:
                    "#657080",
                  fontSize:
                    "11px",
                  cursor:
                    "pointer",
                }}
              >
                <option value="newest">
                  Newest
                </option>

                <option value="oldest">
                  Oldest
                </option>

                <option value="priority">
                  Priority
                </option>
              </select>

              <div
                style={{
                  position: "relative",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setBulkMenuOpen(
                      (open) => !open
                    )
                  }
                  style={{
                    border:
                      "1px solid #D8DEE7",
                    background:
                      selectedIds.size > 0
                        ? "#EEF3F8"
                        : "#FFFFFF",
                    color:
                      selectedIds.size > 0
                        ? "#0B3D66"
                        : "#657080",
                    borderRadius: "7px",
                    padding: "8px 12px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  Bulk actions
                  {selectedIds.size > 0 &&
                    ` (${selectedIds.size})`}
                  {" "}▾
                </button>

                {bulkMenuOpen && (
                  <div
                    onMouseLeave={() =>
                      setBulkMenuOpen(false)
                    }
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 6px)",
                      background: "#FFFFFF",
                      border:
                        "1px solid #D8DEE7",
                      borderRadius: "8px",
                      boxShadow:
                        "0 8px 20px rgba(23,32,51,.12)",
                      minWidth: "170px",
                      zIndex: 20,
                      overflow: "hidden",
                    }}
                  >
                    <button
                      type="button"
                      disabled={
                        selectedIds.size === 0
                      }
                      onClick={handleBulkDelete}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        border: "none",
                        background: "#FFFFFF",
                        color:
                          selectedIds.size === 0
                            ? "#C4CBD4"
                            : "#C62828",
                        padding: "10px 14px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor:
                          selectedIds.size === 0
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      Delete selected
                    </button>
                  </div>
                )}
              </div>

            </div>

          </div>


          {/* =================================================
              TABLE HEADER
          ================================================= */}

          {filteredPopups.length >
            0 && (

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "24px 20px minmax(220px, 1.6fr) 100px 80px 90px 110px 150px",
                gap:
                  "12px",
                alignItems:
                  "center",
                padding:
                  "11px 18px",
                background:
                  "#F8F9FA",
                borderBottom:
                  "1px solid #E7EBEF",
                color:
                  "#8A95A5",
                fontSize:
                  "10px",
                fontWeight:
                  700,
                letterSpacing:
                  "0.06em",
                textTransform:
                  "uppercase",
              }}
            >

              <input
                type="checkbox"
                checked={
                  paginatedPopups.length >
                    0 &&
                  selectedIds.size ===
                    paginatedPopups.length
                }
                onChange={toggleSelectAll}
                style={{
                  cursor: "pointer",
                }}
              />

              <div />

              <div>
                Popup
              </div>

              <div>
                Status
              </div>

              <div>
                Steps
              </div>

              <div>
                Priority
              </div>

              <div>
                Created
              </div>

              <div>
                Actions
              </div>

            </div>

          )}


          {/* =================================================
              EMPTY STATE
          ================================================= */}

          {popups.length ===
            0 && (

            <div
              style={{
                minHeight:
                  "330px",
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "center",
                padding:
                  "40px",
              }}
            >

              <div
                style={{
                  width:
                    "100%",
                  maxWidth:
                    "520px",
                  minHeight:
                    "220px",
                  border:
                    "1px dashed #C9D2DD",
                  borderRadius:
                    "12px",
                  display:
                    "flex",
                  flexDirection:
                    "column",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  textAlign:
                    "center",
                  background:
                    "#FCFDFE",
                }}
              >

                <div
                  style={{
                    width:
                      "48px",
                    height:
                      "48px",
                    borderRadius:
                      "12px",
                    background:
                      "#EEF3F8",
                    display:
                      "flex",
                    alignItems:
                      "center",
                    justifyContent:
                      "center",
                    color:
                      "#0B3D66",
                    fontSize:
                      "21px",
                    marginBottom:
                      "13px",
                  }}
                >
                  ▣
                </div>

                <h3
                  style={{
                    margin:
                      "0 0 7px",
                    fontSize:
                      "15px",
                    color:
                      "#172033",
                  }}
                >
                  No popups yet
                </h3>

                <p
                  style={{
                    margin:
                      "0 0 16px",
                    color:
                      "#7B8795",
                    fontSize:
                      "12px",
                  }}
                >
                  Create your first popup
                  to get started.
                </p>

                <button
                  type="button"
                  onClick={
                    handleCreatePopup
                  }
                  style={{
                    border:
                      "none",
                    background:
                      "#0B3D66",
                    color:
                      "#FFFFFF",
                    borderRadius:
                      "7px",
                    padding:
                      "9px 15px",
                    fontSize:
                      "12px",
                    fontWeight:
                      600,
                    cursor:
                      "pointer",
                  }}
                >
                  + Create popup
                </button>

              </div>

            </div>

          )}


          {/* =================================================
              FILTERED EMPTY
          ================================================= */}

          {popups.length >
            0 &&
            filteredPopups.length ===
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
                padding:
                  "30px",
              }}
            >

              <div>

                <div
                  style={{
                    fontSize:
                      "14px",
                    fontWeight:
                      600,
                    color:
                      "#172033",
                  }}
                >
                  No matching popups
                </div>

                <p
                  style={{
                    margin:
                      "6px 0 0",
                    fontSize:
                      "12px",
                    color:
                      "#7B8795",
                  }}
                >
                  Try changing your
                  search or filter.
                </p>

              </div>

            </div>

          )}


          {/* =================================================
              POPUP ROWS
          ================================================= */}

          {paginatedPopups.map(
            (popup) => {

              const statusStyle =
                getStatusStyle(
                  popup.status
                );

              const stepsCount =
                getStepCount(
                  popup.steps
                );

              const isHovered =
                hoveredPopupId ===
                popup.id;

              const isSelected =
                selectedIds.has(popup.id);

              const isDragOver =
                dragOverPopupId ===
                  popup.id &&
                draggedPopupId !==
                  popup.id;

              return (

                <div
                  key={popup.id}
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={() =>
                    setDraggedPopupId(
                      popup.id
                    )
                  }
                  onDragOver={(event) => {
                    event.preventDefault();

                    if (
                      dragOverPopupId !==
                      popup.id
                    ) {
                      setDragOverPopupId(
                        popup.id
                      );
                    }
                  }}
                  onDragLeave={() =>
                    setDragOverPopupId(
                      (current) =>
                        current === popup.id
                          ? null
                          : current
                    )
                  }
                  onDrop={(event) => {
                    event.preventDefault();
                    handleDropReorder(
                      popup.id
                    );
                  }}
                  onDragEnd={() => {
                    setDraggedPopupId(null);
                    setDragOverPopupId(null);
                  }}
                  onClick={() =>
                    handleOpenPopup(
                      popup.id
                    )
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" ||
                      event.key === " "
                    ) {
                      event.preventDefault();
                      handleOpenPopup(
                        popup.id
                      );
                    }
                  }}
                  onMouseEnter={() =>
                    setHoveredPopupId(
                      popup.id
                    )
                  }
                  onMouseLeave={() =>
                    setHoveredPopupId(
                      (current) =>
                        current === popup.id
                          ? null
                          : current
                    )
                  }
                  style={{
                    width:
                      "100%",
                    display:
                      "grid",
                    gridTemplateColumns:
                      "24px 20px minmax(220px, 1.6fr) 100px 80px 90px 110px 150px",
                    gap:
                      "12px",
                    alignItems:
                      "center",
                    textAlign:
                      "left",
                    padding:
                      "16px 18px 16px 16px",
                    margin:
                      "8px 10px",
                    borderRadius:
                      "10px",
                    borderTop: isDragOver
                      ? "1px dashed #1677FF"
                      : "1px solid #EEF1F4",
                    borderRight: isDragOver
                      ? "1px dashed #1677FF"
                      : "1px solid #EEF1F4",
                    borderBottom: isDragOver
                      ? "1px dashed #1677FF"
                      : "1px solid #EEF1F4",
                    borderLeft: `3px solid ${getStatusAccent(
                      popup.status
                    )}`,
                    background:
                      isSelected
                        ? "#EEF3F8"
                        : isHovered
                          ? "#F8FAFC"
                          : "#FFFFFF",
                    boxShadow:
                      isHovered
                        ? "0 6px 16px rgba(23, 32, 51, 0.08)"
                        : "0 1px 2px rgba(23, 32, 51, 0.03)",
                    transform:
                      isHovered
                        ? "translateY(-1px)"
                        : "translateY(0)",
                    opacity:
                      draggedPopupId ===
                      popup.id
                        ? 0.5
                        : 1,
                    transition:
                      "background 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease",
                    cursor:
                      "pointer",
                    boxSizing:
                      "border-box",
                  }}
                >

                  {/* SELECT */}

                  <input
                    type="checkbox"
                    checked={isSelected}
                    onClick={(event) =>
                      event.stopPropagation()
                    }
                    onChange={() =>
                      toggleSelected(
                        popup.id
                      )
                    }
                    style={{
                      cursor: "pointer",
                    }}
                  />

                  {/* DRAG HANDLE */}

                  <div
                    onClick={(event) =>
                      event.stopPropagation()
                    }
                    title="Drag to set priority"
                    style={{
                      cursor: "grab",
                      color: "#B7C0CC",
                      fontSize: "14px",
                      textAlign: "center",
                      userSelect: "none",
                    }}
                  >
                    ⋮⋮
                  </div>

                  {/* POPUP */}

                  <div>

                    <div
                      style={{
                        display:
                          "flex",
                        alignItems:
                          "center",
                        gap:
                          "11px",
                      }}
                    >

                      <div
                        style={{
                          width:
                            "38px",
                          height:
                            "38px",
                          borderRadius:
                            "8px",
                          background:
                            "#F3F0EA",
                          border:
                            "1px solid #E5DDD2",
                          display:
                            "flex",
                          alignItems:
                            "center",
                          justifyContent:
                            "center",
                          color:
                            "#786A5D",
                          fontSize:
                            "16px",
                          flexShrink:
                            0,
                        }}
                      >
                        ▣
                      </div>

                      <div>

                        <strong
                          style={{
                            display:
                              "block",
                            fontSize:
                              "13px",
                            color:
                              "#172033",
                            marginBottom:
                              "4px",
                          }}
                        >
                          {popup.name}
                        </strong>

                        <span
                          style={{
                            fontSize:
                              "11px",
                            color:
                              "#8A95A5",
                          }}
                        >
                          Popup ·{" "}
                          {stepsCount}{" "}
                          {stepsCount ===
                          1
                            ? "step"
                            : "steps"}
                        </span>

                      </div>

                    </div>

                  </div>


                  {/* STATUS */}

                  <div
                    onClick={(event) =>
                      event.stopPropagation()
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >

                    <button
                      type="button"
                      role="switch"
                      aria-checked={
                        popup.status.toLowerCase() ===
                        "active"
                      }
                      onClick={() =>
                        handleToggleStatus(
                          popup
                        )
                      }
                      style={{
                        position: "relative",
                        width: "30px",
                        height: "17px",
                        borderRadius: "999px",
                        border: "none",
                        background:
                          popup.status.toLowerCase() ===
                          "active"
                            ? "#1FAF6E"
                            : "#D8DEE7",
                        cursor: "pointer",
                        flexShrink: 0,
                        transition:
                          "background 0.15s ease",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: "2px",
                          left:
                            popup.status.toLowerCase() ===
                            "active"
                              ? "15px"
                              : "2px",
                          width: "13px",
                          height: "13px",
                          borderRadius: "50%",
                          background: "#FFFFFF",
                          boxShadow:
                            "0 1px 2px rgba(0,0,0,.25)",
                          transition:
                            "left 0.15s ease",
                        }}
                      />
                    </button>

                    <span
                      style={{
                        fontSize:
                          "9px",
                        fontWeight:
                          700,
                        color:
                          statusStyle.color,
                      }}
                    >
                      {getStatusLabel(
                        popup.status
                      )}
                    </span>

                  </div>


                  {/* STEPS */}

                  <div
                    style={{
                      fontSize:
                        "12px",
                      color:
                        "#374151",
                    }}
                  >
                    {stepsCount}
                  </div>


                  {/* PRIORITY */}

                  <div
                    style={{
                      fontSize:
                        "12px",
                      color:
                        "#374151",
                    }}
                  >
                    Priority{" "}
                    {popup.priority}
                  </div>


                  {/* CREATED */}

                  <div
                    style={{
                      fontSize:
                        "11px",
                      color:
                        "#7B8795",
                    }}
                  >
                    {formatDate(
                      popup.createdAt
                    )}
                  </div>

                  {/* ACTIONS */}

                  <div
                    style={{
                      display:
                        "flex",
                      alignItems:
                        "center",
                      gap:
                        "7px",
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenPopup(
                          popup.id
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
                          "7px",
                        padding:
                          "7px 11px",
                        fontSize:
                          "11px",
                        fontWeight:
                          700,
                        cursor:
                          "pointer",
                      }}
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      disabled={
                        deleting &&
                        deletingPopupId ===
                          popup.id
                      }
                      onClick={() =>
                        handleDeletePopup(
                          popup.id,
                          popup.name
                        )
                      }
                      style={{
                        border:
                          "1px solid #F0B9B9",
                        background:
                          "#FFF5F5",
                        color:
                          "#C62828",
                        borderRadius:
                          "7px",
                        padding:
                          "7px 11px",
                        fontSize:
                          "11px",
                        fontWeight:
                          700,
                        cursor:
                          deleting &&
                          deletingPopupId ===
                            popup.id
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          deleting &&
                          deletingPopupId ===
                            popup.id
                            ? 0.6
                            : 1,
                      }}
                    >
                      {deleting &&
                      deletingPopupId ===
                        popup.id
                        ? "Deleting..."
                        : "Delete"}
                    </button>
                  </div>

                </div>

              );
            }
          )}

          {/* =================================================
              PAGINATION
          ================================================= */}

          {filteredPopups.length >
            pageSize && (
            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "space-between",
                gap:
                  "12px",
                padding:
                  "14px 18px",
                borderTop:
                  "1px solid #E7EBEF",
                flexWrap:
                  "wrap",
              }}
            >
              <span
                style={{
                  fontSize:
                    "12px",
                  color:
                    "#8A95A5",
                }}
              >
                Page {safeCurrentPage}{" "}
                of {totalPages}
              </span>

              <div
                style={{
                  display:
                    "flex",
                  alignItems:
                    "center",
                  gap:
                    "6px",
                }}
              >
                <button
                  type="button"
                  disabled={
                    safeCurrentPage === 1
                  }
                  onClick={() =>
                    setCurrentPage(
                      (page) =>
                        Math.max(
                          1,
                          page - 1
                        )
                    )
                  }
                  style={{
                    border:
                      "1px solid #D8DEE7",
                    background:
                      "#FFFFFF",
                    color:
                      safeCurrentPage === 1
                        ? "#C4CBD4"
                        : "#374151",
                    borderRadius:
                      "7px",
                    padding:
                      "7px 12px",
                    fontSize:
                      "12px",
                    fontWeight:
                      600,
                    cursor:
                      safeCurrentPage === 1
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  Previous
                </button>

                {Array.from(
                  {
                    length:
                      totalPages,
                  },
                  (_, index) =>
                    index + 1
                ).map(
                  (page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() =>
                        setCurrentPage(
                          page
                        )
                      }
                      style={{
                        border:
                          page ===
                          safeCurrentPage
                            ? "1px solid #0B3D66"
                            : "1px solid #D8DEE7",
                        background:
                          page ===
                          safeCurrentPage
                            ? "#0B3D66"
                            : "#FFFFFF",
                        color:
                          page ===
                          safeCurrentPage
                            ? "#FFFFFF"
                            : "#374151",
                        borderRadius:
                          "7px",
                        minWidth:
                          "32px",
                        padding:
                          "7px 8px",
                        fontSize:
                          "12px",
                        fontWeight:
                          600,
                        cursor:
                          "pointer",
                      }}
                    >
                      {page}
                    </button>
                  )
                )}

                <button
                  type="button"
                  disabled={
                    safeCurrentPage ===
                    totalPages
                  }
                  onClick={() =>
                    setCurrentPage(
                      (page) =>
                        Math.min(
                          totalPages,
                          page + 1
                        )
                    )
                  }
                  style={{
                    border:
                      "1px solid #D8DEE7",
                    background:
                      "#FFFFFF",
                    color:
                      safeCurrentPage ===
                      totalPages
                        ? "#C4CBD4"
                        : "#374151",
                    borderRadius:
                      "7px",
                    padding:
                      "7px 12px",
                    fontSize:
                      "12px",
                    fontWeight:
                      600,
                    cursor:
                      safeCurrentPage ===
                      totalPages
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}

        </div>

      </s-section>


      {/* =====================================================
          FOOTER
      ===================================================== */}

      <s-section>

        <p
          style={{
            margin:
              "0 0 20px",
            color:
              "#9CA3AF",
            fontSize:
              "11px",
          }}
        >
          Popups are loaded directly
          from your PostgreSQL database.
        </p>

      </s-section>

    </s-page>

    {/* =====================================================
        TEMPLATE GALLERY MODAL
    ===================================================== */}

    {showTemplateGallery && (
      <div
        role="dialog"
        aria-modal="true"
        onClick={() =>
          setShowTemplateGallery(false)
        }
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(23, 32, 51, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 998,
          padding: "24px",
          boxSizing: "border-box",
        }}
      >
        <div
          onClick={(event) =>
            event.stopPropagation()
          }
          style={{
            width: "100%",
            maxWidth: "900px",
            maxHeight: "90vh",
            overflowY: "auto",
            background: "#FFFFFF",
            borderRadius: "16px",
            padding: "28px",
            boxSizing: "border-box",
            boxShadow:
              "0 24px 60px rgba(0,0,0,.35)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "18px",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "22px",
                fontWeight: 700,
                color: "#172033",
              }}
            >
              Start with a template
            </h2>

            <button
              type="button"
              onClick={() =>
                setShowTemplateGallery(false)
              }
              style={{
                border: "none",
                background: "transparent",
                fontSize: "20px",
                cursor: "pointer",
                color: "#657080",
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* CATEGORY FILTERS */}

          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              marginBottom: "22px",
            }}
          >
            {TEMPLATE_FILTERS.map(
              (filter) => {
                const selected =
                  templateFilter ===
                  filter.value;

                return (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() =>
                      setTemplateFilter(
                        filter.value
                      )
                    }
                    style={{
                      border: selected
                        ? "1px solid #0B3D66"
                        : "1px solid #D8DEE7",
                      background: selected
                        ? "#0B3D66"
                        : "#FFFFFF",
                      color: selected
                        ? "#FFFFFF"
                        : "#657080",
                      borderRadius: "999px",
                      padding: "8px 14px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {filter.label}
                  </button>
                );
              }
            )}
          </div>

          {/* TEMPLATE GRID */}

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fill, minmax(190px, 1fr))",
              gap: "16px",
            }}
          >
            {filteredTemplates.map(
              (template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() =>
                    handleSelectTemplate(
                      template.id
                    )
                  }
                  style={{
                    textAlign: "left",
                    border: "1px solid #E2E6EC",
                    borderRadius: "12px",
                    overflow: "hidden",
                    background: "#FFFFFF",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <div
                    style={{
                      height: "120px",
                      background: template.swatch,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        width: "70%",
                        height: "8px",
                        borderRadius: "4px",
                        background:
                          "rgba(0,0,0,0.08)",
                      }}
                    />
                  </div>

                  <div
                    style={{
                      padding: "12px 14px 14px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "#172033",
                        marginBottom: "8px",
                      }}
                    >
                      {template.name}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          color: template.tagColor,
                          background: `${template.tagColor}1A`,
                          borderRadius: "5px",
                          padding: "3px 7px",
                        }}
                      >
                        {template.tag}
                      </span>

                      <span
                        style={{
                          fontSize: "11px",
                          color: "#8A95A5",
                        }}
                      >
                        {template.metric}
                      </span>
                    </div>
                  </div>
                </button>
              )
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "22px",
              paddingTop: "18px",
              borderTop: "1px solid #EEF1F4",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                color: "#8A95A5",
              }}
            >
              {POPUP_TEMPLATES.length}{" "}
              templates · all fully editable
            </span>

            <button
              type="button"
              onClick={handleStartBlank}
              style={{
                border: "1px solid #D5DCE5",
                background: "#FFFFFF",
                color: "#0B3D66",
                borderRadius: "8px",
                padding: "9px 16px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Start blank
            </button>
          </div>
        </div>
      </div>
    )}

    {/* =====================================================
        DELETE CONFIRM MODAL
    ===================================================== */}

    {popupPendingDelete && (
      <div
        role="dialog"
        aria-modal="true"
        onClick={cancelDeletePopup}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(23, 32, 51, 0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999,
        }}
      >
        <div
          onClick={(event) =>
            event.stopPropagation()
          }
          style={{
            width: "100%",
            maxWidth: "380px",
            margin: "16px",
            background: "#FFFFFF",
            borderRadius: "12px",
            padding: "22px",
            boxShadow:
              "0 12px 32px rgba(23, 32, 51, 0.24)",
          }}
        >
          <h3
            style={{
              margin: "0 0 8px",
              fontSize: "16px",
              color: "#172033",
            }}
          >
            Delete popup?
          </h3>

          <p
            style={{
              margin: "0 0 20px",
              fontSize: "13px",
              color: "#6B7280",
              lineHeight: 1.5,
            }}
          >
            Delete "{popupPendingDelete.name}"?
            This action cannot be undone.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
            }}
          >
            <button
              type="button"
              onClick={cancelDeletePopup}
              style={{
                border: "1px solid #D5DCE5",
                background: "#FFFFFF",
                color: "#374151",
                borderRadius: "7px",
                padding: "9px 16px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              No
            </button>

            <button
              type="button"
              onClick={confirmDeletePopup}
              style={{
                border: "none",
                background: "#C62828",
                color: "#FFFFFF",
                borderRadius: "7px",
                padding: "9px 16px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Yes, delete
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}