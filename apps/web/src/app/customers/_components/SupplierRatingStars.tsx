// A supplier's rating as it reads in lists and pickers: five stars and the figure, 0 in red, and
// "Not rated" as words, so it is never taken for 0 or for an empty cell (Council Outlay 7).
interface SupplierRatingStarsProps {
  /** 0–5 stars, or null when not rated. */
  rating: number | null;
}

const STARS = [0, 1, 2, 3, 4];

export function SupplierRatingStars({ rating }: SupplierRatingStarsProps) {
  if (rating === null) return <span className="whitespace-nowrap text-[12px] text-slate-400">Not rated</span>;
  return (
    <span role="img" aria-label={rating === 0 ? "Rated 0 of 5, the worst" : `Rated ${rating} of 5`} className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className="text-[13px] leading-none tracking-[1px]">
        {STARS.map((i) => (
          <span key={i} className={i < rating ? "text-amber-500" : "text-slate-300"}>
            ★
          </span>
        ))}
      </span>
      <span aria-hidden className={`text-[11px] tabular-nums ${rating === 0 ? "font-medium text-red-600" : "text-slate-500"}`}>
        {rating}/5
      </span>
    </span>
  );
}
