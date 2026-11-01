export default function Toggle({
  title,
  detail,
  checked,
  onChange,
}: {
  title: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>
        <b>{title}</b>
        <small>{detail}</small>
      </span>
      <input
        className="switch"
        type="checkbox"
        role="switch"
        aria-label={title}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
