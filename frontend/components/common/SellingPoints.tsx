"use client";

export function SellingPoints() {
  const points = [
    { icon: "💰", text: "10x cheaper than competitors" },
    { icon: "⚡", text: "Lightning-fast processing (170 emails/30 sec)" },
    { icon: "📈", text: "Handle 250M+ leads effortlessly" },
    { icon: "🔒", text: "Bank-level security (TLS 1.3)" },
    { icon: "✅", text: "GDPR compliant - Auto-deletes after 30 days" },
  ];

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {points.map((point, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
        >
          <span>{point.icon}</span>
          <span>{point.text}</span>
        </span>
      ))}
    </div>
  );
}

export function SecurityBadges() {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className="px-2 py-1 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
        🔒 Bank-level encryption (TLS 1.3)
      </span>
      <span className="px-2 py-1 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
        ✅ GDPR compliant
      </span>
      <span className="px-2 py-1 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
        ✅ SOC 2 Type II certified
      </span>
      <span className="px-2 py-1 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
        ✅ Zero data loss guarantee
      </span>
    </div>
  );
}


