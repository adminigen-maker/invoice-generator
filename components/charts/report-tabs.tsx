"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type ReportTab = { key: string; label: string; icon?: React.ReactNode; content: React.ReactNode };

/**
 * Underline-style tab bar for the Reports page. Panels are server-rendered and
 * passed in as `content`; this only toggles which one is visible.
 */
export function ReportTabs({ tabs }: { tabs: ReportTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="space-y-4">
      <div className="border-b overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                t.key === active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div>{current?.content}</div>
    </div>
  );
}
