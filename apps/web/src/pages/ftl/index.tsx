import { Calculator, FileText, Table2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { Page, PageHeader } from '@/components/page';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import NaoEncontradaPage from '@/pages/nao-encontrada';
import { CalculadoraFtl } from './calculadora';
import { RelatorioFtl } from './relatorio';
import { TabelasFtl } from './tabelas';

const ABAS = {
  calculadora: { rotulo: 'Calculadora', icone: Calculator },
  tabelas: { rotulo: 'Tabelas de Preço', icone: Table2 },
  relatorio: { rotulo: 'Relatório', icone: FileText },
} as const;
type Aba = keyof typeof ABAS;

/** Módulo FTL Fiat com 3 abas, como no app atual (CLAUDE.md §3.4). */
export default function FtlPage() {
  const { aba = 'calculadora' } = useParams();
  const navigate = useNavigate();
  if (!(aba in ABAS)) return <NaoEncontradaPage />;
  const atual = aba as Aba;

  return (
    <Page>
      <PageHeader
        titulo="FTL Fiat"
        descricao="Frete por km com as tabelas de preço por UF. Sem pedágio e sem markup."
      />
      <Tabs
        value={atual}
        onValueChange={(v) => void navigate(v === 'calculadora' ? '/ftl' : `/ftl/${v}`)}
        className="mb-6"
      >
        <TabsList>
          {(Object.keys(ABAS) as Aba[]).map((k) => {
            const { rotulo, icone: Icone } = ABAS[k];
            return (
              <TabsTrigger key={k} value={k} className="gap-1.5 px-3">
                <Icone className="size-4" />
                {rotulo}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      {atual === 'calculadora' && <CalculadoraFtl />}
      {atual === 'tabelas' && <TabelasFtl />}
      {atual === 'relatorio' && <RelatorioFtl />}
    </Page>
  );
}
