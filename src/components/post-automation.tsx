"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Bot, Check, Loader2, MessageCircle, Trash2 } from "lucide-react";
import { Button, InlineError, Switch, cn, inputCls, labelCls } from "@/components/ui";
import { toast } from "sonner";

export type Automation = {
  id: string;
  name: string;
  triggerKeywords: string[];
  responseTemplate: string;
  active: boolean;
  sentCount: number;
};

/** Estado editável da automação enquanto a publicação ainda não foi salva. */
export type AutomationDraft = {
  enabled: boolean;
  keywords: string;
  response: string;
};

export const EMPTY_AUTOMATION: AutomationDraft = { enabled: false, keywords: "", response: "" };

export function draftFromAutomation(automation: Automation | null | undefined): AutomationDraft {
  if (!automation) return EMPTY_AUTOMATION;
  return { enabled: true, keywords: automation.triggerKeywords.join(", "), response: automation.responseTemplate };
}

export function isDraftComplete(draft: AutomationDraft) {
  return draft.enabled && draft.keywords.trim().length > 0 && draft.response.trim().length > 0;
}

/**
 * Persiste a automação de uma publicação já existente.
 *
 * Usado pelo composer no momento em que a publicação ganha um id — antes disso
 * não há a que vincular a regra.
 */
export async function saveAutomationDraft(postId: string, draft: AutomationDraft, existingId?: string | null) {
  if (!draft.enabled) {
    if (existingId) {
      await fetch(`/api/posts/${postId}/automation?automationId=${existingId}`, { method: "DELETE" });
    }
    return;
  }
  if (!isDraftComplete(draft)) return;

  const res = await fetch(`/api/posts/${postId}/automation`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords: draft.keywords, response: draft.response, automationId: existingId ?? undefined }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Não foi possível salvar a automação.");
  }
}

/* ------------------------------------------------------------------ */
/*  Campos                                                             */
/* ------------------------------------------------------------------ */

/**
 * Bloco de configuração, controlado pelo pai.
 *
 * Fica desligado por padrão e explica, em uma frase, o que vai acontecer —
 * é o único lugar do produto onde uma mensagem sai sozinha em nome do cliente,
 * então o comportamento não pode ficar implícito.
 */
export function AutomationFields({
  value,
  onChange,
  disabled = false,
  sentCount,
}: {
  value: AutomationDraft;
  onChange: (next: AutomationDraft) => void;
  disabled?: boolean;
  sentCount?: number;
}) {
  const incomplete = value.enabled && !isDraftComplete(value);

  return (
    <div className={cn("rounded-xl border bg-surface-2/40 p-3.5", value.enabled ? "border-accent/40" : "border-border")}>
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Bot size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">Responder no direct automaticamente</p>
          <p className="mt-0.5 text-[11.5px] leading-4 text-muted">
            Quem comentar esta publicação com uma das palavras abaixo recebe sua mensagem no direct, sem
            você precisar fazer nada.
          </p>
        </div>
        <Switch
          checked={value.enabled}
          onChange={(enabled) => onChange({ ...value, enabled })}
          label="Ativar resposta automática no direct"
        />
      </div>

      {value.enabled && (
        <div className="mt-3.5 space-y-3 border-t border-border pt-3.5">
          <div>
            <label className={labelCls}>
              1. Palavras que ativam <span className="font-normal text-muted/70">(separe por vírgula)</span>
            </label>
            <input
              className={inputCls}
              value={value.keywords}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, keywords: e.target.value })}
              placeholder="quero, eu quero, catálogo, preço"
            />
            <p className="mt-1 text-[10.5px] text-muted">
              Não diferencia maiúsculas de minúsculas e basta a palavra aparecer no comentário.
            </p>
          </div>

          <div>
            <label className={labelCls}>2. Mensagem enviada no direct</label>
            <textarea
              className={cn(inputCls, "h-20 resize-none py-2.5")}
              value={value.response}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, response: e.target.value })}
              placeholder="Oi! Que bom que você se interessou. Segue o link do catálogo: ..."
            />
          </div>

          {value.keywords.trim() && value.response.trim() && (
            <p className="flex items-start gap-1.5 rounded-lg bg-accent-soft/50 px-2.5 py-2 text-[11.5px] leading-4 text-accent">
              <MessageCircle size={12} className="mt-0.5 shrink-0" />
              <span>
                Comentou <b>{value.keywords.split(",")[0]?.trim() || "…"}</b> → recebe sua mensagem no direct.
              </span>
            </p>
          )}

          {incomplete && (
            <p className="text-[11.5px] text-warning">
              Preencha as palavras e a mensagem — sem os dois, a automação não é criada.
            </p>
          )}

          {typeof sentCount === "number" && sentCount > 0 && (
            <p className="text-[11px] text-muted tnum">{sentCount} respostas já enviadas por esta regra.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Versão autônoma (calendário)                                       */
/* ------------------------------------------------------------------ */

/** Carrega e grava sozinha — para telas onde a publicação já existe. */
export function PostAutomation({ postId }: { postId: string }) {
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [draft, setDraft] = useState<AutomationDraft>(EMPTY_AUTOMATION);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/automation`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { automations: Automation[] };
      const found = data.automations[0] ?? null;
      setAutomation(found);
      setDraft(draftFromAutomation(found));
    } catch {
      setError("Não foi possível carregar a automação desta publicação.");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      await saveAutomationDraft(postId, draft, automation?.id);
      await load();
      toast.success(draft.enabled ? "Automação salva." : "Automação desativada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!automation) return;
    setSaving(true);
    try {
      await fetch(`/api/posts/${postId}/automation?automationId=${automation.id}`, { method: "DELETE" });
      setAutomation(null);
      setDraft(EMPTY_AUTOMATION);
      toast.success("Automação removida.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/40 px-3.5 py-3 text-[12.5px] text-muted">
        <Loader2 size={14} className="animate-spin" /> Carregando automação…
      </div>
    );
  }

  const dirty =
    draft.enabled !== Boolean(automation) ||
    draft.keywords !== (automation?.triggerKeywords.join(", ") ?? "") ||
    draft.response !== (automation?.responseTemplate ?? "");

  return (
    <div className="space-y-2.5">
      <AutomationFields value={draft} onChange={setDraft} sentCount={automation?.sentCount} />
      {error && <InlineError>{error}</InlineError>}
      {(dirty || automation) && (
        <div className="flex items-center gap-2">
          {dirty && (
            <Button size="sm" onClick={save} loading={saving} disabled={draft.enabled && !isDraftComplete(draft)}>
              <Check size={13} /> Salvar automação
            </Button>
          )}
          {automation && (
            <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10" onClick={remove} disabled={saving}>
              <Trash2 size={13} /> Remover
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
