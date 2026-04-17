"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RegisterForm } from "@/components/auth/RegisterForm";
import Link from "next/link";

const REDIRECT_KEY = "bv_post_auth_redirect";

function RedirectCapture() {
  const searchParams = useSearchParams();
  useEffect(() => {
    const redirect = searchParams.get("redirect");
    if (redirect) {
      localStorage.setItem(REDIRECT_KEY, redirect);
    }
  }, [searchParams]);
  return null;
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black py-12 px-4 sm:px-6 lg:px-8">
      <Suspense fallback={null}>
        <RedirectCapture />
      </Suspense>
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            Sign up for free
          </h2>
          <p className="mt-2 text-center text-sm text-gray-400">
            Or{" "}
            <Link href="/login" className="font-medium text-[#0099FF] hover:text-[#0099FF]/80">
              sign in to your existing account
            </Link>
          </p>
        </div>
        <div className="glass-surface py-8 px-6">
          <RegisterForm />
        </div>
      </div>
    </div>
  );
}


