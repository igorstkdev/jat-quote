import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { diferencas, registrarAuditoria } from '../lib/audit.js';
import { hojeIso, lerCsv } from '@jat/core';
import { detectarSeparador, linhasCsv } from '../lib/air-rates.js';
import { campoCliente, csvClientes, lerAtivo, temColunaNome } from '../lib/clients-csv.js';
import { conflito, naoEncontrado, requisicaoInvalida } from '../lib/errors.js';
import { exigir } from '../plugins/auth.js';

const opcional = (max: number, msg?: string) =>
  z
    .string()
    .trim()
    .max(max, msg ?? `Use no máximo ${max} caracteres.`)
    .transform((v) => (v === '' ? null : v))
    .nullish();

const documentoSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v === '' || v.length === 11 || v.length === 14, {
    message: 'CNPJ deve ter 14 dígitos (ou CPF, 11 dígitos).',
  })
  .transform((v) => (v === '' ? null : v))
  .nullish();

const clienteSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do cliente.').max(160),
  document: documentoSchema,
  contact: opcional(120),
  email: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v.toLowerCase()))
    .pipe(z.email('E-mail inválido.').nullable())
    .nullish(),
  phone: opcional(40),
  notes: opcional(2000),
});

const listaQuery = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['ativos', 'inativos', 'todos']).default('ativos'),
});

const idParam = z.object({ id: z.uuid('Identificador inválido.') });
const importBody = z.object({
  csv: z.string().max(5_000_000, 'Arquivo grande demais.'),
  confirm: z.boolean().default(false),
});

type DadosCliente = z.infer<typeof clienteSchema>;
const CAMPOS = ['document', 'contact', 'email', 'phone', 'notes'] as const;

/** Nome igual a outro cliente ATIVO (sem diferenciar maiúsculas) não é permitido. */
async function garantirNomeUnico(db: Db, nome: string, ignorarId?: string) {
  const candidatos = await db.client.findMany({
    where: { active: true, name: { equals: nome, mode: 'insensitive' } },
    select: { id: true },
  });
  if (candidatos.some((c) => c.id !== ignorarId)) {
    throw conflito('Já existe um cliente ativo com esse nome.', 'name');
  }
}

