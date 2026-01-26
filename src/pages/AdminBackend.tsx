import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, HardDrive, Server, Clock, AlertCircle, CheckCircle, Mail, CreditCard, Download, Trash2, RefreshCw, Construction, Terminal, Search, Filter, X, Pause, Play, Cpu, Activity, MemoryStick, Zap, Monitor, Box, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from 'sonner';
import { backendApi, DashboardData, HealthCheck, ASRLogsResponse } from '@/lib/backendApi';
import { apiClient, MaintenanceStatus } from '@/lib/api';
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

// Helper functions
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const formatUptime = (seconds: number): { days: number; hours: number; minutes: number } => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return { days, hours, minutes };
};

const formatProcessUptime = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
};

const AdminBackend = () => {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceStatus | null>(null);
  const [maintenancePending, setMaintenancePending] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);
  
  // ASR Logs state
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsData, setLogsData] = useState<ASRLogsResponse | null>(null);
  const [logsLevel, setLogsLevel] = useState<string>('all');
  const [logsKeyword, setLogsKeyword] = useState<string>('');
  const [logsPaused, setLogsPaused] = useState(false);
  const logsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);
  
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

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, []);

  // Auto-refresh every 2 seconds when enabled
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(fetchData, 2000);
    } else {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
    }
    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
    };
  }, [autoRefresh]);

  // ASR Logs polling
  const fetchLogs = async () => {
    try {
      const data = await backendApi.getASRLogs({
        lines: 80,
        level: logsLevel === 'all' ? undefined : logsLevel,
        keyword: logsKeyword || undefined,
      });
      setLogsData(data);
    } catch (error) {
      console.error('Failed to fetch ASR logs:', error);
    }
  };

  useEffect(() => {
    if (logsOpen && !logsPaused) {
      fetchLogs();
      logsIntervalRef.current = setInterval(fetchLogs, 1000);
    }
    
    return () => {
      if (logsIntervalRef.current) {
        clearInterval(logsIntervalRef.current);
        logsIntervalRef.current = null;
      }
    };
  }, [logsOpen, logsPaused, logsLevel, logsKeyword]);

  useEffect(() => {
    if (logsContainerRef.current && logsData?.lines?.length) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logsData]);

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
  const cpuPercent = health?.system?.cpuUsagePercent ?? 0;
  const memPercent = health?.system?.memory?.usedPercent ?? 0;
  const uptime = health?.system ? formatUptime(health.system.uptimeSeconds) : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Laddar systemdata...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b bg-card/50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10">
                  <Server className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold">Backend Dashboard</h1>
                  <p className="text-sm text-muted-foreground">
                    api.tivly.se • Uppdaterad {lastUpdate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Badge 
                  variant={health?.overall === 'healthy' ? 'default' : 'destructive'} 
                  className="gap-1.5 px-3 py-1"
                >
                  <span className={`w-2 h-2 rounded-full ${health?.overall === 'healthy' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                  {health?.overall === 'healthy' ? 'Alla system OK' : 'Problem upptäckt'}
                </Badge>
                
                {/* Auto-refresh toggle */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border">
                  <Switch 
                    checked={autoRefresh} 
                    onCheckedChange={setAutoRefresh}
                    className="scale-90"
                  />
                  <span className="text-xs font-medium whitespace-nowrap">
                    {autoRefresh ? (
                      <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live 2s
                      </span>
                    ) : (
                      'Auto'
                    )}
                  </span>
                </div>
                
                <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
                  <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
                  Uppdatera
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          
          {/* Top Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* CPU Card */}
            <Card className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <Cpu className="w-4 h-4 text-blue-500" />
                    </div>
                    <span className="text-sm font-medium">CPU</span>
                  </div>
                  <span className="text-2xl font-bold">{cpuPercent.toFixed(1)}%</span>
                </div>
                <Progress 
                  value={cpuPercent} 
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {health?.system?.cpuCores ?? 0} kärnor
                </p>
              </CardContent>
            </Card>

            {/* Memory Card */}
            <Card className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <MemoryStick className="w-4 h-4 text-purple-500" />
                    </div>
                    <span className="text-sm font-medium">RAM</span>
                  </div>
                  <span className="text-2xl font-bold">{memPercent.toFixed(1)}%</span>
                </div>
                <Progress 
                  value={memPercent} 
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {health?.system?.memory?.used ?? '0'} / {health?.system?.memory?.total ?? '0'}
                </p>
              </CardContent>
            </Card>

            {/* Uptime Card */}
            <Card className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-emerald-500/10">
                      <Clock className="w-4 h-4 text-emerald-500" />
                    </div>
                    <span className="text-sm font-medium">Uptime</span>
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold">{uptime?.days ?? 0}</span>
                  <span className="text-sm text-muted-foreground">dagar</span>
                  <span className="text-lg font-semibold ml-2">{uptime?.hours ?? 0}h</span>
                  <span className="text-muted-foreground">{uptime?.minutes ?? 0}m</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Process: {health?.system ? formatProcessUptime(health.system.processUptimeSeconds) : '--'}
                </p>
              </CardContent>
            </Card>

            {/* Status Card */}
            <Card className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-amber-500/10">
                      <Activity className="w-4 h-4 text-amber-500" />
                    </div>
                    <span className="text-sm font-medium">Status</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {apiOnline ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                      <span className="text-lg font-semibold">Online</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 text-destructive" />
                      <span className="text-lg font-semibold">Offline</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {dashboard?.uptime?.formatted ?? '--'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* System Info & Health Checks */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* System Information */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Monitor className="w-4 h-4" />
                  Systeminformation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {health?.system && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Hostname</p>
                        <p className="font-medium">{health.system.hostname}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Plattform</p>
                        <p className="font-medium">{health.system.platform} ({health.system.arch})</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Node.js</p>
                        <p className="font-medium">{health.system.process.nodeVersion}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Process ID</p>
                        <p className="font-medium font-mono">{health.system.process.pid}</p>
                      </div>
                    </div>

                    {/* Process Memory */}
                    <div className="pt-3 border-t">
                      <p className="text-sm font-medium mb-3 flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5" />
                        Node.js Minne
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground">RSS</p>
                          <p className="text-sm font-semibold font-mono">{formatBytes(health.system.process.rssBytes)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground">Heap Used</p>
                          <p className="text-sm font-semibold font-mono">{formatBytes(health.system.process.heapUsedBytes)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground">Heap Total</p>
                          <p className="text-sm font-semibold font-mono">{formatBytes(health.system.process.heapTotalBytes)}</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Health Checks */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Gauge className="w-4 h-4" />
                  Hälsokontroller
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {health?.checks.map((check) => (
                    <div 
                      key={check.name} 
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {check.status === 'healthy' ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                        ) : check.status === 'warning' ? (
                          <AlertCircle className="w-4 h-4 text-amber-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-destructive" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{check.name}</p>
                          <p className="text-xs text-muted-foreground">{check.message}</p>
                        </div>
                      </div>
                      <Badge 
                        variant={check.status === 'healthy' ? 'default' : check.status === 'warning' ? 'secondary' : 'destructive'}
                        className="capitalize"
                      >
                        {check.status === 'healthy' ? 'OK' : check.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Services & Storage Row */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Services */}
            {dashboard && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Box className="w-4 h-4" />
                    Integrationer
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/10">
                        <Mail className="w-4 h-4 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Email (SMTP)</p>
                        <p className="text-xs text-muted-foreground">{dashboard.services.smtp.host || 'Ej konfigurerad'}</p>
                      </div>
                    </div>
                    <Badge variant={dashboard.services.smtp.configured ? 'default' : 'secondary'}>
                      {dashboard.services.smtp.configured ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-500/10">
                        <CreditCard className="w-4 h-4 text-purple-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Stripe</p>
                        <p className="text-xs text-muted-foreground capitalize">{dashboard.services.stripe.mode || 'Ej konfigurerad'}</p>
                      </div>
                    </div>
                    <Badge variant={dashboard.services.stripe.configured ? 'default' : 'secondary'}>
                      {dashboard.services.stripe.configured ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/10">
                        <Database className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Databas</p>
                        <p className="text-xs text-muted-foreground">{dashboard.database.type}</p>
                      </div>
                    </div>
                    <Badge variant="default">{dashboard.database.collections.users} användare</Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Storage */}
            {dashboard && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <HardDrive className="w-4 h-4" />
                      Lagring
                    </CardTitle>
                    <span className="text-sm font-semibold">{dashboard.storage.total.formatted}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <span className="text-sm">Användare</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{dashboard.storage.breakdown.users.formatted}</span>
                      <Badge variant="outline" className="text-xs">{dashboard.storage.breakdown.users.count}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <span className="text-sm">Agendor</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{dashboard.storage.breakdown.agendas.formatted}</span>
                      <Badge variant="outline" className="text-xs">{dashboard.storage.breakdown.agendas.count}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <span className="text-sm">Kampanjer</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{dashboard.storage.breakdown.campaigns.formatted}</span>
                      <Badge variant="outline" className="text-xs">{dashboard.storage.breakdown.campaigns.count}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Maintenance & Actions */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Maintenance Mode */}
            <Card className={maintenance?.enabled ? 'border-yellow-500/50 bg-yellow-500/5' : ''}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${maintenance?.enabled ? 'bg-yellow-500/20' : 'bg-muted'}`}>
                      <Construction className={`w-5 h-5 ${maintenance?.enabled ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className="font-medium">Underhållsläge</p>
                      <p className="text-sm text-muted-foreground">
                        {maintenance?.enabled ? 'Användare ser underhållsmeddelande' : 'Appen fungerar normalt'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {maintenancePending && (
                      <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
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

            {/* Quick Actions */}
            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-medium mb-3">Snabbåtgärder</p>
                <div className="flex flex-wrap gap-2">
                  <Button 
                    onClick={handleBackup}
                    disabled={isActionLoading !== null}
                    variant="outline"
                    className="gap-2"
                  >
                    {isActionLoading === 'backup' ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Ladda ner backup
                  </Button>
                  
                  <Button 
                    onClick={() => openConfirmDialog('cleanup')}
                    disabled={isActionLoading !== null}
                    variant="outline"
                    className="gap-2"
                  >
                    {isActionLoading === 'cleanup' ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Rensa temp-filer
                  </Button>
                  
                  <Button 
                    onClick={() => openConfirmDialog('restart')}
                    disabled={isActionLoading !== null}
                    variant="outline"
                    className="gap-2 text-destructive hover:text-destructive"
                  >
                    {isActionLoading === 'restart' ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Starta om server
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ASR Logs Viewer */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  ASR Loggar
                  {logsOpen && logsData && (
                    <Badge variant="secondary" className="ml-2">
                      {logsData.showing}/{logsData.total}
                    </Badge>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {logsOpen && (
                    <>
                      <Button
                        variant={logsPaused ? "default" : "outline"}
                        size="sm"
                        onClick={() => setLogsPaused(!logsPaused)}
                        className="gap-1"
                      >
                        {logsPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                        {logsPaused ? 'Fortsätt' : 'Pausa'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLogsOpen(false)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  {!logsOpen && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLogsOpen(true)}
                    >
                      Öppna loggar
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            
            {logsOpen && (
              <CardContent>
                {/* Filters */}
                <div className="flex gap-2 mb-4">
                  <Select value={logsLevel} onValueChange={setLogsLevel}>
                    <SelectTrigger className="w-32">
                      <Filter className="w-3.5 h-3.5 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="all">Alla</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="warn">Warning</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Sök (meeting ID, [asr], etc.)"
                      value={logsKeyword}
                      onChange={(e) => setLogsKeyword(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                
                {/* Log lines */}
                <div 
                  ref={logsContainerRef}
                  className="h-72 rounded-lg border bg-muted/30 overflow-y-auto"
                >
                  <div className="p-3 font-mono text-xs space-y-1">
                    {logsData?.lines && logsData.lines.length > 0 ? (
                      logsData.lines.map((line, i) => {
                        const isError = /error|fail|fatal/i.test(line);
                        const isWarn = /warn/i.test(line);
                        return (
                          <div 
                            key={i} 
                            className={`px-2 py-1 rounded ${
                              isError ? 'bg-red-500/10 text-red-400' : 
                              isWarn ? 'bg-yellow-500/10 text-yellow-400' : 
                              'text-muted-foreground hover:bg-muted/50'
                            }`}
                          >
                            {line}
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Terminal className="w-8 h-8 mb-2 opacity-50" />
                        <span>{logsData?.message || 'Inga loggar hittades'}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Status bar */}
                <div className="flex items-center justify-between mt-3 text-sm">
                  <div className="flex items-center gap-2">
                    {logsPaused ? (
                      <Badge variant="secondary" className="gap-1">
                        <Pause className="w-3 h-3" />
                        Pausad
                      </Badge>
                    ) : (
                      <Badge variant="default" className="gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Live
                      </Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs">Uppdateras varje sekund</span>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Footer */}
          <div className="pt-4 border-t">
            <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-4">
                <span className="font-medium">api.tivly.se</span>
                <span>Node {dashboard?.environment?.nodeVersion ?? '--'}</span>
                <span className="capitalize">{dashboard?.environment?.platform ?? '--'}/{dashboard?.environment?.arch ?? '--'}</span>
              </div>
              <div className="flex items-center gap-4">
                <span>{dashboard?.environment?.cpus ?? 0} CPU-kärnor</span>
                <span>PID: {health?.system?.process?.pid ?? '--'}</span>
              </div>
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
