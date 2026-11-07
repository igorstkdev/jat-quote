import { Construction } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { TODOS_ITENS } from '@/components/layout/nav';
import { EmptyState, Page, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';

export default function EmBrevePage() {
  const { pathname } = useLocation();
  const item = TODOS_ITENS.find((i) => i.to === pathname);
  return (
    <Page>
      <PageHeader titulo={item?.rotulo ?? 'Em breve'} descricao={item?.descricao} />
      <div className="bg-card rounded-xl border border-dashed">
        <EmptyState
          icone={Construction}
          titulo={`Este módulo chega na Fase ${item?.fase ?? '—'}`}
          descricao="O núcleo de cálculo já está pronto e testado. A tela será liberada assim que a fase for validada."
          acao={
            <Button asChild variant="outline">
              <Link to="/">Voltar ao início</Link>
            </Button>
          }
        />
      </div>
    </Page>
  );
}
