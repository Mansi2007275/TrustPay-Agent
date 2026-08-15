"use client";
// Small "alive" heartbeat indicator for the agent's live status.
export default function AgentPulse({ size = 10, color = "#7ee787" }) {
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <span
        className="absolute inline-flex h-full w-full rounded-full animate-pulseRing"
        style={{ backgroundColor: color }}
      />
      <span
        className="relative inline-flex rounded-full border-2 border-ink"
        style={{ width: size, height: size, backgroundColor: color }}
      />
    </span>
  );
}
