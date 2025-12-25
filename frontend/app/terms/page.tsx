import { LandingHeader } from "@/components/marketing/LandingHeader";
import { LandingFooter } from "@/components/marketing/LandingFooter";

export default function TermsPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[#0D0F12]">
      <LandingHeader />

      <main className="flex-1 pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          {/* Page Header */}
          <div className="mb-12">
            <h1 className="text-3xl md:text-4xl font-bold text-landing-heading mb-4">
              Terms of Service
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
                Welcome to BillionVerifier. These Terms of Service (&quot;Terms&quot;) govern your access to and use of the BillionVerifier platform, including our website, APIs, and related services (collectively, the &quot;Service&quot;). By accessing or using the Service, you agree to be bound by these Terms. If you do not agree to these Terms, you may not use the Service.
              </p>
            </section>

            {/* Section 1: Service Description */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                1. Service Description
              </h2>
              <p className="text-landing-text leading-relaxed mb-4">
                BillionVerifier provides a B2B lead generation platform that includes the following services:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-landing-text">
                <li>
                  <strong className="text-landing-heading">LinkedIn Sales Navigator Scraping:</strong> Extraction of publicly available profile data from LinkedIn Sales Navigator based on your search criteria and account credentials.
                </li>
                <li>
                  <strong className="text-landing-heading">Email Enrichment:</strong> Discovery and generation of professional email addresses using name and domain information through pattern matching and verification algorithms.
                </li>
                <li>
                  <strong className="text-landing-heading">Email Verification:</strong> Validation of email address deliverability through SMTP checks, MX record analysis, and catch-all detection.
                </li>
                <li>
                  <strong className="text-landing-heading">Credit-Based Billing:</strong> Services are metered using a credit system, with credits consumed based on the type and volume of operations performed.
                </li>
              </ul>
            </section>

            {/* Section 2: Acceptable Use Policy */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                2. Acceptable Use Policy
              </h2>
              <p className="text-landing-text leading-relaxed mb-4">
                You agree to use the Service only for lawful purposes and in accordance with these Terms. Specifically, you agree NOT to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-landing-text mb-4">
                <li>Send unsolicited bulk email (spam) or engage in any form of email abuse</li>
                <li>Violate any applicable laws, including but not limited to CAN-SPAM Act, GDPR, CCPA, CASL, and other anti-spam or data protection regulations</li>
                <li>Use the Service to harass, stalk, or threaten any individual</li>
                <li>Scrape data for illegal purposes or competitive intelligence resale</li>
                <li>Resell, redistribute, or sublicense raw scraped data to third parties without authorization</li>
                <li>Attempt to circumvent any security measures or access controls</li>
                <li>Use the Service in any manner that could damage, disable, or impair our systems</li>
              </ul>
              <div className="bg-[#161A1F] border border-landing-border p-4 rounded-lg">
                <p className="text-landing-text text-sm">
                  <strong className="text-landing-accent">Important:</strong> You are solely responsible for ensuring that your use of lead data complies with all applicable laws and regulations. You must have a lawful basis for contacting any individuals whose information you obtain through the Service.
                </p>
              </div>
            </section>

            {/* Section 3: Third-Party Platform Compliance */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                3. Third-Party Platform Compliance
              </h2>
              <p className="text-landing-text leading-relaxed mb-4">
                Our Service interacts with third-party platforms, including LinkedIn. You acknowledge and agree that:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-landing-text mb-4">
                <li>You are solely responsible for compliance with LinkedIn&apos;s Terms of Service and any other third-party platform terms</li>
                <li>You will use your own LinkedIn credentials and account for scraping activities</li>
                <li>BillionVerifier does not guarantee that use of our Service complies with LinkedIn&apos;s Terms of Service or any other third-party terms</li>
                <li>Any restrictions, suspensions, or terminations of your third-party accounts are your sole responsibility</li>
                <li>BillionVerifier is not liable for any damages arising from your violation of third-party platform terms</li>
              </ul>
              <p className="text-landing-text leading-relaxed">
                You agree to indemnify and hold harmless BillionVerifier from any claims, damages, or losses arising from your use of third-party platforms in connection with the Service.
              </p>
            </section>

            {/* Section 4: Data Ownership & Licensing */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                4. Data Ownership & Licensing
              </h2>
              <ul className="list-disc pl-6 space-y-2 text-landing-text mb-4">
                <li>
                  <strong className="text-landing-heading">Your Data:</strong> You retain ownership of all data you upload to, process through, or export from the Service, including CSV files and lead information.
                </li>
                <li>
                  <strong className="text-landing-heading">License to BillionVerifier:</strong> You grant BillionVerifier a limited license to process your data solely for the purpose of providing the Service.
                </li>
                <li>
                  <strong className="text-landing-heading">Aggregated Data:</strong> BillionVerifier may collect and use aggregated, anonymized usage metrics for service improvement, analytics, and reporting purposes. This data will not identify you or any individual leads.
                </li>
                <li>
                  <strong className="text-landing-heading">Restrictions:</strong> You may not resell raw scraped data obtained through the Service to third parties as a data product without express written consent from BillionVerifier.
                </li>
              </ul>
            </section>

            {/* Section 5: Credits, Billing & Refunds */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                5. Credits, Billing & Refunds
              </h2>
              <h3 className="text-xl font-semibold text-landing-heading mb-3">5.1 Credit System</h3>
              <p className="text-landing-text leading-relaxed mb-4">
                The Service operates on a credit-based system. Credits are consumed based on the type of operation:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-landing-text mb-4">
                <li>LinkedIn profile scraping</li>
                <li>Email enrichment requests</li>
                <li>Email verification checks</li>
              </ul>
              <p className="text-landing-text leading-relaxed mb-4">
                Credit costs for each operation are displayed in the Service interface and may be updated from time to time.
              </p>

              <h3 className="text-xl font-semibold text-landing-heading mb-3">5.2 Subscriptions</h3>
              <p className="text-landing-text leading-relaxed mb-4">
                Paid subscriptions are available on monthly or annual billing cycles. Annual subscriptions are billed in advance for the full year. Subscriptions automatically renew unless cancelled before the renewal date.
              </p>

              <h3 className="text-xl font-semibold text-landing-heading mb-3">5.3 No Refunds Policy</h3>
              <div className="bg-[#161A1F] border border-landing-accent/30 p-4 rounded-lg">
                <p className="text-landing-text">
                  <strong className="text-landing-accent">All sales are final.</strong> We do not offer refunds for subscription fees, unused credits, or any other charges. By purchasing a subscription or credits, you acknowledge and accept this no-refund policy. If you cancel your subscription, you will retain access to the Service until the end of your current billing period.
                </p>
              </div>
            </section>

            {/* Section 6: Disclaimers & Limitations */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                6. Disclaimers & Limitations of Liability
              </h2>
              <h3 className="text-xl font-semibold text-landing-heading mb-3">6.1 Service Disclaimers</h3>
              <p className="text-landing-text leading-relaxed mb-4">
                THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. WE SPECIFICALLY DISCLAIM:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-landing-text mb-4">
                <li>Any guarantee of email deliverability or accuracy rates</li>
                <li>The accuracy, completeness, or currency of scraped data</li>
                <li>Uninterrupted or error-free operation of the Service</li>
                <li>That the Service will meet your specific requirements</li>
              </ul>

              <h3 className="text-xl font-semibold text-landing-heading mb-3">6.2 Limitation of Liability</h3>
              <p className="text-landing-text leading-relaxed mb-4">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, BILLIONVERIFIER SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-landing-text mb-4">
                <li>Loss of profits, revenue, or business opportunities</li>
                <li>Data loss or corruption</li>
                <li>Third-party account suspensions or terminations</li>
                <li>Reputational damage</li>
              </ul>
              <p className="text-landing-text leading-relaxed">
                Our total liability for any claims arising from these Terms or your use of the Service shall not exceed the amount you paid to BillionVerifier in the twelve (12) months preceding the claim.
              </p>
            </section>

            {/* Section 7: Account Termination */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                7. Account Termination
              </h2>
              <h3 className="text-xl font-semibold text-landing-heading mb-3">7.1 Termination by You</h3>
              <p className="text-landing-text leading-relaxed mb-4">
                You may terminate your account at any time through your account settings or by contacting support. Upon termination, you will lose access to the Service at the end of your current billing period.
              </p>

              <h3 className="text-xl font-semibold text-landing-heading mb-3">7.2 Termination by BillionVerifier</h3>
              <p className="text-landing-text leading-relaxed mb-4">
                We may suspend or terminate your account immediately, without prior notice, if:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-landing-text mb-4">
                <li>You violate these Terms or our Acceptable Use Policy</li>
                <li>We receive complaints of spam or abuse related to your activities</li>
                <li>Your use poses a security risk to our systems or other users</li>
                <li>We are required to do so by law</li>
              </ul>

              <h3 className="text-xl font-semibold text-landing-heading mb-3">7.3 Data After Termination</h3>
              <p className="text-landing-text leading-relaxed">
                Upon account termination, we will retain your data for thirty (30) days, after which it may be permanently deleted. You are responsible for exporting any data you wish to retain before account termination.
              </p>
            </section>

            {/* Section 8: General Provisions */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                8. General Provisions
              </h2>
              <ul className="list-disc pl-6 space-y-3 text-landing-text">
                <li>
                  <strong className="text-landing-heading">Modifications:</strong> We reserve the right to modify these Terms at any time. Material changes will be communicated via email or through the Service. Continued use after changes constitutes acceptance.
                </li>
                <li>
                  <strong className="text-landing-heading">Severability:</strong> If any provision of these Terms is found unenforceable, the remaining provisions will continue in full force and effect.
                </li>
                <li>
                  <strong className="text-landing-heading">Entire Agreement:</strong> These Terms constitute the entire agreement between you and BillionVerifier regarding the Service.
                </li>
                <li>
                  <strong className="text-landing-heading">Assignment:</strong> You may not assign your rights under these Terms without our written consent. We may assign our rights to any successor or affiliate.
                </li>
                <li>
                  <strong className="text-landing-heading">Governing Law:</strong> These Terms shall be governed by the laws of the jurisdiction in which BillionVerifier is incorporated, without regard to conflict of law principles.
                </li>
              </ul>
            </section>

            {/* Section 9: Contact */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-landing-heading mb-4 border-b border-landing-border pb-2">
                9. Contact Us
              </h2>
              <p className="text-landing-text leading-relaxed mb-4">
                If you have any questions about these Terms, please contact us at:
              </p>
              <div className="bg-[#161A1F] border border-landing-border p-4 rounded-lg">
                <p className="text-landing-text">
                  <strong className="text-landing-heading">Email:</strong>{" "}
                  <a href="mailto:legal@billionverifier.io" className="text-landing-accent hover:underline">
                    legal@billionverifier.io
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

