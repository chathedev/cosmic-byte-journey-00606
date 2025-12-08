import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Activity, HardDrive, Zap, Server, Clock, AlertCircle, CheckCircle, Mail, CreditCard, Shield, Globe, Download, Trash2, RefreshCw, FileText, Users, Folder, FileCode, Construction, Cloud, Radio, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from 'sonner';
import { backendApi, DashboardData, HealthCheck } from '@/lib/backendApi';
import { apiClient, MaintenanceStatus } from '@/lib/api';
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [activeTab, setActiveTab] = useState('overview');
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: 'cleanup' | 'restart' | 'maintenance' | null;
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
      toast.error('Kunde inte hämta backend-data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Auto-refresh every 5 seconds
    const interval = setInterval(() => {
      fetchData();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const handleCleanup = async () => {
    setIsActionLoading('cleanup');
    try {
      const result = await backendApi.cleanup('all');
      toast.success(`${result.message} - ${result.freedSpace.formatted} frigjort`);
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
      
      // Download backup file
      const blob = new Blob([JSON.stringify(result.backup, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tivly-backup-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success('Backup skapad och nedladdad');
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
    
    // Optimistic update - show new state immediately
    setMaintenancePending(true);
    setMaintenance(prev => prev ? { ...prev, enabled: newState } : { enabled: newState });
    
    try {
      const result = await apiClient.toggleMaintenance();
      setMaintenance(result.maintenance);
      toast.success(result.maintenance.enabled ? 'Underhållsläge aktiverat' : 'Underhållsläge avaktiverat');
      
      // Verify with backend after 5 seconds to ensure state is correct
      setTimeout(async () => {
        try {
          const verifyResult = await apiClient.getMaintenanceStatus();
          if (verifyResult.success) {
            setMaintenance(verifyResult.maintenance);
          }
        } catch (e) {
          // Silent fail on verification
        } finally {
          setMaintenancePending(false);
        }
      }, 5000);
    } catch (error) {
      // Revert on error
      setMaintenance(prev => prev ? { ...prev, enabled: previousState } : { enabled: previousState });
      setMaintenancePending(false);
      toast.error('Kunde inte ändra underhållsläge');
    }
  };

  const openConfirmDialog = (action: 'cleanup' | 'restart' | 'maintenance') => {
    const dialogs = {
      cleanup: {
        title: 'Rensa temporära filer',
        description: 'Är du säker på att du vill radera alla temporära filer? Denna åtgärd kan inte ångras.',
      },
      restart: {
        title: 'Starta om servern',
        description: 'Är du säker på att du vill starta om servern? Detta kommer tillfälligt avbryta tjänsten.',
      },
      maintenance: {
        title: maintenance?.enabled ? 'Avaktivera underhållsläge' : 'Aktivera underhållsläge',
        description: maintenance?.enabled 
          ? 'Är du säker på att du vill avaktivera underhållsläge? Användare kommer kunna använda appen igen.'
          : 'Är du säker på att du vill aktivera underhållsläge? Användare kommer se ett meddelande om att appen är under underhåll.',
      },
    };

    setConfirmDialog({
      open: true,
      action,
      ...dialogs[action],
    });
  };

  const handleConfirmAction = async () => {
    const { action } = confirmDialog;
    setConfirmDialog({ open: false, action: null, title: '', description: '' });

    if (action === 'cleanup') {
      await handleCleanup();
    } else if (action === 'restart') {
      await handleRestart();
    } else if (action === 'maintenance') {
      await handleMaintenanceToggle();
    }
  };

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'unhealthy':
      case 'not configured':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  // Compute server status
  const apiOnline = dashboard?.status === 'online';
  const servicesOnline = (apiOnline ? 1 : 0) + 1; // +1 for Cloud which is always on
  const totalServices = 2;

  const memoryPercentage = dashboard?.memory?.system?.usagePercent 
    ?? (dashboard?.memory?.system 
      ? (dashboard.memory.system.used.bytes / dashboard.memory.system.total.bytes) * 100 
      : 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Laddar infrastruktur...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Enhanced Header */}
      <div className="sticky top-0 z-40 bg-gradient-to-r from-background via-primary/5 to-background backdrop-blur-sm border-b border-border">
        <div className="px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Layers className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Tivly Server</h1>
              <p className="text-xs text-muted-foreground">
                {lastUpdate.toLocaleTimeString('sv-SE')} • api.tivly.se
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Status Pills */}
            <div className="hidden md:flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${
                apiOnline ? 'bg-green-500/10 text-green-600 border-green-500/20' : 'bg-red-500/10 text-red-600 border-red-500/20'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${apiOnline ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                API
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border bg-green-500/10 text-green-600 border-green-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Cloud
              </div>
            </div>
            
            <Badge 
              variant={servicesOnline === totalServices ? 'default' : 'destructive'} 
              className="gap-2"
            >
              <Radio className={`w-3 h-3 ${servicesOnline === totalServices ? 'animate-pulse' : ''}`} />
              {servicesOnline}/{totalServices} Online
            </Badge>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 pb-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-3 w-full max-w-sm">
              <TabsTrigger value="overview" className="text-xs">Översikt</TabsTrigger>
              <TabsTrigger value="resources" className="text-xs">Resurser</TabsTrigger>
              <TabsTrigger value="actions" className="text-xs">Åtgärder</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Server Card */}
        <Card className="border-2 border-primary/20 bg-gradient-to-br from-background to-muted/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
                  <Server className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Tivly API Server</CardTitle>
                  <CardDescription className="font-mono text-xs">api.tivly.se</CardDescription>
                </div>
              </div>
              <div className="text-right">
                <Badge variant={apiOnline ? 'default' : 'destructive'} className="gap-2 text-sm px-3 py-1">
                  <span className={`w-2 h-2 rounded-full ${apiOnline ? 'bg-green-300' : 'bg-red-300'} animate-pulse`} />
                  {apiOnline ? 'ONLINE' : 'OFFLINE'}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* RAM Usage */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/5 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-medium text-muted-foreground">RAM</span>
                </div>
                <p className="font-bold text-lg">{memoryPercentage.toFixed(0)}%</p>
                <p className="text-xs text-muted-foreground">
                  {dashboard?.memory?.system?.used.formatted || '--'}
                </p>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all"
                    style={{ width: `${memoryPercentage}%` }}
                  />
                </div>
              </div>

              {/* Storage */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-green-500/5 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-medium text-muted-foreground">Lagring</span>
                </div>
                <p className="font-bold text-lg">{dashboard?.storage.total.formatted || '--'}</p>
                <p className="text-xs text-muted-foreground">{dashboard?.storage.status || 'Data storage'}</p>
              </div>

              {/* Uptime */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-purple-500/10 to-pink-500/5 border border-purple-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-purple-500" />
                  <span className="text-xs font-medium text-muted-foreground">Uptime</span>
                </div>
                <p className="font-bold text-lg">{dashboard?.uptime.formatted || '--'}</p>
                <p className="text-xs text-muted-foreground">Server drift</p>
              </div>

              {/* Endpoints */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-orange-500/10 to-yellow-500/5 border border-orange-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-medium text-muted-foreground">Endpoints</span>
                </div>
                <p className="font-bold text-lg">{dashboard?.functions.endpoints.total || '--'}</p>
                <p className="text-xs text-muted-foreground">
                  {dashboard?.functions.endpoints.admin || 0} admin • {dashboard?.functions.endpoints.public || 0} public
                </p>
              </div>
            </div>

            {/* Service Status Row */}
            <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <div className={`p-2 rounded-lg ${apiOnline ? 'bg-blue-500/10' : 'bg-red-500/10'}`}>
                  <Globe className={`w-5 h-5 ${apiOnline ? 'text-blue-500' : 'text-red-500'}`} />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">API Server</p>
                  <p className="text-xs text-muted-foreground font-mono">api.tivly.se</p>
                </div>
                <Badge variant={apiOnline ? 'default' : 'destructive'} className="text-xs">
                  {apiOnline ? 'ON' : 'OFF'}
                </Badge>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Cloud className="w-5 h-5 text-purple-500" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">Lovable Cloud</p>
                  <p className="text-xs text-muted-foreground">Database & Auth</p>
                </div>
                <Badge variant="default" className="text-xs">ON</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6 mt-0">
            {/* Overall Health Status */}
            {health && (
              <Card className="border-l-4" style={{ borderLeftColor: health.overall === 'healthy' ? '#10b981' : health.overall === 'warning' ? '#f59e0b' : '#ef4444' }}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {getHealthIcon(health.overall)}
                    System Health: {health.overall.toUpperCase()}
                  </CardTitle>
                  <CardDescription>
                    Senaste hälsokontroll: {new Date(health.timestamp).toLocaleString('sv-SE')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {health.checks.map((check) => (
                      <div key={check.name} className="flex items-start gap-2 p-3 rounded-lg bg-muted/30">
                        {getHealthIcon(check.status)}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{check.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{check.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Key Metrics */}
            {dashboard && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-background">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-blue-600 dark:text-blue-400">
                      <Clock className="w-4 h-4" />
                      Uptime
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{dashboard.uptime.formatted}</p>
                    <p className="text-xs text-muted-foreground mt-1">api.tivly.se</p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/20 dark:to-background">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-purple-600 dark:text-purple-400">
                      <HardDrive className="w-4 h-4" />
                      Total Lagring
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{dashboard.storage.total.formatted}</p>
                    <p className="text-xs text-muted-foreground mt-1">{dashboard.storage.status}</p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/20 dark:to-background">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-orange-600 dark:text-orange-400">
                      <Zap className="w-4 h-4" />
                      API Endpoints
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{dashboard.functions.endpoints.total}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {dashboard.functions.endpoints.admin} admin • {dashboard.functions.endpoints.public} public
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <Users className="w-4 h-4" />
                      Användare
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{dashboard.database.collections.users}</p>
                    <p className="text-xs text-muted-foreground mt-1">Registrerade konton</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Maintenance Mode */}
            <Card className={`border-l-4 ${maintenance?.enabled ? 'border-l-yellow-500' : 'border-l-green-500'}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Construction className={`w-5 h-5 ${maintenance?.enabled ? 'text-yellow-500' : 'text-green-500'}`} />
                  Underhållsläge
                </CardTitle>
                <CardDescription>
                  {maintenance?.enabled 
                    ? 'Appen är i underhållsläge - användare ser ett meddelande' 
                    : 'Appen fungerar normalt'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={maintenance?.enabled ? 'secondary' : 'default'}>
                        {maintenance?.enabled ? 'AKTIVT' : 'INAKTIVT'}
                      </Badge>
                      {maintenancePending && (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <div className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />
                          Verifierar...
                        </Badge>
                      )}
                    </div>
                    {maintenance?.updatedAt && (
                      <p className="text-xs text-muted-foreground">
                        Senast ändrad: {new Date(maintenance.updatedAt).toLocaleString('sv-SE')}
                        {maintenance.updatedByName && ` av ${maintenance.updatedByName}`}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => openConfirmDialog('maintenance')}
                    disabled={isActionLoading !== null || maintenancePending}
                    variant={maintenance?.enabled ? 'default' : 'destructive'}
                    className="gap-2"
                  >
                    <Construction className="w-4 h-4" />
                    {maintenance?.enabled ? 'Avaktivera' : 'Aktivera'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Services Status */}
            {dashboard && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    Externa Tjänster
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Mail className="w-8 h-8 text-blue-500" />
                        <div>
                          <p className="font-semibold">SMTP Email Service</p>
                          <p className="text-sm text-muted-foreground">{dashboard.services.smtp.host}</p>
                        </div>
                      </div>
                      <Badge variant={dashboard.services.smtp.configured ? 'default' : 'secondary'}>
                        {dashboard.services.smtp.status}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <CreditCard className="w-8 h-8 text-purple-500" />
                        <div>
                          <p className="font-semibold">Stripe Payments</p>
                          <p className="text-sm text-muted-foreground">Mode: {dashboard.services.stripe.mode}</p>
                        </div>
                      </div>
                      <Badge variant={dashboard.services.stripe.configured ? 'default' : 'secondary'}>
                        {dashboard.services.stripe.status}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Resources Tab */}
          <TabsContent value="resources" className="space-y-6 mt-0">
            {dashboard && (
              <>
                {/* Storage Breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Folder className="w-5 h-5" />
                      Lagringsfördelning
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-blue-500" />
                            <span className="font-medium">Användare</span>
                          </div>
                          <span className="text-sm text-muted-foreground">{dashboard.storage.breakdown.users.formatted}</span>
                        </div>
                        <Progress value={(dashboard.storage.breakdown.users.bytes / dashboard.storage.total.bytes) * 100} className="h-2" />
                        <p className="text-xs text-muted-foreground">{dashboard.storage.breakdown.users.count} filer</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-purple-500" />
                            <span className="font-medium">Agendor</span>
                          </div>
                          <span className="text-sm text-muted-foreground">{dashboard.storage.breakdown.agendas.formatted}</span>
                        </div>
                        <Progress value={(dashboard.storage.breakdown.agendas.bytes / dashboard.storage.total.bytes) * 100} className="h-2" />
                        <p className="text-xs text-muted-foreground">{dashboard.storage.breakdown.agendas.count} filer</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-green-500" />
                            <span className="font-medium">Kampanjer</span>
                          </div>
                          <span className="text-sm text-muted-foreground">{dashboard.storage.breakdown.campaigns.formatted}</span>
                        </div>
                        <Progress value={(dashboard.storage.breakdown.campaigns.bytes / dashboard.storage.total.bytes) * 100} className="h-2" />
                        <p className="text-xs text-muted-foreground">{dashboard.storage.breakdown.campaigns.count} filer</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Database Collections */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="w-5 h-5" />
                      Database Collections
                    </CardTitle>
                    <CardDescription>{dashboard.database.type} • {dashboard.database.status}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-4 rounded-lg bg-muted/30">
                        <Users className="w-8 h-8 mx-auto mb-2 text-blue-500" />
                        <p className="text-2xl font-bold">{dashboard.database.collections.users}</p>
                        <p className="text-sm text-muted-foreground">Användare</p>
                      </div>
                      <div className="text-center p-4 rounded-lg bg-muted/30">
                        <FileText className="w-8 h-8 mx-auto mb-2 text-purple-500" />
                        <p className="text-2xl font-bold">{dashboard.database.collections.agendas}</p>
                        <p className="text-sm text-muted-foreground">Agendor</p>
                      </div>
                      <div className="text-center p-4 rounded-lg bg-muted/30">
                        <Mail className="w-8 h-8 mx-auto mb-2 text-green-500" />
                        <p className="text-2xl font-bold">{dashboard.database.collections.campaigns}</p>
                        <p className="text-sm text-muted-foreground">Kampanjer</p>
                      </div>
                      <div className="text-center p-4 rounded-lg bg-muted/30">
                        <Shield className="w-8 h-8 mx-auto mb-2 text-orange-500" />
                        <p className="text-2xl font-bold">{dashboard.database.collections.roles}</p>
                        <p className="text-sm text-muted-foreground">Roller</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* System Resources */}
                {dashboard.memory?.system && (
                  <Card className="bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-background">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <HardDrive className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        System RAM
                      </CardTitle>
                      <CardDescription>Physical server memory usage</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Main RAM Display */}
                      <div className="relative">
                        <div className="flex items-end justify-between mb-3">
                          <div>
                            <p className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">
                              {dashboard.memory.system.used.formatted}
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                              of {dashboard.memory.system.total.formatted} system RAM used
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-3xl font-bold">
                              {memoryPercentage.toFixed(1)}%
                            </p>
                            <p className="text-xs text-muted-foreground">Usage</p>
                          </div>
                        </div>
                        
                        {/* Enhanced Progress Bar */}
                        <div className="relative h-4 rounded-full bg-muted overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              memoryPercentage > 90 ? 'bg-gradient-to-r from-red-500 to-red-600' :
                              memoryPercentage > 75 ? 'bg-gradient-to-r from-orange-500 to-orange-600' :
                              'bg-gradient-to-r from-indigo-500 to-purple-600'
                            }`}
                            style={{ width: `${memoryPercentage}%` }}
                          >
                            <div className="h-full w-full opacity-30 animate-pulse bg-white"></div>
                          </div>
                        </div>
                        
                        {/* Status Badge */}
                        <div className="mt-3 flex items-center gap-2">
                          <Badge variant={memoryPercentage > 90 ? 'destructive' : memoryPercentage > 75 ? 'secondary' : 'default'}>
                            {memoryPercentage > 90 ? 'Critical' : memoryPercentage > 75 ? 'High' : 'Normal'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {dashboard.memory.system.free.formatted} tillgängligt
                          </span>
                        </div>
                      </div>
                      
                      <Separator />
                      
                      {/* System Info Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="text-center p-3 rounded-lg bg-muted/30">
                          <FileCode className="w-5 h-5 mx-auto mb-2 text-indigo-500" />
                          <p className="text-xs text-muted-foreground mb-1">Node</p>
                          <p className="font-mono text-sm font-semibold">{dashboard.environment.nodeVersion}</p>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-muted/30">
                          <Server className="w-5 h-5 mx-auto mb-2 text-purple-500" />
                          <p className="text-xs text-muted-foreground mb-1">Platform</p>
                          <p className="font-mono text-sm font-semibold capitalize">{dashboard.environment.platform}/{dashboard.environment.arch}</p>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-muted/30">
                          <Zap className="w-5 h-5 mx-auto mb-2 text-orange-500" />
                          <p className="text-xs text-muted-foreground mb-1">CPU Cores</p>
                          <p className="font-mono text-sm font-semibold">{dashboard.environment.cpus}</p>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-muted/30">
                          <Activity className="w-5 h-5 mx-auto mb-2 text-blue-500" />
                          <p className="text-xs text-muted-foreground mb-1">PID</p>
                          <p className="font-mono text-sm font-semibold">{dashboard.environment.pid}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* Actions Tab */}
          <TabsContent value="actions" className="space-y-6 mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Administrativa Åtgärder</CardTitle>
                <CardDescription>Hantera backend-operationer</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Button 
                    onClick={handleBackup}
                    disabled={isActionLoading !== null}
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2"
                  >
                    {isActionLoading === 'backup' ? (
                      <>
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm">Skapar backup...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" />
                        <div className="text-center">
                          <p className="font-semibold">Skapa Backup</p>
                          <p className="text-xs text-muted-foreground">Ladda ner full databas-backup</p>
                        </div>
                      </>
                    )}
                  </Button>

                  <Button 
                    onClick={() => openConfirmDialog('cleanup')}
                    disabled={isActionLoading !== null}
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2"
                  >
                    {isActionLoading === 'cleanup' ? (
                      <>
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm">Rensar...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-5 h-5" />
                        <div className="text-center">
                          <p className="font-semibold">Rensa Filer</p>
                          <p className="text-xs text-muted-foreground">Ta bort temporära filer</p>
                        </div>
                      </>
                    )}
                  </Button>

                  <Button 
                    onClick={() => openConfirmDialog('restart')}
                    disabled={isActionLoading !== null}
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2"
                  >
                    {isActionLoading === 'restart' ? (
                      <>
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm">Startar om...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-5 h-5" />
                        <div className="text-center">
                          <p className="font-semibold">Starta Om API</p>
                          <p className="text-xs text-muted-foreground">Omstart av api.tivly.se</p>
                        </div>
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ open: false, action: null, title: '', description: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>
              Bekräfta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AdminBackend;
