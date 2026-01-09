"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api";
import { Check } from "lucide-react";

interface PaymentDetails {
  payment_status: string;
  amount_dollars: number;
  credits_purchased: number;
  current_credits: number;
}

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  
  const [loading, setLoading] = useState(true);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError("No session ID found");
      setLoading(false);
      return;
    }

    const verifyPayment = async () => {
      try {
        const details = await apiClient.verifyCheckoutSession(sessionId);
        setPaymentDetails(details);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to verify payment");
      } finally {
        setLoading(false);
      }
    };

    verifyPayment();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-dashboard-accent mx-auto mb-4" />
          <p className="text-dashboard-text-muted">Verifying payment...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-dashboard-text mb-2">Verification Issue</h1>
          <p className="text-dashboard-text-muted mb-6">{error}</p>
          <p className="text-sm text-dashboard-text-muted mb-6">
            If you were charged, your credits will be added automatically. Please check your dashboard or contact support if credits aren&apos;t showing.
          </p>
          <Link
            href="/dashboard"
            className="inline-block px-6 py-3 bg-dashboard-accent text-white font-semibold rounded-xl hover:bg-dashboard-accent/90 transition-all"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass-card p-8 max-w-md w-full text-center">
        {/* Success Icon */}
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6 animate-bounce">
          <Check className="w-10 h-10 text-green-400" />
        </div>

        <h1 className="text-3xl font-bold text-dashboard-text mb-2">Payment Successful!</h1>
        <p className="text-dashboard-text-muted mb-8">Your credits have been added to your account.</p>

        {/* Payment Details */}
        <div className="glass-card p-6 mb-8 text-left space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-dashboard-text-muted">Amount Paid</span>
            <span className="text-dashboard-text font-semibold">${paymentDetails?.amount_dollars}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-dashboard-text-muted">Credits Added</span>
            <span className="text-green-400 font-semibold">+{paymentDetails?.credits_purchased.toLocaleString()}</span>
          </div>
          <div className="border-t border-dashboard-border pt-4">
            <div className="flex justify-between items-center">
              <span className="text-dashboard-text-muted">New Balance</span>
              <span className="text-dashboard-accent font-bold text-xl">{paymentDetails?.current_credits.toLocaleString()} credits</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Link
            href="/dashboard"
            className="block w-full px-6 py-3 bg-dashboard-accent text-white font-semibold rounded-xl hover:bg-dashboard-accent/90 transition-all"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/get-credits"
            className="block w-full px-6 py-3 bg-transparent border border-dashboard-border text-dashboard-text font-semibold rounded-xl hover:border-dashboard-accent hover:text-dashboard-accent transition-all"
          >
            Buy More Credits
          </Link>
        </div>
      </div>
    </div>
  );
}


