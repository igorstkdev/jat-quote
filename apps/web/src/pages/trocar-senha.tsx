import { KeyRound } from 'lucide-react';
import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ChangePasswordForm } from '@/components/change-password-form';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { useLogout, useMe } from '@/lib/auth';

/** Troca obrigatória no primeiro acesso ou após redefinição pelo Admin. */
export default function TrocarSenhaPage() {
  const { data: user } = useMe();
  const navigate = useNavigate();
  const logout = useLogout();

  useEffect(() => {
    document.title = 'Defina sua senha · JAT Quote';
  }, []);

  if (!user) return <Navigate to="/login" replace />;
  if (!user.mustChangePassword) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Logo className="mb-8" />
        <div className="bg-primary/10 text-primary mb-4 flex size-10 items-center justify-center rounded-lg">
          <KeyRound className="size-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Defina sua senha</h1>
        <p className="text-muted-foreground mt-1 mb-6 text-sm">
          Olá, {user.name}. Por segurança, troque a senha temporária antes de continuar.
        </p>
        <ChangePasswordForm
          rotuloBotao="Definir senha e entrar"
          onSucesso={() => {
            toast.success('Senha definida. Bem-vindo ao JAT Quote!');
            navigate('/', { replace: true });
          }}
        />
        <Button
          variant="link"
          className="text-muted-foreground mt-4 px-0"
          onClick={() =>
            logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })
          }
        >
          Sair e entrar com outro usuário
        </Button>
      </div>
    </div>
  );
}
