import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Database, HardDrive, Server, Clock, AlertCircle, CheckCircle, Mail, CreditCard, Globe, Download, Trash2, RefreshCw, Construction, Cloud, Layers, Terminal, Search, Filter, X, Pause, Play, Cpu, Activity, Gauge, MemoryStick, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from 'sonner';
import { backendApi, DashboardData, HealthCheck, ASRLogsResponse } from '@/lib/backendApi';
import { apiClient, MaintenanceStatus } from '@/lib/api';
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
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

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

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
      fetchLogs(); // Fetch immediately
      logsIntervalRef.current = setInterval(fetchLogs, 1000);
    }
    
    return () => {
      if (logsIntervalRef.current) {
        clearInterval(logsIntervalRef.current);
        logsIntervalRef.current = null;
      }
    };
  }, [logsOpen, logsPaused, logsLevel, logsKeyword]);

  // Auto-scroll to bottom when logs update
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
      <div className="min-h-screen bg-background overflow-x-hidden">
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
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                    )}
                    <span className="text-sm font-medium">Systemhälsa</span>
                  </div>
                  <Badge variant={health.overall === 'healthy' ? 'default' : 'secondary'} className="font-normal">
                    {health.overall === 'healthy' ? 'OK' : 'Varning'}
                  </Badge>
                </div>
                
                {/* Health Checks Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {health.checks.map((check) => (
                    <div 
                      key={check.name} 
                      className="flex items-center gap-2 text-sm p-2 rounded-md bg-background/50"
                      title={check.message}
                    >
                      {check.status === 'healthy' ? (
                        <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                      )}
                      <span className="text-muted-foreground truncate">{check.name}</span>
                    </div>
                  ))}
                </div>

                {/* Extended System Info */}
                {health.system && (
                  <div className="pt-4 border-t border-border/50 space-y-4">
                    {/* System Overview */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 rounded-md bg-background/50">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Server className="w-3 h-3" />
                          <span className="text-xs">Värd</span>
                        </div>
                        <p className="text-sm font-medium truncate">{health.system.hostname}</p>
                        <p className="text-xs text-muted-foreground">{health.system.platform} ({health.system.arch})</p>
                      </div>
                      
                      <div className="p-3 rounded-md bg-background/50">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Cpu className="w-3 h-3" />
                          <span className="text-xs">CPU</span>
                        </div>
                        <p className="text-sm font-medium">{health.system.cpuCores} kärnor</p>
                        <p className="text-xs text-muted-foreground">
                          Load: {health.system.loadAvg1m.toFixed(2)}
                        </p>
                      </div>
                      
                      <div className="p-3 rounded-md bg-background/50">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <MemoryStick className="w-3 h-3" />
                          <span className="text-xs">RAM</span>
                        </div>
                        <p className="text-sm font-medium">{health.system.memory.usedPercent.toFixed(1)}%</p>
                        <p className="text-xs text-muted-foreground">
                          {health.system.memory.used} / {health.system.memory.total}
                        </p>
                      </div>
                      
                      <div className="p-3 rounded-md bg-background/50">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Clock className="w-3 h-3" />
                          <span className="text-xs">Uptime</span>
                        </div>
                        <p className="text-sm font-medium">
                          {Math.floor(health.system.uptimeSeconds / 86400)}d {Math.floor((health.system.uptimeSeconds % 86400) / 3600)}h
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Process: {formatProcessUptime(health.system.processUptimeSeconds)}
                        </p>
                      </div>
                    </div>
                    
                    {/* Load Averages */}
                    <div className="p-3 rounded-md bg-background/50">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <Activity className="w-3 h-3" />
                        <span className="text-xs font-medium">Systembelastning</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">1 min</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all ${
                                  health.system.loadAvg1m / health.system.cpuCores > 0.8 
                                    ? 'bg-destructive' 
                                    : health.system.loadAvg1m / health.system.cpuCores > 0.5 
                                      ? 'bg-amber-500' 
                                      : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min((health.system.loadAvg1m / health.system.cpuCores) * 100, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono">{health.system.loadAvg1m.toFixed(2)}</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">5 min</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all ${
                                  health.system.loadAvg5m / health.system.cpuCores > 0.8 
                                    ? 'bg-destructive' 
                                    : health.system.loadAvg5m / health.system.cpuCores > 0.5 
                                      ? 'bg-amber-500' 
                                      : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min((health.system.loadAvg5m / health.system.cpuCores) * 100, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono">{health.system.loadAvg5m.toFixed(2)}</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">15 min</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all ${
                                  health.system.loadAvg15m / health.system.cpuCores > 0.8 
                                    ? 'bg-destructive' 
                                    : health.system.loadAvg15m / health.system.cpuCores > 0.5 
                                      ? 'bg-amber-500' 
                                      : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min((health.system.loadAvg15m / health.system.cpuCores) * 100, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono">{health.system.loadAvg15m.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Process Memory */}
                    <div className="p-3 rounded-md bg-background/50">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <Zap className="w-3 h-3" />
                        <span className="text-xs font-medium">Node.js Process (PID: {health.system.process.pid})</span>
                        <span className="text-xs ml-auto">{health.system.process.nodeVersion}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-xs">
                        <div>
                          <p className="text-muted-foreground">RSS</p>
                          <p className="font-medium font-mono">{formatBytes(health.system.process.rssBytes)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Heap Used</p>
                          <p className="font-medium font-mono">{formatBytes(health.system.process.heapUsedBytes)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Heap Total</p>
                          <p className="font-medium font-mono">{formatBytes(health.system.process.heapTotalBytes)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
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

          {/* ASR Logs Viewer */}
          <Card className="border-0 bg-muted/30">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">ASR Loggar</span>
                  {logsOpen && logsData && (
                    <Badge variant="secondary" className="font-normal text-xs">
                      {logsData.showing}/{logsData.total}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {logsOpen && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLogsPaused(!logsPaused)}
                        className="h-7 w-7 p-0"
                        title={logsPaused ? "Fortsätt" : "Pausa"}
                      >
                        {logsPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLogsOpen(false)}
                        className="h-7 w-7 p-0"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                  {!logsOpen && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLogsOpen(true)}
                      className="h-7 text-xs"
                    >
                      Öppna
                    </Button>
                  )}
                </div>
              </div>
              
              {logsOpen && (
                <>
                  {/* Filters */}
                  <div className="flex gap-2 mb-3">
                    <Select value={logsLevel} onValueChange={setLogsLevel}>
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <Filter className="w-3 h-3 mr-1" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alla</SelectItem>
                        <SelectItem value="error">Error</SelectItem>
                        <SelectItem value="warn">Warning</SelectItem>
                        <SelectItem value="info">Info</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                      <Input
                        placeholder="Sök (meeting ID, [asr], etc.)"
                        value={logsKeyword}
                        onChange={(e) => setLogsKeyword(e.target.value)}
                        className="h-8 pl-7 text-xs"
                      />
                    </div>
                  </div>
                  
                  {/* Log lines */}
                  <div 
                    ref={logsContainerRef}
                    className="h-64 rounded border border-border/50 bg-background/50 overflow-y-auto"
                  >
                    <div className="p-2 font-mono text-xs space-y-0.5">
                      {logsData?.lines && logsData.lines.length > 0 ? (
                        logsData.lines.map((line, i) => {
                          const isError = /error|fail|fatal/i.test(line);
                          const isWarn = /warn/i.test(line);
                          return (
                            <div 
                              key={i} 
                              className={`px-1 py-0.5 rounded ${
                                isError ? 'bg-red-500/10 text-red-400' : 
                                isWarn ? 'bg-yellow-500/10 text-yellow-400' : 
                                'text-muted-foreground'
                              }`}
                            >
                              {line}
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          {logsData?.message || 'Inga loggar hittades'}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Status bar */}
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span>
                      {logsPaused ? (
                        <span className="text-yellow-500">⏸ Pausad</span>
                      ) : (
                        <span className="text-green-500">● Live</span>
                      )}
                    </span>
                    <span>Uppdateras varje sekund</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

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
