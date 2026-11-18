import ExcelJS from 'exceljs';
import { expect, test, type Page } from '@playwright/test';

const SENHA = 'E2eSenha123';

async function entrar(page: Page, username = 'admin.e2e') {
  const res = await page.request.post('/api/auth/login', {
    headers: { 'x-jat-requested': '1' },
    data: { username, password: SENHA },
  });
  expect(res.ok()).toBe(true);
}

async function escolherCidade(page: Page, campo: string, termo: string, nome: RegExp) {
  await page.locator(`#${campo}`).click();
  await page
    .locator('[data-slot="popover-content"][data-state="open"]')
    .getByPlaceholder('Digite a cidade (ex.: feira ba)')
    .fill(termo);
  await page.getByRole('option', { name: nome }).first().click();
}

async function preencherSpot(page: Page, modal: 'Aéreo' | 'Rodoviário') {
  await page.locator('#spot-cliente').click();
  await page.getByPlaceholder('Buscar cliente…').fill('fiat');
  await page.getByRole('option', { name: 'Fiat Automóveis S.A.' }).click();
  await escolherCidade(page, 'spot-origem', 'belo horizonte', /^Belo Horizonte\s*MG/);
  await escolherCidade(page, 'spot-destino', 'feira ba', /^Feira de Santana\s*BA/);
  await page.getByRole('radio', { name: modal }).click();
  if (modal === 'Aéreo') await page.locator('#spot-custo-AEREO').fill('400');
  else await page.locator('#spot-custo-RODOVIARIO').fill('400');
  await page.locator('#spot-markup').fill('32,5');
  await page.locator('#spot-markup').blur();
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('Condições Spot por modal: tópicos com Enter, reordenar e salvar', async ({ page }) => {
  await entrar(page);
  await page.goto('/admin/configuracoes?aba=spot');
  await expect(page.getByRole('tab', { name: 'Condições Spot' })).toHaveAttribute(
    'data-state',
    'active',
  );
  // Aéreo vem com os 7 tópicos de referência.
  await page.getByRole('tab', { name: 'Aéreo' }).click();
  await expect(page.getByLabel(/^Tópico \d+ \(Aéreo\)$/)).toHaveCount(7);

  // Rodoviário começa vazio: cria dois tópicos com Enter e inverte a ordem.
  await page.getByRole('tab', { name: 'Rodoviário' }).click();
  await expect(page.getByText('Nenhum tópico.')).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar tópico' }).click();
  await page.keyboard.type('Pedágio incluso conforme rota.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('ICMS e seguro a incluir.');
  await page.getByRole('button', { name: 'Subir o tópico 2' }).click();
  await expect(page.getByLabel('Tópico 1 (Rodoviário)')).toHaveValue('ICMS e seguro a incluir.');
  await page.getByRole('button', { name: 'Salvar condições' }).click();
  await expect(page.getByText('Termos e condições do Frete Spot salvos.')).toBeVisible();

  const cfg = await (await page.request.get('/api/settings')).json();
  expect(cfg.condicoesSpot.RODOVIARIO.topicos).toEqual([
    'ICMS e seguro a incluir.',
    'Pedágio incluso conforme rota.',
  ]);
});

test('Condições FTL por veículo: texto livre ou tópicos', async ({ page }) => {
  await entrar(page);
  await page.goto('/admin/configuracoes?aba=ftl');
  await page.getByRole('tab', { name: '1.5T' }).click();
  await expect(page.getByRole('radio', { name: 'Texto livre' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByLabel('Texto das condições (1.5T)').fill('Condição exclusiva do 1.5T.');
  await page.getByRole('button', { name: 'Salvar condições' }).click();
  await expect(page.getByText('Condições comerciais do FTL salvas.')).toBeVisible();
  const cfg = await (await page.request.get('/api/settings')).json();
  expect(cfg.condicoesFtl.TRES_QUARTOS.texto).toBe('Condição exclusiva do 1.5T.');
  expect(cfg.condicoesFtl.VAN.texto).toContain('PRAZO DE VALIDADE 15 DIAS');
});

test('Prévia do Spot: logo da JAT, termos do modal, observações e Copiar', async ({ page }) => {
  await entrar(page);
  await page.goto('/spot');
  await preencherSpot(page, 'Aéreo');
  const termos = page.getByTestId('termos');
  await expect(termos).toContainText('Termos e condições');
  await expect(termos).toContainText('ICMS e seguro a incluir.');
  await expect(page.getByAltText('JAT', { exact: true })).toBeVisible();

  // Observação aparece na prévia enquanto digita.
  await page.locator('#spot-obs').fill('Coleta até as 17h.');
  await expect(page.getByTestId('previa-observacoes')).toContainText('Coleta até as 17h.');

  // Trocar o modal troca os termos.
  await page.getByRole('radio', { name: 'Rodoviário' }).click();
  await page.locator('#spot-custo-RODOVIARIO').fill('400');
  await expect(termos).toContainText('Pedágio incluso conforme rota.');

  await page.keyboard.press('Control+s');
  await expect(page.getByText(/Cotação JQ-\d{6} salva\./)).toBeVisible();
  await page.getByRole('button', { name: 'Copiar' }).click();
  const texto = await page.evaluate(() => navigator.clipboard.readText());
  // A área de transferência do Windows usa \r\n.
  expect(texto).toMatch(/\*Termos e condições:\*\r?\n• ICMS e seguro a incluir\./);
  expect(texto).toContain('Observações: Coleta até as 17h.');
});

test('Importar cotações de teste (Excel), selo "teste" e remover em lote', async ({ page }) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Cotações');
  ws.addRow(['Nº', 'DATA', 'CLIENTE', 'ROTA', 'MODAL', 'TOTAL', 'STATUS', 'Criada por']);
  ws.addRow([
    'JQ-000901',
    new Date(Date.now() - 86_400_000),
    'Cliente Planilha E2E',
    'Frutal, MG → Sorocaba, SP',
    'Rodoviário',
    950,
    'Pendente',
    'Administrador',
  ]);
  ws.addRow([
    'JQ-000902',
    new Date(Date.now() - 2 * 86_400_000),
    'Cliente Planilha E2E',
    'São Paulo, SP → Betim, MG',
    'Aéreo',
    1360,
    'Aprovada',
    'Administrador',
  ]);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  await entrar(page);
  await page.goto('/relatorios');
  await page.getByRole('button', { name: 'Importar cotações (Excel)' }).click();
  await page.getByLabel('Planilha do Excel').setInputFiles({
    name: 'relatorio_cotacoes.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
  const previa = page.getByTestId('previa-importacao');
  await expect(previa).toContainText('Arquivo válido');
  await page.getByRole('button', { name: 'Importar 2 linhas' }).click();
  await expect(page.getByText(/Importação concluída/)).toBeVisible();

  await page.getByLabel('Buscar cotações').fill('Cliente Planilha E2E');
  await expect(page.getByRole('button', { name: 'JQ-000902', exact: true })).toBeVisible();
  await expect(page.getByTitle('Cotação importada como dado de teste').first()).toBeVisible();

  await page.getByRole('button', { name: /Remover dados de teste \(2\)/ }).click();
  await page.getByLabel(/Digite REMOVER DADOS DE TESTE/).fill('REMOVER DADOS DE TESTE');
  await page.getByRole('button', { name: 'Remover dados de teste', exact: true }).click();
  await expect(page.getByText('2 cotações de teste removidas.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'JQ-000902', exact: true })).toHaveCount(0);
});

test('Plano Vitalício aparece nas opções de ativação', async ({ page }) => {
  await entrar(page);
  await page.goto('/admin/configuracoes?aba=licenca');
  await expect(page.getByRole('radio', { name: /Vitalício/ })).toBeVisible();
});

// ── Screenshots ──

for (const tema of ['light', 'dark'] as const) {
  for (const vp of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    test(`screenshots v1.1 ${tema} ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.addInitScript((t) => localStorage.setItem('jat-theme', t), tema);
      const foto = async (nome: string, fullPage = true) => {
        await page.waitForTimeout(600);
        await page.screenshot({
          path: `e2e/screenshots/v1_1-${nome}-${tema}-${vp.width}x${vp.height}.png`,
          fullPage,
        });
      };
      await entrar(page);
      await page.goto('/admin/configuracoes?aba=spot');
      await page.getByRole('tab', { name: 'Aéreo' }).click();
      await foto('condicoes-spot');
      await page.goto('/admin/configuracoes?aba=ftl');
      await expect(page.getByRole('tab', { name: 'VAN' })).toBeVisible();
      await foto('condicoes-ftl');

      await page.goto('/spot');
      await preencherSpot(page, 'Aéreo');
      await page.locator('#spot-obs').fill('Material frágil, empilhamento máximo de 2 caixas.');
      await expect(page.getByTestId('previa-observacoes')).toBeVisible();
      await foto('spot-previa');
      await page.locator('main').evaluate((m) => m.scrollTo(0, m.scrollHeight));
      await foto('spot-previa-termos', false);

      await page.goto('/relatorios');
      await page.getByRole('button', { name: 'Importar cotações (Excel)' }).click();
      await foto('importar', false);
    });
  }
}
