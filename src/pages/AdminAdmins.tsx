import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { Shield, Trash2, UserPlus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const AdminAdmins = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [admins, setAdmins] = useState<Array<{ email: string; role: string }>>([]);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const isOwner = user?.email === 'vildewretling@gmail.com';

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    try {
      const data = await apiClient.getAllUserRoles();
      setAdmins(data.filter((u: any) => u.role === 'admin' || u.role === 'owner'));
    } catch (err) {
      console.error('Failed to fetch admins:', err);
    }
  };

  const handleAddAdmin = async () => {
    if (!isOwner) {
      toast({ title: 'Access Denied', description: 'Only the owner can manage admin roles', variant: 'destructive' });
      return;
    }

    if (!newAdminEmail.trim()) {
      toast({ title: 'Error', description: 'Please enter an email', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      await apiClient.createUserRole(newAdminEmail.toLowerCase(), 'admin');
      await apiClient.grantUserCredit(newAdminEmail.toLowerCase(), {
        type: 'unlimited',
        note: 'Automatically granted unlimited access for admin role'
      });
      toast({ title: 'Success', description: `${newAdminEmail} added as admin` });
      setNewAdminEmail("");
      fetchAdmins();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to add admin', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAdmin = async (email: string) => {
    if (email === 'vildewretling@gmail.com') {
      toast({ title: 'Protected Account', description: 'The owner account cannot be removed', variant: 'destructive' });
      return;
    }

    if (!isOwner) {
      toast({ title: 'Access Denied', description: 'Only the owner can manage admin roles', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      await apiClient.deleteUserRole(email);
      await apiClient.grantUserCredit(email, { type: 'clear', clear: true });
      toast({ title: 'Success', description: `${email} removed as admin and reverted to normal plan` });
      fetchAdmins();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to remove admin', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-2">
        <Shield className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-semibold">Admin Management</h1>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {isOwner && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Add New Admin
              </CardTitle>
              <CardDescription>Grant admin access to a user</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="user@example.com"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddAdmin()}
                />
                <Button onClick={handleAddAdmin} disabled={loading}>
                  Add Admin
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Current Admins</CardTitle>
            <CardDescription>Manage admin users</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {admins.map((admin) => (
                <div
                  key={admin.email}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Shield className="w-4 h-4 text-primary" />
                    <div>
                      <p className="font-medium">{admin.email}</p>
                      <p className="text-xs text-muted-foreground capitalize">{admin.role}</p>
                    </div>
                  </div>
                  {isOwner && admin.email !== 'vildewretling@gmail.com' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveAdmin(admin.email)}
                      disabled={loading}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                  {admin.email === 'vildewretling@gmail.com' && (
                    <div className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full font-medium">
                      Owner
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default AdminAdmins;
