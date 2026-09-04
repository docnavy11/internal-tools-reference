import { Avatar, AvatarFallback, AvatarImage } from '@/client/platform/ui/avatar';
import { cn } from '@/client/lib/utils';

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0] ?? '');
  return letters.join('').toUpperCase() || '?';
}

export function UserAvatar({
  name,
  email,
  avatarUrl,
  className,
}: {
  name: string | null;
  email: string;
  avatarUrl?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn('size-7', className)}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
      <AvatarFallback className="text-xs">{initials(name, email)}</AvatarFallback>
    </Avatar>
  );
}
