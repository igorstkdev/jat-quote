import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, Page } from '@/components/page';
import { Button } from '@/components/ui/button';

export default function NaoEncontradaPage() {
  return (
    <Page>
      <EmptyState
        icone={Compass}
        titulo="Página não encontrada"
        descricao="O endereço não existe ou você não tem acesso a ele."
        acao={
          <Button asChild>
            <Link to="/">Ir para o início</Link>
          </Button>
        }
      />
    </Page>
  );
}
