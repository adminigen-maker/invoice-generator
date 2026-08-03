import { describe, it, expect } from "vitest";
import { COMMANDS, allowedCommands, hotkeyLabel } from "@/lib/commands";

describe("command catalog", () => {
  it("has no duplicate ids", () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique hotkeys (no two combos collide)", () => {
    const keys = COMMANDS.map((c) => c.hotkey).filter(Boolean) as string[];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every Create command a direct hotkey", () => {
    for (const c of COMMANDS.filter((c) => c.group === "Create")) {
      expect(c.hotkey, `${c.id} should have a hotkey`).toBeTruthy();
    }
  });

  it("allowedCommands filters by permission", () => {
    // No permissions → only commands without a perm requirement (e.g. Dashboard).
    const none = allowedCommands([]);
    expect(none.every((c) => !c.perm)).toBe(true);
    expect(none.some((c) => c.id === "go-dashboard")).toBe(true);
    expect(none.some((c) => c.id === "new-product")).toBe(false);

    // Grant product create → New product shows up.
    const withCreate = allowedCommands(["inventory.product.create"]);
    expect(withCreate.some((c) => c.id === "new-product")).toBe(true);
  });

  it("formats hotkey labels per platform", () => {
    expect(hotkeyLabel("p", false)).toBe("Ctrl+Alt+P");
    expect(hotkeyLabel("p", true)).toBe("⌃⌥P");
  });
});
