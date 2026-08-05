import React from "react";

/** Tipografia compartilhada pelas páginas legais. */

export function PageTitle({ title, updatedAt }: { title: string; updatedAt: string }) {
  return (
    <div className="mb-8 border-b border-border pb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-[12.5px] text-muted">Última atualização: {updatedAt}</p>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="mb-2.5 text-[15.5px] font-semibold">{title}</h2>
      <div className="space-y-3 text-[13.5px] leading-6 text-foreground/85">{children}</div>
    </section>
  );
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-1.5 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Bloco de destaque para instruções que o revisor da Meta precisa achar rápido. */
export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-accent/25 bg-accent-soft/50 p-4 text-[13.5px] leading-6">
      {children}
    </div>
  );
}
