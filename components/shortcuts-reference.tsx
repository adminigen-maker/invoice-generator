import { allowedCommands, type Command } from "@/lib/commands";

// Presentational cheatsheet — shared by the "?" modal and Settings → Shortcuts.
// isMac only affects which modifier label we show for the palette key.
export function ShortcutsReference({ permissions, isMac }: { permissions: string[]; isMac?: boolean }) {
  const cmds = allowedCommands(permissions);
  const groups: Array<Command["group"]> = ["Create", "Go to"];
  const mod = isMac ? "⌘" : "Ctrl";

  return (
    <div className="space-y-5 text-sm">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Global</div>
        <ul className="space-y-1.5">
          <Shortcut keys={[mod, "K"]} label="Open the command menu (search actions & pages)" />
          <Shortcut keys={["?"]} label="Show this shortcuts help" />
          <Shortcut keys={["Esc"]} label="Close the menu / dialog" />
        </ul>
        <p className="text-xs text-muted-foreground mt-2">
          Everything below runs from the command menu ({mod}+K) — just type a few letters and press Enter.
          You only see actions you have permission for.
        </p>
      </div>

      {groups.map((g) => {
        const items = cmds.filter((c) => c.group === g);
        if (!items.length) return null;
        return (
          <div key={g}>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{g}</div>
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
              {items.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-0.5">
                  <span className="text-foreground">{c.label}</span>
                  <span className="text-xs text-muted-foreground truncate">{c.href}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex gap-1 shrink-0">
        {keys.map((k) => (
          <kbd key={k} className="inline-grid place-items-center min-w-[1.6rem] h-6 px-1.5 rounded border bg-muted text-[11px] font-medium">
            {k}
          </kbd>
        ))}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </li>
  );
}
