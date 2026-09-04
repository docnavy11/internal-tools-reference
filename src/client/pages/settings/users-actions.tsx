import { useState } from 'react';
import { MoreHorizontalIcon, UserPlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/client/platform/shell/confirm-dialog';
import { Button } from '@/client/platform/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/client/platform/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/client/platform/ui/dropdown-menu';
import { Input } from '@/client/platform/ui/input';
import { Label } from '@/client/platform/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/platform/ui/select';
import { roles, type Role } from '@/shared/permissions';
import type { User } from '@/shared/features/users/schema';
import {
  describeApiError,
  useInviteUser,
  useRevokeSessions,
  useUpdateUser,
} from '@/client/pages/settings/users-api';

export function InviteUserDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [error, setError] = useState<string | null>(null);
  const invite = useInviteUser();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await invite.mutateAsync({ email, role });
      toast.success(`Invited ${email}.`);
      setOpen(false);
      setEmail('');
      setRole('member');
    } catch (caught) {
      setError(describeApiError(caught));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlusIcon />
          Invite user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>Invite a user</DialogTitle>
            <DialogDescription>
              They can sign in with this address even if their email domain is not allowed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                required
                autoFocus
                placeholder="person@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={role} onValueChange={(value) => setRole(value as Role)}>
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((option) => (
                    <SelectItem key={option} value={option} className="capitalize">
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? 'Inviting…' : 'Send invite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Inline role change. Disabled for your own row: the server refuses `self_change`. */
export function RoleSelect({ user, isSelf }: { user: User; isSelf: boolean }) {
  const update = useUpdateUser();

  const change = async (role: Role) => {
    try {
      await update.mutateAsync({ id: user.id, role });
      toast.success(`${user.email} is now ${role}.`);
    } catch (caught) {
      toast.error(describeApiError(caught));
    }
  };

  return (
    <Select
      value={user.role}
      disabled={isSelf || update.isPending}
      onValueChange={(value) => void change(value as Role)}
    >
      <SelectTrigger size="sm" className="w-28 capitalize" aria-label={`Role for ${user.email}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((option) => (
          <SelectItem key={option} value={option} className="capitalize">
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function UserRowActions({ user, isSelf }: { user: User; isSelf: boolean }) {
  const [confirming, setConfirming] = useState<'status' | 'revoke' | null>(null);
  const update = useUpdateUser();
  const revoke = useRevokeSessions();
  const disabling = user.status === 'active';

  const toggleStatus = async () => {
    try {
      await update.mutateAsync({ id: user.id, status: disabling ? 'disabled' : 'active' });
      toast.success(`${user.email} is now ${disabling ? 'disabled' : 'active'}.`);
      setConfirming(null);
    } catch (caught) {
      toast.error(describeApiError(caught));
    }
  };

  const revokeSessions = async () => {
    try {
      await revoke.mutateAsync(user.id);
      toast.success(`Signed ${user.email} out everywhere.`);
      setConfirming(null);
    } catch (caught) {
      toast.error(describeApiError(caught));
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.email}`}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={isSelf} onSelect={() => setConfirming('status')}>
            {disabling ? 'Disable user' : 'Enable user'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirming('revoke')}>
            Revoke sessions
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirming === 'status'}
        onOpenChange={(open) => setConfirming(open ? 'status' : null)}
        title={disabling ? `Disable ${user.email}?` : `Enable ${user.email}?`}
        description={
          disabling
            ? 'They will be signed out everywhere and cannot sign in again until an admin re-enables the account.'
            : 'They will be able to sign in again.'
        }
        confirmLabel={disabling ? 'Disable' : 'Enable'}
        destructive={disabling}
        busy={update.isPending}
        onConfirm={() => void toggleStatus()}
      />
      <ConfirmDialog
        open={confirming === 'revoke'}
        onOpenChange={(open) => setConfirming(open ? 'revoke' : null)}
        title={`Revoke sessions for ${user.email}?`}
        description={
          isSelf
            ? 'This signs you out on every device, including this one.'
            : 'They will be signed out on every device and will have to sign in again.'
        }
        confirmLabel="Revoke"
        destructive
        busy={revoke.isPending}
        onConfirm={() => void revokeSessions()}
      />
    </>
  );
}
