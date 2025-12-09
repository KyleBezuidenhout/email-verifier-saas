"use client";

import { RegisterForm } from "@/components/auth/RegisterForm";
import Link from "next/link";

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-apple-bg py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-apple-text">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-apple-text-muted">
            Or{" "}
            <Link href="/login" className="font-medium text-apple-accent hover:text-apple-accent/80">
              sign in to your existing account
            </Link>
          </p>
        </div>
        <div className="bg-apple-surface border border-apple-border py-8 px-6 shadow-xl rounded-lg">
          <RegisterForm />
        </div>
      </div>
    </div>
  );
}


