import {
  createPrivateKey,
  createPublicKey,
  randomUUID,
  scrypt,
  sign,
  timingSafeEqual,
  verify,
} from 'node:crypto';
import {
  calcularVencimento,
  hojeIso,
  situacaoVigencia,
  type DataIso,
  type EstadoVigencia,
  type PlanoLicenca,
} from '@jat/core';
import type { Db } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Licença (plano de vigência) — decisão de 14/11/2026.
 *
 * A senha mestre de ativação NUNCA é gravada (nem no código, nem no banco). Dela se deriva
 * (scrypt) uma chave de assinatura Ed25519; o sistema conhece só a chave PÚBLICA. Na ativação o
 * servidor deriva a chave privada a partir da senha digitada, confere se bate com a pública e
 * assina a licença. Alterar a licença direto no banco invalida a assinatura → sistema bloqueado.
 */

/** Chave pública derivada da senha mestre oficial (Ed25519, 32 bytes em base64). */
export const CHAVE_PUBLICA_LICENCA = '20t+nZBOEnttUeeNbqH4WQLhJR65E0ZWOw7pevDLXbo=';

const SAL = 'JAT-Quote/licenca/v1';
const PARAMS_SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 } as const;
const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');

/** Tolerância antes de considerar que o relógio do servidor foi atrasado. */
export const TOLERANCIA_RELOGIO_MS = 6 * 3600_000;
/** 5 senhas mestre erradas seguidas bloqueiam a ativação por 15 minutos. */
export const MAX_TENTATIVAS_ATIVACAO = 5;
export const BLOQUEIO_ATIVACAO_MINUTOS = 15;

export const CHAVES_LICENCA = {
  licenca: 'licenca',
  instalacao: 'instalacao_id',
  relogio: 'licenca_relogio',
  tentativas: 'licenca_tentativas',
} as const;

export interface DadosLicenca {
  instalacao: string;
  plano: PlanoLicenca;
  inicio: DataIso;
  vencimento: DataIso;
  /** ISO 8601. */
  ativadoEm: string;
  ativadoPor: string;
}

export interface LicencaGravada extends DadosLicenca {
  assinatura: string;
}

export type MotivoBloqueio = 'NAO_ATIVADA' | 'VENCIDA' | 'INVALIDA' | 'RELOGIO';

export interface EstadoLicenca {
  bloqueado: boolean;
  motivo: MotivoBloqueio | null;
  mensagem: string | null;
  /** Licença válida (assinatura conferida), mesmo que vencida. */
  licenca: DadosLicenca | null;
  vigencia: EstadoVigencia;
}

export const MENSAGENS_BLOQUEIO: Record<MotivoBloqueio, string> = {
  NAO_ATIVADA: 'O sistema ainda não foi ativado.',
  VENCIDA: 'O plano de vigência do sistema venceu.',
  INVALIDA: 'A licença do sistema é inválida ou foi alterada.',
  RELOGIO: 'O relógio do servidor está atrasado em relação ao último uso do sistema.',
};

function derivarSemente(senhaMestre: string): Promise<Buffer> {
  return new Promise((ok, falha) =>
    scrypt(senhaMestre.normalize('NFC'), SAL, 32, PARAMS_SCRYPT, (e, k) => (e ? falha(e) : ok(k))),
  );
}

/** Deriva o par de chaves da senha mestre. Leva ~0,3 s de propósito (dificulta força bruta). */
export async function derivarChaves(senhaMestre: string) {
  const semente = await derivarSemente(senhaMestre);
  const privada = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519, semente]),
    format: 'der',
    type: 'pkcs8',
  });
  const publica = createPublicKey(privada).export({ format: 'der', type: 'spki' }).subarray(12);
  return { privada, publica: Buffer.from(publica).toString('base64') };
}

