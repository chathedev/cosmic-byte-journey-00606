import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-black tracking-tight">404</h1>
        <p className="text-xl text-muted-foreground">Sidan kunde inte hittas</p>
        <p className="text-sm text-muted-foreground">
          URL: <code className="px-2 py-1 rounded bg-muted text-xs">{location.pathname}</code>
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            to="/"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover-scale"
          >
            Gå till startsidan
          </Link>
          <Link
            to="/feedback"
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted hover-scale"
          >
            Kontakta support
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
