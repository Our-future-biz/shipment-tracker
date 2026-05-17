import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardTab } from "@/components/DashboardTab";
import { FullSheetTab } from "@/components/FullSheetTab";
import { DocumentReadingTab } from "@/components/DocumentReadingTab";
import { InvoicingTab } from "@/components/InvoicingTab";
import { QuoteTab } from "@/components/QuoteTab";
import { WarehouseTab } from "@/components/WarehouseTab";
import { ShipmentProvider } from "@/lib/shipment-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LoginScreen } from "@/components/LoginScreen";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { Ship, LayoutDashboard, Table2, FileSearch, Receipt, ClipboardList, Warehouse, LogOut, Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme-context";

function AppContent() {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("dashboard");

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <ShipmentProvider>
      <div className="h-screen flex flex-col overflow-hidden" data-testid="app-root">
        {/* Header */}
        <header className="flex-none border-b border-border/50 px-6 py-3 flex items-center justify-between" style={{ background: "hsl(var(--surface-8))" }}>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg" style={{ background: "var(--brand-teal-soft)" }}>
              <Ship className="w-5 h-5" style={{ color: "var(--brand-teal)" }} />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-foreground">Shipment Tracker</h1>
              <p className="text-xs text-muted-foreground">Operations Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="tabular-nums">{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</span>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors hover-elevate"
              style={{ color: "hsl(var(--muted-55))" }}
              title={theme === "dark" ? "Switch to day mode" : "Switch to night mode"}
              data-testid="button-theme-toggle"
            >
              {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <div className="flex items-center gap-2 ml-2 pl-2 border-l" style={{ borderColor: "hsl(var(--border-18))" }}>
              <span className="text-xs" style={{ color: "hsl(var(--muted-65))" }}>{user?.displayName || user?.email}</span>
              <button
                onClick={logout}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors hover:bg-white/5"
                style={{ color: "hsl(var(--muted-55))" }}
                title="Sign out"
                data-testid="button-logout"
              >
                <LogOut className="w-3 h-3" />
              </button>
            </div>
          </div>
        </header>

        {/* Tab nav + content fills remaining space */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="flex-none border-b border-border/50 px-6" style={{ background: "hsl(var(--surface-8))" }}>
            <TabsList className="bg-transparent h-10 p-0 gap-0">
              <TabsTrigger
                value="dashboard"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 rounded-none px-4 h-10 text-xs font-medium gap-1.5"
                style={{ borderColor: activeTab === "dashboard" ? "var(--brand-teal)" : "transparent", color: activeTab === "dashboard" ? "var(--brand-teal)" : undefined }}
                data-testid="tab-dashboard"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger
                value="fullsheet"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 rounded-none px-4 h-10 text-xs font-medium gap-1.5"
                style={{ borderColor: activeTab === "fullsheet" ? "var(--brand-teal)" : "transparent", color: activeTab === "fullsheet" ? "var(--brand-teal)" : undefined }}
                data-testid="tab-fullsheet"
              >
                <Table2 className="w-3.5 h-3.5" />
                Shipments
              </TabsTrigger>
              <TabsTrigger
                value="docreading"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 rounded-none px-4 h-10 text-xs font-medium gap-1.5"
                style={{ borderColor: activeTab === "docreading" ? "var(--brand-teal)" : "transparent", color: activeTab === "docreading" ? "var(--brand-teal)" : undefined }}
                data-testid="tab-docreading"
              >
                <FileSearch className="w-3.5 h-3.5" />
                Document/Text Reading
              </TabsTrigger>
              <TabsTrigger
                value="invoicing"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 rounded-none px-4 h-10 text-xs font-medium gap-1.5"
                style={{ borderColor: activeTab === "invoicing" ? "var(--brand-teal)" : "transparent", color: activeTab === "invoicing" ? "var(--brand-teal)" : undefined }}
                data-testid="tab-invoicing"
              >
                <Receipt className="w-3.5 h-3.5" />
                Invoicing
              </TabsTrigger>
              <TabsTrigger
                value="quote"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 rounded-none px-4 h-10 text-xs font-medium gap-1.5"
                style={{ borderColor: activeTab === "quote" ? "var(--brand-teal)" : "transparent", color: activeTab === "quote" ? "var(--brand-teal)" : undefined }}
                data-testid="tab-quote"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                Quote
              </TabsTrigger>
              <TabsTrigger
                value="warehouse"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 rounded-none px-4 h-10 text-xs font-medium gap-1.5"
                style={{ borderColor: activeTab === "warehouse" ? "var(--brand-teal)" : "transparent", color: activeTab === "warehouse" ? "var(--brand-teal)" : undefined }}
                data-testid="tab-warehouse"
              >
                <Warehouse className="w-3.5 h-3.5" />
                Warehouse
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="flex-1 min-h-0 m-0 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
            <DashboardTab />
          </TabsContent>

          <TabsContent value="fullsheet" className="flex-1 min-h-0 m-0 overflow-hidden">
            <FullSheetTab />
          </TabsContent>

          <TabsContent value="docreading" className="flex-1 min-h-0 m-0 overflow-hidden">
            <DocumentReadingTab />
          </TabsContent>

          <TabsContent value="invoicing" className="flex-1 min-h-0 m-0 overflow-hidden">
            <InvoicingTab />
          </TabsContent>

          <TabsContent value="quote" className="flex-1 min-h-0 m-0 overflow-hidden">
            <QuoteTab />
          </TabsContent>

          <TabsContent value="warehouse" className="flex-1 min-h-0 m-0 overflow-hidden">
            <WarehouseTab />
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <footer className="flex-none border-t border-border/50 px-6 py-1.5 text-center" style={{ background: "hsl(var(--surface-7))" }}>
          <PerplexityAttribution />
        </footer>
      </div>
    </ShipmentProvider>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
