import { allowedCommands, seqKeys, hotkeyLabel, type Command } from "@/lib/commands";

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
          <Row keys={[[mod, "K"]]} label="Open the command menu (search actions & pages)" />
          <Row keys={[["?"]]} label="Show this shortcuts help" />
          <Row keys={[["Esc"]]} label="Close the menu / dialog" />
        </ul>
        <p className="text-xs text-muted-foreground mt-2">
          <b>Sequences</b>: press the leader key, then the letter — e.g. <b>g</b> then <b>p</b> for Products. Reliable on every keyboard.
          Create pages also have a direct <b>Ctrl+Alt</b> combo, but some keyboard layouts intercept those — the sequence always works.
        </p>
      </div>

      {groups.map((g) => {
        const items = cmds.filter((c) => c.group === g);
        if (!items.length) return null;
        return (
          <div key={g}>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{g}</div>
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {items.map((c) => {
                const [lead, key] = seqKeys(c);
                return (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="text-foreground">{c.label}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <Kbd>{lead}</Kbd><span className="text-[10px] text-muted-foreground">then</span><Kbd>{key}</Kbd>
                      {c.hotkey && (
                        <span className="ml-1 text-[10px] text-muted-foreground hidden sm:inline">or {hotkeyLabel(c.hotkey, !!isMac)}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Row({ keys, label }: { keys: string[][]; label: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex gap-1 shrink-0">
        {keys.flat().map((k, i) => (
          <Kbd key={i}>{k}</Kbd>
        ))}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </li>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-grid place-items-center min-w-[1.5rem] h-6 px-1.5 rounded border bg-muted text-[11px] font-medium">
      {children}
    </kbd>
  );
}
