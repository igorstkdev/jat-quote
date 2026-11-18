import { useQueryClient } from '@tanstack/react-query';
import { dataIsoParaBR, PLANOS_LICENCA, type PlanoLicenca } from '@jat/core';
import { motion } from 'framer-motion';
import { CalendarClock, Eye, EyeOff, KeyRound, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/field';
import { Logo } from '@/components/logo';
import { Rodape } from '@/components/rodape';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, definirAoBloquearLicenca } from '@/lib/api';
import { CHAVE_LICENCA, useAtivarLicenca, useLicenca, type EstadoLicenca } from '@/lib/licenca';
import { cn } from '@/lib/utils';

/** Nome e duração de cada plano nos cartões de escolha. */
const CARTAO_PLANO: Record<PlanoLicenca, { titulo: string; duracao: string }> = {
  MENSAL: { titulo: 'Mensal', duracao: '1 mês' },
  TRIMESTRAL: { titulo: 'Trimestral', duracao: '3 meses' },
  SEMESTRAL: { titulo: 'Semestral', duracao: '6 meses' },
  ANUAL: { titulo: 'Anual', duracao: '1 ano' },
  VITALICIO: { titulo: 'Vitalício', duracao: 'sem vencimento' },
};

/** Escolha do plano em cartões (grupo de rádio acessível). */
export function SeletorPlano({
  valor,
  onChange,
}: {
  valor: PlanoLicenca | null;
  onChange: (p: PlanoLicenca) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Plano" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {PLANOS_LICENCA.map((p) => {
        const marcado = valor === p;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={marcado}
            onClick={() => onChange(p)}
            className={cn(
              'rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              marcado
                ? 'border-primary bg-primary/8 ring-primary ring-1'
                : 'hover:bg-muted/60 hover:border-foreground/20',
            )}
          >
            <div className="text-sm font-semibold">{CARTAO_PLANO[p].titulo}</div>
            <div className="text-muted-foreground text-xs">{CARTAO_PLANO[p].duracao}</div>
          </button>
        );
      })}
    </div>
  );
}

