import {
  BarChart3,
  Building2,
  Calculator,
  FileText,
  House,
  type LucideIcon,
  Package,
  Plane,
  ScrollText,
  Settings,
  Truck,
  UserCog,
} from 'lucide-react';

export interface ItemNav {
  to: string;
  rotulo: string;
  icone: LucideIcon;
  /** Palavras extras para a paleta de comandos. */
  palavras?: string;
  /** Módulo das próximas fases. */
  emBreve?: boolean;
  /** Fase em que o módulo chega (para a tela "Em breve"). */
  fase?: number;
  descricao?: string;
  somenteAdmin?: boolean;
}

export interface GrupoNav {
  titulo: string;
  itens: ItemNav[];
}

export const NAV: GrupoNav[] = [
  {
    titulo: 'Operação',
    itens: [
      { to: '/', rotulo: 'Início', icone: House },
      {
        to: '/spot',
        rotulo: 'Frete Spot',
        icone: Calculator,
        palavras: 'cotação calculadora aéreo rodoviário',
        emBreve: true,
        fase: 3,
        descricao: 'Cotação de frete aéreo e rodoviário com markup, pedágio e ad valorem.',
      },
      {
        to: '/cubagem',
        rotulo: 'Cubagem',
        icone: Package,
        palavras: 'peso cubado taxado volumes',
        emBreve: true,
        fase: 3,
        descricao: 'Peso cubado e peso taxado de vários volumes, aéreo e rodoviário.',
      },
      {
        to: '/tarifas-aereas',
        rotulo: 'Tarifas Aéreas',
        icone: Plane,
        palavras: 'gol azul latam iata',
        emBreve: true,
        fase: 4,
        descricao: 'Base de tarifas GOL, AZUL e LATAM e calculadora rápida por rota.',
      },
      {
        to: '/ftl',
        rotulo: 'FTL Fiat',
        icone: Truck,
        palavras: 'km tabela van utilitário',
        emBreve: true,
        fase: 4,
        descricao: 'Calculadora por km, tabelas de preço por UF e histórico de cotações.',
      },
    ],
  },
  {
    titulo: 'Análise',
    itens: [
      {
        to: '/dashboard',
        rotulo: 'Dashboard',
        icone: BarChart3,
        palavras: 'kpi gráficos conversão',
        emBreve: true,
        fase: 5,
        descricao: 'Indicadores, conversão, volume mensal e principais rotas.',
      },
      {
        to: '/relatorios',
        rotulo: 'Relatório Spot',
        icone: FileText,
        palavras: 'excel status cotações',
        emBreve: true,
        fase: 5,
        descricao: 'Filtros, estatísticas, visão cliente/operação e exportação Excel.',
      },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [{ to: '/clientes', rotulo: 'Clientes', icone: Building2, palavras: 'cnpj empresa' }],
  },
  {
    titulo: 'Administração',
    itens: [
      {
        to: '/admin/usuarios',
        rotulo: 'Usuários',
        icone: UserCog,
        palavras: 'perfil senha acesso',
        somenteAdmin: true,
      },
      {
        to: '/admin/configuracoes',
        rotulo: 'Configurações',
        icone: Settings,
        palavras: 'ad valorem links condições ftl',
        somenteAdmin: true,
      },
      {
        to: '/admin/auditoria',
        rotulo: 'Auditoria',
        icone: ScrollText,
        palavras: 'log histórico',
        somenteAdmin: true,
      },
    ],
  },
];

export const TODOS_ITENS = NAV.flatMap((g) => g.itens);

export function gruposVisiveis(admin: boolean): GrupoNav[] {
  return NAV.map((g) => ({ ...g, itens: g.itens.filter((i) => admin || !i.somenteAdmin) })).filter(
    (g) => g.itens.length > 0,
  );
}
