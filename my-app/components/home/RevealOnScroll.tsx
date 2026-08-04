"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

interface RevealOnScrollProps {
  children: ReactNode;
  className?: string;
}

export function RevealOnScroll({ children, className }: RevealOnScrollProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.16, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.56, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
