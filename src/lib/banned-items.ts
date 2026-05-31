// Words that flag a listing as illegal/restricted. Match is case-insensitive,
// substring-based on title + description.
export const BANNED_KEYWORDS = [
  // Drugs
  "cocaine","heroin","meth","methamphetamine","mdma","ecstasy","lsd","crack","opium","fentanyl","ketamine",
  // Weapons
  "ak47","ak-47","ak 47","handgun","rifle","pistol","grenade","ammunition","silencer","explosive","tnt","c4 explosive",
  // Wildlife / illegal trade
  "ivory","rhino horn","pangolin scale","shark fin","bushmeat",
  // Counterfeit / fraud
  "counterfeit","fake id","stolen","cloned card","carding","credit card dump",
  // Adult / human exploitation
  "escort","sex worker","prostitute","child porn","cp ",
  // Other
  "human organ","kidney for sale","passport for sale","ssn for sale",
];

export function detectBanned(text: string): string | null {
  const t = ` ${text.toLowerCase()} `;
  for (const k of BANNED_KEYWORDS) {
    if (t.includes(k)) return k;
  }
  return null;
}