/** A senha mestre confere com a chave pública? (comparação em tempo constante) */
export function chaveConfere(publicaDerivada: string, publicaEsperada: string): boolean {
  const a = Buffer.from(publicaDerivada, 'base64');
  const b = Buffer.from(publicaEsperada, 'base64');
  return a.length === b.length && a.length === 32 && timingSafeEqual(a, b);
}

const mensagem = (l: DadosLicenca) =>
  Buffer.from(
    JSON.stringify([
      'JATQ-LIC-1',
      l.instalacao,
      l.plano,
      l.inicio,
      l.vencimento,
      l.ativadoEm,
      l.ativadoPor,
    ]),
    'utf8',
  );

export function assinarLicenca(
  dados: DadosLicenca,
  privada: ReturnType<typeof createPrivateKey>,
): LicencaGravada {
  return { ...dados, assinatura: sign(null, mensagem(dados), privada).toString('base64') };
}

export function licencaValida(
  l: LicencaGravada,
  chavePublica: string,
  instalacao: string,
): boolean {
  try {
    if (l.instalacao !== instalacao) return false;
    const chave = createPublicKey({
      key: Buffer.concat([SPKI_ED25519, Buffer.from(chavePublica, 'base64')]),
      format: 'der',
      type: 'spki',
    });
    return verify(null, mensagem(l), chave, Buffer.from(l.assinatura, 'base64'));
  } catch {
    return false;
  }
}

function lerLicencaGravada(v: unknown): LicencaGravada | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const campos = [
    'instalacao',
    'plano',
    'inicio',
    'vencimento',
    'ativadoEm',
    'ativadoPor',
    'assinatura',
  ];
  if (!campos.every((c) => typeof o[c] === 'string')) return null;
  return o as unknown as LicencaGravada;
}

/** Identificador desta instalação (criado no primeiro uso). */
export async function idInstalacao(db: Db): Promise<string> {
  const s = await db.setting.findUnique({ where: { key: CHAVES_LICENCA.instalacao } });
  if (typeof s?.value === 'string') return s.value;
  const id = randomUUID();
  await db.setting.upsert({
    where: { key: CHAVES_LICENCA.instalacao },
    create: { key: CHAVES_LICENCA.instalacao, value: id },
    update: {},
  });
  const gravado = await db.setting.findUniqueOrThrow({ where: { key: CHAVES_LICENCA.instalacao } });
  return gravado.value as string;
}

/**
 * Controle da licença: estado (com cache curto), relógio e ativação.
 * Uma instância por servidor.
 */
