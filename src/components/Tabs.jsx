// a row of tabs; arrow keys move between them
export default function Tabs({ label, items, value, onChange }) {
  const keys = items.map(([k]) => k);
  const onKey = e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = keys.indexOf(value), n = keys[(i + (e.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length];
    onChange(n);
    e.currentTarget.querySelector(`[data-k="${n}"]`)?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {items.map(([k, t]) => (
        <button key={k} role="tab" type="button" data-k={k} aria-selected={k === value} tabIndex={k === value ? 0 : -1} onClick={() => onChange(k)}>{t}</button>
      ))}
    </div>
  );
}
