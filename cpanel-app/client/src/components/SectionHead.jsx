import Reveal from './Reveal';

export default function SectionHead({ eyebrow, title, lead, align = 'center' }) {
  return (
    <Reveal variant="fade" className={`section-head ${align !== 'center' ? 'align-left' : ''}`}>
      <span className="eyebrow">
        <i className="eyebrow-line" aria-hidden="true" />
        {eyebrow}
      </span>
      <h2>{title}</h2>
      {lead && <p className="lead">{lead}</p>}
    </Reveal>
  );
}
