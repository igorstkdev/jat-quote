import {
  AD_VALOREM_PADRAO,
  calcularFtl,
  calcularSpot,
  TOPICOS_AEREO_PADRAO,
  type VeiculoFtl,
} from '@jat/core';
import type { Db } from '../db.js';
import type { Prisma, QuoteStatus } from '../generated/prisma/client.js';
import { hashSenha } from './password.js';
import { tarifaFtlCore } from './ftl.js';
import { CHAVES } from './settings.js';

/**
 * Edição de DEMONSTRAÇÃO (25/11/2026): banco só com dados fictícios, para apresentar o produto.
 * `popularDemo` APAGA TUDO e recria um cenário completo (clientes, tarifas, tabelas FTL,
 * ~12 meses de cotações). Só pode rodar com a edição demo — nunca no sistema real.
 */
export const EMPRESA_DEMO = 'Transportadora Exemplo';
export const USUARIO_DEMO = 'visitante';
/** Senha fixa da demo: aparece na tela de login da edição demo. */
export const SENHA_DEMO = 'quote2026';

/** Gerador pseudoaleatório com semente: a demo sai sempre igual (datas relativas a hoje). */
function sorteador(semente: number) {
  let s = semente >>> 0;
  const proximo = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    numero: proximo,
    entre: (a: number, b: number) => a + proximo() * (b - a),
    item: <T>(lista: readonly T[]): T => lista[Math.floor(proximo() * lista.length)]!,
  };
}

const CLIENTES = [
  ['Aurora Autopeças Ltda.', 'Marina Lopes', 'logistica@aurora-autopecas.example'],
  ['Brisa Cosméticos S.A.', 'Paulo Henrique', 'compras@brisacosmeticos.example'],
  ['Cerrado Agro Insumos', 'Lívia Martins', 'expedicao@cerradoagro.example'],
  ['Delta Eletrônicos', 'Rafael Nunes', 'suprimentos@deltaeletronicos.example'],
  ['Estrela Têxtil', 'Camila Duarte', 'logistica@estrelatextil.example'],
  ['Fenix Embalagens', 'Gustavo Ribeiro', 'pcp@fenixembalagens.example'],
  ['Granito Construções', 'Tatiane Rocha', 'obras@granito.example'],
  ['Horizonte Farmacêutica', 'Eduardo Pires', 'distribuicao@horizontefarma.example'],
  ['Ipê Móveis Planejados', 'Bianca Teixeira', 'pedidos@ipemoveis.example'],
  ['Jade Alimentos', 'Felipe Moreira', 'logistica@jadealimentos.example'],
  ['Kappa Máquinas Industriais', 'Renata Campos', 'expedicao@kappamaquinas.example'],
  ['Lumen Iluminação', 'Diego Carvalho', 'compras@lumen.example'],
  ['Maré Pescados', 'Aline Barros', 'vendas@marepescados.example'],
  ['Norte Sul Distribuidora', 'Bruno Farias', 'operacao@nortesul.example'],
  ['Órbita Tecnologia', 'Sabrina Melo', 'ti@orbita.example'],
  ['Pampa Couros', 'Leonardo Vieira', 'exportacao@pampacouros.example'],
  ['Quartzo Vidros', 'Isabela Castro', 'logistica@quartzovidros.example'],
  ['Rota Verde Orgânicos', 'Thiago Mendes', 'pedidos@rotaverde.example'],
  ['Solaris Energia', 'Patrícia Gomes', 'suprimentos@solaris.example'],
  ['Tupi Bebidas', 'Marcelo Azevedo', 'distribuicao@tupibebidas.example'],
  ['Urbano Calçados', 'Fernanda Lima', 'logistica@urbanocalcados.example'],
  ['Vale do Aço Metalúrgica', 'Ricardo Souza', 'expedicao@valedoaco.example'],
  ['Xingu Papel e Celulose', 'Juliana Araújo', 'compras@xingupapel.example'],
  ['Zênite Hospitalar', 'André Correia', 'suprimentos@zenitehospitalar.example'],
] as const;

