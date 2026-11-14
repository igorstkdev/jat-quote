/**
 * Gera a chave pública da licença a partir de uma senha mestre (para TROCAR a senha mestre).
 *
 *   npm run licenca:chave -w @jat/api
 *
 * Pergunta a senha (sem mostrá-la) e imprime a chave. Coloque-a em CHAVE_PUBLICA_LICENCA
 * (src/lib/licenca.ts), gere um novo setup e reative os sistemas instalados com a nova senha.
 * A senha em si nunca é gravada.
 */
import { stdin, stdout } from 'node:process';
import { derivarChaves } from './lib/licenca.js';

/** Entrada redirecionada (sem teclado): lê tudo de uma vez. */
let linhas: Promise<string[]> | null = null;
function linhasRedirecionadas(): Promise<string[]> {
  linhas ??= new Promise((ok) => {
    let t = '';
    stdin.setEncoding('utf8');
    stdin.on('data', (d) => (t += String(d)));
    stdin.on('end', () => ok(t.split(/\r?\n/)));
  });
  return linhas;
}

function perguntarOculto(pergunta: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(pergunta);
    let valor = '';
    if (!stdin.isTTY) {
      void linhasRedirecionadas().then((l) => {
        stdout.write('\n');
        resolve(l.shift() ?? '');
      });
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const aoDigitar = (c: string) => {
      if (c === '\r' || c === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', aoDigitar);
        stdout.write('\n');
        resolve(valor);
      } else if (c === '\u0003') {
        process.exit(1);
      } else if (c === '\u0008' || c === '\u007f') {
        valor = valor.slice(0, -1);
      } else {
        valor += c;
      }
    };
    stdin.on('data', aoDigitar);
  });
}

const senha = await perguntarOculto('Nova senha mestre de ativação: ');
const confirmacao = await perguntarOculto('Repita a senha: ');
if (!senha || senha !== confirmacao) {
  console.error('As senhas não conferem.');
  process.exit(1);
}
const { publica } = await derivarChaves(senha);
console.log(`\nCHAVE_PUBLICA_LICENCA = '${publica}'`);
