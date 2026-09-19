/**
 * Infinite category ticker — duplicated track, CSS keyframe scroll,
 * pauses on hover, static for reduced-motion users.
 */
export default function Marquee({ items }) {
  const row = items.map((c) => (
    <span className="marquee-item" key={c}>
      {c}
    </span>
  ));
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {row}
        {row}
      </div>
    </div>
  );
}
