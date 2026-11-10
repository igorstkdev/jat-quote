import ExcelJS from 'exceljs';
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

const brl = (v: string | number) =>
  `R$ ${Number(v)
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

test.describe.configure({ mode: 'serial' });

test('relatório: estatísticas batem com a API, filtro pelo cartão de status e paginação', async ({
  page,
}) => {
  await entrar(page);
  const api = await (await page.request.get('/api/reports/spot')).json();
  await page.goto('/relatorios');
  await expect(page.getByRole('heading', { name: 'Relatório Spot' })).toBeVisible();
  await expect(page.getByTestId('paginacao')).toHaveText(
    `1–${Math.min(25, api.stats.count)} de ${api.stats.count}`,
  );
  await expect(page.getByText(brl(api.stats.value)).first()).toBeVisible();

  // Cartão "Aprovada" filtra a lista e vai para o endereço (link compartilhável).
  await page.getByTitle('Filtrar: Aprovada').click();
  await expect(page).toHaveURL(/status=APROVADA/);
  const linhas = page.getByRole('table', { name: 'Cotações Spot' }).getByRole('row');
  await expect(linhas.nth(1)).toContainText('Aprovada');
  const aprovadas = api.stats.byStatus.find((s: { status: string }) => s.status === 'APROVADA');
  await expect(page.getByTestId('paginacao')).toContainText(`de ${aprovadas.count}`);

  // Busca por cliente
  await page.getByTitle('Filtrar: Aprovada').click();
  await page.getByLabel('Buscar cotações').fill('Bosch');
  await expect(page).toHaveURL(/q=Bosch/);
  await expect(linhas.nth(1)).toContainText('Bosch');

  // Paginação (26 cotações semeadas + as das fases anteriores)
  await page.getByRole('button', { name: 'Limpar' }).click();
  await page.getByRole('button', { name: 'Próxima página' }).click();
  await expect(page.getByTestId('paginacao')).toHaveText(new RegExp(`^26–`));
});

test('relatório: visões cliente/operação, status, editar no Spot e excluir (Admin)', async ({
  page,
}) => {
  await entrar(page);
  await page.goto('/relatorios?status=PENDENTE&modal=RODOVIARIO');
  const linha = page.getByRole('table', { name: 'Cotações Spot' }).getByRole('row').nth(1);
  const codigo = (await linha.getByRole('button').first().textContent())!.trim();
  expect(codigo).toMatch(/^JQ-\d{6}$/);

  // Visão cliente (sem custos) e operação (com MKUP)
  await linha.getByRole('button', { name: codigo, exact: true }).click();
  const painel = page.getByRole('dialog');
  await expect(painel.getByText(`Cotação ${codigo}`)).toBeVisible();
  await expect(painel.getByTestId('visao-cliente')).toContainText('Valor do frete');
  await expect(painel.getByTestId('visao-cliente')).not.toContainText('MKUP');
  await painel.getByRole('tab', { name: /Visão operação/ }).click();
  await expect(painel.getByTestId('visao-operacao')).toContainText('MKUP total aplicado');
  await expect(painel.getByTestId('visao-operacao')).toContainText('Custo base');

  // Editar abre a cotação no Frete Spot
  await painel.getByRole('button', { name: 'Editar' }).click();
  await expect(page).toHaveURL(/\/spot$/);
  await expect(page.getByText(`Cotação ${codigo}`)).toBeVisible();

  // Alterar status e excluir
  await page.goto(`/relatorios?q=${codigo}`);
  const l = page.getByRole('row', { name: new RegExp(codigo) });
  await l.getByTitle('Alterar status').click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('radio', { name: /Declinada/ }).click();
  await dlg.getByRole('button', { name: 'Marcar como Declinada' }).click();
  await expect(page.getByText(`Cotação ${codigo}: Declinada.`)).toBeVisible();
  await expect(l).toContainText('Declinada');

  await l.getByRole('button', { name: `Ações da cotação ${codigo}` }).click();
  await page.getByRole('menuitem', { name: 'Excluir' }).click();
  await page.getByRole('button', { name: 'Excluir cotação' }).click();
  await expect(page.getByText(`Cotação ${codigo} excluída.`)).toBeVisible();
  await expect(page.getByText('Nenhuma cotação encontrada')).toBeVisible();
});

test('relatório: Operacional não vê "Excluir"; Aprovada não pode ser editada', async ({ page }) => {
  await entrar(page, 'bruno.lima');
  await page.goto('/relatorios?status=APROVADA');
  const linha = page.getByRole('table', { name: 'Cotações Spot' }).getByRole('row').nth(1);
  await linha.getByRole('button', { name: /Ações da cotação/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Excluir' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /Editar/ })).toBeDisabled();
});

test('relatório: Excel das cotações filtradas', async ({ page }) => {
  await entrar(page);
  await page.goto('/relatorios?modal=AEREO');
  const api = await (await page.request.get('/api/reports/spot?modal=AEREO')).json();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar Excel' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^cotacoes-spot-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await readFile(await download.path())) as unknown as ArrayBuffer);
  const ws = wb.getWorksheet('Cotações')!;
  expect(ws.rowCount).toBe(api.stats.count + 2); // cabeçalho + linhas + totais
  for (let r = 2; r <= api.stats.count + 1; r++)
    expect(ws.getRow(r).getCell(6).value).toBe('Aéreo');
  const total = ws.getRow(api.stats.count + 2).getCell(13).value as { result: number };
  expect(total.result).toBeCloseTo(Number(api.stats.value), 2);
});

test('dashboard: KPIs da API, filtro por modal e atalho do status para o relatório', async ({
  page,
}) => {
  await entrar(page);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  const kpi = (nome: string) => page.getByTestId(`kpi-${nome}`).getByTestId('kpi-valor');
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const [a, m] = hoje.split('-').map(Number) as [number, number];
  const de = `${m === 12 ? a : a - 1}-${String((m % 12) + 1).padStart(2, '0')}-01`;
  // Outros arquivos de teste rodam em paralelo e criam cotações: compara tela e API de novo
  // (recarregando) até baterem.
  await expect(async () => {
    const api = await (await page.request.get(`/api/dashboard?from=${de}&to=${hoje}`)).json();
    await page.reload();
    await expect(kpi('Cotações')).toHaveText(String(api.kpis.total), { timeout: 2000 });
    await expect(kpi('Valor cotado')).toHaveText(brl(api.kpis.quotedValue), { timeout: 2000 });
    await expect(kpi('Valor aprovado')).toHaveText(brl(api.kpis.approvedValue), {
      timeout: 2000,
    });
    await expect(kpi('Conversão')).toHaveText(
      `${Number(api.kpis.conversionPct).toFixed(1).replace('.', ',')}%`,
      { timeout: 2000 },
    );
  }).toPass({ timeout: 20_000 });
  await expect(
    page.getByTestId('grafico-mensal').locator('.recharts-bar-rectangle').first(),
  ).toBeVisible();
  await expect(page.getByTestId('top-rotas').getByRole('listitem').nth(1)).toBeVisible();

  await page.getByRole('radio', { name: 'FTL' }).click();
  await expect(page).toHaveURL(/modal=FTL/);
  await expect(async () => {
    const ftl = await (
      await page.request.get(`/api/dashboard?from=${de}&to=${hoje}&modal=FTL`)
    ).json();
    await page.reload();
    await expect(kpi('Cotações')).toHaveText(String(ftl.kpis.total), { timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByText(/Tabela FTL: SP Capital/).first()).toBeVisible();

  await page.getByRole('radio', { name: 'Rodoviário' }).click();
  await page.getByTitle('Ver cotações aprovadas no relatório').click();
  await expect(page).toHaveURL(/\/relatorios\?status=APROVADA&modal=RODOVIARIO/);
});

// ── Screenshots ──

for (const tema of ['light', 'dark'] as const) {
  for (const vp of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    test(`screenshots fase 5 ${tema} ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await entrar(page);
      await page.addInitScript((t) => localStorage.setItem('jat-theme', t), tema);
      const foto = async (nome: string, fullPage = true) => {
        await page.waitForTimeout(700);
        await page.screenshot({
          path: `e2e/screenshots/fase5-${nome}-${tema}-${vp.width}x${vp.height}.png`,
          fullPage,
        });
      };
      await page.goto('/dashboard');
      await expect(page.getByTestId('grafico-mensal')).toBeVisible();
      await foto('dashboard');
      await page.getByRole('heading', { name: 'Atividade recente' }).scrollIntoViewIfNeeded();
      await foto('dashboard-baixo', false);

      await page.goto('/relatorios');
      await expect(page.getByTestId('paginacao')).toBeVisible();
      await foto('relatorio');

      const linha = page.getByRole('table', { name: 'Cotações Spot' }).getByRole('row').nth(1);
      await linha.getByRole('button').first().click();
      await page.getByRole('tab', { name: /Visão operação/ }).click();
      await foto('relatorio-visao', false);
    });
  }
}
