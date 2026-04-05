"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Sidebar } from "@/components/common/Sidebar";
import { Header } from "@/components/common/Header";
import { Footer } from "@/components/common/Footer";
import { ImpersonationBanner } from "@/components/common/ImpersonationBanner";
import { SubscriptionBanner } from "@/components/common/SubscriptionBanner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <ImpersonationBanner />
      <div className="min-h-screen flex bg-black relative">
        <Sidebar />
        <div className="flex-1 flex flex-col ml-[250px] relative z-10">
          <SubscriptionBanner />
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </div>
    </ProtectedRoute>
  );
}

