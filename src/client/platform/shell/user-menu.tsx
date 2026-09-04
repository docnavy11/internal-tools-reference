import { useState } from 'react';
import { LogOutIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from '@/client/platform/auth/session';
import { UserAvatar } from '@/client/platform/shell/user-avatar';
import { Badge } from '@/client/platform/ui/badge';
import { Button } from '@/client/platform/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/platform/ui/dropdown-menu';

export function UserMenu() {
  const { user, logout } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;

  const signOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } catch {
      toast.error('Could not sign out. Please try again.');
      setSigningOut(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu">
          <UserAvatar name={user.name} email={user.email} avatarUrl={user.avatarUrl} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="flex flex-col gap-1 px-2 py-1.5">
          <span className="truncate text-sm font-medium">{user.name ?? user.email}</span>
          <span className="text-muted-foreground truncate text-xs">{user.email}</span>
          <Badge variant="secondary" className="mt-1 w-fit capitalize">
            {user.role}
          </Badge>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onSelect={() => void signOut()}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
