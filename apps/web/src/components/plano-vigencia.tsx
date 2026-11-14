import { dataIsoParaBR, ROTULO_PLANO } from '@jat/core';
import { CalendarCheck2, CalendarClock } from 'lucide-react';
import type { ReactNode } from 'react';
import { FormAtivacao } from '@/components/licenca';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDataHora } from '@/lib/format';
import { useLicenca } from '@/lib/licenca';

/** Aba "Plano de vigência" em Configurações (só Admin). */
export function PlanoVigencia() {
  const { data, isPending } = useLicenca();

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck2 className="text-primary size-4" />
            Plano atual
          </CardTitle>
          <CardDescription>
            O sistema fica bloqueado para todos quando o plano vence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPending || !data ? (
            <Skeleton className="h-32 w-full" />
          ) : !data.vencimento || !data.plano ? (
            <p className="text-muted-foreground text-sm">Sem informações do plano.</p>
          ) : (
            <dl className="grid gap-3 text-sm">
              <Linha rotulo="Situação">
                {data.aviso ? (
                  <Badge className="bg-brand-accent/12 text-brand-accent border-transparent">
                    <CalendarClock className="size-3" />
                    Vence em breve
                  </Badge>
                ) : (
                  <Badge variant="success">Ativo</Badge>
                )}
              </Linha>
              <Linha rotulo="Plano">{ROTULO_PLANO[data.plano]}</Linha>
              <Linha rotulo="Vence em">
                <span className="font-semibold tabular-nums">{dataIsoParaBR(data.vencimento)}</span>
                {data.diasRestantes != null && (
                  <span className="text-muted-foreground ml-1.5">
                    (
                    {data.diasRestantes === 0
                      ? 'hoje'
                      : `${data.diasRestantes} ${data.diasRestantes === 1 ? 'dia' : 'dias'}`}
                    )
                  </span>
                )}
              </Linha>
              {data.ativadoEm && (
                <Linha rotulo="Última ativação">
                  <span className="tabular-nums">{formatDataHora(data.ativadoEm)}</span>
                  {data.ativadoPor && (
                    <span className="text-muted-foreground"> por {data.ativadoPor}</span>
                  )}
                </Linha>
              )}
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Renovar plano</CardTitle>
          <CardDescription>
            O novo prazo é somado ao tempo que ainda falta. Exige a senha mestre de ativação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormAtivacao comCredenciais={false} rotuloBotao="Renovar plano" />
        </CardContent>
      </Card>
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b pb-3 last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