/** Rotas plausíveis (cidades oficiais do IBGE) e custo-base aproximado do trecho. */
const ROTAS: readonly [string, string, string, string, number][] = [
  ['São Paulo', 'SP', 'Salvador', 'BA', 1900],
  ['Campinas', 'SP', 'Recife', 'PE', 2600],
  ['Belo Horizonte', 'MG', 'Curitiba', 'PR', 1300],
  ['São Paulo', 'SP', 'Manaus', 'AM', 4200],
  ['Betim', 'MG', 'Rio de Janeiro', 'RJ', 800],
  ['Guarulhos', 'SP', 'Fortaleza', 'CE', 3000],
  ['Contagem', 'MG', 'Goiânia', 'GO', 1100],
  ['Joinville', 'SC', 'Porto Alegre', 'RS', 700],
  ['Sorocaba', 'SP', 'Brasília', 'DF', 1250],
  ['Rio de Janeiro', 'RJ', 'Vitória', 'ES', 650],
  ['Uberlândia', 'MG', 'Campo Grande', 'MS', 1000],
  ['Curitiba', 'PR', 'Florianópolis', 'SC', 450],
  ['Feira de Santana', 'BA', 'Aracaju', 'SE', 420],
  ['São José dos Campos', 'SP', 'Belém', 'PA', 3800],
  ['Jundiaí', 'SP', 'Cuiabá', 'MT', 2000],
];
const ROTAS_AEREAS: readonly [string, string][] = [
  ['GRU', 'SSA'],
  ['GRU', 'REC'],
  ['GRU', 'MAO'],
  ['GRU', 'FOR'],
  ['CNF', 'CWB'],
  ['CNF', 'GIG'],
  ['VCP', 'BEL'],
  ['VCP', 'BSB'],
  ['GIG', 'POA'],
  ['CGH', 'FLN'],
];
/** UF, região e tarifa-base por km (VAN, capital). */
const UFS_FTL: readonly [string, string, number][] = [
  ['AC', 'Norte', 5.2],
  ['AL', 'Nordeste', 4.3],
  ['AM', 'Norte', 5.4],
  ['AP', 'Norte', 5.3],
  ['BA', 'Nordeste', 4.2],
  ['CE', 'Nordeste', 4.4],
  ['DF', 'Centro-Oeste', 3.9],
  ['ES', 'Sudeste', 3.7],
  ['GO', 'Centro-Oeste', 3.8],
  ['MA', 'Nordeste', 4.6],
  ['MG', 'Sudeste', 3.8],
  ['MS', 'Centro-Oeste', 4.0],
  ['MT', 'Centro-Oeste', 4.3],
  ['PA', 'Norte', 4.9],
  ['PB', 'Nordeste', 4.4],
  ['PE', 'Nordeste', 4.3],
  ['PI', 'Nordeste', 4.6],
  ['PR', 'Sul', 3.75],
  ['RJ', 'Sudeste', 3.9],
  ['RN', 'Nordeste', 4.5],
  ['RO', 'Norte', 5.0],
  ['RR', 'Norte', 5.5],
  ['RS', 'Sul', 3.9],
  ['SC', 'Sul', 3.8],
  ['SE', 'Nordeste', 4.3],
  ['SP', 'Sudeste', 3.6],
  ['TO', 'Norte', 4.7],
];

const TOPICOS_RODOVIARIO_DEMO = [
  'Cotação válida para carga seca, paletizada e não perigosa.',
  'ICMS e seguro a incluir.',
  'Coleta e entrega em horário comercial, de segunda a sexta-feira.',
  'Em caso de coleta ou entrega frustrada, haverá cobrança de taxa adicional.',
  'Valores sujeitos a alteração se peso ou dimensões forem diferentes do informado.',
];
const CONDICOES_FTL_DEMO =
  `O atendimento só pode ser acionado com a carga e a nota fiscal liberadas. Prazo de pagamento de ` +
  `30 dias. Free time de 3 horas na coleta e 3 horas na entrega. Impostos e seguro a incluir. ` +
  `Atendimento sujeito à disponibilidade de veículo. ${EMPRESA_DEMO}.`;

const c2 = (n: number) => n.toFixed(2);

