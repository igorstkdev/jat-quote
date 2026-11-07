import { KeyRound, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLogout, useMe } from '@/lib/auth';
import { iniciais } from '@/lib/format';

export const ROTULO_PERFIL = { ADMIN: 'Admin', OPERACIONAL: 'Operacional' } as const;

export function UserMenu() {
  const { data: user } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  if (!user) return null;

  const sair = () =>
    logout.mutate(undefined, {
      onSuccess: () => toast.success('Você saiu do sistema.'),
      onSettled: () => navigate('/login', { replace: true }),
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="hover:bg-accent focus-visible:ring-ring/50 flex items-center gap-2.5 rounded-lg py-1 pr-2 pl-1 outline-none focus-visible:ring-[3px]"
        aria-label="Menu do usuário"
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {iniciais(user.name)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden flex-col items-start leading-tight sm:flex">
          <span className="text-sm font-medium">{user.name}</span>
          <span className="text-muted-foreground text-xs">{ROTULO_PERFIL[user.role]}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{user.name}</div>
          <div className="text-muted-foreground text-xs">@{user.username}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/minha-conta')}>
          <KeyRound />
          Trocar minha senha
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={sair} variant="destructive">
          <LogOut />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
