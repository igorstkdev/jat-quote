import { formatBRL } from '@jat/core';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Clock,
  Database,
  RefreshCw,
  Server,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiGet, type HealthResponse } from '@/lib/api';

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function App() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<HealthResponse>('/api/health'),
    retry: false,
  });

  return (
    <div className="min-h-svh">
      <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <Badge variant="outline" className="mb-4">
            v1.0 beta · Fase 0
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Status do sistema
          </h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-pretty">
            Verificação de ponta a ponta: esta página chama a API, que consulta o banco PostgreSQL.
          </p>
        </motion.div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <OverallStatus state={health.status} message={health.error?.message} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void health.refetch()}
            disabled={health.isFetching}
          >
            <RefreshCw className={health.isFetching ? 'animate-spin' : undefined} />
            Verificar novamente
          </Button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard
            icon={<Server />}
            title="API"
            loading={health.isPending}
            ok={health.isSuccess}
            value={health.data?.api.name}
            detail={health.data ? `versão ${health.data.api.version}` : undefined}
          />
          <StatusCard
            icon={<Database />}
            title="Banco de dados"
            loading={health.isPending}
            ok={health.isSuccess}
            value={health.data?.database.version}
            detail={
              health.data ? `${health.data.database.settings} configurações salvas` : undefined
            }
          />
          <StatusCard
            icon={<Clock />}
            title="Hora do servidor"
            loading={health.isPending}
            ok={health.isSuccess}
            value={
              health.data ? dateTime.format(new Date(health.data.database.serverTime)) : undefined
            }
            detail="America/Sao_Paulo"
            mono
          />
          <StatusCard
            icon={<Calculator />}
            title="Núcleo de cálculo"
            loading={false}
            ok
            value={formatBRL('1234.565')}
            detail="Decimal, arredondamento comercial"
            mono
          />
        </div>
      </main>
    </div>
  );
}

function OverallStatus({ state, message }: { state: string; message?: string }) {
  if (state === 'pending') {
    return <Skeleton className="h-6 w-56" />;
  }
  if (state === 'error') {
    return (
      <div role="alert" className="text-destructive flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="size-4" />
        {message}
      </div>
    );
  }
  return (
    <div className="text-success flex items-center gap-2 text-sm font-medium">
      <CheckCircle2 className="size-4" />
      Todos os serviços operacionais
    </div>
  );
}

interface StatusCardProps {
  icon: ReactNode;
  title: string;
  loading: boolean;
  ok: boolean;
  value?: string;
  detail?: string;
  mono?: boolean;
}

function StatusCard({ icon, title, loading, ok, value, detail, mono }: StatusCardProps) {
  return (
    <Card className="gap-4" data-testid={`status-${title}`}>
      <CardHeader className="flex flex-row items-center justify-between">
        <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg [&>svg]:size-4.5">
          {icon}
        </span>
        {!loading && (
          <span
            className={
              ok
                ? 'bg-success size-2 rounded-full shadow-[0_0_0_4px] shadow-success/15'
                : 'bg-destructive size-2 rounded-full shadow-[0_0_0_4px] shadow-destructive/15'
            }
            aria-label={ok ? 'Operacional' : 'Indisponível'}
          />
        )}
      </CardHeader>
      <CardContent className="grid gap-1">
        <CardDescription>{title}</CardDescription>
        {loading ? (
          <>
            <Skeleton className="mt-1 h-5 w-3/4" />
            <Skeleton className="mt-1 h-4 w-1/2" />
          </>
        ) : (
          <>
            <CardTitle className={mono ? 'tabular text-base' : 'text-base'}>
              {value ?? '—'}
            </CardTitle>
            <p className="text-muted-foreground text-xs">{detail ?? 'Indisponível'}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
