import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  FiHome,
  FiBookOpen,
  FiCalendar,
  FiMessageSquare,
  FiMessageCircle,
  FiUsers,
  FiBarChart,
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
} from "react-icons/fi";
import { Lock } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useToast } from "@/hooks/use-toast";
import { isUserAdmin, hasPlusAccess, hasUnlimitedAccess, isLibraryLocked } from "@/lib/accessCheck";
import { SettingsDialog } from "@/components/SettingsDialog";
import { SubscribeDialog } from "@/components/SubscribeDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { isMobileDevice } from "@/utils/mobileDetection";
import tivlyLogo from "@/assets/tivly-logo.png";

export function AppSidebar() {
  const [isMobile] = useState(() => isMobileDevice());
  const [open, setOpen] = useState(() => !isMobileDevice());
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState("Hem");
  const [showSettings, setShowSettings] = useState(false);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(false);
  
  const scrollYRef = useRef(0);
  const { user, logout } = useAuth();
  const { userPlan, isLoading: planLoading, refreshPlan } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Prevent background scroll and stabilize viewport when sidebar is open on mobile (iOS-safe lock)
  useEffect(() => {
    if (!isMobile) return;
    const body = document.body;

    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    if (open) {
      scrollYRef.current = window.scrollY || window.pageYOffset || 0;
      body.style.position = 'fixed';
      body.style.top = `-${scrollYRef.current}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
    } else {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      if (scrollYRef.current) {
        window.scrollTo(0, scrollYRef.current);
      }
    }

    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
    };
  }, [isMobile, open]);

  const unlimited = planLoading ? false : hasUnlimitedAccess(user, userPlan);
  const plusAccess = planLoading ? false : hasPlusAccess(user, userPlan);
  const libraryLocked = planLoading ? false : isLibraryLocked(user, userPlan);
  const agendasLocked = planLoading ? false : (!unlimited && !plusAccess);
  const chatLocked = planLoading ? false : (!unlimited && !plusAccess);

  const meetingsUsed = !planLoading && userPlan ? (userPlan.meetingsUsed ?? 0) : 0;
  const meetingsLimit = !planLoading && userPlan ? (userPlan.meetingsLimit ?? null) : null;
  const meetingsLeft = meetingsLimit !== null ? Math.max(0, Number(meetingsLimit) - Number(meetingsUsed)) : null;

  useEffect(() => {
    refreshPlan();
  }, []);

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
    else if (path === "/library") setSelected("Bibliotek");
    else if (path === "/agendas") setSelected("Agendor");
    else if (path === "/chat") setSelected("AI Chatt");
    else if (path === "/feedback") setSelected("Feedback");
    else if (path.startsWith("/admin")) {
      if (path === "/admin/users") setSelected("Användare");
      else if (path === "/admin/analytics") setSelected("Analys");
      else if (path === "/admin/email-campaigns") setSelected("E-postkampanjer");
      else if (path === "/admin/outreach") setSelected("B2B Outreach");
      else if (path === "/admin/admins") setSelected("Admins");
      else if (path === "/admin/backend") setSelected("Backend");
      else if (path === "/admin/enterprise") setSelected("Enterprise");
    }
  }, [location.pathname]);

  const handleNavigation = (path: string, title: string, locked: boolean = false) => {
    if (locked) {
      toast({
        title: "Låst funktion",
        description: "Denna funktion kräver Standard- eller Enterprise-plan.",
      });
      setShowSubscribe(true);
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

  const navItems = [
    { Icon: FiHome, title: "Hem", path: "/", locked: false },
    { Icon: FiBookOpen, title: "Bibliotek", path: "/library", locked: libraryLocked },
    { Icon: FiMessageCircle, title: "AI Chatt", path: "/chat", locked: chatLocked },
    { Icon: FiCalendar, title: "Agendor", path: "/agendas", locked: agendasLocked },
    { Icon: FiMessageSquare, title: "Feedback", path: "/feedback", locked: false },
  ];

  const adminItems = [
    { Icon: FiUsers, title: "Användare", path: "/admin/users" },
    { Icon: FiBarChart, title: "Analys", path: "/admin/analytics" },
    { Icon: FiMail, title: "E-postkampanjer", path: "/admin/email-campaigns" },
    { Icon: FiMail, title: "B2B Outreach", path: "/admin/outreach" },
    { Icon: FiUserCheck, title: "Admins", path: "/admin/admins" },
    { Icon: FiDatabase, title: "Backend", path: "/admin/backend" },
    { Icon: FiSettings, title: "Enterprise", path: "/admin/enterprise" },
  ];

  return (
    <>
      {/* Mobile Trigger Button - Only visible when closed */}
      {isMobile && !open && (
        <motion.button
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
          onClick={() => setOpen(true)}
          className="fixed z-50 w-12 h-12 bg-primary backdrop-blur-md border-2 border-primary/20 rounded-full flex items-center justify-center text-primary-foreground shadow-xl transition-transform hover:scale-110 active:scale-95"
          style={{
            bottom: 'calc(max(env(safe-area-inset-bottom, 16px), 16px) + 16px)',
            left: 'calc(max(env(safe-area-inset-left, 16px), 16px) + 16px)',
            willChange: 'transform, opacity',
            transform: 'translate3d(0, 0, 0)',
            backfaceVisibility: 'hidden',
          }}
        >
          <FiMenu className="text-xl" />
        </motion.button>
      )}

      {/* Backdrop - Mobile Only (always mounted to avoid flashes) */}
      {isMobile && (
        <motion.div
          initial={false}
          animate={{ opacity: open ? 1 : 0 }}
          transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
          onClick={() => open && setOpen(false)}
          className="fixed inset-0 z-40 bg-black/50"
          style={{ 
            pointerEvents: open ? 'auto' : 'none', 
            willChange: 'opacity',
            transform: 'translate3d(0, 0, 0)',
            backfaceVisibility: 'hidden',
          }}
        />
      )}

      {/* Sidebar Navigation - Always Rendered */}
      <motion.aside
        initial={false}
        animate={{
          x: isMobile ? (open ? 0 : -280) : 0,
          ...(isMobile ? {} : { width: collapsed ? '70px' : '280px' }),
        }}
        transition={{
          type: "tween",
          duration: 0.2,
          ease: [0.25, 0.1, 0.25, 1],
        }}
        className={`sidebar-nav ${isMobile ? 'fixed' : 'sticky'} top-0 left-0 z-50 flex flex-col bg-card border-r border-border`}
        style={{
          height: isMobile ? '100dvh' : '100vh',
          paddingTop: isMobile ? 'max(env(safe-area-inset-top, 0px), 0px)' : 0,
          paddingBottom: isMobile ? 'max(env(safe-area-inset-bottom, 0px), 0px)' : 0,
          willChange: 'transform',
          transform: 'translate3d(0, 0, 0)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          perspective: 1000,
          contain: 'paint',
          touchAction: 'manipulation',
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
          <div className="flex items-center gap-3">
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
                    <div className="text-sm font-semibold text-foreground truncate">Tivly</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {userPlan?.plan === 'enterprise' ? 'Enterprise' : 
                       userPlan?.plan === 'unlimited' ? 'Unlimited' : 
                       userPlan?.plan === 'plus' ? 'Plus' : 
                       userPlan?.plan === 'standard' ? 'Standard' : 'Free'}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-3">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.title}
                onClick={() => handleNavigation(item.path, item.title, item.locked)}
                className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg transition-all duration-200 ${
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
              <div className="mt-4 pt-4 border-t border-border">
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

        {/* Upgrade Section */}
        {!planLoading && userPlan && !plusAccess && !unlimited && meetingsLeft !== null && !collapsed && (
          <div className="shrink-0 p-3 border-t border-border">
            <div className="text-xs text-muted-foreground mb-2 px-1">
              {meetingsLeft} möten kvar
            </div>
            <button
              onClick={() => setShowSubscribe(true)}
              className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 px-3 text-sm font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
            >
              <FiZap className="text-base" />
              Uppgradera
            </button>
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
                onClick={() => setShowSettings(true)}
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
                    {user?.email?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {user?.email?.split('@')[0] || 'Användare'}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {user?.email || ''}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowSettings(true)}
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

      {/* Dialogs */}
      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
      <SubscribeDialog open={showSubscribe} onOpenChange={setShowSubscribe} />
    </>
  );
}
