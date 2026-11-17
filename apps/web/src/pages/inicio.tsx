import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';
import { gruposVisiveis } from '@/components/layout/nav';
import { Page } from '@/components/page';
import { ehAdmin, useMe } from '@/lib/auth';
import { primeiroNome, saudacao } from '@/lib/format';
import { cn } from '@/lib/utils';

const dataExtenso = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export default function InicioPage() {
  const { data: user } = useMe();
  if (!user) return null;
  const modulos = gruposVisiveis(ehAdmin(user))
    .flatMap((g) => g.itens.map((i) => ({ ...i, grupo: g.titulo })))
    .filter((i) => i.to !== '/');

  return (
    <Page>
      <div className="mb-8 flex flex-col gap-1">
        <p className="text-muted-foreground text-sm first-letter:uppercase">
          {dataExtenso.format(new Date())}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {saudacao()}, {primeiroNome(user.name)}
        </h1>
        <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
          Acesse um módulo abaixo ou pressione
          <kbd>Ctrl K</kbd>
          para buscar qualquer tela.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modulos.map((m) => {
          const Icone = m.icone;
          return (
            <Link
              key={m.to}
              to={m.to}
              className={cn(
                'group bg-card relative flex flex-col rounded-xl border p-5 shadow-xs transition-all',
                'hover:border-primary/40 hover:shadow-md focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]',
              )}
            >
              <div className="flex items-start justify-between">
                <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                  <Icone className="size-5" />
                </span>
                {m.emBreve ? (
                  <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">
                    Fase {m.fase}
                  </span>
                ) : (
                  <ArrowUpRight className="text-muted-foreground group-hover:text-quote size-4 transition-colors" />
                )}
              </div>
              <div className="mt-4">
                <div className="text-muted-foreground text-xs font-medium">{m.grupo}</div>
                <div className="mt-0.5 font-semibold">{m.rotulo}</div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {m.descricao ?? DESCRICOES[m.to] ?? ''}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </Page>
  );
}

const DESCRICOES: Record<string, string> = {
  '/clientes': 'Cadastro de clientes com busca em tempo real.',
  '/admin/usuarios': 'Acessos, perfis, permissão de tarifas e senhas.',
  '/admin/configuracoes': 'Links úteis, ad valorem padrão e condições do FTL.',
  '/admin/auditoria': 'Quem fez o quê e quando, com os valores alterados.',
};
