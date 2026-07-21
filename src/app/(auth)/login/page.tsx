"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, User, Building2, ArrowRight, TrendingUp, CheckCircle2, Heart, MessageCircle } from "lucide-react";
import { Logo, Button, InlineError, inputCls, labelCls, cn } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "sonner";

type Mode = "login" | "register" | "forgot";

/** Traduz erros do Supabase Auth para mensagens claras em pt-BR. */
function translateAuthError(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (msg.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar (veja sua caixa de entrada).";
  if (msg.includes("user already registered") || msg.includes("already registered")) return "Este e-mail já está em uso. Faça login.";
  if (msg.includes("password should be at least")) return "A senha deve ter pelo menos 8 caracteres.";
  if (msg.includes("rate limit") || msg.includes("too many")) return "Muitas tentativas. Aguarde um minuto e tente novamente.";
  if (msg.includes("provider is not enabled")) return "Login com Google não está habilitado no Supabase ainda.";
  if (msg.includes("supabase")) return "Autenticação não configurada. Adicione as chaves do Supabase no ambiente.";
  if (msg.includes("failed to fetch") || msg.includes("networkerror")) return "Não foi possível conectar. Verifique sua conexão e tente novamente.";
  return err instanceof Error && err.message ? err.message : "Algo deu errado. Tente novamente.";
}

const PHOTOS = [
  "https://images.pexels.com/photos/29765795/pexels-photo-29765795.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  "https://images.pexels.com/photos/692101/pexels-photo-692101.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  "https://images.pexels.com/photos/28309428/pexels-photo-28309428.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  "https://images.pexels.com/photos/18281417/pexels-photo-18281417.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  "https://images.pexels.com/photos/27082720/pexels-photo-27082720.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  "https://images.pexels.com/photos/19793978/pexels-photo-19793978.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", workspace: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e?: React.FormEvent, override?: Partial<typeof form>, forceMode?: Mode) {
    e?.preventDefault();
    const payload = { ...form, ...override };
    const m = forceMode ?? mode;
    setError("");

    // Validação client-side com mensagens claras em pt-BR
    if (!payload.email.trim() || !payload.email.includes("@")) {
      return setError("Informe um e-mail válido.");
    }
    if (m === "register" && payload.password.length < 8) {
      return setError("A senha deve ter pelo menos 8 caracteres.");
    }
    if (m === "login" && !payload.password) {
      return setError("Informe sua senha.");
    }
    if (m === "register" && !payload.name.trim()) {
      return setError("Informe seu nome completo.");
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const email = payload.email.trim().toLowerCase();

      if (m === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
        });
        if (error) throw error;
        toast.success("Se o e-mail existir, enviaremos um link de recuperação.");
        setMode("login");
        setLoading(false);
        return;
      }

      if (m === "register") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: payload.password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: { full_name: payload.name.trim(), workspace_name: payload.workspace.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Conta criada! Confirme seu e-mail para ativar o acesso.");
          setMode("login");
          setLoading(false);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: payload.password });
        if (error) throw error;
      }

      // Navega; se o roteador falhar por qualquer motivo, força recarga total.
      router.replace("/dashboard");
      router.refresh();
      setTimeout(() => {
        if (window.location.pathname.startsWith("/login")) {
          window.location.assign("/dashboard");
        }
      }, 1000);
    } catch (err) {
      setError(translateAuthError(err));
      setLoading(false);
    }
  }

  async function loginWithGoogle() {
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
      // O navegador é redirecionado para o Google; nada mais a fazer aqui.
    } catch (err) {
      setError(translateAuthError(err));
    }
  }


  return (
    <div className="flex min-h-dvh bg-background">
      {/* ------------------------------------------------ Form side */}
      <div className="flex w-full flex-col px-6 py-8 sm:px-12 lg:w-[46%] lg:px-16 xl:px-24">
        <div className="flex items-center gap-2.5">
          <Logo size={32} />
          <span className="text-[17px] font-semibold tracking-tight">Postline</span>
        </div>

        <div className="flex flex-1 items-center">
          <motion.div key={mode} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="w-full max-w-105 mx-auto">
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight">
              {mode === "login" && "Bem-vindo de volta"}
              {mode === "register" && "Crie sua conta"}
              {mode === "forgot" && "Recuperar senha"}
            </h1>
            <p className="mt-1.5 text-[14px] text-muted">
              {mode === "login" && "Entre para gerenciar suas redes em um só lugar."}
              {mode === "register" && "Comece a planejar, publicar e analisar em minutos."}
              {mode === "forgot" && "Enviaremos um link de redefinição para seu e-mail."}
            </p>

            <form onSubmit={(e) => void submit(e)} noValidate className="mt-7 space-y-4">
              {mode === "register" && (
                <>
                  <div>
                    <label htmlFor="name" className={labelCls}>Nome completo</label>
                    <div className="relative">
                      <User size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                      <input id="name" className={cn(inputCls, "pl-10")} placeholder="Marina Duarte" value={form.name} onChange={set("name")} required />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="ws" className={labelCls}>Nome da empresa ou agência</label>
                    <div className="relative">
                      <Building2 size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                      <input id="ws" className={cn(inputCls, "pl-10")} placeholder="Aurora Studio" value={form.workspace} onChange={set("workspace")} />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label htmlFor="email" className={labelCls}>E-mail</label>
                <div className="relative">
                  <Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input id="email" type="email" autoComplete="email" className={cn(inputCls, "pl-10")} placeholder="voce@empresa.com" value={form.email} onChange={set("email")} required />
                </div>
              </div>

              {mode !== "forgot" && (
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className={labelCls}>Senha</label>
                    {mode === "login" && (
                      <button type="button" onClick={() => setMode("forgot")} className="mb-1.5 text-[12.5px] font-medium text-accent hover:underline">
                        Esqueceu a senha?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      id="password" type={showPass ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"}
                      className={cn(inputCls, "pl-10 pr-11")} placeholder={mode === "register" ? "Mínimo de 8 caracteres" : "Sua senha"}
                      value={form.password} onChange={set("password")} required minLength={mode === "register" ? 8 : 1}
                    />
                    <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-foreground" aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}>
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}

              {error && <InlineError>{error}</InlineError>}

              <Button id="auth-submit" type="submit" size="lg" loading={loading} className="w-full">
                {mode === "login" ? "Entrar" : mode === "register" ? "Criar conta" : "Enviar link de recuperação"}
                <ArrowRight size={15} />
              </Button>

              {mode !== "forgot" && (
                <>
                  <div className="flex items-center gap-3 py-1">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[12px] text-muted">ou continue com</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <Button type="button" variant="outline" onClick={() => void loginWithGoogle()} className="w-full">
                    <svg width="15" height="15" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"/></svg>
                    Continuar com Google
                  </Button>
                </>
              )}
            </form>

            <p className="mt-6 text-center text-[13px] text-muted">
              {mode === "login" ? (
                <>Ainda não tem conta?{" "}<button onClick={() => setMode("register")} className="font-medium text-accent hover:underline">Criar conta grátis</button></>
              ) : (
                <>Já tem conta?{" "}<button onClick={() => setMode("login")} className="font-medium text-accent hover:underline">Fazer login</button></>
              )}
            </p>
          </motion.div>
        </div>

        <p className="text-center text-[12px] text-muted/70">© 2026 Postline · Privacidade · Termos</p>
      </div>

      {/* ------------------------------------------------ Visual side */}
      <div className="relative hidden flex-1 overflow-hidden lg:block" style={{ background: "linear-gradient(160deg, #241a20 0%, #331d27 45%, #1c1a1e 100%)" }}>
        <div className="absolute inset-0 opacity-[0.15]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)", backgroundSize: "26px 26px" }} />
        <div className="relative flex h-full flex-col justify-center px-14 xl:px-20">
          <div className="grid max-w-130 grid-cols-3 gap-4">
            {PHOTOS.map((src, i) => (
              <motion.div
                key={src}
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className={cn("overflow-hidden rounded-2xl", i % 3 === 1 && "translate-y-6")}
                style={{ aspectRatio: "3/4" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
              </motion.div>
            ))}
          </div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="absolute left-14 top-[16%] xl:left-20">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-3.5 pr-5 backdrop-blur-md">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/20 text-emerald-300"><TrendingUp size={17} /></span>
              <div>
                <p className="text-[13px] font-semibold leading-none text-white">+240% engajamento</p>
                <p className="mt-1 text-[11.5px] text-white/60">últimos 30 dias</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }} className="absolute bottom-[14%] right-14 xl:right-20">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-3.5 pr-5 backdrop-blur-md">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-400/25 text-rose-200"><Heart size={16} /></span>
              <div>
                <p className="text-[13px] font-semibold leading-none text-white">4,2 mil curtidas</p>
                <p className="mt-1 flex items-center gap-1 text-[11.5px] text-white/60"><CheckCircle2 size={11} className="text-emerald-300" /> Publicado agora</p>
              </div>
              <span className="ml-1 flex h-9 w-9 items-center justify-center rounded-xl bg-sky-400/20 text-sky-200"><MessageCircle size={15} /></span>
            </div>
          </motion.div>

          <div className="mt-14 max-w-105">
            <p className="text-[22px] font-semibold leading-snug tracking-tight text-white">
              “A Postline transformou a rotina da agência. Publicamos 3x mais, com metade do esforço.”
            </p>
            <p className="mt-3 text-[13.5px] text-white/55">Marina Duarte — Aurora Studio</p>
          </div>
        </div>
      </div>
    </div>
  );
}
