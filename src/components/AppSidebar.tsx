import { useState, useEffect } from "react";
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
import { motion, AnimatePresence } from "framer-motion";
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
  const [selected, setSelected] = useState("Hem");
  const [showSettings, setShowSettings] = useState(false);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(false);
  
  const { user, logout } = useAuth();
  const { userPlan, isLoading: planLoading, refreshPlan } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();


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
    // Update selected based on current path
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
    { Icon: FiUserCheck, title: "Admins", path: "/admin/admins" },
    { Icon: FiDatabase, title: "Backend", path: "/admin/backend" },
    { Icon: FiSettings, title: "Enterprise", path: "/admin/enterprise" },
  ];

  return (
    <>
      {/* Mobile hamburger button - positioned at bottom left to avoid content overlap */}
      {isMobile && !open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed z-50 w-12 h-12 bg-primary/90 backdrop-blur-md border border-primary/20 rounded-full flex items-center justify-center text-primary-foreground shadow-lg hover:scale-105 active:scale-95 transition-all duration-200"
          style={{
            bottom: 'calc(max(env(safe-area-inset-bottom, 16px), 16px) + 16px)',
            left: 'calc(max(env(safe-area-inset-left, 16px), 16px) + 16px)',
          }}
        >
          <FiMenu className="text-xl" />
        </button>
      )}

      {/* Backdrop for mobile */}
      <AnimatePresence>
        {isMobile && open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-[2px]"
          />
        )}
      </AnimatePresence>

      
      {/* Sidebar - always mounted to avoid layout flashes */}
      <motion.nav
        initial={false}
        animate={{
          x: isMobile && !open ? -280 : 0,
          opacity: 1,
          ...(isMobile ? {} : { width: open ? 240 : 64 }),
        }}
        transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
        className={`${
          isMobile 
            ? "fixed top-0 left-0 w-[280px] z-50" 
            : "sticky top-0 shrink-0"
        } border-r border-border bg-card flex flex-col mobile-inset-top`}
        style={
          isMobile 
            ? {
                height: '100dvh',
                paddingTop: 'max(env(safe-area-inset-top, 0px), 0px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0px)',
                pointerEvents: open ? 'auto' : 'none',
              }
            : {
                height: '100vh',
              }
        }
        aria-hidden={isMobile && !open}
      >
        {/* Header Section */}
        <div className="shrink-0 p-2 pt-3">
          {isMobile && (
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <FiX className="text-xl" />
              </button>
            </div>
          )}
          <TitleSection 
            open={open} 
            user={user} 
            userPlan={userPlan}
            planLoading={planLoading}
          />
        </div>

        {/* Scrollable Navigation Section */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-2">
          <div className="space-y-1 py-1">
            {navItems.map((item) => (
              <Option
                key={item.title}
                Icon={item.Icon}
                title={item.title}
                selected={selected}
                onClick={() => handleNavigation(item.path, item.title, item.locked)}
                open={open}
                locked={item.locked}
              />
            ))}

            {isAdmin && (
              <AdminSection
                open={open}
                expanded={adminExpanded}
                setExpanded={setAdminExpanded}
                items={adminItems}
                selected={selected}
                onSelect={(path, title) => handleNavigation(path, title)}
              />
            )}

            {userPlan?.plan === 'enterprise' && open && (
              <div className="mt-4 pt-4 border-t border-border">
                <motion.button
                  layout
                  onClick={() => window.location.href = 'mailto:charlie.wretling@tivly.se'}
                  className="relative flex h-10 w-full items-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <motion.div
                    layout
                    className="grid h-full w-10 place-content-center text-lg"
                  >
                    <FiMail />
                  </motion.div>
                  <motion.span
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.125 }}
                    className="text-xs font-medium"
                  >
                    Kontakta support
                  </motion.span>
                </motion.button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section - Upgrade & User Info */}
        <div className="shrink-0 mt-auto">
          {!planLoading && userPlan && !plusAccess && open && !unlimited && meetingsLeft !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="px-2 py-2 border-t border-border"
            >
              <div className="text-xs text-muted-foreground mb-2">
                {meetingsLeft} möten kvar
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowSubscribe(true)}
                className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium flex items-center justify-center gap-2"
              >
                <FiZap className="text-base" />
                Uppgradera
              </motion.button>
            </motion.div>
          )}

          {!planLoading && userPlan && !plusAccess && !open && !unlimited && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowSubscribe(true)}
              className="mb-2 mx-2 w-10 h-10 bg-primary text-primary-foreground rounded-md flex items-center justify-center"
            >
              <FiZap className="text-lg" />
            </motion.button>
          )}

          <div className="px-2 pb-safe pb-3">
            <UserSection
              open={open}
              user={user}
              userPlan={userPlan}
              planLoading={planLoading}
              onSettings={() => setShowSettings(true)}
            />
          </div>

          {!isMobile && <ToggleClose open={open} setOpen={setOpen} />}
        </div>
      </motion.nav>

      <SettingsDialog 
        open={showSettings} 
        onOpenChange={setShowSettings}
      />
      <SubscribeDialog
        open={showSubscribe}
        onOpenChange={setShowSubscribe}
      />
    </>
  );
}