/** Apaga tudo e recria o cenário de demonstração. Devolve quantas cotações criou. */
export async function popularDemo(db: Db, agora: Date = new Date()): Promise<{ cotacoes: number }> {
  const r = sorteador(20261125);
  const dia = 86_400_000;

  await db.$executeRawUnsafe(`
    truncate table audit_logs, sessions, quote_status_changes, quotes, air_rate_history, air_rates,
      ftl_rate_history, ftl_rates, clients, useful_links, settings, users restart identity cascade
  `);

  // Usuários: o visitante (Admin, senha fixa) e duas operadoras fictícias (sem login).
  const senhaTravada = await hashSenha(`bloqueada-${agora.getTime()}-${Math.random()}`);
  const visitante = await db.user.create({
    data: {
      username: USUARIO_DEMO,
      name: 'Visitante',
      role: 'ADMIN',
      canEditRates: true,
      passwordHash: await hashSenha(SENHA_DEMO),
      mustChangePassword: false,
    },
  });
  const operadores = await Promise.all(
    [
      ['carla.mendes', 'Carla Mendes'],
      ['joao.batista', 'João Batista'],
    ].map(([username, name]) =>
      db.user.create({
        data: {
          username: username!,
          name: name!,
          role: 'OPERACIONAL',
          passwordHash: senhaTravada,
          mustChangePassword: false,
        },
      }),
    ),
  );
  const autores = [visitante, ...operadores];

  // Configurações
  const condicoes = (formato: 'TOPICOS' | 'TEXTO', topicos: readonly string[], texto = '') => ({
    formato,
    topicos: [...topicos],
    texto,
  });
  const ftlTexto = condicoes('TEXTO', [], CONDICOES_FTL_DEMO);
  const settings: [string, Prisma.InputJsonValue][] = [
    [CHAVES.adValorem, { ...AD_VALOREM_PADRAO }],
    [
      CHAVES.condicoesSpot,
      {
        RODOVIARIO: condicoes('TOPICOS', TOPICOS_RODOVIARIO_DEMO),
        AEREO: condicoes('TOPICOS', TOPICOS_AEREO_PADRAO),
      },
    ],
    [CHAVES.condicoesFtlVeiculos, { UTILITARIO: ftlTexto, VAN: ftlTexto, TRES_QUARTOS: ftlTexto }],
    [CHAVES.condicoesFtl, CONDICOES_FTL_DEMO],
  ];
  await db.setting.createMany({ data: settings.map(([key, value]) => ({ key, value })) });
  await db.usefulLink.createMany({
    data: [
      { name: 'Qualp', url: 'https://qualp.com.br/#/', sortOrder: 1 },
      { name: 'Google Maps', url: 'https://www.google.com/maps', sortOrder: 2 },
    ],
  });

  // Clientes
  await db.client.createMany({
    data: CLIENTES.map(([name, contact, email], i) => ({
      name,
      contact,
      email,
      phone: `(11) 4${String(100 + i).padStart(3, '0')}-${String(1000 + i * 37).slice(0, 4)}`,
    })),
  });
  const clientes = await db.client.findMany({ orderBy: { name: 'asc' } });

  // Tarifas aéreas (vigentes desde o início do ano passado, sem data final)
  const inicio = new Date(Date.UTC(agora.getUTCFullYear() - 1, 0, 1));
  const tarifas: Prisma.AirRateCreateManyInput[] = [];
  for (const [o, d] of ROTAS_AEREAS) {
    for (const airline of ['GOL', 'AZUL', 'LATAM'] as const) {
      if (r.numero() < 0.15) continue; // nem toda companhia atende toda rota
      const base = r.entre(6.5, 14);
      tarifas.push({
        origin: o,
        destination: d,
        airline,
        validFrom: inicio,
        urgentPerKg: c2(base * 1.45),
        urgentMin: c2(r.entre(140, 260)),
        fastPerKg: c2(base * 1.2),
        fastMin: c2(r.entre(110, 200)),
        economyPerKg: r.numero() < 0.8 ? c2(base) : null,
        economyMin: c2(r.entre(80, 160)),
      });
    }
  }
  await db.airRate.createMany({ data: tarifas });

  // Tabelas FTL: todas as UFs, capital e interior
  await db.ftlRate.createMany({
    data: UFS_FTL.flatMap(([uf, region, van]) =>
      (['CAPITAL', 'INTERIOR'] as const).map((locality) => {
        const f = locality === 'INTERIOR' ? 0.93 : 1;
        return {
          uf,
          region,
          locality,
          perKmUtility: c2(van * 0.8 * f),
          perKmVan: c2(van * f),
          perKm15t: c2(van * 1.25 * f),
          adValoremPct: region === 'Norte' ? '0.7' : '0.5',
        };
      }),
    ),
  });
  const tabelasFtl = await db.ftlRate.findMany();

  // Cotações: ~12 meses, mais recentes = mais movimento.
  const termosSpot = {
    RODOVIARIO: condicoes('TOPICOS', TOPICOS_RODOVIARIO_DEMO),
    AEREO: condicoes('TOPICOS', TOPICOS_AEREO_PADRAO),
  };
  const sorteioStatus = (idadeDias: number): QuoteStatus => {
    if (idadeDias < 10 && r.numero() < 0.7) return 'PENDENTE';
    const x = r.numero();
    return x < 0.42 ? 'APROVADA' : x < 0.62 ? 'DECLINADA' : x < 0.75 ? 'RECUSADA' : 'PENDENTE';
  };
  const registrar = async (
    data: Prisma.QuoteUncheckedCreateInput,
    status: QuoteStatus,
    criada: Date,
    autorId: string,
  ) => {
    const q = await db.quote.create({
      data: { ...data, status, createdById: autorId, createdAt: criada, updatedAt: criada },
    });
    await db.quoteStatusChange.create({
      data: { quoteId: q.id, toStatus: 'PENDENTE', userId: autorId, at: criada },
    });
    if (status !== 'PENDENTE') {
      await db.quoteStatusChange.create({
        data: {
          quoteId: q.id,
          fromStatus: 'PENDENTE',
          toStatus: status,
          userId: visitante.id,
          at: new Date(criada.getTime() + r.entre(2, 72) * 3_600_000),
        },
      });
    }
  };

  const datas: Date[] = [];
  for (let i = 0; i < 165; i++) {
    // Mais cotações nos meses recentes (crescimento), em horário comercial.
    const idade = Math.floor(Math.pow(r.numero(), 1.35) * 360);
    const d = new Date(agora.getTime() - idade * dia);
    d.setUTCHours(11 + Math.floor(r.entre(0, 9)), Math.floor(r.entre(0, 60)), 0, 0);
    if (d.getTime() > agora.getTime()) d.setTime(agora.getTime() - 3_600_000);
    datas.push(d);
  }
  datas.sort((a, b) => a.getTime() - b.getTime());

  let criadas = 0;
  for (const criada of datas) {
    const idade = (agora.getTime() - criada.getTime()) / dia;
    const autor = r.item(autores);
    const status = sorteioStatus(idade);
    if (r.numero() < 0.15) {
      // FTL
      const t = r.item(tabelasFtl);
      const veiculo = r.item<VeiculoFtl>(['UTILITARIO', 'VAN', 'VAN', 'TRES_QUARTOS']);
      const km = Math.round(r.entre(40, 900));
      const res = calcularFtl({ tarifa: tarifaFtlCore(t), veiculo, distanciaKm: String(km) });
      const total = res.total.toFixed(2);
      await registrar(
        {
          modal: 'FTL',
          status,
          destUf: t.uf,
          ftlRateId: t.id,
          ftlRateVersion: t.version,
          ftlLocality: t.locality,
          vehicle: veiculo,
          distanceKm: res.distanciaKm.toString(),
          ratePerKm: res.tarifaKm.toString(),
          adValoremPct: res.adValorem.pct.toString(),
          costTotal: total,
          markupTotal: '0',
          subtotal: total,
          total,
          terms: ftlTexto,
          createdById: autor.id,
        },
        status,
        criada,
        autor.id,
      );
    } else {
      // Spot
      const [oc, ou, dc, du, base] = r.item(ROTAS);
      const aereo = r.numero() < 0.35;
      const cliente = r.item(clientes);
      const custo = base * r.entre(0.6, 1.5) * (aereo ? 1.6 : 1);
      const custos = aereo
        ? { COLETA: c2(custo * 0.18), AEREO: c2(custo * 0.67), ENTREGA: c2(custo * 0.15) }
        : { RODOVIARIO: c2(custo) };
      const res = calcularSpot({
        modal: aereo ? 'AEREO' : 'RODOVIARIO',
        custos,
        pedagio: aereo ? '0' : c2(r.entre(0, 1) < 0.6 ? r.entre(40, 260) : 0),
        markupPct: String(r.item([15, 20, 25, 30, 35, 40, 45, 50])),
        padroesAdValorem: AD_VALOREM_PADRAO,
      });
      const comp = (k: string) =>
        res.componentes.find((x) => x.componente === k)?.custo.toFixed(2) ?? null;
      await registrar(
        {
          modal: aereo ? 'AEREO' : 'RODOVIARIO',
          status,
          clientId: cliente.id,
          clientName: cliente.name,
          originCity: oc,
          originUf: ou,
          destCity: dc,
          destUf: du,
          costRoad: comp('RODOVIARIO'),
          costPickup: comp('COLETA'),
          costAir: comp('AEREO'),
          costDelivery: comp('ENTREGA'),
          toll: res.pedagio.toFixed(2),
          markupPct: res.markupPct.toString(),
          adValoremPct: res.adValorem.pct.toString(),
          costTotal: res.somaCustos.toFixed(2),
          markupTotal: res.markupTotal.toFixed(2),
          subtotal: res.subtotal.toFixed(2),
          total: res.total.toFixed(2),
          notes:
            r.numero() < 0.15
              ? r.item([
                  'Coleta agendada para 8h.',
                  'Carga frágil.',
                  'Cliente pediu entrega até sexta.',
                ])
              : null,
          terms: termosSpot[aereo ? 'AEREO' : 'RODOVIARIO'],
          createdById: autor.id,
        },
        status,
        criada,
        autor.id,
      );
    }
    criadas++;
  }
  return { cotacoes: criadas };
}
