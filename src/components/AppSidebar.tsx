import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import {
  FiHome,
  FiBookOpen,
  FiCalendar,
  FiMessageSquare,
  
  FiUsers,
  FiMail,
  FiUserCheck,
  FiSettings,
  FiLogOut,
  FiChevronDown,
  FiChevronsRight,
  FiZap,
  FiShield,
  FiDatabase,
  FiMenu,
  FiX,
  FiAlertTriangle,
} from "react-icons/fi";
import { Lock, Eye, DollarSign, BarChart3, Mic, CreditCard, Users, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useToast } from "@/hooks/use-toast";
import { isUserAdmin, hasPlusAccess, hasUnlimitedAccess, isLibraryLocked } from "@/lib/accessCheck";
import { SubscribeDialog } from "@/components/SubscribeDialog";
import { AdminSupportPanel } from "@/components/AdminSupportPanel";
import { isNativeApp } from "@/utils/capacitorDetection";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { isMobileDevice } from "@/utils/mobileDetection";
import { OrgSwitcherDialog } from "@/components/OrgSwitcherDialog";
import tivlyLogo from "@/assets/tivly-logo.png";

export function AppSidebar() {
  const [isMobile] = useState(() => isMobileDevice());
  const [open, setOpen] = useState(() => !isMobileDevice());
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState("Hem");
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [showAdminSupport, setShowAdminSupport] = useState(false);
  const [showOrgSwitcher, setShowOrgSwitcher] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(false);
  const [orgExpanded, setOrgExpanded] = useState(false);
  const isNative = isNativeApp();
  
  const scrollYRef = useRef(0);
  const { user, logout } = useAuth();
  const { userPlan, isLoading: planLoading, refreshPlan, enterpriseMembership, switchCompany } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Prevent background scroll when sidebar is open on mobile
  useEffect(() => {
    if (!isMobile) return;
    
    if (open) {
      scrollYRef.current = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollYRef.current}px`;
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollYRef.current);
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
    };
  }, [open, isMobile]);

  const unlimited = planLoading ? false : hasUnlimitedAccess(user, userPlan);
  const plusAccess = planLoading ? false : hasPlusAccess(user, userPlan);
  const libraryLocked = planLoading ? false : isLibraryLocked(user, userPlan);
  const agendasLocked = planLoading ? false : (!unlimited && !plusAccess);
  

  const meetingsUsed = !planLoading && userPlan ? (userPlan.meetingsUsed ?? 0) : 0;
  const meetingsLimit = !planLoading && userPlan ? (userPlan.meetingsLimit ?? null) : null;
  const meetingsLeft = meetingsLimit !== null ? Math.max(0, Number(meetingsLimit) - Number(meetingsUsed)) : null;


  useEffect(() => {
    if (user) {
      refreshPlan();
    }
  }, [user, refreshPlan]);

  useEffect(() => {
    const checkAdmin = async () => {
      if (user) {
        const adminStatus = await isUserAdmin(user);
        setIsAdmin(adminStatus);
      }
    };
    checkAdmin();
  }, [user]);

  useEffect(() => {
    const path = location.pathname;
    if (path === "/") setSelected("Hem");
    else if (path === "/library" || path.startsWith("/library/")) setSelected("Bibliotek");
    else if (path === "/agendas" || path.startsWith("/agendas/")) setSelected("Agendor");
    else if (path === "/feedback" || path.startsWith("/feedback/")) setSelected("Feedback");
    else if (path.startsWith("/integrations")) setSelected("Integrationer");
    else if (path === "/settings" || path.startsWith("/settings/")) setSelected("Inställningar");
    else if (path === "/enterprise/stats" || path.startsWith("/enterprise/stats/")) setSelected("Översikt");
    else if (path === "/org/settings" || path.startsWith("/org/settings/")) setSelected("Team");
    else if (path === "/org/billing" || path.startsWith("/org/billing/")) setSelected("Fakturering");
    else if (path.startsWith("/billing/invoices")) setSelected("Fakturor");
    else if (path.startsWith("/meetings/")) setSelected("Hem");
    else if (path === "/chat" || path.startsWith("/chat/")) setSelected("Hem");
    else if (path.startsWith("/admin")) {
      if (path === "/admin/users") setSelected("Användare");
      else if (path === "/admin/email-campaigns") setSelected("E-postkampanjer");
      else if (path === "/admin/admins") setSelected("Admins");
      else if (path === "/admin/backend") setSelected("Backend");
      else if (path.startsWith("/admin/enterprise/billing")) setSelected("Enterprise Billing");
      else if (path.startsWith("/admin/enterprise")) setSelected("Enterprise");
      else if (path === "/admin/ai-costs") setSelected("AI Kostnader");
      else if (path === "/admin/speaker-profiles") setSelected("Röstprofiler");
      else if (path.startsWith("/admin/integrations")) setSelected("Integrationer (Admin)");
    }

    // Auto-expand org section if on an org page
    if (['/enterprise/stats', '/org/settings', '/org/billing', '/billing/invoices'].some(p => path.startsWith(p))) {
      setOrgExpanded(true);
    }
  }, [location.pathname]);

  const handleNavigation = (path: string, title: string, locked: boolean = false, external: boolean = false) => {
    if (locked) {
      toast({
        title: "Låst funktion",
        description: "Denna funktion kräver Standard- eller Enterprise-plan.",
      });
      setShowSubscribe(true);
      return;
    }
    
    if (external) {
      window.open(path, '_blank', 'noopener,noreferrer');
      if (isMobile) {
        setOpen(false);
      }
      return;
    }
    
    setSelected(title);
    navigate(path);
    if (isMobile) {
      setOpen(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    toast({
      title: "Utloggad",
      description: "Du har loggats ut framgångsrikt",
    });
    navigate("/auth");
  };

  // Check if user is enterprise owner (only owners can see Översikt)
  const isEnterpriseOwner = enterpriseMembership?.isMember && 
    enterpriseMembership.membership?.role === 'owner';

  // Viewer = read-only investor-style access
  const isEnterpriseViewer = enterpriseMembership?.isMember && 
    enterpriseMembership.membership?.role === 'viewer';

  const navItems = isEnterpriseViewer
    ? [
        { Icon: FiHome, title: "Hem", path: "/", locked: false },
      ]
    : [
        { Icon: FiHome, title: "Hem", path: "/", locked: false },
        { Icon: FiBookOpen, title: "Bibliotek", path: "/library", locked: libraryLocked },
        { Icon: FiCalendar, title: "Agendor", path: "/agendas", locked: agendasLocked },
        { Icon: FiMessageSquare, title: "Feedback", path: "/feedback", locked: false },
        { Icon: FiZap, title: "Integrationer", path: "/integrations", locked: false },
      ];

  const isEnterpriseOwnerOrAdmin = enterpriseMembership?.isMember && 
    (enterpriseMembership.membership?.role === 'owner' || enterpriseMembership.membership?.role === 'admin');

  const orgSubItems = isEnterpriseViewer
    ? [
        { Icon: Users, title: "Team", path: "/org/settings" },
      ]
    : [
        ...(isEnterpriseOwner ? [{ Icon: BarChart3, title: "Översikt", path: "/enterprise/stats" }] : []),
        { Icon: Users, title: "Team", path: "/org/settings" },
        { Icon: CreditCard, title: "Fakturering", path: "/org/billing" },
        { Icon: FileText, title: "Fakturor", path: "/billing/invoices" },
      ];

  const adminItems = [
    { Icon: FiUsers, title: "Användare", path: "/admin/users" },
    { Icon: FiMail, title: "E-postkampanjer", path: "/admin/email-campaigns" },
    { Icon: FiUserCheck, title: "Admins", path: "/admin/admins" },
    { Icon: FiDatabase, title: "Backend", path: "/admin/backend" },
    { Icon: FiSettings, title: "Enterprise", path: "/admin/enterprise" },
    { Icon: DollarSign, title: "AI Kostnader", path: "/admin/ai-costs" },
    { Icon: Mic, title: "Röstprofiler", path: "/admin/speaker-profiles" },
    { Icon: FiZap, title: "Integrationer (Admin)", path: "/admin/integrations" },
    { Icon: Eye, title: "Support Panel", action: () => setShowAdminSupport(true) },
  ];

  return (
    <>
      {/* Mobile Trigger Button - Minimal hamburger, top-left */}
      {isMobile && !open && (
        <button
          onClick={() => setOpen(true)}
          className="md:hidden fixed z-50 w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all"
          style={{
            top: 'max(env(safe-area-inset-top, 12px), 12px)',
            left: 'max(env(safe-area-inset-left, 12px), 12px)',
          }}
          aria-label="Öppna meny"
        >
          <FiMenu className="text-xl" />
        </button>
      )}

      {/* Backdrop - Mobile Only */}
      {isMobile && open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/50"
          style={{ 
            WebkitBackfaceVisibility: 'hidden',
            backfaceVisibility: 'hidden',
          }}
        />
      )}

      {/* Sidebar Navigation */}
      {(open || !isMobile) && (
        <motion.aside
          initial={false}
          animate={{
            x: isMobile ? (open ? 0 : -280) : 0,
            ...(isMobile ? {} : { width: collapsed ? '70px' : '280px' }),
          }}
          transition={{
            type: "tween",
            duration: 0.2,
            ease: "easeInOut",
          }}
          className={`sidebar-nav ${isMobile ? 'fixed' : 'sticky'} top-0 left-0 z-50 flex flex-col bg-card border-r border-border`}
          style={{
            height: isMobile ? '100dvh' : '100vh',
            width: isMobile ? '280px' : undefined,
            paddingTop: (isMobile && isNative) ? 'env(safe-area-inset-top, 0px)' : 0,
            paddingBottom: (isMobile && isNative) ? 'env(safe-area-inset-bottom, 0px)' : 0,
            WebkitBackfaceVisibility: 'hidden',
            backfaceVisibility: 'hidden',
          }}
        >
        {/* Toggle Buttons */}
        {isMobile ? (
          <div className="flex justify-end p-2">
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
            >
              <FiX className="text-xl" />
            </button>
          </div>
        ) : (
          <div className="flex justify-end p-2">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
            >
              <motion.div
                animate={{ rotate: collapsed ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <FiChevronsRight className="text-xl" />
              </motion.div>
            </button>
          </div>
        )}

        {/* Header */}
        <div className="shrink-0 px-4 py-3 border-b border-border">
          <button
            className={`w-full flex items-center gap-3 text-left rounded-lg transition-colors ${
              enterpriseMembership?.memberships && enterpriseMembership.memberships.length > 1
                ? 'hover:bg-accent/50 cursor-pointer p-1 -m-1'
                : ''
            }`}
            onClick={() => {
              if (enterpriseMembership?.memberships && enterpriseMembership.memberships.length > 1) {
                setShowOrgSwitcher(true);
              }
            }}
            disabled={!enterpriseMembership?.memberships || enterpriseMembership.memberships.length <= 1}
          >
            <div className="w-10 h-10 shrink-0 rounded-lg bg-primary overflow-hidden flex items-center justify-center">
              <img src={tivlyLogo} alt="Tivly" className="w-full h-full object-contain p-1" />
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                {planLoading ? (
                  <div className="space-y-1">
                    <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                    <div className="h-3 w-20 bg-muted/80 rounded animate-pulse" />
                  </div>
                ) : (
                  <>
                    <span className="text-sm font-semibold text-foreground truncate block max-w-full text-left">
                      {enterpriseMembership?.isMember && enterpriseMembership.company?.name 
                        ? enterpriseMembership.company.name 
                        : 'Tivly'}
                    </span>
                    <div className="text-xs text-muted-foreground truncate">
                      {enterpriseMembership?.isMember ? (
                        <span className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 border-primary/20 text-primary">
                            Enterprise
                          </Badge>
                          {enterpriseMembership.membership?.role && (
                            <span className="text-muted-foreground/70">
                              {enterpriseMembership.membership.role === 'admin' ? 'Admin' : 
                               enterpriseMembership.membership.role === 'owner' ? 'Ägare' : 
                               enterpriseMembership.membership.role === 'viewer' ? 'Läsare' : 'Medlem'}
                            </span>
                          )}
                        </span>
                      ) : (
                        userPlan?.plan === 'enterprise' ? 'Enterprise' : 
                        userPlan?.plan === 'unlimited' ? 'Unlimited' : 
                        userPlan?.plan === 'plus' ? 'Plus' : 
                        userPlan?.plan === 'pro' ? 'Pro' : 'Free'
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
            {!collapsed && enterpriseMembership?.memberships && enterpriseMembership.memberships.length > 1 && (
              <FiChevronDown className="text-muted-foreground shrink-0 text-sm" />
            )}
          </button>
        </div>

        {/* Trial banner rendered at bottom */}

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-3">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.title}
                onClick={() => handleNavigation(item.path, item.title, item.locked, (item as any).external)}
                className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-sm transition-all duration-150 ${
                  selected === item.title
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
                title={collapsed ? item.title : undefined}
              >
                <item.Icon className="text-lg shrink-0" />
                {!collapsed && (
                  <>
                    <span className="text-sm truncate">{item.title}</span>
                    {item.locked && <Lock className="ml-auto h-3.5 w-3.5 shrink-0" />}
                  </>
                )}
              </button>
            ))}

            {/* Enterprise Organisation Section */}
            {enterpriseMembership?.isMember && !collapsed && (
              <div className="mt-4 pt-4 border-t border-border">
                <button
                  onClick={() => setOrgExpanded(!orgExpanded)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all"
                >
                  <Users className="text-lg shrink-0" />
                  <span className="text-sm flex-1 text-left">Organisation</span>
                  <FiChevronDown
                    className={`text-base shrink-0 transition-transform duration-200 ${
                      orgExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {orgExpanded && (
                  <div className="mt-1 space-y-1 pl-2">
                    {orgSubItems.map((item) => (
                      <button
                        key={item.title}
                        onClick={() => handleNavigation(item.path, item.title)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
                          selected === item.title
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                      >
                        <item.Icon className="text-base shrink-0" />
                        <span className="text-sm truncate">{item.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Enterprise Org Icon Only - Collapsed State */}
            {enterpriseMembership?.isMember && collapsed && (
              <div className="mt-4 pt-4 border-t border-border">
                <button
                  onClick={() => { setCollapsed(false); setOrgExpanded(true); }}
                  className="w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all"
                  title="Organisation"
                >
                  <Users className="text-lg shrink-0" />
                </button>
              </div>
            )}

            {/* Admin Section */}
            {isAdmin && !collapsed && (
              <div className="mt-4 pt-4 border-t border-border">
                <button
                  onClick={() => setAdminExpanded(!adminExpanded)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all"
                >
                  <FiShield className="text-lg shrink-0" />
                  <span className="text-sm flex-1 text-left">Admin</span>
                  <FiChevronDown
                    className={`text-base shrink-0 transition-transform duration-200 ${
                      adminExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {adminExpanded && (
                  <div className="mt-1 space-y-1 pl-2">
                    {adminItems.map((item) => (
                      <button
                        key={item.title}
                        onClick={() => {
                          if ('action' in item && item.action) {
                            item.action();
                            if (isMobile) setOpen(false);
                          } else if ('path' in item && item.path) {
                            handleNavigation(item.path, item.title);
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
                          selected === item.title
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                      >
                        <item.Icon className="text-base shrink-0" />
                        <span className="text-sm truncate">{item.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Admin Icon Only - Collapsed State */}
            {isAdmin && collapsed && (
              <div className="mt-4 pt-4 border-t border-border">
                <button
                  onClick={() => setCollapsed(false)}
                  className="w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all"
                  title="Admin"
                >
                  <FiShield className="text-lg shrink-0" />
                </button>
              </div>
            )}


            {/* Enterprise Contact */}
            {userPlan?.plan === 'enterprise' && !collapsed && (
              <div className="pt-2">
                <button
                  onClick={() => window.location.href = 'mailto:charlie.wretling@tivly.se'}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all"
                >
                  <FiMail className="text-lg shrink-0" />
                  <span className="text-sm">Kontakta support</span>
                </button>
              </div>
            )}
          </nav>
        </div>

        {/* Enterprise Trial Banner — minimal, bottom-positioned */}
        {!collapsed && enterpriseMembership?.isMember && enterpriseMembership.company?.trial?.enabled && 
         !enterpriseMembership.company.trial.expired && 
         !enterpriseMembership.company.trial.manuallyDisabled &&
         enterpriseMembership.company.trial.daysRemaining !== null && 
         enterpriseMembership.company.trial.daysRemaining > 0 && (() => {
          const daysRemaining = enterpriseMembership.company!.trial!.daysRemaining!;
          const trialEndDate = new Date();
          trialEndDate.setDate(trialEndDate.getDate() + daysRemaining);
          const formattedEndDate = trialEndDate.toLocaleDateString('sv-SE', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
          });
          
          const getTextColor = () => {
            if (daysRemaining <= 3) return 'text-destructive';
            if (daysRemaining <= 7) return 'text-yellow-600 dark:text-yellow-500';
            return 'text-muted-foreground';
          };

          return (
            <div className={`shrink-0 px-4 py-2.5 border-t border-border ${getTextColor()}`}>
              <div className="flex items-center gap-2">
                <FiAlertTriangle className="text-xs shrink-0" />
                <span className="text-[11px] font-medium">
                  {daysRemaining === 1 ? 'Sista dagen' : `${daysRemaining} dagar kvar`}
                  <span className="font-normal opacity-70"> · Trial t.o.m. {formattedEndDate}</span>
                </span>
              </div>
            </div>
          );
        })()}

        {!planLoading && userPlan && userPlan.plan === 'free' && meetingsLeft !== null && !collapsed && !isEnterpriseViewer &&
         !(typeof window !== 'undefined' && window.location.hostname === 'io.tivly.se') && (
          <div className="shrink-0 p-3 border-t border-border">
            <div className="text-xs text-muted-foreground mb-2 px-1">
              {meetingsLeft} möten kvar
            </div>
            <button
              onClick={() => setShowSubscribe(true)}
              className="w-full bg-primary text-primary-foreground rounded-none py-2.5 px-3 text-sm font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
            >
              <FiZap className="text-base" />
              Uppgradera
            </button>
          </div>
        )}

        {/* Meeting Counter - For Pro users (no upgrade button) */}
        {!planLoading && userPlan && userPlan.plan === 'pro' && meetingsLeft !== null && !collapsed && !isEnterpriseViewer && (
          <div className="shrink-0 p-3 border-t border-border">
            <div className="text-xs text-muted-foreground px-1">
              {meetingsLeft} möten kvar
            </div>
          </div>
        )}

        {/* User Section */}
        <div className="shrink-0 border-t border-border p-3">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                  {user?.email?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => navigate('/settings')}
                className="flex items-center justify-center p-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all"
                title="Inställningar"
              >
                <FiSettings className="text-base" />
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center justify-center p-2 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                title="Logga ut"
              >
                <FiLogOut className="text-base" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-2">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                    {((user as any)?.preferredName?.[0] || user?.email?.[0] || "U").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {(user as any)?.preferredName || user?.email?.split('@')[0] || 'Användare'}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {user?.email || ''}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => navigate('/settings')}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all"
                >
                  <FiSettings className="text-base" />
                  <span>Inställningar</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                >
                  <FiLogOut className="text-base" />
                </button>
              </div>
            </>
          )}
        </div>
        </motion.aside>
      )}

      {/* Dialogs */}
      <SubscribeDialog open={showSubscribe} onOpenChange={setShowSubscribe} />
      <AdminSupportPanel open={showAdminSupport} onOpenChange={setShowAdminSupport} />
      {enterpriseMembership?.memberships && enterpriseMembership.memberships.length > 1 && (
        <OrgSwitcherDialog
          open={showOrgSwitcher}
          onOpenChange={setShowOrgSwitcher}
          memberships={enterpriseMembership.memberships}
          activeCompanyId={enterpriseMembership.activeCompanyId}
          onSelect={async (companyId) => {
            await switchCompany(companyId);
            toast({ title: 'Organisation bytt', description: `Du arbetar nu i ${enterpriseMembership.memberships?.find(m => m.companyId === companyId)?.companyName || 'vald organisation'}.` });
          }}
        />
      )}
    </>
  );
}
