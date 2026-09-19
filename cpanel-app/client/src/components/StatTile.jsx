import { useCountUp } from '../lib/motion';
import Reveal from './Reveal';

export default function StatTile({ label, value, suffix = '', delay = 0 }) {
  const [ref, count] = useCountUp(value || 0);
  return (
    <Reveal variant="up" delay={delay}>
      <div className="stat-tile" ref={ref}>
        <div className="stat-value">
          {count}
          <span className="stat-suffix">{suffix}</span>
        </div>
        <div className="stat-label">{label}</div>
      </div>
    </Reveal>
  );
}
