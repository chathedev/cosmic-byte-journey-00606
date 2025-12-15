import { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Database, HardDrive, Server, Clock, AlertCircle, CheckCircle, Mail, CreditCard, Globe, Download, Trash2, RefreshCw, Construction, Cloud, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from 'sonner';
import { backendApi, DashboardData, HealthCheck } from '@/lib/backendApi';
import { apiClient, MaintenanceStatus } from '@/lib/api';
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const AdminBackend = () => {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceStatus | null>(null);
  const [maintenancePending, setMaintenancePending] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: 'cleanup' | 'restart' | null;
    title: string;
    description: string;
  }>({
    open: false,
    action: null,
    title: '',
    description: '',
  });

  const fetchData = async () => {
    try {
      const [dashboardData, healthData, maintenanceData] = await Promise.all([
        backendApi.getDashboard(),
        backendApi.getHealth(),
        apiClient.getMaintenanceStatus().catch(() => ({ success: false, maintenance: { enabled: false } })),
      ]);
      setDashboard(dashboardData);
      setHealth(healthData);
      
      if (maintenanceData.success) {
        setMaintenance(maintenanceData.maintenance);
      }
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch backend data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCleanup = async () => {
    setIsActionLoading('cleanup');
    try {
      const result = await backendApi.cleanup('all');
      toast.success(`${result.freedSpace.formatted} frigjort`);
      fetchData();
    } catch (error) {
      toast.error('Kunde inte rensa filer');
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleBackup = async () => {
    setIsActionLoading('backup');
    try {
      const result = await backendApi.backup(['all']);
      const blob = new Blob([JSON.stringify(result.backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tivly-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup nedladdad');
    } catch (error) {
      toast.error('Kunde inte skapa backup');
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleRestart = async () => {
    setIsActionLoading('restart');
    try {
      await backendApi.restart();
      toast.success('Server startar om...');
    } catch (error) {
      toast.error('Kunde inte starta om servern');
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleMaintenanceToggle = async () => {
    const previousState = maintenance?.enabled ?? false;
    const newState = !previousState;
    
    setMaintenancePending(true);
    setMaintenance(prev => prev ? { ...prev, enabled: newState } : { enabled: newState });
    
    try {
      const result = await apiClient.toggleMaintenance();
      setMaintenance(result.maintenance);
      toast.success(result.maintenance.enabled ? 'Underhållsläge på' : 'Underhållsläge av');
      
      setTimeout(async () => {
        try {
          const verifyResult = await apiClient.getMaintenanceStatus();
          if (verifyResult.success) {
            setMaintenance(verifyResult.maintenance);
          }
        } catch (e) {}
        setMaintenancePending(false);
      }, 3000);
    } catch (error) {
      setMaintenance(prev => prev ? { ...prev, enabled: previousState } : { enabled: previousState });
      setMaintenancePending(false);
      toast.error('Kunde inte ändra underhållsläge');
    }
  };

  const openConfirmDialog = (action: 'cleanup' | 'restart') => {
    const dialogs = {
      cleanup: {
        title: 'Rensa temporära filer',
        description: 'Radera alla temporära filer?',
      },
      restart: {
        title: 'Starta om servern',
        description: 'Tjänsten avbryts tillfälligt.',
      },
    };
    setConfirmDialog({ open: true, action, ...dialogs[action] });
  };

  const handleConfirmAction = async () => {
    const { action } = confirmDialog;
    setConfirmDialog({ open: false, action: null, title: '', description: '' });
    if (action === 'cleanup') await handleCleanup();
    else if (action === 'restart') await handleRestart();
  };

  const apiOnline = dashboard?.status === 'online';
  const memoryPercentage = dashboard?.memory?.system?.usagePercent 
    ?? (dashboard?.memory?.system 
      ? (dashboard.memory.system.used.bytes / dashboard.memory.system.total.bytes) * 100 
      : 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-muted-foreground">Laddar...</div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-background">
        {/* Minimal Header */}
        <div className="border-b border-border/50">
          <div className="max-w-4xl mx-auto px-6 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted/50">
                  <Layers className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <h1 className="text-lg font-medium">Backend</h1>
                  <p className="text-xs text-muted-foreground">
                    {lastUpdate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Badge 
                  variant={apiOnline ? 'default' : 'destructive'} 
                  className="gap-1.5 font-normal"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${apiOnline ? 'bg-green-300 animate-pulse' : 'bg-red-300'}`} />
                  {apiOnline ? 'Online' : 'Offline'}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
          
          {/* Status Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-0 bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Server className="w-3.5 h-3.5" />
                  <span className="text-xs">API</span>
                </div>
                <p className="font-medium">{apiOnline ? 'Aktiv' : 'Nere'}</p>
              </CardContent>
            </Card>
            
            <Card className="border-0 bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Cloud className="w-3.5 h-3.5" />
                  <span className="text-xs">Cloud</span>
                </div>
                <p className="font-medium">Aktiv</p>
              </CardContent>
            </Card>
            
            <Card className="border-0 bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-xs">Uptime</span>
                </div>
                <p className="font-medium">{dashboard?.uptime.formatted || '--'}</p>
              </CardContent>
            </Card>
            
            <Card className="border-0 bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <HardDrive className="w-3.5 h-3.5" />
                  <span className="text-xs">RAM</span>
                </div>
                <p className="font-medium">{memoryPercentage.toFixed(0)}%</p>
              </CardContent>
            </Card>
          </div>

          {/* Health */}
          {health && (
            <Card className="border-0 bg-muted/30">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    {health.overall === 'healthy' ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-yellow-500" />
                    )}
                    <span className="text-sm font-medium">Systemhälsa</span>
                  </div>
                  <Badge variant={health.overall === 'healthy' ? 'default' : 'secondary'} className="font-normal">
                    {health.overall === 'healthy' ? 'OK' : 'Varning'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {health.checks.map((check) => (
                    <div key={check.name} className="flex items-center gap-2 text-sm">
                      {check.status === 'healthy' ? (
                        <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                      )}
                      <span className="text-muted-foreground truncate">{check.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Maintenance Toggle */}
          <Card className="border-0 bg-muted/30">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Construction className={`w-4 h-4 ${maintenance?.enabled ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                  <div>
                    <p className="text-sm font-medium">Underhållsläge</p>
                    <p className="text-xs text-muted-foreground">
                      {maintenance?.enabled ? 'Användare ser underhållsmeddelande' : 'Appen fungerar normalt'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {maintenancePending && (
                    <div className="w-3 h-3 border border-muted-foreground border-t-transparent rounded-full animate-spin" />
                  )}
                  <Switch
                    checked={maintenance?.enabled ?? false}
                    onCheckedChange={handleMaintenanceToggle}
                    disabled={maintenancePending || isActionLoading !== null}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Services */}
          {dashboard && (
            <Card className="border-0 bg-muted/30">
              <CardContent className="p-5">
                <p className="text-sm font-medium mb-4">Tjänster</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm">Email (SMTP)</p>
                        <p className="text-xs text-muted-foreground">{dashboard.services.smtp.host}</p>
                      </div>
                    </div>
                    <Badge variant={dashboard.services.smtp.configured ? 'default' : 'secondary'} className="font-normal">
                      {dashboard.services.smtp.configured ? 'OK' : 'Ej konfigurerad'}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm">Stripe</p>
                        <p className="text-xs text-muted-foreground capitalize">{dashboard.services.stripe.mode}</p>
                      </div>
                    </div>
                    <Badge variant={dashboard.services.stripe.configured ? 'default' : 'secondary'} className="font-normal">
                      {dashboard.services.stripe.configured ? 'OK' : 'Ej konfigurerad'}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <Database className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm">Databas</p>
                        <p className="text-xs text-muted-foreground">{dashboard.database.type}</p>
                      </div>
                    </div>
                    <Badge variant="default" className="font-normal">
                      {dashboard.database.collections.users} användare
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Storage */}
          {dashboard && (
            <Card className="border-0 bg-muted/30">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium">Lagring</p>
                  <span className="text-sm text-muted-foreground">{dashboard.storage.total.formatted}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Användare</span>
                    <span>{dashboard.storage.breakdown.users.formatted}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Agendor</span>
                    <span>{dashboard.storage.breakdown.agendas.formatted}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Kampanjer</span>
                    <span>{dashboard.storage.breakdown.campaigns.formatted}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={handleBackup}
              disabled={isActionLoading !== null}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              {isActionLoading === 'backup' ? (
                <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Backup
            </Button>
            
            <Button 
              onClick={() => openConfirmDialog('cleanup')}
              disabled={isActionLoading !== null}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              {isActionLoading === 'cleanup' ? (
                <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              Rensa
            </Button>
            
            <Button 
              onClick={() => openConfirmDialog('restart')}
              disabled={isActionLoading !== null}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              {isActionLoading === 'restart' ? (
                <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Starta om
            </Button>
          </div>

          {/* Footer info */}
          <div className="pt-4 border-t border-border/30">
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>api.tivly.se</span>
              <span>Node {dashboard?.environment.nodeVersion}</span>
              <span className="capitalize">{dashboard?.environment.platform}/{dashboard?.environment.arch}</span>
              <span>{dashboard?.environment.cpus} cores</span>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ open: false, action: null, title: '', description: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AdminBackend;
