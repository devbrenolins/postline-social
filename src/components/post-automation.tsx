"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Bot, Check, Loader2, Trash2 } from "lucide-react";
import { Button, InlineError, cn, inputCls, labelCls } from "@/components/ui";
import { toast } from "sonner";

type Automation = {
  id: string;
  name: string;
  triggerKeywords: string[];
  responseTemplate: string;
  active: boolean;
  sentCount: number;
};

/**
 * Configura a resposta automática no direct de uma publicação, sem sair da tela.
 *
 * Usado no composer e no detalhe do calendário. Antes só dava para fazer isso no
 * Studio, e só criando — uma automação com palavra-gatilho errada tinha que ser
 * apagada e refeita.
 */
export function PostAutomation({ postId, compact = false }: { postId: string; compact?: boolean }) {
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [keywords, setKeywords] = useState("");
  const [response, setResponse] = useState("");
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
      setKeywords(found ? found.triggerKeywords.join(", ") : "");
      setResponse(found?.responseTemplate ?? "");
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
      const res = await fetch(`/api/posts/${postId}/automation`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, response, automationId: automation?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      setAutomation(data.automation);
      toast.success(automation ? "Automação atualizada." : "Automação criada.");
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
      setKeywords("");
      setResponse("");
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

  return (
    <div className={cn("rounded-xl border border-border bg-surface-2/40 p-3.5", compact && "p-3")}>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Bot size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold">Resposta automática no direct</p>
          <p className="text-[11px] leading-4 text-muted">
            Quem comentar esta publicação usando uma das palavras recebe a mensagem no direct.
          </p>
        </div>
        {automation && (
          <span className="shrink-0 text-[10.5px] text-muted tnum">{automation.sentCount} enviadas</span>
        )}
      </div>

      <div className="space-y-2.5">
        <div>
          <label className={labelCls}>Palavras-gatilho (separadas por vírgula)</label>
          <input
            className={inputCls}
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="quero, catálogo, preço"
          />
        </div>
        <div>
          <label className={labelCls}>Mensagem enviada</label>
          <textarea
            className={cn(inputCls, "h-20 resize-none py-2.5")}
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Oi! Segue o link do nosso catálogo: ..."
          />
        </div>

        {error && <InlineError>{error}</InlineError>}

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={save} loading={saving} disabled={!keywords.trim() || !response.trim()}>
            <Check size={13} /> {automation ? "Salvar alterações" : "Ativar automação"}
          </Button>
          {automation && (
            <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10" onClick={remove} disabled={saving}>
              <Trash2 size={13} /> Remover
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
