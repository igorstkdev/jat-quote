import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { ThemeProvider } from './lib/theme';

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
});

describe('App (Fase 0)', () => {
  it('mostra os dados do banco quando a API responde', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'ok',
            api: { name: 'JAT Quote API', version: '0.1.0' },
            database: {
              connected: true,
              version: 'PostgreSQL 18.6',
              serverTime: '2026-11-07T15:00:00.000Z',
              settings: 0,
            },
          }),
          { status: 200 },
        ),
      ),
    );
    renderApp();
    expect(await screen.findByText('PostgreSQL 18.6')).toBeInTheDocument();
    expect(screen.getByText('Todos os serviços operacionais')).toBeInTheDocument();
    // 15:00 UTC = 12:00 em São Paulo
    expect(screen.getByText('07/11/2026, 12:00:00')).toBeInTheDocument();
  });

  it('mostra erro em português quando o banco está fora', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Não foi possível conectar ao banco de dados.' }), {
          status: 503,
        }),
      ),
    );
    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível conectar ao banco de dados.',
    );
  });

  it('alterna entre tema claro e escuro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Usar tema escuro' }));
    expect(document.documentElement).toHaveClass('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Usar tema claro' }));
    expect(document.documentElement).not.toHaveClass('dark');
  });
});

describe('App sem API', () => {
  it('explica em português quando a API não responde (502 do proxy)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 502 })));
    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A API não está respondendo. Verifique se o servidor está ligado.',
    );
  });
});
