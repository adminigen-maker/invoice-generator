import { cn } from "@/lib/utils";

/** Base shimmer block. Compose these to mirror a page's real layout. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-300 dark:bg-slate-700", className)}
      {...props}
    />
  );
}

export { Skeleton };
