import { useNavigate } from "react-router-dom";
import { ArrowLeft, Monitor, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const AdminIntegrations = () => {
  const navigate = useNavigate();

  const integrations = [
    {
      title: "Microsoft Teams",
      description: "Hantera Teams-kopplingar, auto-import och tenant consent",
      icon: Monitor,
      path: "/admin/integrations/teams",
      active: true,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-semibold">Integrationer</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Admin – hantera externa kopplingar</p>
          </div>
        </div>

        <div className="space-y-3">
          {integrations.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="w-full text-left rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors overflow-hidden"
            >
              <div className="p-4 sm:p-5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
                  <item.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">{item.title}</h2>
                    {item.active && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Aktiv</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminIntegrations;
