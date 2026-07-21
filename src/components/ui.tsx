"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X as CloseIcon, Loader2, AlertCircle } from "lucide-react";

function InstagramIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}
function FacebookIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}
function LinkedInIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}
function YoutubeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/* ---------------------------------- Types ---------------------------------- */
export type Platform = "instagram" | "facebook" | "x" | "linkedin" | "tiktok" | "youtube";

export const PLATFORM_META: Record<Platform, { name: string; color: string; charLimit: number }> = {
  instagram: { name: "Instagram", color: "#C45C8E", charLimit: 2200 },
  facebook: { name: "Facebook", color: "#6A8AC4", charLimit: 63206 },
  x: { name: "X", color: "#3A8BD9", charLimit: 280 },
  linkedin: { name: "LinkedIn", color: "#4F83AC", charLimit: 3000 },
  tiktok: { name: "TikTok", color: "#8B7FB8", charLimit: 2200 },
  youtube: { name: "YouTube", color: "#B0584F", charLimit: 5000 },
};

function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function TikTokIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}

export function PlatformIcon({ platform, size = 14, className }: { platform: Platform | string; size?: number; className?: string }) {
  const p = platform as Platform;
  void className;
  if (p === "instagram") return <InstagramIcon size={size} />;
  if (p === "facebook") return <FacebookIcon size={size} />;
  if (p === "x") return <XIcon size={size} />;
  if (p === "linkedin") return <LinkedInIcon size={size} />;
  if (p === "tiktok") return <TikTokIcon size={size} />;
  if (p === "youtube") return <YoutubeIcon size={size} />;
  return null;
}

export function PlatformChip({ platform, size = 20 }: { platform: Platform | string; size?: number }) {
  const meta = PLATFORM_META[platform as Platform];
  if (!meta) return null;
  return (
    <span
      title={meta.name}
      className="inline-flex shrink-0 items-center justify-center rounded-md text-white"
      style={{ width: size + 6, height: size + 6, background: meta.color }}
    >
      <PlatformIcon platform={platform} size={size - 4} />
    </span>
  );
}

