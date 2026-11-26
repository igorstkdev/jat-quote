import { motion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, Loader2, Plane, ShieldCheck, Truck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { FormError } from '@/components/field';
import { AcessoDemo } from '@/components/demo';
import { Logo } from '@/components/logo';
import { LOGIN_DEMO, useEdicao } from '@/lib/edicao';
import { Rodape } from '@/components/rodape';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLogin, useMe } from '@/lib/auth';

export default function LoginPage() {
  const { data: user } = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const { demo, produto } = useEdicao();

  useEffect(() => {
    document.title = `Entrar · ${produto}`;
  }, [produto]);

  const destino = (location.state as { de?: string } | null)?.de ?? '/';
  if (user) return <Navigate to={user.mustChangePassword ? '/trocar-senha' : destino} replace />;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    login.mutate(
      { username, password },
      {
        onSuccess: ({ user: u }) =>
          navigate(u.mustChangePassword ? '/trocar-senha' : destino, { replace: true }),
      },
    );
  };

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      {/* Painel da marca */}
      <div className="relative hidden overflow-hidden bg-[oklch(0.22_0.04_264)] lg:block">
        <div
          aria-hidden
          className="absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(60rem 40rem at 10% 10%, color-mix(in oklch, var(--brand) 55%, transparent), transparent 60%), radial-gradient(50rem 35rem at 90% 90%, color-mix(in oklch, var(--brand-accent) 45%, transparent), transparent 60%)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Logo branco tamanho="lg" />
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="max-w-md"
          >
            <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance">
              Cotações de frete rápidas, precisas e{' '}
              <span className="from-quote to-quote-2 bg-gradient-to-r bg-clip-text text-transparent">
                rastreáveis.
              </span>
            </h1>
            <p className="mt-4 text-white/70">
              Aéreo, rodoviário e FTL em um só lugar, com cálculo em tempo real e histórico completo
              de cada cotação.
            </p>
            <div className="mt-8 grid gap-3 text-sm text-white/80">
              <Destaque icone={<Plane className="size-4" />} texto="Tarifas GOL, AZUL e LATAM" />
              <Destaque icone={<Truck className="size-4" />} texto="Frete Spot e FTL Fiat" />
              <Destaque
                icone={<ShieldCheck className="size-4" />}
                texto="Acesso por perfil e auditoria"
              />
            </div>
          </motion.div>
          <p className="text-xs text-white/50">
            {demo
              ? 'Ambiente de demonstração · dados fictícios'
              : 'JAT Transportes e Logística · uso interno'}
          </p>
        </div>
      </div>

      {/* Formulário */}
      <div className="relative flex flex-col">
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="absolute top-4 right-4">
            <ThemeToggle />
          </div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="w-full max-w-sm"
          >
            <div className="mb-8 lg:hidden">
              <Logo />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Entrar</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Use o usuário e a senha fornecidos pelo administrador.
            </p>

            {demo && (
              <AcessoDemo
                onUsar={() => {
                  setUsername(LOGIN_DEMO.usuario);
                  setPassword(LOGIN_DEMO.senha);
                }}
              />
            )}
            <form onSubmit={enviar} className="mt-8 grid gap-4" noValidate>
              <FormError mensagem={login.error?.message} />
              <div className="grid gap-1.5">
                <Label htmlFor="username">Usuário</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  autoFocus
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={verSenha ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setVerSenha((v) => !v)}
                    className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center"
                    aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {verSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" size="lg" className="mt-2 h-10" disabled={login.isPending}>
                {login.isPending ? <Loader2 className="animate-spin" /> : null}
                Entrar
                {!login.isPending && <ArrowRight />}
              </Button>
            </form>
            <p className="text-muted-foreground mt-8 text-xs">
              Esqueceu a senha? Peça ao administrador para redefini-la.
            </p>
          </motion.div>
        </div>
        <Rodape />
      </div>
    </div>
  );
}

function Destaque({ icone, texto }: { icone: React.ReactNode; texto: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
        {icone}
      </span>
      {texto}
    </div>
  );
}