const Option = ({ Icon, title, selected, onClick, open, locked = false, badge = undefined }) => {
  return (
    <button
      onClick={onClick}
      className={`relative flex h-10 w-full items-center rounded-md transition-all duration-200 ${
        selected === title 
          ? "bg-primary/10 text-primary" 
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      <div className="grid h-full w-10 shrink-0 place-content-center text-lg">
        <Icon />
      </div>
      {open && (
        <span className="text-xs font-medium flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
          {title}
          {locked && <Lock className="h-3 w-3" />}
          {badge && !locked && (
            <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium">
              {badge}
            </span>
          )}
        </span>
      )}
    </button>
  );
};

const AdminSection = ({ open, expanded, setExpanded, items, selected, onSelect }) => {
  return (
    <div className="mt-4 pt-4 border-t border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="relative flex h-10 w-full items-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors mb-1"
      >
        <div className="grid h-full w-10 shrink-0 place-content-center text-lg">
          <FiShield />
        </div>
        {open && (
          <>
            <span className="text-xs font-medium animate-in fade-in slide-in-from-left-2 duration-200">
              Admin
            </span>
            <div
              className={`ml-auto mr-2 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            >
              <FiChevronDown className="text-sm" />
            </div>
          </>
        )}
      </button>

      {expanded && open && (
        <div className="space-y-1 pl-2 animate-in slide-in-from-top-2 duration-200">
          {items.map((item) => (
            <button
              key={item.title}
              onClick={() => onSelect(item.path, item.title)}
              className={`relative flex h-9 w-full items-center rounded-md transition-all duration-200 ${
                selected === item.title 
                  ? "bg-primary/10 text-primary" 
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              <div className="grid h-full w-10 shrink-0 place-content-center text-base">
                <item.Icon />
              </div>
              <span className="text-xs font-medium">
                {item.title}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const TitleSection = ({ open, user, userPlan, planLoading }) => {
  const planLabel = userPlan?.plan === 'enterprise' ? 'Enterprise' : userPlan?.plan === 'unlimited' ? 'Unlimited' : userPlan?.plan === 'plus' ? 'Plus' : userPlan?.plan === 'standard' ? 'Standard' : 'Free';
  
  return (
    <div className="mb-3 border-b border-border pb-3">
      <div className="flex items-center gap-2">
        <Logo />
        {open && (
          <div className="animate-in fade-in slide-in-from-left-2 duration-200">
            {planLoading ? (
              <div className="space-y-1">
                <div className="h-3 w-10 bg-muted rounded animate-pulse" />
                <div className="h-3 w-14 bg-muted/80 rounded animate-pulse" />
              </div>
            ) : (
              <>
                <span className="block text-xs font-semibold text-foreground">Tivly</span>
                <span className="block text-xs text-muted-foreground">{planLabel}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const Logo = () => {
  return (
    <div className="grid size-10 shrink-0 place-content-center rounded-md bg-primary overflow-hidden p-1">
      <img 
        src={tivlyLogo} 
        alt="Tivly"
        className="w-full h-full object-contain"
      />
    </div>
  );
};

const UserSection = ({ open, user, userPlan, planLoading, onSettings }) => {
  const planLabel = userPlan?.plan === 'enterprise' ? 'Enterprise' : userPlan?.plan === 'unlimited' ? 'Unlimited' : userPlan?.plan === 'plus' ? 'Plus' : userPlan?.plan === 'standard' ? 'Standard' : 'Free';
  const planColor = userPlan?.plan === 'enterprise' ? 'bg-amber-600' : userPlan?.plan === 'unlimited' ? 'bg-purple-500' : userPlan?.plan === 'plus' ? 'bg-blue-500' : userPlan?.plan === 'standard' ? 'bg-green-600' : 'bg-gray-500';

  return (
    <div className="border-t border-border pt-3 space-y-1">
      {open && user && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-2 pb-2 flex items-center gap-2"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {user.email?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-foreground truncate">
              {user.email}
            </div>
            {planLoading ? (
              <div className="h-4 w-16 bg-muted rounded animate-pulse" />
            ) : (
              <Badge className={`${planColor} text-white text-[10px] px-1 py-0 h-4`}>
                {planLabel}
              </Badge>
            )}
          </div>
        </motion.div>
      )}

      <motion.button
        layout
        onClick={onSettings}
        className="relative flex h-9 w-full items-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <motion.div
          layout
          className="grid h-full w-10 place-content-center text-base"
        >
          <FiSettings />
        </motion.div>
        {open && (
          <motion.span
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.125 }}
            className="text-xs font-medium"
          >
            Inställningar
          </motion.span>
        )}
      </motion.button>
    </div>
  );
};

const ToggleClose = ({ open, setOpen }) => {
  return (
    <motion.button
      layout
      onClick={() => setOpen((pv) => !pv)}
      className="border-t border-border transition-colors hover:bg-accent"
    >
      <div className="flex items-center p-2">
        <motion.div
          layout
          className="grid size-10 place-content-center text-lg text-muted-foreground"
        >
          <FiChevronsRight
            className={`transition-transform ${open && "rotate-180"}`}
          />
        </motion.div>
        {open && (
          <motion.span
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.125 }}
            className="text-xs font-medium text-muted-foreground"
          >
            Dölj
          </motion.span>
        )}
      </div>
    </motion.button>
  );
};