export function criarControleLicenca(
  db: Db,
  chavePublica: string,
  agora: () => Date = () => new Date(),
) {
  let cache: { em: number; estado: EstadoLicenca } | null = null;
  const TTL = 30_000;

  async function calcular(): Promise<EstadoLicenca> {
    const instalacao = await idInstalacao(db);
    const linhas = await db.setting.findMany({
      where: { key: { in: [CHAVES_LICENCA.licenca, CHAVES_LICENCA.relogio] } },
    });
    const valor = (k: string) => linhas.find((l) => l.key === k)?.value;
    const gravada = lerLicencaGravada(valor(CHAVES_LICENCA.licenca));
    const momento = agora();

    // Relógio: guarda o maior horário já visto; se o atual for bem menor, bloqueia.
    const relogio = valor(CHAVES_LICENCA.relogio) as { maior?: string } | undefined;
    const maior = relogio?.maior ? Date.parse(relogio.maior) : NaN;
    const atrasado = Number.isFinite(maior) && momento.getTime() < maior - TOLERANCIA_RELOGIO_MS;
    if (!Number.isFinite(maior) || momento.getTime() > maior + 10 * 60_000) {
      await gravarRelogio(momento);
    }

    const bloquear = (
      motivo: MotivoBloqueio,
      licenca: DadosLicenca | null,
      vigencia: EstadoVigencia,
    ): EstadoLicenca => ({
      bloqueado: true,
      motivo,
      mensagem: MENSAGENS_BLOQUEIO[motivo],
      licenca,
      vigencia,
    });

    if (!gravada) return bloquear('NAO_ATIVADA', null, situacaoVigencia(null, momento));
    if (!licencaValida(gravada, chavePublica, instalacao)) {
      return bloquear('INVALIDA', null, situacaoVigencia(null, momento));
    }
    const licenca: DadosLicenca = {
      instalacao: gravada.instalacao,
      plano: gravada.plano,
      inicio: gravada.inicio,
      vencimento: gravada.vencimento,
      ativadoEm: gravada.ativadoEm,
      ativadoPor: gravada.ativadoPor,
    };
    const vigencia = situacaoVigencia(licenca.vencimento, momento);
    if (atrasado) return bloquear('RELOGIO', licenca, vigencia);
    if (vigencia.situacao !== 'ATIVA') return bloquear('VENCIDA', licenca, vigencia);
    return { bloqueado: false, motivo: null, mensagem: null, licenca, vigencia };
  }

  async function gravarRelogio(momento: Date) {
    const value = { maior: momento.toISOString() } as Prisma.InputJsonValue;
    await db.setting.upsert({
      where: { key: CHAVES_LICENCA.relogio },
      create: { key: CHAVES_LICENCA.relogio, value },
      update: { value },
    });
  }

  return {
    async estado(): Promise<EstadoLicenca> {
      const t = Date.now();
      if (cache && t - cache.em < TTL) return cache.estado;
      const estado = await calcular();
      cache = { em: t, estado };
      return estado;
    },
    invalidar() {
      cache = null;
    },

    /** Lê o bloqueio por tentativas erradas. */
    async tentativas(): Promise<{ falhas: number; bloqueadoAte: number | null }> {
      const s = await db.setting.findUnique({ where: { key: CHAVES_LICENCA.tentativas } });
      const v = (s?.value ?? {}) as { falhas?: number; bloqueadoAte?: string | null };
      return {
        falhas: v.falhas ?? 0,
        bloqueadoAte: v.bloqueadoAte ? Date.parse(v.bloqueadoAte) : null,
      };
    },
    async gravarTentativas(falhas: number, bloqueadoAte: Date | null) {
      const value = {
        falhas,
        bloqueadoAte: bloqueadoAte?.toISOString() ?? null,
      } as Prisma.InputJsonValue;
      await db.setting.upsert({
        where: { key: CHAVES_LICENCA.tentativas },
        create: { key: CHAVES_LICENCA.tentativas, value },
        update: { value },
      });
    },

    /**
     * Ativa/renova com a senha mestre. Devolve null se a senha não confere.
     * Renovação de licença válida e ainda não vencida soma ao que falta.
     */
    async ativar(senhaMestre: string, plano: PlanoLicenca, usuario: string) {
      const { privada, publica } = await derivarChaves(senhaMestre);
      if (!chaveConfere(publica, chavePublica)) return null;
      const anterior = (await calcular()).licenca;
      const momento = agora();
      const hoje = hojeIso(momento);
      const vencimento = calcularVencimento(plano, hoje, anterior?.vencimento ?? null);
      const dados: DadosLicenca = {
        instalacao: await idInstalacao(db),
        plano,
        inicio: hoje,
        vencimento,
        ativadoEm: momento.toISOString(),
        ativadoPor: usuario,
      };
      const value = assinarLicenca(dados, privada) as unknown as Prisma.InputJsonValue;
      await db.setting.upsert({
        where: { key: CHAVES_LICENCA.licenca },
        create: { key: CHAVES_LICENCA.licenca, value },
        update: { value },
      });
      // Reativar com a senha mestre também acerta o controle do relógio.
      await gravarRelogio(momento);
      cache = null;
      return { anterior, atual: dados };
    },
  };
}

export type ControleLicenca = ReturnType<typeof criarControleLicenca>;
