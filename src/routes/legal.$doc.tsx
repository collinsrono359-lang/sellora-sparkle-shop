import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/legal/$doc")({
  head: ({ params }) => ({ meta: [{ title: `${titleFor(params.doc)} — Sellora` }] }),
  component: LegalPage,
});

function titleFor(slug: string) { return DOCS[slug]?.title || "Legal"; }

interface Section { heading: string; paragraphs: string[]; bullets?: string[] }
interface Doc { title: string; intro: string; sections: Section[] }

const DOCS: Record<string, Doc> = {
  terms: {
    title: "Terms of Service",
    intro: "These Terms of Service (\"Terms\") govern your access to and use of Sellora, a peer-to-peer marketplace operated by Sellora Ltd. By creating an account, browsing, listing, buying, or paying through Sellora you confirm that you have read, understood, and agree to be bound by these Terms.",
    sections: [
      { heading: "1. Eligibility", paragraphs: ["You must be at least 18 years old, have legal capacity to enter contracts in your jurisdiction, and not be barred from using the Service under any applicable law or sanctions list."] },
      { heading: "2. Your Account", paragraphs: ["You are responsible for the confidentiality of your login credentials, all activity under your account, and the accuracy of your profile information including your verified GPS location."], bullets: ["Provide truthful information during registration and KYC.", "Do not create more than one personal account.", "Notify us immediately of any unauthorized access."] },
      { heading: "3. Listings & Sales", paragraphs: ["Sellers are solely responsible for the legality, accuracy, quality, and delivery of items listed. Sellora is not a party to the underlying contract between buyer and seller."], bullets: ["Photos must be your own and represent the actual item being sold.", "Pricing must be in the displayed currency and inclusive of all applicable taxes.", "Counterfeit, illegal, hazardous, recalled, or restricted items are strictly prohibited."] },
      { heading: "4. Payments", paragraphs: ["Payments are processed by Pesapal. By initiating a payment you authorize Pesapal and Sellora to charge the selected payment method. Verification, boost and subscription fees are non-refundable once activated."] },
      { heading: "5. Fees", paragraphs: ["Listing products is free. Optional services (Boost, Verified Badge, Pro Subscription) are charged separately and clearly displayed before checkout."] },
      { heading: "6. Prohibited Conduct", paragraphs: ["You may not harass, defraud, transmit malware, scrape data at scale, or evade safety controls including GPS verification."] },
      { heading: "7. Intellectual Property", paragraphs: ["All Sellora trademarks, logos and software are owned by Sellora Ltd. By posting content you grant Sellora a worldwide, royalty-free licence to host and display that content for the purpose of operating the Service."] },
      { heading: "8. Termination", paragraphs: ["We may suspend or terminate accounts that breach these Terms or pose risk to the community. You may close your account at any time from Settings."] },
      { heading: "9. Disclaimers & Liability", paragraphs: ["The Service is provided \"as is\". Sellora's aggregate liability is limited to the fees you paid us in the 12 months preceding the claim."] },
      { heading: "10. Governing Law", paragraphs: ["Governed by the laws of the Republic of Kenya. Disputes are subject to the exclusive jurisdiction of the courts of Nairobi."] },
      { heading: "11. Changes to These Terms", paragraphs: ["Material changes will be notified in-app and become effective 14 days after notice."] },
    ],
  },
  buyer: {
    title: "Buyer Guidelines",
    intro: "These guidelines help you buy safely on Sellora and get the best experience from sellers worldwide.",
    sections: [
      { heading: "Before You Buy", paragraphs: ["Take time to review the listing, seller profile, ratings, and prior reviews before committing."], bullets: ["Confirm the item's condition (New / Like New / Used / Refurbished).", "Check the seller's verified badge and location.", "Read the description in full and ask clarifying questions in chat.", "Compare prices with similar listings."] },
      { heading: "Communicating With Sellers", paragraphs: ["Always use Sellora chat. Do not share emails, phone numbers, or pay through third-party links — these are common scam tactics."] },
      { heading: "Paying Safely", paragraphs: ["Use Sellora-supported Pesapal checkout. Never wire money, send mobile money to personal numbers, or buy gift cards on a seller's request."] },
      { heading: "Receiving the Item", paragraphs: ["For pickups, meet in well-lit public places. For shipped items, inspect the package before signing for delivery."] },
      { heading: "After You Receive It", paragraphs: ["Leave an honest review. If something is wrong, message the seller first; if unresolved, open a report."] },
      { heading: "Red Flags", paragraphs: ["Treat the following as warning signs and report immediately:"], bullets: ["Prices dramatically below market.", "Pressure to pay outside Sellora.", "Stock photos copied from other sites.", "Sellers refusing in-app chat or video proof."] },
    ],
  },
  seller: {
    title: "Seller Guidelines",
    intro: "Great sellers earn loyal buyers. Follow these standards to grow trust, get more views, and keep your account in good standing.",
    sections: [
      { heading: "Listing Quality", paragraphs: ["Buyers decide in seconds — make every listing count."], bullets: ["Use 3 clear, well-lit photos of the actual item.", "Write a descriptive title (brand, model, size).", "Disclose flaws honestly in the description.", "Set a fair, realistic price in your local currency."] },
      { heading: "Response & Fulfilment", paragraphs: ["Reply to buyers within 24 hours. Honor agreed prices, timelines, and shipping methods."] },
      { heading: "Verified Location", paragraphs: ["Sellora locks the country on every listing to your device GPS. This protects buyers and rewards genuine local sellers with higher ranking."] },
      { heading: "Prohibited Items", paragraphs: ["The following items can never be listed:"], bullets: ["Weapons, ammunition, explosives.", "Recreational drugs and prescription medications.", "Counterfeit goods, replicas, or stolen items.", "Endangered wildlife products.", "Adult content, human remains, or services that breach local law."] },
      { heading: "Boost & Verification", paragraphs: ["Boosts increase your visibility on the home feed and search. The Verified Badge unlocks higher trust and conversion. Both are optional."] },
      { heading: "Account Health", paragraphs: ["Repeat policy breaches escalate: yellow → orange → red warning, then suspension."] },
    ],
  },
  community: {
    title: "Community Standards",
    intro: "Sellora connects people across many cultures and languages. Treating each other with respect keeps the marketplace welcoming for everyone.",
    sections: [
      { heading: "Be Respectful", paragraphs: ["No harassment, hate speech, slurs, threats, sexual harassment, or discrimination."] },
      { heading: "Honest Listings", paragraphs: ["Misleading titles, edited photos that hide damage, and bait-and-switch pricing are violations."] },
      { heading: "No Spam or Manipulation", paragraphs: ["Do not repost identical listings, fake reviews, or use bots to inflate views, follows or favourites."] },
      { heading: "Privacy", paragraphs: ["Don't share other people's personal information without consent. Don't doxx, stalk, or coerce other users."] },
      { heading: "Enforcement", paragraphs: ["Sellora may issue warnings, hide listings, suspend accounts, or remove users permanently. Severe violations result in immediate ban and may be reported to authorities."] },
    ],
  },
  safety: {
    title: "Safety Tips",
    intro: "These tips reduce risk for both buyers and sellers — please read before your first transaction.",
    sections: [
      { heading: "Meeting in Person", paragraphs: ["When pickup is required:"], bullets: ["Choose a public, busy place during the day (mall, fuel station, police-station parking).", "Bring a friend if possible and tell someone your plan.", "Inspect the item fully before paying.", "Carry only the agreed payment amount."] },
      { heading: "Shipping & Delivery", paragraphs: ["For shipped goods:"], bullets: ["Use a tracked courier with proof of delivery.", "Open the parcel in front of the courier when allowed.", "Photograph damaged packaging before opening."] },
      { heading: "Online Safety", paragraphs: ["Protect your account and money:"], bullets: ["Use a unique, strong password.", "Never share OTP codes — Sellora and Pesapal will never ask for them.", "Beware of phishing links pretending to be Sellora.", "Keep all conversation and payment inside the Sellora app."] },
      { heading: "Reporting Issues", paragraphs: ["If something feels wrong, stop and tap Report a Problem in Settings. Our trust team responds within 48 hours."] },
      { heading: "Emergencies", paragraphs: ["If you feel physically unsafe, leave immediately and contact local emergency services. Sellora cooperates with law enforcement on verified investigations."] },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    intro: "This policy describes what data Sellora collects, why we collect it, how we protect it, and the choices you have.",
    sections: [
      { heading: "Information We Collect", paragraphs: ["We collect only what we need to operate the marketplace:"], bullets: ["Account: email, display name, avatar.", "Verified location: country (locked from GPS) and city.", "Listings: titles, photos, prices, descriptions you publish.", "Messages: chat content between buyers and sellers.", "Payments: amount, currency, status and Pesapal references — we never store full card numbers.", "Device: browser, IP address, and basic usage analytics.", "KYC: government ID images you upload (encrypted, restricted access)."] },
      { heading: "How We Use Your Data", paragraphs: ["We use your data to:"], bullets: ["Operate, maintain and improve the Service.", "Verify identity, prevent fraud, and enforce our policies.", "Process payments and provide receipts.", "Communicate important account or transaction updates.", "Comply with legal obligations."] },
      { heading: "Sharing", paragraphs: ["We share data only with: Pesapal (for payments), our hosting providers, and law enforcement when legally required. We never sell your personal data."] },
      { heading: "Retention", paragraphs: ["Account data is kept while active. Transaction records are kept for up to 7 years. KYC documents are deleted within 90 days of verification or rejection."] },
      { heading: "Your Rights", paragraphs: ["You can:"], bullets: ["Edit your profile from Settings → Edit Profile.", "Update privacy toggles from Settings → Privacy.", "Request a copy of your data via Contact Support.", "Delete your account at any time."] },
      { heading: "Security", paragraphs: ["Data is encrypted in transit (HTTPS) and at rest. Sensitive operations run server-side under strict access controls."] },
      { heading: "Contact", paragraphs: ["Questions about your privacy? Use Settings → Contact Support and we will respond within 7 days."] },
    ],
  },
};

function LegalPage() {
  const { doc } = Route.useParams();
  const navigate = useNavigate();
  const data = DOCS[doc];

  return (
    <AppLayout>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => navigate({ to: "/settings" })} aria-label="Back" className="rounded-full p-2 hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">{data?.title || "Not found"}</h1>
      </div>

      {data ? (
        <article className="space-y-5 rounded-lg border border-border bg-card p-4 text-sm leading-relaxed">
          <p className="italic text-muted-foreground">{data.intro}</p>
          {data.sections.map((s) => (
            <section key={s.heading} className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">{s.heading}</h2>
              {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
              {s.bullets && (
                <ul className="ml-5 list-disc space-y-1 text-foreground/90">
                  {s.bullets.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              )}
            </section>
          ))}
          <p className="pt-2 text-xs text-muted-foreground">Last updated: 2026</p>
        </article>
      ) : (
        <p className="text-sm text-muted-foreground">Document not found.</p>
      )}
    </AppLayout>
  );
}
