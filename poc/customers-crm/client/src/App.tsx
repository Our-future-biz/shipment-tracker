import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import CustomerList from "./pages/CustomerList";
import CustomerCard from "./pages/CustomerCard";
import CustomerProfileDetail from "./pages/CustomerProfileDetail";
import CustomerDetailSection from "./pages/CustomerDetailSection";
import SalesPage from "./pages/SalesPage";
import NotFound from "./pages/not-found";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background text-foreground">
        <Router hook={useHashLocation}>
          <Switch>
            <Route path="/" component={CustomerList} />
            <Route path="/sales" component={SalesPage} />
            <Route path="/customers/:id" component={CustomerCard} />
            <Route path="/customers/:id/profile" component={CustomerProfileDetail} />
            <Route path="/customers/:id/section/:section" component={CustomerDetailSection} />
            <Route component={NotFound} />
          </Switch>
        </Router>
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}
