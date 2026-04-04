import { useQuery } from '@tanstack/react-query';
import { listAdminUsers, type AdminUser } from '../../api/admin';
import { Layout } from '../../components/layout/Layout';
import { Spinner } from '../../components/ui/Spinner';

function roleBadge(role: string) {
  const map: Record<string, string> = {
    ADMIN:    'bg-red-100 text-red-700',
    MAID:     'bg-blue-100 text-blue-700',
    CUSTOMER: 'bg-gray-100 text-gray-600',
  };
  return map[role] ?? 'bg-gray-100 text-gray-600';
}

export function AdminUsersPage() {
  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ['adminUsers'],
    queryFn:  () => listAdminUsers(),
  });

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">All Users</h1>
        <p className="text-gray-500 mb-6">{isLoading ? '—' : users.length} registered users</p>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : (
          <div className="space-y-3">
            {users.map(user => (
              <div key={user.id} className="card flex items-center gap-4">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.fullName}
                    className="h-10 w-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center shrink-0 text-brand-700 font-bold text-sm">
                    {user.fullName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{user.fullName}</p>
                  <p className="text-sm text-gray-500 truncate">{user.email}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(user.roles ?? []).filter(Boolean).map(role => (
                    <span key={role} className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleBadge(role)}`}>
                      {role}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-400 shrink-0 hidden sm:block">
                  {new Date(user.createdAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
