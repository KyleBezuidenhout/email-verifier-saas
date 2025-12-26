import { LandingHeader } from "@/components/marketing/LandingHeader";
import { LandingFooter } from "@/components/marketing/LandingFooter";

export default function PrivacyPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[#0D0F12]">
      <LandingHeader />

      <main className="flex-1 pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          {/* Page Header */}
          <div className="mb-12">
            <h1 className="text-3xl md:text-4xl font-bold text-landing-heading mb-4">
              Privacy Policy
            </h1>
            <p className="text-landing-muted">
              Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>

          {/* Content */}
          <div className="prose prose-invert prose-lg max-w-none">
            {/* Introduction */}
            <section className="mb-12">
              <p className="text-landing-text leading-relaxed">
                BillionVerifier (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our B2B lead generation platform and related services (the &quot;Service&quot;). Please read this policy carefully. By using the Service, you consent to the data practices described in this policy.
              </p>
            </section>

            {/* Section 1: Data Controller Information */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                1. Data Controller Information
              </h2>
              <p className="text-landing-text leading-relaxed mb-4">
                BillionVerifier acts as the data controller for the personal information we collect from our users (account holders). For questions about this Privacy Policy or our data practices, please contact us:
              </p>
              <div className="bg-[#161A1F] border border-landing-border p-4 rounded-lg">
                <p className="text-landing-text">
                  <strong className="text-landing-heading">Email:</strong>{" "}
                  <a href="mailto:support@billionverifier.io" className="text-landing-accent hover:underline">
                    support@billionverifier.io
                  </a>
                </p>
              </div>
            </section>

            {/* Section 2: Information We Collect */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                2. Information We Collect
              </h2>

              <h3 className="text-xl font-semibold text-landing-heading mb-3">2.1 User Account Data</h3>
              <p className="text-landing-text leading-relaxed mb-4">
                When you create an account, we collect:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-landing-text mb-6">
                <li>Email address</li>
                <li>Full name</li>
                <li>Company name</li>
                <li>Password (stored in hashed/encrypted form)</li>
                <li>API keys (auto-generated for programmatic access)</li>
                <li>Billing and payment information (processed by third-party payment processors)</li>
              </ul>

              <h3 className="text-xl font-semibold text-landing-heading mb-3">2.2 Lead and Job Data</h3>
              <p className="text-landing-text leading-relaxed mb-4">
                Through your use of the Service, we process:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-landing-text mb-6">
                <li>Names and professional information of third-party individuals (leads)</li>
                <li>Company domains and websites</li>
                <li>Email addresses (generated or uploaded)</li>
                <li>LinkedIn profile URLs and Sales Navigator search URLs</li>
                <li>CSV files you upload or export</li>
                <li>Company size and other professional attributes</li>
                <li>Email verification status and MX records</li>
              </ul>

              <h3 className="text-xl font-semibold text-landing-heading mb-3">2.3 Technical and Usage Data</h3>
              <p className="text-landing-text leading-relaxed mb-4">
                We automatically collect:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-landing-text mb-4">
                <li>IP addresses and approximate location</li>
                <li>Browser type and version</li>
                <li>Device information</li>
                <li>Pages visited and features used</li>
                <li>Date and time of access</li>
                <li>Cookies and similar tracking technologies</li>
              </ul>
            </section>

            {/* Section 3: Legal Basis for Processing (GDPR) */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                3. Legal Basis for Processing (GDPR)
              </h2>
              <p className="text-landing-text leading-relaxed mb-4">
                If you are located in the European Economic Area (EEA), we process your personal data based on the following legal grounds:
              </p>
              <div className="space-y-4">
                <div className="bg-[#161A1F] border border-landing-border p-4 rounded-lg">
                  <h4 className="text-landing-heading font-semibold mb-2">Contract Performance</h4>
                  <p className="text-landing-text text-sm">
                    Processing necessary to provide our Service, manage your account, process payments, and deliver the features you request.
                  </p>
                </div>
                <div className="bg-[#161A1F] border border-landing-border p-4 rounded-lg">
                  <h4 className="text-landing-heading font-semibold mb-2">Legitimate Interests</h4>
                  <p className="text-landing-text text-sm">
                    Processing for service improvement, analytics, security, fraud prevention, and customer support—where our interests do not override your rights.
                  </p>
                </div>
                <div className="bg-[#161A1F] border border-landing-border p-4 rounded-lg">
                  <h4 className="text-landing-heading font-semibold mb-2">Consent</h4>
                  <p className="text-landing-text text-sm">
                    Where required, we obtain your explicit consent for marketing communications and non-essential cookies. You may withdraw consent at any time.
                  </p>
                </div>
                <div className="bg-[#161A1F] border border-landing-border p-4 rounded-lg">
                  <h4 className="text-landing-heading font-semibold mb-2">Legal Obligation</h4>
                  <p className="text-landing-text text-sm">
                    Processing necessary to comply with legal requirements, such as tax regulations or lawful requests from authorities.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 4: How We Use Your Information */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                4. How We Use Your Information
              </h2>
              <p className="text-landing-text leading-relaxed mb-4">
                We use collected information to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-landing-text">
                <li>Provide, operate, and maintain the Service</li>
                <li>Process scraping, enrichment, and verification requests</li>
                <li>Manage your account and subscription</li>
                <li>Process payments and billing</li>
                <li>Send transactional emails (confirmations, alerts, updates)</li>
                <li>Provide customer support</li>
                <li>Analyze usage patterns to improve our Service</li>
                <li>Detect, prevent, and address security issues and abuse</li>
                <li>Comply with legal obligations</li>
                <li>Send marketing communications (with your consent)</li>
              </ul>
            </section>

            {/* Section 5: Data Sharing and Disclosure */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                5. Data Sharing and Disclosure
              </h2>
              <p className="text-landing-text leading-relaxed mb-4">
                We may share your information with:
              </p>
              <ul className="list-disc pl-6 space-y-3 text-landing-text mb-6">
                <li>
                  <strong className="text-landing-heading">Cloud Infrastructure Providers:</strong> We use Cloudflare R2 for secure file storage and delivery.
                </li>
                <li>
                  <strong className="text-landing-heading">Payment Processors:</strong> Subscription and payment data is processed by third-party payment providers who maintain their own privacy policies.
                </li>
                <li>
                  <strong className="text-landing-heading">Analytics Providers:</strong> We use analytics tools to understand Service usage (data is aggregated where possible).
                </li>
                <li>
                  <strong className="text-landing-heading">Legal Requirements:</strong> We may disclose information if required by law, court order, or governmental regulation.
                </li>
                <li>
                  <strong className="text-landing-heading">Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your data may be transferred to the acquiring entity.
                </li>
              </ul>
              <div className="bg-[#161A1F] border border-landing-accent/30 p-4 rounded-lg">
                <p className="text-landing-text">
                  <strong className="text-landing-accent">We do not sell your personal data.</strong> We do not sell, rent, or trade your personal information to third parties for their marketing purposes.
                </p>
              </div>
            </section>

            {/* Section 6: International Data Transfers */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                6. International Data Transfers
              </h2>
              <p className="text-landing-text leading-relaxed mb-4">
                Your information may be transferred to and processed in countries outside your country of residence, including the United States. These countries may have different data protection laws than your jurisdiction.
              </p>
              <p className="text-landing-text leading-relaxed mb-4">
                When we transfer data internationally, we implement appropriate safeguards, including:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-landing-text">
                <li>Standard Contractual Clauses (SCCs) approved by the European Commission</li>
                <li>Data processing agreements with our service providers</li>
                <li>Technical and organizational security measures</li>
              </ul>
            </section>

            {/* Section 7: Your Rights (GDPR & CCPA) */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                7. Your Privacy Rights
              </h2>

              <h3 className="text-xl font-semibold text-landing-heading mb-3">7.1 Rights Under GDPR (EEA Residents)</h3>
              <p className="text-landing-text leading-relaxed mb-4">
                If you are located in the European Economic Area, you have the right to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-landing-text mb-6">
                <li><strong className="text-landing-heading">Access:</strong> Request a copy of the personal data we hold about you</li>
                <li><strong className="text-landing-heading">Rectification:</strong> Request correction of inaccurate or incomplete data</li>
                <li><strong className="text-landing-heading">Erasure:</strong> Request deletion of your personal data (&quot;right to be forgotten&quot;)</li>
                <li><strong className="text-landing-heading">Restriction:</strong> Request limitation of processing in certain circumstances</li>
                <li><strong className="text-landing-heading">Data Portability:</strong> Receive your data in a structured, machine-readable format</li>
                <li><strong className="text-landing-heading">Object:</strong> Object to processing based on legitimate interests or for direct marketing</li>
                <li><strong className="text-landing-heading">Withdraw Consent:</strong> Withdraw consent at any time where processing is based on consent</li>
                <li><strong className="text-landing-heading">Lodge a Complaint:</strong> File a complaint with your local data protection authority</li>
              </ul>

              <h3 className="text-xl font-semibold text-landing-heading mb-3">7.2 Rights Under CCPA (California Residents)</h3>
              <p className="text-landing-text leading-relaxed mb-4">
                If you are a California resident, you have the right to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-landing-text mb-6">
                <li><strong className="text-landing-heading">Know:</strong> Request disclosure of the categories and specific pieces of personal information we collect</li>
                <li><strong className="text-landing-heading">Delete:</strong> Request deletion of your personal information</li>
                <li><strong className="text-landing-heading">Opt-Out of Sale:</strong> We do not sell personal information, but you may request confirmation</li>
                <li><strong className="text-landing-heading">Non-Discrimination:</strong> You will not be discriminated against for exercising your privacy rights</li>
              </ul>

              <div className="bg-[#161A1F] border border-landing-border p-4 rounded-lg">
                <p className="text-landing-text">
                  <strong className="text-landing-heading">To Exercise Your Rights:</strong> Contact us at{" "}
                  <a href="mailto:support@billionverifier.io" className="text-landing-accent hover:underline">
                    support@billionverifier.io
                  </a>
                  . We will respond to verified requests within the timeframes required by applicable law (typically 30 days for GDPR, 45 days for CCPA).
                </p>
              </div>
            </section>

            {/* Section 8: Data Retention */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                8. Data Retention
              </h2>
              <p className="text-landing-text leading-relaxed mb-4">
                We retain your information for as long as necessary to fulfill the purposes outlined in this Privacy Policy:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-landing-text mb-4">
                <li><strong className="text-landing-heading">Account Data:</strong> Retained while your account is active and for up to 30 days after account closure</li>
                <li><strong className="text-landing-heading">Lead/Job Data:</strong> Retained while your account is active; deleted within 30 days of account termination unless legally required to retain</li>
                <li><strong className="text-landing-heading">Billing Records:</strong> Retained for 7 years as required for tax and accounting purposes</li>
                <li><strong className="text-landing-heading">Usage Logs:</strong> Retained for up to 12 months for security and analytics purposes</li>
              </ul>
              <p className="text-landing-text leading-relaxed">
                You may export your data at any time through the Service before account termination.
              </p>
            </section>

            {/* Section 9: Security Measures */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                9. Security Measures
              </h2>
              <p className="text-landing-text leading-relaxed mb-4">
                We implement industry-standard security measures to protect your information, including:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-landing-text mb-4">
                <li>Encryption of data in transit (TLS/SSL) and at rest</li>
                <li>Secure password hashing algorithms</li>
                <li>Access controls and authentication requirements</li>
                <li>Regular security assessments and monitoring</li>
                <li>Incident response procedures</li>
              </ul>
              <p className="text-landing-text leading-relaxed">
                While we strive to protect your information, no method of transmission over the Internet or electronic storage is 100% secure. We cannot guarantee absolute security.
              </p>
            </section>

            {/* Section 10: Third-Party Lead Data Notice */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                10. Third-Party Lead Data
              </h2>
              <div className="bg-[#161A1F] border border-landing-accent/30 p-4 rounded-lg mb-4">
                <p className="text-landing-text">
                  <strong className="text-landing-accent">Important Notice:</strong> Our Service enables you to collect, enrich, and verify information about third-party individuals (leads). For this lead data, you are the data controller, and BillionVerifier acts as a data processor on your behalf.
                </p>
              </div>
              <p className="text-landing-text leading-relaxed mb-4">
                As the data controller for lead data, you are responsible for:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-landing-text">
                <li>Ensuring you have a lawful basis to collect and process lead information</li>
                <li>Providing appropriate privacy notices to data subjects</li>
                <li>Honoring data subject rights requests</li>
                <li>Complying with CAN-SPAM, GDPR, CCPA, and other applicable regulations</li>
                <li>Using lead data only for lawful B2B communications</li>
              </ul>
            </section>

            {/* Section 11: Cookies */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                11. Cookies and Tracking Technologies
              </h2>
              <p className="text-landing-text leading-relaxed mb-4">
                We use cookies and similar technologies to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-landing-text mb-4">
                <li><strong className="text-landing-heading">Essential Cookies:</strong> Required for authentication, security, and core functionality</li>
                <li><strong className="text-landing-heading">Analytics Cookies:</strong> Help us understand how you use our Service</li>
                <li><strong className="text-landing-heading">Preference Cookies:</strong> Remember your settings and preferences</li>
              </ul>
              <p className="text-landing-text leading-relaxed">
                You can control cookies through your browser settings. Disabling essential cookies may affect Service functionality.
              </p>
            </section>

            {/* Section 12: Children's Privacy */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                12. Children&apos;s Privacy
              </h2>
              <p className="text-landing-text leading-relaxed">
                The Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have inadvertently collected information from a child, please contact us immediately at{" "}
                <a href="mailto:support@billionverifier.io" className="text-landing-accent hover:underline">
                  support@billionverifier.io
                </a>
                , and we will take steps to delete such information.
              </p>
            </section>

            {/* Section 13: Changes to Privacy Policy */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                13. Changes to This Privacy Policy
              </h2>
              <p className="text-landing-text leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date. For significant changes, we may also send you an email notification. Your continued use of the Service after changes become effective constitutes your acceptance of the revised policy.
              </p>
            </section>

            {/* Section 14: Contact Us */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                14. Contact Us
              </h2>
              <p className="text-landing-text leading-relaxed mb-4">
                If you have any questions about this Privacy Policy or wish to exercise your privacy rights, please contact us:
              </p>
              <div className="bg-[#161A1F] border border-landing-border p-4 rounded-lg">
                <p className="text-landing-text">
                  <strong className="text-landing-heading">Email:</strong>{" "}
                  <a href="mailto:support@billionverifier.io" className="text-landing-accent hover:underline">
                    support@billionverifier.io
                  </a>
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}

