import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const SENHA = 'E2eSenha123';

async function entrar(page: Page, username = 'admin.e2e') {
  const res = await page.request.post('/api/auth/login', {
    headers: { 'x-jat-requested': '1' },
    data: { username, password: SENHA },
  });
  expect(res.ok()).toBe(true);
}

const arquivo = (linhas: string[]) => ({
  name: 'clientes_base44.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from(linhas.join('\r\n'), 'utf8'),
});

test.describe.configure({ mode: 'serial' });

test('migração: importar clientes com prévia, relatório de inconsistências e confirmação', async ({
  page,
}) => {
  await entrar(page);
  await page.goto('/clientes');
  await page.getByRole('button', { name: 'Importar CSV' }).click();

  // Arquivo com vírgula, coluna "Cliente" e uma linha vazia antes do erro
  await page
    .locator('input[type=file]')
    .setInputFiles(
      arquivo([
        'Cliente,CNPJ,Email,Telefone',
        'Transportes Alfa Ltda.,11.222.333/0001-81,contato@alfa.com.br,(11) 4000-1000',
        '',
        'Beta Logística,123,,',
      ]),
    );
  const previa = page.getByTestId('previa-importacao');
  await expect(previa).toContainText('CNPJ deve ter 14 dígitos');
  await expect(previa.getByRole('cell', { name: '4', exact: true })).toBeVisible(); // linha real

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar relatório' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('relatorio-importacao_clientes_base44.csv');
  const relatorio = (await readFile(await download.path(), 'utf8')).replace(/^\uFEFF/, '');
  expect(relatorio.split('\r\n')).toEqual(
    expect.arrayContaining([
      'Linha do arquivo;Item;Resultado;Problema',
      '4;Beta Logística;Erro;CNPJ deve ter 14 dígitos (ou CPF, 11 dígitos).',
      '2;Transportes Alfa Ltda.;Novo;',
    ]),
  );
  await expect(page.getByRole('button', { name: /^Importar/ })).toBeDisabled();

  // Arquivo corrigido
  await page
    .locator('input[type=file]')
    .setInputFiles(
      arquivo([
        'Cliente,CNPJ,Email,Telefone',
        'Transportes Alfa Ltda.,11.222.333/0001-81,contato@alfa.com.br,(11) 4000-1000',
        'Beta Logística,,,',
      ]),
    );
  await expect(previa).toContainText('Arquivo válido');
  await page.getByRole('button', { name: 'Importar 2 linhas' }).click();
  await expect(page.getByText('Importação concluída: 2 novas e 0 atualizadas.')).toBeVisible();
  await expect(page.getByRole('row', { name: /Transportes Alfa Ltda\./ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Beta Logística/ })).toBeVisible();
});

test('Operacional não vê "Importar CSV" de clientes, mas exporta', async ({ page }) => {
  await entrar(page, 'bruno.lima');
  await page.goto('/clientes');
  await expect(page.getByRole('link', { name: 'Exportar CSV' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Importar CSV' })).toHaveCount(0);
});

for (const tema of ['light', 'dark'] as const) {
  test(`screenshot importação de clientes ${tema}`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await entrar(page);
    await page.addInitScript((t) => localStorage.setItem('jat-theme', t), tema);
    await page.goto('/clientes');
    await page.getByRole('button', { name: 'Importar CSV' }).click();
    await page
      .locator('input[type=file]')
      .setInputFiles(
        arquivo([
          'Nome;CNPJ/CPF;E-mail;Status',
          'Gama Cargas;;gama@cargas.com.br;Ativo',
          'Delta;999;;Ativo',
          'Fiat Automóveis S.A.;;;',
        ]),
      );
    await expect(page.getByTestId('previa-importacao')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `e2e/screenshots/fase6-importar-clientes-${tema}-1366x768.png` });
  });
}
