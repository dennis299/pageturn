import { cn } from "@/lib/utils";
import { clothFor, coverSrc } from "@/lib/cover";

type Props = {
  id: string;
  title: string;
  author?: string | null;
  /** Storage path of the book's cover photo; without one the cover is cloth with a stamped title. */
  coverPath?: string | null;
  /** 0..1, how far through the book you are: sets the ribbon length. */
  progress?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
};

/** A book's cover: its photo when it has one, otherwise cloth with a gold-stamped title. A ribbon marks your place. */
export function BookCover({ id, title, author, coverPath, progress = 0, size = "md", className }: Props) {
  const ribbon = Math.min(1, Math.max(0, progress));
  const src = coverSrc({ id, cover_path: coverPath });
  return (
    <div
      className={cn(
        "book-cover cloth relative isolate flex aspect-[2/3] shrink-0 flex-col overflow-hidden",
        size === "sm" && "w-16",
        size === "md" && "w-full",
        size === "lg" && "w-48 sm:w-60",
        className,
      )}
      style={{ ["--cloth" as string]: clothFor(id) }}
      aria-hidden
    >
      {/* The cloth cover is always there: it is the whole cover for a book without a photo, and what
          you see for the moment a photo takes to arrive. */}
      <div className="pointer-events-none absolute inset-[7%] rounded-[2px] border border-[#e2c373]/35" />
      <div className={cn("relative flex flex-1 flex-col items-center justify-center px-[14%] text-center", size === "sm" && "px-1.5")}>
        <p
          className={cn(
            "foil-text font-serif leading-[1.05] text-balance",
            size === "sm" ? "line-clamp-4 text-[9px]" : size === "lg" ? "text-2xl sm:text-3xl" : "line-clamp-5 text-base sm:text-lg",
          )}
        >
          {title}
        </p>
        {author && size !== "sm" && <p className="foil-text mt-3 line-clamp-2 font-sans text-[11px] opacity-80">{author}</p>}
      </div>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- private, per-user image served by our own route
        <img src={src} alt="" className="absolute inset-0 z-[5] size-full object-cover" decoding="async" draggable={false} />
      )}
      {/* The spine's shadow and a soft sheen, so a flat photo still reads as a bound book. */}
      <div className="book-sheen pointer-events-none absolute inset-0 z-10" />
      {ribbon > 0 && (
        <div
          className="ribbon-tail absolute top-0 right-[16%] z-20 w-[9%] max-w-3.5 min-w-1.5 bg-ribbon shadow-[1px_0_2px_rgb(0_0_0/0.4)]"
          style={{ height: `${Math.max(10, ribbon * 100)}%` }}
        />
      )}
    </div>
  );
}