function CampoSenha({
  id,
  valor,
  onChange,
  autoComplete = 'off',
}: {
  id: string;
  valor: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={ver ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 pr-10"
      />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center"
        aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}
      >
        {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/**
 * Formulário de ativação/renovação. `comCredenciais`: pede usuário e senha do Admin
 * (tela de bloqueio). Em Configurações o Admin já está logado e informa só a senha mestre.
 */
export function FormAtivacao({
  comCredenciais,
  rotuloBotao,
  onAtivado,
}: {
  comCredenciais: boolean;
  rotuloBotao: string;
  onAtivado?: (e: EstadoLicenca) => void;
}) {
  const ativar = useAtivarLicenca();
  const qc = useQueryClient();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [senhaMestre, setSenhaMestre] = useState('');
  const [plano, setPlano] = useState<PlanoLicenca | null>(null);
  const [erroPlano, setErroPlano] = useState<string | null>(null);

  const campo = ativar.error instanceof ApiError ? (ativar.error.campo ?? null) : null;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!plano) {
      setErroPlano('Escolha o plano.');
      return;
    }
    setErroPlano(null);
    ativar.mutate(
      { ...(comCredenciais ? { usuario, senha } : {}), senhaMestre, plano },
      {
        onSuccess: (estado) => {
          setSenhaMestre('');
          setSenha('');
          toast.success(
            estado.plano === 'VITALICIO'
              ? 'Sistema ativado: plano Vitalício, sem vencimento.'
              : estado.vencimento
                ? `Sistema ativo até ${dataIsoParaBR(estado.vencimento)}.`
                : 'Sistema ativado.',
          );
          // Recarrega o que estava bloqueado.
          void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== CHAVE_LICENCA[0] });
          onAtivado?.(estado);
        },
      },
    );
  };

  return (
    <form onSubmit={enviar} className="grid gap-4" noValidate>
      <FormError
        mensagem={campo === 'senhaMestre' || campo === 'senha' ? null : ativar.error?.message}
      />
      {comCredenciais && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ativ-usuario" rotulo="Usuário do Admin">
            <Input
              id="ativ-usuario"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              className="h-10"
            />
          </Field>
          <Field
            id="ativ-senha"
            rotulo="Senha do Admin"
            erro={campo === 'senha' ? ativar.error?.message : null}
          >
            <CampoSenha
              id="ativ-senha"
              valor={senha}
              onChange={setSenha}
              autoComplete="current-password"
            />
          </Field>
        </div>
      )}
      <Field
        id="ativ-mestre"
        rotulo="Senha mestre de ativação"
        erro={campo === 'senhaMestre' ? ativar.error?.message : null}
        dica="Fornecida pelo responsável pelo sistema."
      >
        <CampoSenha id="ativ-mestre" valor={senhaMestre} onChange={setSenhaMestre} />
      </Field>
      <div className="grid gap-1.5">
        <span className="text-sm leading-none font-medium">Plano de vigência</span>
        <SeletorPlano valor={plano} onChange={(p) => (setPlano(p), setErroPlano(null))} />
        {erroPlano && (
          <p className="text-destructive text-xs" role="alert">
            {erroPlano}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" className="mt-1 h-10" disabled={ativar.isPending}>
        {ativar.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
        {rotuloBotao}
      </Button>
    </form>
  );
}

const TITULO: Record<NonNullable<EstadoLicenca['motivo']>, string> = {
  NAO_ATIVADA: 'Ativação do sistema',
  VENCIDA: 'Plano de vigência vencido',
  INVALIDA: 'Licença inválida',
  RELOGIO: 'Relógio do servidor alterado',
};

const EXPLICACAO: Record<NonNullable<EstadoLicenca['motivo']>, string> = {
  NAO_ATIVADA:
    'Antes do primeiro uso, um Admin precisa ativar o JAT Quote e escolher o plano de vigência.',
  VENCIDA:
    'O sistema fica bloqueado até um Admin renovar o plano com a senha mestre de ativação. Os dados continuam guardados.',
  INVALIDA:
    'A licença gravada não confere. Um Admin precisa ativar novamente com a senha mestre de ativação.',
  RELOGIO:
    'A data do servidor está anterior ao último uso do sistema. Corrija a data do Windows ou ative novamente com a senha mestre.',
};

/** Tela única mostrada a todos enquanto o sistema está bloqueado. */
export function TelaAtivacao({ estado }: { estado: EstadoLicenca }) {
  const motivo = estado.motivo ?? 'NAO_ATIVADA';
  useEffect(() => {
    document.title = 'Sistema bloqueado · JAT Quote';
  }, []);
  return (
    <div className="relative flex min-h-svh flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-40"
        style={{
          background:
            'radial-gradient(50rem 30rem at 15% 0%, color-mix(in oklch, var(--brand) 14%, transparent), transparent 70%), radial-gradient(40rem 28rem at 100% 100%, color-mix(in oklch, var(--brand-accent) 10%, transparent), transparent 70%)',
        }}
      />
      <header className="relative flex h-16 items-center justify-between px-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="relative flex flex-1 items-center justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="bg-card w-full max-w-xl rounded-2xl border p-6 shadow-sm sm:p-8"
        >
          <div className="flex items-start gap-4">
            <span
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-xl ring-1',
                motivo === 'NAO_ATIVADA'
                  ? 'bg-primary/10 text-primary ring-primary/20'
                  : 'bg-destructive/10 text-destructive ring-destructive/20',
              )}
            >
              {motivo === 'NAO_ATIVADA' ? (
                <ShieldCheck className="size-5" />
              ) : (
                <Lock className="size-5" />
              )}
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{TITULO[motivo]}</h1>
              <p className="text-muted-foreground mt-1 text-sm">{EXPLICACAO[motivo]}</p>
            </div>
          </div>
          <div className="mt-6">
            <FormAtivacao
              comCredenciais
              rotuloBotao={motivo === 'NAO_ATIVADA' ? 'Ativar sistema' : 'Liberar sistema'}
            />
          </div>
        </motion.div>
      </main>
      <Rodape className="relative" />
    </div>
  );
}

/** Mostra a tela de ativação no lugar do sistema enquanto a licença não for válida. */
export function LicencaGate({ children }: { children: ReactNode }) {
  const licenca = useLicenca();
  const qc = useQueryClient();

  useEffect(() => {
    definirAoBloquearLicenca(() => void qc.invalidateQueries({ queryKey: CHAVE_LICENCA }));
    return () => definirAoBloquearLicenca(null);
  }, [qc]);

  if (licenca.isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="animate-pulse">
          <Logo link={false} />
        </div>
      </div>
    );
  }
  if (licenca.isError) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
        <Logo link={false} />
        <p role="alert" className="text-destructive max-w-sm text-sm">
          {licenca.error.message}
        </p>
        <Button variant="outline" onClick={() => void licenca.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }
  if (licenca.data.bloqueado) return <TelaAtivacao estado={licenca.data} />;
  return <>{children}</>;
}

/** Faixa para Admins quando faltam até 15 dias para vencer. */
export function AvisoLicenca() {
  const { data } = useLicenca();
  if (!data?.aviso || !data.vencimento || data.diasRestantes == null) return null;
  const d = data.diasRestantes;
  const quando = d === 0 ? 'vence hoje' : d === 1 ? 'vence amanhã' : `vence em ${d} dias`;
  return (
    <div
      role="status"
      className="border-brand-accent/30 bg-brand-accent/10 flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm md:px-6"
    >
      <CalendarClock className="text-brand-accent size-4 shrink-0" />
      <span>
        O plano de vigência do sistema <strong className="font-semibold">{quando}</strong> (
        {dataIsoParaBR(data.vencimento)}). Depois disso o sistema fica bloqueado.
      </span>
      <Button asChild size="sm" variant="outline" className="ml-auto h-7">
        <Link to="/admin/configuracoes?aba=licenca">Renovar</Link>
      </Button>
    </div>
  );
}
