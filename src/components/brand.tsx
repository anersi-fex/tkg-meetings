import { cn } from "@/components/ui";

/**
 * Meetings brand, a sibling of Sales Coach and Scorecard (Tide, Crimson): a white speech bubble
 * holding three talking points (cut out, so the gradient shows through) on the colorway's
 * gradient squircle; the lockup puts "by TKG" (the real TKG letters) under the name. The same
 * mark draws the slides' footer (components/slides/slide.tsx) and the icons in public/
 * (scripts/gen-icons.mjs); keep the three in sync.
 */
export const BUBBLE_PATH =
  "M296 208H728A128 128 0 0 1 856 336V600A128 128 0 0 1 728 728H472L300 846Q268 866 268 828V728H296A128 128 0 0 1 168 600V336A128 128 0 0 1 296 208Z M334 384h356a22 22 0 0 1 0 44H334a22 22 0 0 1 0-44z M334 468h276a22 22 0 0 1 0 44H334a22 22 0 0 1 0-44z M334 552h188a22 22 0 0 1 0 44H334a22 22 0 0 1 0-44z";

export function MeetingsMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center bg-tide", className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.27) }}
    >
      <svg viewBox="0 0 1024 1024" width={size} height={size}>
        <path d={BUBBLE_PATH} fill="#fff" fillRule="evenodd" />
      </svg>
    </span>
  );
}

/** The real TKG letters as a solid shape (aspect 1540 x 734). */
export function TkgMark({ height = 12, className, title = "TKG" }: { height?: number; className?: string; title?: string }) {
  return (
    <svg viewBox="30 30 1540 734" height={height} width={Math.round((height * 1540) / 734)} role="img" aria-label={title} className={cn("block shrink-0 fill-current", className)}>
      <path d="M30 39H542V204H368V684H203V204H30ZM570 41H734V253L887 41H1084V47L865 350L1084 648V682H906L766 491L570 763ZM1569 160A323 323 0 1 0 1305 677H1560V294H1259V458H1396V513H1305A160 160 0 1 1 1449 268Z" />
    </svg>
  );
}

/** Icon + "Meetings" + "by TKG". `size` is the icon size; the type scales with it. */
export function MeetingsLockup({ size = 28, className }: { size?: number; className?: string }) {
  const name = Math.round(size * 0.56);
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <MeetingsMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="font-extrabold tracking-[-0.03em] text-gray-900" style={{ fontSize: name }}>
          Meetings
        </span>
        <span className="mt-[3px] flex items-center gap-1 text-[10px] font-medium text-gray-500">
          by <TkgMark height={Math.max(8, Math.round(size * 0.3))} className="text-gray-700" />
        </span>
      </span>
    </span>
  );
}
