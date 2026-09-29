import { describe, expect, it } from "vitest";

import { DEFAULT_FLOATING_BUTTON, FLOATING_BUTTON_OPTIONS, normalizeFloatingButton } from "./floating-button";

describe("floating button", () => {
  it("keeps the five positions and falls back to bottom right", () => {
    expect(FLOATING_BUTTON_OPTIONS.map((o) => o.value)).toEqual(["bottom_right", "bottom_left", "left_wall", "right_wall", "none"]);
    expect(normalizeFloatingButton("left_wall")).toBe("left_wall");
    expect(normalizeFloatingButton("none")).toBe("none");
    expect(normalizeFloatingButton("top")).toBe(DEFAULT_FLOATING_BUTTON);
    expect(normalizeFloatingButton(undefined)).toBe("bottom_right");
  });
});