/* --------------------------------- Button ---------------------------------- */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger" | "soft";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: BtnProps) {
  const variants: Record<string, string> = {
    primary: "bg-accent text-white hover:bg-accent-strong shadow-[0_1px_2px_rgba(0,0,0,0.08)]",
    outline: "border border-border bg-surface hover:bg-surface-2 text-foreground",
    ghost: "hover:bg-surface-2 text-foreground",
    danger: "bg-danger/10 text-danger hover:bg-danger/15 border border-danger/20",
    soft: "bg-accent-soft text-accent hover:bg-accent-soft hover:brightness-95",
  };
  const sizes: Record<string, string> = {
    sm: "h-8 px-3 text-[13px] gap-1.5",
    md: "h-9.5 px-4 text-[13.5px] gap-2",
    lg: "h-11 px-5 text-[14.5px] gap-2",
    icon: "h-9 w-9 justify-center",
  };
  return (
    <button
      className={cn(
        "inline-flex select-none items-center justify-center rounded-xl font-medium transition-all duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
        variants[variant], sizes[size], className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

/* --------------------------------- Avatar ---------------------------------- */
export function Avatar({ name, color = "#AB2F5F", size = 32, className }: { name: string; color?: string; size?: number; className?: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
      aria-label={name}
    >
      {initials}
    </span>
  );
}

/* ---------------------------------- Badge ---------------------------------- */
export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "info"; className?: string }) {
  const tones: Record<string, string> = {
    neutral: "bg-surface-2 text-muted",
    accent: "bg-accent-soft text-accent",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-danger/10 text-danger",
    info: "bg-info/10 text-info",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

export const POST_STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" | "info" }> = {
  draft: { label: "Rascunho", tone: "neutral" },
  scheduled: { label: "Agendado", tone: "info" },
  published: { label: "Publicado", tone: "success" },
  failed: { label: "Falhou", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "warning" },
};

/* ---------------------------------- Modal ---------------------------------- */
export function Modal({ open, onClose, title, children, width = "max-w-lg", subtitle }: {
  open: boolean; onClose: () => void; title?: string; subtitle?: string; children: React.ReactNode; width?: string;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
          role="dialog" aria-modal="true"
        >
          <motion.div
            className={cn("w-full overflow-hidden rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl", width)}
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            {title !== undefined && (
              <div className="flex items-start justify-between border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-[15px] font-semibold">{title}</h2>
                  {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
                </div>
                <button onClick={onClose} className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-foreground" aria-label="Fechar">
                  <CloseIcon size={16} />
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------------------------- Switch --------------------------------- */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch" aria-checked={checked} aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        checked ? "bg-accent" : "bg-border-strong"
      )}
    >
      <span
        className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all duration-200"
        style={{ left: checked ? 18 : 2 }}
      />
    </button>
  );
}

/* -------------------------------- Segmented -------------------------------- */
export function Segmented<T extends string>({ options, value, onChange, className }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div className={cn("inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-surface p-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value} role="tab" aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition-all duration-150",
            value === o.value ? "bg-foreground text-background shadow-sm" : "text-muted hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------- Dropdown --------------------------------- */
export function Dropdown({ trigger, items, align = "right", side = "bottom" }: {
  trigger: React.ReactNode;
  align?: "left" | "right";
  side?: "top" | "bottom";
  items: { label: string; icon?: React.ReactNode; onClick?: () => void; danger?: boolean; divider?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: side === "top" ? -4 : 4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: side === "top" ? -4 : 4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className={cn(
              "absolute z-40 min-w-44 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-lg",
              side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
              align === "right" ? "right-0" : "left-0"
            )}
          >
            {items.map((item, i) =>
              item.divider ? (
                <div key={i} className="my-1 h-px bg-border" />
              ) : (
                <button
                  key={i}
                  onClick={() => { setOpen(false); item.onClick?.(); }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                    item.danger ? "text-danger hover:bg-danger/10" : "hover:bg-surface-2"
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------- Misc ----------------------------------- */
export function EmptyState({ icon, title, description, action }: { icon: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-muted">{icon}</div>
      <h3 className="text-[14.5px] font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function InlineError({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/8 px-3.5 py-2.5 text-[13px] text-danger">
      <AlertCircle size={15} className="shrink-0" />
      {children}
    </div>
  );
}

export const inputCls =
  "h-10 w-full rounded-xl border border-border bg-surface px-3.5 text-[13.5px] text-foreground placeholder:text-muted/70 transition-colors focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/15";

export const labelCls = "mb-1.5 block text-[12.5px] font-medium text-muted";

export function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1).replace(".", ",")} mil`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".", ",")} mil`;
  return n.toLocaleString("pt-BR");
}

/** Marca oficial da Postline (vetor da logo — "P" com gradiente rosa). */
export function Logo({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 88 98"
      className={cn("inline-block shrink-0", className)}
      role="img"
      aria-label="Postline"
    >
      <defs>
        <linearGradient id="postlineGrad" x1="0" y1="0" x2="88" y2="98" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF9DC7" />
          <stop offset="0.55" stopColor="#FC6BAA" />
          <stop offset="1" stopColor="#F03D86" />
        </linearGradient>
      </defs>
      <path
        fillRule="evenodd"
        fill="url(#postlineGrad)"
        d="M32.5,0.5C37.21,0.54 55.17,0.71 60.75,1C66.33,1.29 63.79,1.38 66,2.25C68.21,3.13 71.5,4.46 74,6.25C76.5,8.04 79,10.29 81,13C83,15.71 84.96,19.71 86,22.5C87.04,25.29 87,26.29 87.25,29.75C87.5,33.21 87.5,39.08 87.5,43.25C87.5,47.42 87.67,51.42 87.25,54.75C86.83,58.08 86.04,60.67 85,63.25C83.96,65.83 83.04,67.79 81,70.25C78.96,72.71 75.5,76.08 72.75,78C70,79.92 66.88,80.96 64.5,81.75C62.13,82.54 63.63,82.58 58.5,82.75C53.38,82.92 38.21,83.04 33.75,82.75C29.29,82.46 32.21,81.54 31.75,81C31.29,80.46 31.13,81.38 31,79.5C30.88,77.63 30.67,72.08 31,69.75C31.33,67.42 32.38,66.46 33,65.5C33.63,64.54 33.67,64.54 34.75,64C35.83,63.46 37.42,62.5 39.5,62.25C41.58,62 44.42,62.54 47.25,62.5C50.08,62.46 54.08,62.58 56.5,62C58.92,61.42 60.38,60.04 61.75,59C63.13,57.96 64.21,56.58 64.75,55.75C65.29,54.92 64.83,54.38 65,54C65.17,53.63 65.46,54.13 65.75,53.5C66.04,52.88 66.58,53.38 66.75,50.25C66.92,47.13 67.08,38.21 66.75,34.75C66.42,31.29 65.63,30.96 64.75,29.5C63.88,28.04 62.83,27.04 61.5,26C60.17,24.96 58.04,23.79 56.75,23.25C55.46,22.71 57.63,22.83 53.75,22.75C49.88,22.67 37.83,22.38 33.5,22.75C29.17,23.13 29.33,24.04 27.75,25C26.17,25.96 24.88,27.5 24,28.5C23.13,29.5 22.96,29.96 22.5,31C22.04,32.04 21.5,24.79 21.25,34.75C21,44.71 21.54,80.67 21,90.75C20.46,100.83 19.33,94.04 18,95.25C16.67,96.46 14.5,97.54 13,98C11.5,98.46 10.54,98.46 9,98C7.46,97.54 5.08,96.38 3.75,95.25C2.42,94.13 1.54,92.38 1,91.25C0.46,90.13 0.54,98.71 0.5,88.5C0.46,78.29 0.5,40.96 0.75,30C1,19.04 1.13,25.33 2,22.75C2.88,20.17 4.88,16.46 6,14.5C7.13,12.54 7.42,12.38 8.75,11C10.08,9.63 12.71,7.21 14,6.25C15.29,5.29 15.92,5.63 16.5,5.25C17.08,4.88 16.08,4.67 17.5,4C18.92,3.33 22.5,1.79 25,1.25C27.5,0.71 31.25,0.88 32.5,0.75C33.75,0.63 27.79,0.46 32.5,0.5Z M38.75,33.75C40.71,33.75 47.92,33.58 50.5,34C53.08,34.42 53.42,35.63 54.25,36.25C55.08,36.88 55.04,36.83 55.5,37.75C55.96,38.67 56.88,40.25 57,41.75C57.13,43.25 56.67,45.42 56.25,46.75C55.83,48.08 55,49.08 54.5,49.75C54,50.42 54,50.33 53.25,50.75C52.5,51.17 52.71,52.04 50,52.25C47.29,52.46 39.54,52.25 37,52C34.46,51.75 35.46,51.29 34.75,50.75C34.04,50.21 33.33,49.63 32.75,48.75C32.17,47.88 31.54,46.63 31.25,45.5C30.96,44.38 30.71,43.42 31,42C31.29,40.58 32.04,38.29 33,37C33.96,35.71 35.79,34.75 36.75,34.25C37.71,33.75 38.42,34.08 38.75,34C39.08,33.92 36.79,33.75 38.75,33.75Z"
      />
    </svg>
  );
}

export function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}sem`;
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}
