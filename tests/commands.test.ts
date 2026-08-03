import { describe, it, expect } from "vitest";
import { COMMANDS, allowedCommands, hotkeyLabel, seqKeys } from "@/lib/commands";

describe("command catalog", () => {
  it("has no duplicate ids", () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique sequence keys within each group", () => {
    for (const g of ["Create", "Go to"] as const) {
      const keys = COMMANDS.filter((c) => c.group === g).map((c) => c.seqKey);
      expect(new Set(keys).size, `${g} seqKeys must be unique`).toBe(keys.length);
    }
  });

  it("has unique direct hotkeys", () => {
    const keys = COMMANDS.map((c) => c.hotkey).filter(Boolean) as string[];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every Create command a sequence key and a direct hotkey", () => {
    for (const c of COMMANDS.filter((c) => c.group === "Create")) {
      expect(c.seqKey, `${c.id} seqKey`).toBeTruthy();
      expect(c.hotkey, `${c.id} hotkey`).toBeTruthy();
    }
  });

  it("builds sequence labels (leader + key, uppercased)", () => {
    expect(seqKeys(COMMANDS.find((c) => c.id === "new-quotation")!)).toEqual(["C", "Q"]);
    expect(seqKeys(COMMANDS.find((c) => c.id === "go-products")!)).toEqual(["G", "P"]);
  });

  it("allowedCommands filters by permission", () => {
    const none = allowedCommands([]);
    expect(none.every((c) => !c.perm)).toBe(true);
    expect(none.some((c) => c.id === "go-dashboard")).toBe(true);
    expect(none.some((c) => c.id === "new-product")).toBe(false);

    const withCreate = allowedCommands(["inventory.product.create"]);
    expect(withCreate.some((c) => c.id === "new-product")).toBe(true);
  });

  it("formats direct-hotkey labels per platform", () => {
    expect(hotkeyLabel("p", false)).toBe("Ctrl+Alt+P");
    expect(hotkeyLabel("p", true)).toBe("⌃⌥P");
  });
});
