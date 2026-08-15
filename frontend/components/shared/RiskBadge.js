export default function RiskBadge({ score }) {
  const tone =
    score <= 25 ? { bg: "#7ee787", label: "LOW" } :
    score <= 60 ? { bg: "#ffde59", label: "MEDIUM" } :
    score <= 80 ? { bg: "#ffb700", label: "HIGH" } :
                  { bg: "#ff5c5c", label: "CRITICAL" };

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 border-[2.5px] border-ink font-mono text-xs font-bold"
      style={{ backgroundColor: tone.bg }}
    >
      {score}/100 · {tone.label}
    </span>
  );
}
