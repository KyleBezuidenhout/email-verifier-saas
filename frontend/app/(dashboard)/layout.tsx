"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Sidebar } from "@/components/common/Sidebar";
import { Header } from "@/components/common/Header";
import { Footer } from "@/components/common/Footer";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen flex">
        <Sidebar />
        <div className="flex-1 flex flex-col ml-[250px]">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </div>
    </ProtectedRoute>
  );
}