export function clientRoutes(db: Db) {
  return async (app: FastifyInstance) => {
    const logado = { preHandler: exigir() };
    const admin = { preHandler: exigir({ admin: true }) };

    app.get('/api/clients', logado, async (req) => {
      const { search, status } = listaQuery.parse(req.query);
      const where: Prisma.ClientWhereInput = {};
      if (status !== 'todos') where.active = status === 'ativos';
      if (search) {
        const digitos = search.replace(/\D/g, '');
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { contact: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          ...(digitos.length >= 3 ? [{ document: { contains: digitos } }] : []),
        ];
      }
      const clients = await db.client.findMany({ where, orderBy: { name: 'asc' }, take: 500 });
      return { clients };
    });

    /** CSV com todos os clientes (ativos e inativos). */
    app.get('/api/clients/export', logado, async (_req, reply) => {
      const clientes = await db.client.findMany({ orderBy: { name: 'asc' } });
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="clientes_${hojeIso()}.csv"`)
        .header('Cache-Control', 'no-store')
        .send(csvClientes(clientes));
    });

    /**
     * Importação de clientes por CSV (migração do Base44). Somente Admin.
     * Sem `confirm`, só valida e devolve a prévia. Mesmo nome (sem diferenciar maiúsculas) de
     * um cliente existente = atualização, e coluna vazia no arquivo mantém o valor atual.
     * Com qualquer erro, nada é gravado.
     */
    app.post('/api/clients/import', { ...admin, bodyLimit: 6_000_000 }, async (req) => {
      const { csv, confirm } = importBody.parse(req.body);
      const [cabecalho = []] = lerCsv(csv, detectarSeparador(csv));
      if (!temColunaNome(cabecalho)) {
        throw requisicaoInvalida('O arquivo não está no formato esperado. Coluna ausente: Nome.');
      }
      const linhas = linhasCsv(csv, []);
      const existentes = await db.client.findMany();
      const porNome = new Map(existentes.map((c) => [c.name.toLowerCase(), c]));
      const vistas = new Map<string, number>();
      const novos: { d: DadosCliente; ativo: boolean }[] = [];
      const atualizacoes: { id: string; data: Prisma.ClientUpdateInput }[] = [];

      type Resultado = {
        linha: number;
        acao: 'criar' | 'atualizar' | 'igual' | 'erro';
        rota?: string;
        erro?: string;
      };
      const resultado: Resultado[] = [];

      for (const { linha, get } of linhas) {
        const nome = campoCliente(get, 'Nome');
        try {
          const ativo = lerAtivo(campoCliente(get, 'Status'));
          if (ativo === null) {
            throw new Error(
              `Status "${campoCliente(get, 'Status')}" inválido: use Ativo ou Inativo.`,
            );
          }
          const parsed = clienteSchema.safeParse({
            name: nome,
            document: campoCliente(get, 'CNPJ/CPF'),
            contact: campoCliente(get, 'Contato'),
            email: campoCliente(get, 'E-mail'),
            phone: campoCliente(get, 'Telefone'),
            notes: campoCliente(get, 'Observações'),
          });
          if (!parsed.success)
            throw new Error(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
          const d = parsed.data;
          const chave = d.name.toLowerCase();
          const repetida = vistas.get(chave);
          if (repetida) throw new Error(`Cliente repetido no arquivo (igual à linha ${repetida}).`);
          vistas.set(chave, linha);

          const existente = porNome.get(chave);
          if (!existente) {
            novos.push({ d, ativo });
            resultado.push({ linha, acao: 'criar', rota: d.name });
            continue;
          }
          // Atualiza só o que veio preenchido; o status do arquivo vale se a coluna existir.
          const data: Prisma.ClientUpdateInput = {};
          for (const c of CAMPOS) {
            const v = d[c];
            if (v && v !== existente[c]) data[c] = v;
          }
          if (campoCliente(get, 'Status') && ativo !== existente.active) data.active = ativo;
          if (Object.keys(data).length === 0) {
            resultado.push({ linha, acao: 'igual', rota: existente.name });
          } else {
            atualizacoes.push({ id: existente.id, data });
            resultado.push({ linha, acao: 'atualizar', rota: existente.name });
          }
        } catch (e) {
          resultado.push({
            linha,
            acao: 'erro',
            rota: nome || undefined,
            erro: (e as Error).message,
          });
        }
      }

      const resumo = {
        total: resultado.length,
        criar: novos.length,
        atualizar: atualizacoes.length,
        igual: resultado.filter((r) => r.acao === 'igual').length,
        erros: resultado.filter((r) => r.acao === 'erro').length,
      };
      if (!confirm || resumo.erros > 0 || resumo.total === 0) {
        return { applied: false, summary: resumo, rows: resultado };
      }

      await db.$transaction(
        async (tx) => {
          for (const { d, ativo } of novos) {
            await tx.client.create({
              data: {
                name: d.name,
                document: d.document ?? null,
                contact: d.contact ?? null,
                email: d.email ?? null,
                phone: d.phone ?? null,
                notes: d.notes ?? null,
                active: ativo,
              },
            });
          }
          for (const { id, data } of atualizacoes) await tx.client.update({ where: { id }, data });
          await registrarAuditoria(tx, req, {
            action: 'IMPORTAR',
            entity: 'cliente',
            details: {
              criados: resumo.criar,
              atualizados: resumo.atualizar,
              semAlteracao: resumo.igual,
            },
          });
        },
        { timeout: 60_000 },
      );
      return { applied: true, summary: resumo, rows: resultado };
    });

    app.get('/api/clients/:id', logado, async (req) => {
      const { id } = idParam.parse(req.params);
      const client = await db.client.findUnique({ where: { id } });
      if (!client) throw naoEncontrado('Cliente');
      return { client };
    });

    app.post('/api/clients', logado, async (req, reply) => {
      const dados = clienteSchema.parse(req.body);
      await garantirNomeUnico(db, dados.name);
      const client = await db.client.create({
        data: {
          name: dados.name,
          document: dados.document ?? null,
          contact: dados.contact ?? null,
          email: dados.email ?? null,
          phone: dados.phone ?? null,
          notes: dados.notes ?? null,
        },
      });
      await registrarAuditoria(db, req, {
        action: 'CRIAR',
        entity: 'cliente',
        entityId: client.id,
        details: { name: client.name },
      });
      return reply.code(201).send({ client });
    });

    app.patch('/api/clients/:id', logado, async (req) => {
      const { id } = idParam.parse(req.params);
      const dados = clienteSchema.partial().parse(req.body);
      const antes = await db.client.findUnique({ where: { id } });
      if (!antes) throw naoEncontrado('Cliente');
      if (dados.name !== undefined && antes.active) await garantirNomeUnico(db, dados.name, id);
      const depois = await db.client.update({ where: { id }, data: dados });
      const mudancas = diferencas(antes, depois);
      if (Object.keys(mudancas).length > 0) {
        await registrarAuditoria(db, req, {
          action: 'EDITAR',
          entity: 'cliente',
          entityId: id,
          details: mudancas,
        });
      }
      return { client: depois };
    });

    /** "Excluir" = desativar (soft delete). Somente Admin. */
    app.post('/api/clients/:id/deactivate', admin, async (req) => {
      const { id } = idParam.parse(req.params);
      const antes = await db.client.findUnique({ where: { id } });
      if (!antes) throw naoEncontrado('Cliente');
      const client = await db.client.update({ where: { id }, data: { active: false } });
      if (antes.active) {
        await registrarAuditoria(db, req, {
          action: 'DESATIVAR',
          entity: 'cliente',
          entityId: id,
          details: { name: client.name },
        });
      }
      return { client };
    });

    app.post('/api/clients/:id/reactivate', admin, async (req) => {
      const { id } = idParam.parse(req.params);
      const antes = await db.client.findUnique({ where: { id } });
      if (!antes) throw naoEncontrado('Cliente');
      if (!antes.active) await garantirNomeUnico(db, antes.name, id);
      const client = await db.client.update({ where: { id }, data: { active: true } });
      if (!antes.active) {
        await registrarAuditoria(db, req, {
          action: 'REATIVAR',
          entity: 'cliente',
          entityId: id,
          details: { name: client.name },
        });
      }
      return { client };
    });
  };
}
