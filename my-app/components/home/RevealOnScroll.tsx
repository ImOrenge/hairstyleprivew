"use client";

import { type ReactNode, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../../lib/utils";

const SECTION_REVEAL_DURATION = 1.05;

interface RevealOnScrollProps {
  children: ReactNode;
  className?: string;
}

export function RevealOnScroll({ children, className }: RevealOnScrollProps) {
  const shouldReduceMotion = useReducedMotion();
  const [hasEntered, setHasEntered] = useState(false);

  if (shouldReduceMotion) {
    return (
      <div className={cn("f-reveal-group", className)} data-reveal-state="reduced">
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={cn("f-reveal-group", className)}
      data-reveal-state={hasEntered ? "visible" : "hidden"}
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.08, margin: "0px 0px -8% 0px" }}
      transition={{ duration: SECTION_REVEAL_DURATION, ease: [0.22, 1, 0.36, 1] }}
      onViewportEnter={() => setHasEntered(true)}
      onFocusCapture={() => setHasEntered(true)}
    >
      {children}
    </motion.div>
  );
}
