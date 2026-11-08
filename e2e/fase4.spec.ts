import { expect, test, type Page } from '@playwright/test';

const SENHA = 'E2eSenha123';

async function entrar(page: Page, username = 'admin.e2e') {
  const res = await page.request.post('/api/auth/login', {
    headers: { 'x-jat-requested': '1' },
    data: { username, password: SENHA },
  });
  expect(res.ok()).toBe(true);
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('calculadora rápida: companhias do menor para o maior custo e "Usar no Frete Spot"', async ({
  page,
}) => {
  await entrar(page);
  await page.goto('/tarifas-aereas');
  await expect(page.getByRole('heading', { name: 'Tarifas Aéreas' })).toBeVisible();
  await expect(page.getByText('Aguardando cálculo')).toBeVisible();

  await page.locator('#calc-origem').fill('gru');
  await page.locator('#calc-destino').fill('ssa');
  await page.getByRole('radio', { name: 'Urgente' }).click();
  await page.locator('#calc-peso').fill('20,5');

  const opcoes = page.getByTestId('opcao-tarifa');
  await expect(opcoes).toHaveCount(3);
  // LATAM 20,5 × 11 = 225,50 ; GOL 20,5 × 12,5 = 256,25 ; AZUL 205 < mínimo 300
  await expect(opcoes.nth(0)).toContainText('LATAM');
  await expect(opcoes.nth(0)).toContainText('R$ 225,50');
  await expect(opcoes.nth(0)).toContainText('Menor custo');
  await expect(opcoes.nth(1)).toContainText('R$ 256,25');
  await expect(opcoes.nth(2)).toContainText('AZUL');
  await expect(opcoes.nth(2)).toContainText('Mínimo aplicado');

  await page.getByRole('radio', { name: 'Rápido' }).click();
  await expect(opcoes).toHaveCount(2);

  await page.getByRole('radio', { name: 'Urgente' }).click();
  await expect(opcoes).toHaveCount(3);
  await opcoes.nth(0).getByRole('button', { name: 'Usar no Frete Spot' }).click();
  await expect(page).toHaveURL(/\/spot$/);
  await expect(page.getByRole('radio', { name: 'Aéreo' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#spot-custo-AEREO')).toHaveValue('225,50');
});

test('nova tarifa, vigência sobreposta bloqueada e prévia do CSV com erro', async ({ page }) => {
  await entrar(page);
  await page.goto('/tarifas-aereas');
  const nova = async () => {
    await page.getByRole('button', { name: 'Nova tarifa' }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.locator('#t-origem').fill('cnf');
    await dlg.locator('#t-destino').fill('for');
    await dlg.getByRole('radio', { name: 'AZUL' }).click();
    await dlg.locator('#t-inicio').fill('01012026');
    await dlg.locator('#t-URGENTE-kg').fill('15,5');
    await dlg.locator('#t-URGENTE-min').fill('200');
    await dlg.getByRole('button', { name: 'Cadastrar tarifa' }).click();
    return dlg;
  };
  await nova();
  await expect(page.getByText('Tarifa AZUL CNF → FOR cadastrada.')).toBeVisible();
  await expect(page.getByRole('row', { name: /CNF.*FOR/ })).toBeVisible();

  const dlg = await nova();
  await expect(dlg.getByRole('alert')).toContainText('Já existe uma tarifa ativa AZUL CNF → FOR');
  await dlg.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('button', { name: 'Importar CSV' }).first().click();
  const csv = [
    'Origem;Destino;Companhia;Urgente R$/Kg;Urgente Min;Rápido R$/Kg;Rápido Min;Econômico R$/Kg;Econômico Min;Status;Versão;Vigência Início;Vigência Fim;Observações',
    'GIG;SSA;GOL;12,00;150,00;;;;;Ativa;1;01/01/2026;;',
    'GIG;SSA;TAM;12,00;150,00;;;;;Ativa;1;01/01/2026;;',
  ].join('\r\n');
  await page.locator('input[type=file]').setInputFiles({
    name: 'tarifas.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  const previa = page.getByTestId('previa-importacao');
  await expect(previa).toContainText('Companhia "TAM" inválida');
  await expect(page.getByRole('button', { name: /^Importar 1 linha/ })).toBeDisabled();
});

test('FTL (app atual): SP Capital, VAN R$ 3,60/km × 300 km → R$ 1.080,00; mínimo 25 km; status', async ({
  page,
}) => {
  await entrar(page);
  await page.goto('/ftl');
  await page.locator('#ftl-uf').click();
  await page.getByRole('option', { name: /^SP/ }).click();
  await page.getByRole('radio', { name: 'Capital' }).click();
  await page.getByRole('radio', { name: /^VAN/ }).click();
  await expect(page.getByRole('radio', { name: /^VAN/ })).toContainText('R$ 3,60/km');

  await page.locator('#ftl-km').fill('20');
  await expect(page.getByText('KM da rota: mínimo 25 km.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar cotação' })).toBeDisabled();

  await page.locator('#ftl-km').fill('300');
  await expect(page.getByTestId('ftl-total')).toHaveText('R$ 1.080,00');
  await expect(page.getByText('0,50% sobre a NF')).toBeVisible();
  await expect(page.getByText(/O ATENDIMENTO SOMENTE PODERÁ SER ACIONADO/)).toBeVisible();

  await page.getByRole('button', { name: 'Salvar cotação' }).click();
  const toast = page.getByText(/Cotação JQ-\d{6} salva\./);
  await expect(toast).toBeVisible();
  const codigo = ((await toast.textContent()) ?? '').match(/JQ-\d{6}/)![0];

  await page.getByRole('button', { name: 'Copiar' }).click();
  const texto = await page.evaluate(() => navigator.clipboard.readText());
  expect(texto).toContain(`*COTAÇÃO FTL FIAT ${codigo}*`);
  expect(texto).toContain('Destino: SP — Capital (Sudeste)');
  expect(texto).toContain('*Valor do frete: R$ 1.080,00*');
  expect(texto).toContain('Ad valorem de 0,50%');
  expect(texto).toContain('*Condições comerciais:*');

  await page.getByRole('tab', { name: 'Relatório' }).click();
  await expect(page).toHaveURL(/\/ftl\/relatorio$/);
  const linha = page.getByRole('row', { name: new RegExp(codigo) });
  await expect(linha).toContainText('R$ 1.080,00');
  await linha.getByTitle('Alterar status').click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('radio', { name: /Aprovada/ }).click();
  await dlg.getByRole('button', { name: 'Marcar como Aprovada' }).click();
  await expect(page.getByText(`Cotação ${codigo}: Aprovada.`)).toBeVisible();
  await expect(linha).toContainText('Aprovada');
});

test('"Pode editar tarifas" sem ser Admin: cadastra, mas não vê "Excluir tudo"', async ({
  page,
}) => {
  await entrar(page, 'bruno.lima');
  await page.goto('/tarifas-aereas');
  await expect(page.getByRole('button', { name: 'Nova tarifa' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mais ações' })).toHaveCount(0);
});

// ── Screenshots ──

for (const tema of ['light', 'dark'] as const) {
  for (const vp of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    test(`screenshots fase 4 ${tema} ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await entrar(page);
      const me = (await (await page.request.get('/api/auth/me')).json()).user;
      await page.addInitScript(
        ({ t, u }) => {
          localStorage.setItem('jat-theme', t);
          localStorage.setItem(
            `jat-calc-tarifa:${u}`,
            JSON.stringify({ origem: 'GRU', destino: 'SSA', nivel: 'URGENTE', peso: '20,5' }),
          );
          localStorage.setItem(
            `jat-rascunho-ftl:${u}`,
            JSON.stringify({
              form: { uf: 'SP', localidade: 'CAPITAL', veiculo: 'VAN', km: '300', obs: '' },
              cotacao: null,
            }),
          );
        },
        { t: tema, u: me.id },
      );
      const foto = async (nome: string) => {
        await page.waitForTimeout(450);
        await page.screenshot({
          path: `e2e/screenshots/fase4-${nome}-${tema}-${vp.width}x${vp.height}.png`,
          fullPage: true,
        });
      };
      await page.goto('/tarifas-aereas');
      await expect(page.getByTestId('opcao-tarifa').first()).toBeVisible();
      await foto('tarifas');
      await page.getByRole('heading', { name: 'Tarifas cadastradas' }).scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `e2e/screenshots/fase4-tarifas-tabela-${tema}-${vp.width}x${vp.height}.png`,
      });
      await page.getByRole('button', { name: 'Nova tarifa' }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `e2e/screenshots/fase4-tarifa-dialog-${tema}-${vp.width}x${vp.height}.png`,
      });
      await page.keyboard.press('Escape');
      await page.goto('/ftl');
      await expect(page.getByTestId('ftl-total')).toHaveText('R$ 1.080,00');
      await foto('ftl-calculadora');
      await page.goto('/ftl/tabelas');
      await expect(page.getByRole('cell', { name: 'BA', exact: true })).toBeVisible();
      await foto('ftl-tabelas');
      for (const [uf, localidade, veiculo, km] of [
        ['SP', 'CAPITAL', 'VAN', '300'],
        ['MG', 'INTERIOR', 'TRES_QUARTOS', '612,5'],
        ['BA', 'CAPITAL', 'UTILITARIO', '1962'],
      ] as const) {
        const r = await page.request.post('/api/ftl/quotes', {
          headers: { 'x-jat-requested': '1' },
          data: { uf, locality: localidade, vehicle: veiculo, distanceKm: km },
        });
        expect(r.ok()).toBe(true);
      }
      await page.goto('/ftl/relatorio');
      await expect(page.getByText('R$ 2.695,00').first()).toBeVisible();
      await foto('ftl-relatorio');
    });
  }
}
