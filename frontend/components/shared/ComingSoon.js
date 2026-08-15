"use client";
import { motion } from "framer-motion";

export default function ComingSoon({ icon, title, description, plannedFeatures = [] }) {
  return (
    <main className="p-8 max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-display font-bold mb-1">{icon} {title}</h1>
        <p className="font-mono text-sm text-ink/60 mb-6">{description}</p>

        <div className="nb-panel p-6">
          <p className="font-mono text-xs uppercase text-ink/50 mb-3">Planned for this page</p>
          <ul className="flex flex-col gap-2">
            {plannedFeatures.map((f, i) => (
              <li key={i} className="font-mono text-sm flex items-start gap-2">
                <span className="mt-0.5">▢</span> {f}
              </li>
            ))}
          </ul>
        </div>
      </motion.div>
    </main>
  );
}
