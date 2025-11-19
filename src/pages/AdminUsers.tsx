import { useEffect, useState, useMemo } from 'react';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, ExternalLink, Edit, Trash2, Users, FileText, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface UserData {
  email: string;
  plan: string;
  paymentStatus: string;
  meetingCount: number;
  meetingLimit: number | null;
  folderCount: number;
  createdAt: string;
  lastLoginAt: string;
  isVerified: boolean;
  googleId?: string;
  hasUnlimitedInvite: boolean;
  unlimitedInviteNote?: string;
  meetingUsage?: {
    meetingCount: number;
    meetingLimit: number | null;
    meetingSlotsRemaining: number | null;
    override?: any;
  };
  overrides?: {
    meeting?: {
      type: 'extra' | 'unlimited';
      extraMeetings?: number;
      expiresAt?: string;
      isActive?: boolean;
    };
  };
  stripe?: {
    hasCustomer: boolean;
    hasSubscription: boolean;
    subscriptionId?: string;
    priceId?: string;
    cancelAtPeriodEnd?: boolean;
    lastSyncAt?: string;
  };
}

export default function AdminUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchEmail, setSearchEmail] = useState<string>('');
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [newPlan, setNewPlan] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [deleteUser, setDeleteUser] = useState<UserData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [locationCache, setLocationCache] = useState<Record<string, string>>({});
  const [admins, setAdmins] = useState<Array<{ email: string; role: string }>>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);
  const [resetUsageUser, setResetUsageUser] = useState<UserData | null>(null);
  const [resetNote, setResetNote] = useState('');
  const [isResettingUsage, setIsResettingUsage] = useState(false);
  const { toast } = useToast();

  // Filter users based on search
  // Filter users based on search
  const filteredUsers = useMemo(() => {
    if (!searchEmail.trim()) return users;
    const searchLower = searchEmail.toLowerCase();
    return users.filter(user => user.email.toLowerCase().includes(searchLower));
  }, [users, searchEmail]);

  // Calculate effective meeting limit from backend data
  const getEffectiveMeetingLimit = (user: UserData): number | null => {
    if (isSuperAdmin(user.email) || isAdmin(user.email)) return null;
    
    // Check override first (gifted meetings)
    const override = user.overrides?.meeting || user.meetingUsage?.override;
    if (override?.isActive) {
      if (override.type === 'unlimited') return null;
      // If extra meetings, base + extra
      const base = user.meetingLimit || 0;
      const extra = override.extraMeetings || 0;
      return base + extra;
    }
    
    // Use meetingUsage.meetingLimit if available, else user.meetingLimit
    return user.meetingUsage?.meetingLimit ?? user.meetingLimit;
  };

  const getUsedMeetings = (user: UserData): number => {
    return user.meetingUsage?.meetingCount ?? user.meetingCount;
  };

  const isSuperAdmin = (email?: string) => (email || '').toLowerCase() === 'vildewretling@gmail.com';
  const isOwner = (email?: string) => isSuperAdmin(email);
  const isAdmin = (email?: string) => {
    if (!email) return false;
    const adminRecord = admins.find(a => a.email.toLowerCase() === email.toLowerCase());
    return !!adminRecord && (adminRecord.role === 'admin' || adminRecord.role === 'owner');
  };
  const getDisplayPlan = (user: UserData) => {
    if (isSuperAdmin(user.email) || isAdmin(user.email)) return 'unlimited';
    return user.plan;
  };


  const fetchUsers = async () => {
    try {
      const data = await apiClient.getAdminUsers();
      console.log('🔍 Raw admin data:', data);
      
      const userArray = (data.users || []).map((raw: any) => {
        const summary = raw.summary || raw;
        console.log('👤 Processing user:', summary.email, {
          meetingUsage: summary.meetingUsage,
          overrides: summary.overrides,
          meetingLimit: summary.meetingLimit,
        });
        
        return {
          email: summary.email || raw.email,
          plan: summary.plan || raw.plan || 'free',
          paymentStatus: summary.paymentStatus || raw.paymentStatus || 'unpaid',
          meetingCount: summary.meetingCount ?? raw.meetingCount ?? 0,
          meetingLimit: summary.meetingLimit ?? raw.meetingLimit ?? null,
          folderCount: summary.folderCount ?? raw.folderCount ?? 0,
          createdAt: summary.createdAt || raw.createdAt,
          lastLoginAt: summary.lastLoginAt || raw.lastLoginAt,
          isVerified: summary.isVerified ?? raw.isVerified ?? false,
          googleId: summary.googleId || raw.googleId,
          hasUnlimitedInvite: summary.hasUnlimitedInvite ?? raw.hasUnlimitedInvite ?? false,
          unlimitedInviteNote: summary.unlimitedInviteNote || raw.unlimitedInviteNote,
          meetingUsage: summary.meetingUsage || raw.meetingUsage,
          overrides: summary.overrides || raw.overrides,
          stripe: summary.stripe || raw.stripe,
        };
      });
      
      console.log('✅ Processed users:', userArray);
      setUsers(userArray);
      setError(null);
    } catch (err) {
      console.error('❌ Admin fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchAdmins = async () => {
    try {
      const roles = await apiClient.getAllUserRoles();
      setAdmins(roles || []);
    } catch (err) {
      console.error('Failed to fetch admins:', err);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchAdmins();

    const interval = setInterval(() => {
      fetchUsers();
      fetchAdmins();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const handleAddAdmin = async () => {
    // ONLY owner can add admins
    if (!user?.email || user.email.toLowerCase() !== 'vildewretling@gmail.com') {
      toast({ 
        title: 'Access Denied', 
        description: 'Only the owner can add admins', 
        variant: 'destructive' 
      });
      return;
    }
    
    if (!newAdminEmail.trim()) {
      toast({ title: 'Error', description: 'Email required', variant: 'destructive' });
      return;
    }
    setIsAddingAdmin(true);
    try {
      const email = newAdminEmail.toLowerCase().trim();
      
      // Create admin role
      await apiClient.createUserRole(email, 'admin');
      
      toast({ 
        title: 'Success', 
        description: `${newAdminEmail} added as admin` 
      });
      setNewAdminEmail('');
      fetchAdmins();
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to add admin', variant: 'destructive' });
    } finally {
      setIsAddingAdmin(false);
    }
  };

  const handleRemoveAdmin = async (email: string) => {
    // Prevent removing the owner account
    if (email === 'vildewretling@gmail.com') {
      toast({ 
        title: 'Protected Account', 
        description: 'The owner account cannot be removed as admin', 
        variant: 'destructive' 
      });
      return;
    }

    // ONLY owner can remove admins
    if (!user?.email || user.email.toLowerCase() !== 'vildewretling@gmail.com') {
      toast({ 
        title: 'Access Denied', 
        description: 'Only the owner can remove admins', 
        variant: 'destructive' 
      });
      return;
    }
    
    try {
      // Remove admin role
      await apiClient.deleteUserRole(email);
      
      toast({ 
        title: 'Success', 
        description: `${email} removed as admin` 
      });
      fetchAdmins();
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to remove admin', variant: 'destructive' });
    }
  };

  const handleEditPlan = (user: UserData) => {
    setEditingUser(user);
    setNewPlan(user.plan);
  };

  const handleUpdatePlan = async (cancelAtPeriodEnd: boolean = false) => {
    if (!editingUser) return;
    
    setIsUpdating(true);
    try {
      const result = await apiClient.updateAdminUserPlan(editingUser.email, {
        plan: newPlan,
        synchronizeStripe: true,
        prorationBehavior: 'create_prorations',
        cancelAtPeriodEnd: (newPlan === 'free' || newPlan === 'unlimited') ? cancelAtPeriodEnd : undefined,
      });
      
      console.log('✅ Plan update result:', result);
      
      toast({
        title: "Plan uppdaterad",
        description: `Plan för ${editingUser.email} har uppdaterats till ${newPlan}${result.stripe?.action ? ` (${result.stripe.action})` : ''}`,
      });
      
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      console.error('❌ Plan update error:', error);
      toast({
        title: "Fel vid uppdatering",
        description: error instanceof Error ? error.message : 'Kunde inte uppdatera plan',
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUser) return;
    
    setIsDeleting(true);
    try {
      await apiClient.deleteAdminUser(deleteUser.email);
      
      toast({
        title: "Användare raderad",
        description: `${deleteUser.email} har raderats`,
      });
      
      setDeleteUser(null);
      fetchUsers();
    } catch (error) {
      toast({
        title: "Fel",
        description: error instanceof Error ? error.message : 'Kunde inte radera användare',
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenStripeDashboard = async (email: string) => {
    try {
      const { url } = await apiClient.getAdminUserStripeDashboard(email);
      window.open(url, '_blank');
    } catch (error) {
      toast({
        title: "Fel",
        description: 'Kunde inte öppna Stripe dashboard',
        variant: "destructive",
      });
    }
  };

  const handleResetUsage = async () => {
    if (!resetUsageUser) return;
    
    setIsResettingUsage(true);
    try {
      const result = await apiClient.resetUserMonthlyUsage(
        resetUsageUser.email,
        resetNote || undefined
      );
      
      toast({
        title: "✅ Användningen återställd",
        description: `${resetUsageUser.email} har nu 0 använda möten denna månad.`,
      });
      
      // Update the user in the list with new data
      setUsers(users.map(u => 
        u.email === resetUsageUser.email 
          ? { ...u, meetingUsage: result.meetingUsage }
          : u
      ));
      
      setResetUsageUser(null);
      setResetNote('');
      fetchUsers(); // Refresh to get latest data
    } catch (error) {
      toast({
        title: "Fel",
        description: error instanceof Error ? error.message : 'Kunde inte återställa användningen',
        variant: "destructive",
      });
    } finally {
      setIsResettingUsage(false);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-40 bg-gradient-to-r from-background via-background/95 to-background border-b border-border/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-sm">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  User Management
                </h1>
                <p className="text-xs text-muted-foreground">Manage user plans and permissions</p>
              </div>
            </div>
          </div>
          <Badge variant="outline" className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border-green-500/20">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-green-700 dark:text-green-400">Live Updates</span>
          </Badge>
        </div>
      </div>

      <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
            {error && (
              <Card className="border-destructive bg-destructive/5">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-destructive" />
                    <p className="text-sm text-destructive font-medium">{error}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {isOwner(localStorage.getItem('userEmail') || '') && (
              <Card className="border-primary/20 shadow-lg">
                <CardHeader className="bg-gradient-to-br from-primary/5 to-accent/5 border-b border-border/50">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Admin Management</CardTitle>
                      <CardDescription>Grant or revoke admin permissions</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex gap-2">
                    <Input 
                      placeholder="admin@example.com" 
                      value={newAdminEmail} 
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddAdmin()}
                      className="flex-1"
                    />
                    <Button 
                      onClick={handleAddAdmin} 
                      disabled={isAddingAdmin}
                      className="bg-gradient-to-r from-primary to-accent hover:shadow-lg transition-all"
                    >
                      {isAddingAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Admin'}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {admins.map((admin) => (
                      <div 
                        key={admin.email} 
                        className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Badge 
                            variant={admin.role === 'owner' ? 'default' : 'secondary'}
                            className={admin.role === 'owner' ? 'bg-gradient-to-r from-primary to-accent' : ''}
                          >
                            {admin.role}
                          </Badge>
                          <span className="text-sm font-medium">{admin.email}</span>
                        </div>
                        {admin.role !== 'owner' && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleRemoveAdmin(admin.email)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-border/50 bg-gradient-to-br from-card to-muted/20">
                <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Users
                  </CardTitle>
                  <Users className="h-5 w-5 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground">{users.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">Active accounts</p>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-gradient-to-br from-card to-muted/20">
                <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Free Users
                  </CardTitle>
                  <Users className="h-5 w-5 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground">
                    {users.filter(u => u.plan === 'free').length}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {Math.round((users.filter(u => u.plan === 'free').length / users.length) * 100)}% of total
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-gradient-to-br from-card to-muted/20">
                <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Paid Users
                  </CardTitle>
                  <ShieldCheck className="h-5 w-5 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {users.filter(u => u.plan === 'pro').length}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Pro plan</p>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-gradient-to-br from-card to-muted/20">
                <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Meetings
                  </CardTitle>
                  <FileText className="h-5 w-5 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground">
                    {users.reduce((sum, u) => sum + (u.meetingUsage?.meetingCount ?? u.meetingCount), 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">All time</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="border-b bg-muted/30">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">User Management</CardTitle>
                    <CardDescription className="text-xs">
                      Auto-updates every 3 seconds
                    </CardDescription>
                  </div>
                  <div className="w-full sm:w-64">
                    <Input
                      placeholder="Search by email..."
                      value={searchEmail}
                      onChange={(e) => setSearchEmail(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {/* Desktop Table View */}
                <div className="hidden lg:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="font-medium">User</TableHead>
                        <TableHead className="font-medium">Plan</TableHead>
                        <TableHead className="font-medium">Meetings</TableHead>
                        <TableHead className="text-right font-medium">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                <span className="text-sm font-medium">
                                  {user.email.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{user.email}</p>
                                <div className="flex items-center gap-1 mt-0.5">
                                  {user.googleId && (
                                    <Badge variant="outline" className="h-5 text-xs">
                                      Google
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Badge 
                                variant={getDisplayPlan(user) === 'free' ? 'outline' : 'default'}
                                className="text-xs"
                              >
                                {getDisplayPlan(user).charAt(0).toUpperCase() + getDisplayPlan(user).slice(1)}
                              </Badge>
                              {getEffectiveMeetingLimit(user) === null && (
                                <Badge variant="outline" className="h-5 text-[10px]">∞</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">
                              {(() => {
                                const effectiveLimit = getEffectiveMeetingLimit(user);
                                const usedMeetings = getUsedMeetings(user);
                                
                                // Show X/unlimited for unlimited plans
                                if (effectiveLimit === null) {
                                  return (
                                    <>
                                      {usedMeetings}
                                      <span className="text-muted-foreground font-normal">/unlimited</span>
                                    </>
                                  );
                                }
                                
                                // For all limited plans, show X/Y format
                                return (
                                  <>
                                    {usedMeetings}
                                    <span className="text-muted-foreground font-normal">/{effectiveLimit}</span>
                                  </>
                                );
                              })()}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditPlan(user)}
                                className="h-9 w-9 hover:bg-primary/10 hover:text-primary transition-all"
                                title="Edit plan"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              {user.stripe?.hasCustomer && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenStripeDashboard(user.email)}
                                  className="h-9 w-9 hover:bg-accent/10 hover:text-accent transition-all"
                                  title="Open Stripe dashboard"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setResetUsageUser(user)}
                                className="h-9 px-2 hover:bg-orange-500/10 hover:text-orange-600 dark:hover:text-orange-400 transition-all"
                                title="Reset monthly usage"
                              >
                                <span className="text-xs font-medium">Reset</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteUser(user)}
                                className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10 transition-all"
                                title="Delete user"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card View */}
                <div className="lg:hidden divide-y">
                  {filteredUsers.map((user, index) => (
                    <div key={index} className="p-4">
                      {/* User Header */}
                      <div className="flex items-start gap-3 mb-3">
                        <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <span className="text-base font-medium">
                            {user.email.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{user.email}</p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <Badge 
                              variant={getDisplayPlan(user) === 'free' ? 'outline' : 'default'}
                              className="h-5 text-xs"
                            >
                              {getDisplayPlan(user).charAt(0).toUpperCase() + getDisplayPlan(user).slice(1)}
                            </Badge>
                            {user.googleId && (
                              <Badge variant="outline" className="h-5 text-xs">
                                Google
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* User Stats Grid */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-muted/50 rounded-md p-2.5">
                          <p className="text-xs text-muted-foreground mb-0.5">Meetings</p>
                          <p className="text-sm font-medium">
                            {(() => {
                              const effectiveLimit = getEffectiveMeetingLimit(user);
                              const usedMeetings = getUsedMeetings(user);
                              
                              // Show X/unlimited for unlimited plans
                              if (effectiveLimit === null) {
                                return (
                                  <>
                                    {usedMeetings}
                                    <span className="text-muted-foreground font-normal">/unlimited</span>
                                  </>
                                );
                              }
                              
                              // For all limited plans, show X/Y format
                              return (
                                <>
                                  {usedMeetings}
                                  <span className="text-muted-foreground font-normal">/{effectiveLimit}</span>
                                </>
                              );
                            })()}
                          </p>
                        </div>
                        <div className="bg-muted/50 rounded-md p-2.5">
                          <p className="text-xs text-muted-foreground mb-0.5">Folders</p>
                          <p className="text-sm font-medium">{user.folderCount}</p>
                        </div>
                      </div>

                      {/* Simplified Badges */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {getEffectiveMeetingLimit(user) === null && (
                          <Badge variant="default" className="h-6 text-xs gap-1 bg-gradient-to-r from-primary to-accent">
                            <ShieldCheck className="h-3 w-3" /> Unlimited
                          </Badge>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditPlan(user)}
                          className="flex-1 hover:bg-primary/10 hover:text-primary transition-all"
                        >
                          <Edit className="h-3.5 w-3.5 mr-1.5" />
                          Edit Plan
                        </Button>
                        {user.stripe?.hasCustomer && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenStripeDashboard(user.email)}
                            className="flex-1 hover:bg-accent/10 transition-all"
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Stripe
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setResetUsageUser(user)}
                          className="h-9 px-2 hover:bg-orange-500/10 hover:text-orange-600 dark:hover:text-orange-400 transition-all"
                          title="Reset monthly usage"
                        >
                          <span className="text-xs">Reset</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteUser(user)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

      {/* Edit Plan Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-md border-primary/20">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Edit className="w-5 h-5 text-primary" />
              Update User Plan
            </DialogTitle>
            <DialogDescription>
              Change subscription plan for <span className="font-semibold text-foreground">{editingUser?.email}</span>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Current Plan</span>
                <Badge variant="outline" className="capitalize">
                  {editingUser?.plan || 'free'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Meetings Used</span>
                <span className="text-sm font-medium">
                  {editingUser ? `${getUsedMeetings(editingUser)}/${getEffectiveMeetingLimit(editingUser) ?? '∞'}` : '—'}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="newPlan" className="text-base font-semibold">New Plan</Label>
              <Select value={newPlan} onValueChange={setNewPlan}>
                <SelectTrigger id="newPlan" className="w-full">
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setEditingUser(null)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => handleUpdatePlan(false)} 
              disabled={isUpdating}
              className="flex-1 bg-gradient-to-r from-primary to-accent hover:shadow-lg transition-all"
            >
              {isUpdating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Plan'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent className="border-destructive/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete User Account
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-semibold text-foreground">{deleteUser?.email}</span>?
              This will permanently remove all their data, meetings, and folders.
              <span className="block mt-2 font-medium text-destructive">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete User
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Usage Dialog */}
      <AlertDialog open={!!resetUsageUser} onOpenChange={(open) => { if (!open) { setResetUsageUser(null); setResetNote(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Monthly Usage</AlertDialogTitle>
            <AlertDialogDescription>
              Reset meeting usage for <span className="font-semibold text-foreground">{resetUsageUser?.email}</span> back to zero. 
              This sets a new baseline without deleting meeting history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reset-note">Note (optional)</Label>
              <Textarea
                id="reset-note"
                placeholder="e.g., Manual reset for March invoice"
                value={resetNote}
                onChange={(e) => setResetNote(e.target.value.slice(0, 500))}
                className="resize-none"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                {resetNote.length}/500 characters
              </p>
            </div>
            {resetUsageUser && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Current Usage</p>
                <p className="text-sm font-medium">
                  {getUsedMeetings(resetUsageUser)} / {getEffectiveMeetingLimit(resetUsageUser) ?? '∞'} meetings
                </p>
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResettingUsage}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetUsage}
              disabled={isResettingUsage}
              className="bg-orange-600 text-white hover:bg-orange-700"
            >
              {isResettingUsage ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                'Reset Usage'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
