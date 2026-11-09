import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder screens shown the instant you tap, while the real page loads. */
export function ShelfSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 md:py-10" aria-busy="true" aria-label="Loading your shelf">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="size-12 rounded-full" />
      </div>
      <Skeleton className="mt-10 h-3 w-32" />
      <Skeleton className="mt-3 h-28 w-full rounded-2xl" />
      <Skeleton className="mt-10 h-3 w-24" />
      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i}>
            <Skeleton className="aspect-[2/3] w-full rounded-[3px_8px_8px_3px]" />
            <Skeleton className="mt-3 h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 md:py-10" aria-busy="true" aria-label="Loading stats">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-6 h-24 w-full rounded-2xl" />
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-8 h-64 w-full rounded-2xl" />
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-8 md:py-10" aria-busy="true" aria-label="Loading settings">
      <Skeleton className="h-9 w-40" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="mt-4 h-36 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export function PlayerSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-5 pt-16" aria-busy="true" aria-label="Opening book">
      <Skeleton className="aspect-[2/3] w-48 rounded-[3px_8px_8px_3px] sm:w-60" />
      <Skeleton className="mt-6 h-7 w-56" />
      <Skeleton className="mt-2 h-4 w-32" />
      <Skeleton className="mt-8 h-1 w-full" />
      <Skeleton className="mt-6 size-20 rounded-full" />
    </div>
  );
}
