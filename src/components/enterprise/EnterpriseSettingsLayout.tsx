import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Building2, Lock, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useEnterpriseSettings } from '@/hooks/useEnterpriseSettings';

interface Props {
  title: string;
  description?: string;
  icon: ReactNode;
  children: (ctx: ReturnType<typeof useEnterpriseSettings>) => ReactNode;
}

export function EnterpriseSettingsLayout({ title, description, icon, children }: Props) {
  const navigate = useNavigate();
  const ctx = useEnterpriseSettings();

  if (!ctx.isEnterprise) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <Shield className="w-10 h-10 mx-auto text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">Enterprise-inställningar är bara tillgängliga för Enterprise-planen.</p>
        </div>
      </div>
    );
  }

  if (ctx.loading || !ctx.data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/org/enterprise-settings')} className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="p-2 rounded-lg bg-primary/10 shrink-0">
              {icon}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-semibold truncate">{title}</h1>
              {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="bg-primary/15 text-primary text-xs gap-1">
              <Building2 className="w-3 h-3" />Enterprise
            </Badge>
            {ctx.hasLocks && (
              <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
                <Lock className="w-3 h-3" />Låst
              </Badge>
            )}
          </div>
        </div>

        {!ctx.canEdit && (
          <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 text-xs text-amber-700 dark:text-amber-300">
            Du har läsbehörighet men kan inte ändra enterprise-inställningar.
          </div>
        )}

        {children(ctx)}
      </div>
    </div>
  );
}
