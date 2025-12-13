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
      <div className="min-h-screen flex bg-apple-bg">
        <Sidebar />
        <div className="flex-1 flex flex-col ml-[250px]">
          <Header />
          <main className="flex-1 bg-apple-bg">{children}</main>
          <Footer />
        </div>
      </div>
    </ProtectedRoute>
  );
}

