import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LicencaGate } from '@/components/licenca';
import { ApiError } from './lib/api';
import { SessaoWatcher } from './lib/auth';
import { ThemeProvider, useTheme } from './lib/theme';
import { router } from './router';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Não insiste em erros de permissão/validação; tenta de novo só em falha de rede/servidor.
      retry: (n, e) => n < 2 && (!(e instanceof ApiError) || e.status === 0 || e.status >= 500),
    },
  },
});

function Toasts() {
  const { theme } = useTheme();
  return <Toaster theme={theme} richColors position="bottom-right" closeButton />;
}

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado');

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <SessaoWatcher />
          <LicencaGate>
            <Suspense>
              <RouterProvider router={router} />
            </Suspense>
          </LicencaGate>
          <Toasts />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
