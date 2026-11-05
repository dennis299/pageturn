import { cn } from "@/lib/utils";
import { clothFor } from "@/lib/cover";

type Props = {
  id: string;
  title: string;
  author?: string | null;
  /** 0..1, how far through the book you are: sets the ribbon length. */
  progress?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
};

/** A cloth-bound cover with a gold-stamped title and a ribbon that marks your place. */
export function BookCover({ id, title, author, progress = 0, size = "md", className }: Props) {
  const ribbon = Math.min(1, Math.max(0, progress));
  return (
    <div
      className={cn(
        "cloth relative isolate flex aspect-[2/3] shrink-0 flex-col overflow-hidden rounded-[3px_8px_8px_3px] shadow-[0_10px_30px_-12px_rgb(0_0_0/0.6),inset_3px_0_0_rgb(0_0_0/0.25)]",
        size === "sm" && "w-16",
        size === "md" && "w-full",
        size === "lg" && "w-48 sm:w-60",
        className,
      )}
      style={{ ["--cloth" as string]: clothFor(id) }}
      aria-hidden
    >
      <div className="pointer-events-none absolute inset-[7%] rounded-[2px] border border-[#e2c373]/35" />
      <div className={cn("relative z-10 flex flex-1 flex-col items-center justify-center px-[14%] text-center", size === "sm" && "px-1.5")}>
        <p
          className={cn(
            "foil-text font-serif leading-[1.05] text-balance",
            size === "sm" ? "line-clamp-4 text-[9px]" : size === "lg" ? "text-2xl sm:text-3xl" : "line-clamp-5 text-base sm:text-lg",
          )}
        >
          {title}
        </p>
        {author && size !== "sm" && (
          <p className="foil-text mt-3 font-sans text-[10px] tracking-[0.18em] uppercase opacity-80">{author}</p>
        )}
      </div>
      {ribbon > 0 && (
        <div
          className="ribbon-tail absolute top-0 right-[16%] z-20 w-[9%] max-w-3.5 min-w-1.5 bg-ribbon shadow-[1px_0_2px_rgb(0_0_0/0.4)]"
          style={{ height: `${Math.max(10, ribbon * 100)}%` }}
        />
      )}
    </div>
  );
}
