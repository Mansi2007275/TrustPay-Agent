export default function DecisionBadge({ decision }) {
  const map = {
    AUTO_EXECUTE: { bg: "#7ee787", label: "🟢 AUTO EXECUTED" },
    HUMAN_APPROVAL: { bg: "#ffde59", label: "🟡 PENDING APPROVAL" },
    BLOCKED: { bg: "#ff5c5c", label: "🔴 BLOCKED" },
  };
  const tone = map[decision] || { bg: "#e5e5e5", label: decision };
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 border-[2.5px] border-ink font-mono text-xs font-bold"
      style={{ backgroundColor: tone.bg }}
    >
      {tone.label}
    </span>
  );
}
