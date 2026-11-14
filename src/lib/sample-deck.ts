import type { DrawnSlide } from "./slides";

/**
 * The approved sample deck (2026-11-04: "I actually love all these slides"), as slide data: the
 * same 12 slides as brand/slides/NN-*.html, one per layout. Settings > The 12 layouts shows it,
 * and the visual check (scripts/compare-layouts.mjs) draws it next to the approved pictures.
 */
const raw: DrawnSlide[] = [
  {
    layout: "cover",
    eyebrow: "The Koka Group · November 2026",
    title: "Team meeting",
    line: "Your raise, cash bonuses, and who writes the policy.",
    footer: "Anersi Koka · Troy, MI",
    notes: "The meeting’s name, the month, and what it covers in one line.",
  },
  {
    layout: "scoreboard",
    eyebrow: "October · Live from Scorecard",
    title: "We hit the goal",
    number: "$200,665",
    line: "of the $200,000 goal · 145 policies",
    pill: "Goal hit · 100%",
    pillTone: "green",
    pct: 100,
    notes: "October final, read from Scorecard on Nov 4.",
  },
  { layout: "agenda", eyebrow: "Today", title: "Five things", rows: ["Your raise and the 90-day rule", "Bonuses, paid in cash", "The business I’m building", "Where my money goes", "Who writes the policy"], notes: "" },
  { layout: "big_news", eyebrow: "1 · Your raise", statement: "Everybody’s getting a raise.", line: "Newer people get theirs after 90 working days.", notes: "" },
  {
    layout: "big_number",
    eyebrow: "1 · Your raise",
    title: "The 90-day rule",
    number: "90",
    label: "working days",
    pill: "[X]% raise on commission · TBD",
    lines: ["**Logged in** and in the office.", "**Not** from your hire date.", "Your raise starts **the next day.**"],
    notes: "",
  },
  {
    layout: "chart",
    eyebrow: "2 · Bonuses",
    title: "Your slice of the pie",
    subtitle: "",
    slices: [
      { share: 18, label: "", highlight: true },
      { share: 24, label: "", highlight: false },
      { share: 20, label: "", highlight: false },
      { share: 16, label: "", highlight: false },
      { share: 12, label: "", highlight: false },
      { share: 10, label: "", highlight: false },
    ],
    center: "You",
    math: ["Your premium this month", "÷ the team’s total", "= your share of the bonus"],
    note: "For people under 90 working days, for now.",
    pill: "Bonus amounts · TBD",
    drawn: true,
    notes: "",
  },
  { layout: "key_line", eyebrow: "2 · Bonuses", statement: "Paid in cash.\nToday.", coral: "cash.", line: "Everybody gets a bonus, handed to you at this meeting.", notes: "" },
  {
    layout: "diagram",
    eyebrow: "3 · The business",
    title: "The business I’m building",
    tiers: [
      { kind: "owner", label: "Me", count: 1 },
      { kind: "team", label: "You, full time", count: 3 },
      { kind: "open", label: "People under you", count: 6 },
    ],
    rule: "I keep putting people under you, if you’re here full time.",
    takeaway: "Treat this like a business, so one day you won’t have to.",
    notes: "",
  },
  {
    layout: "price_cards",
    eyebrow: "4 · Where my money goes",
    title: "Same setup as mine",
    subtitle: "I only started in June. A lot of what I make goes to the team.",
    cards: [
      { icon: "headphones", number: "$400", label: "Headphones", highlight: false },
      { icon: "mini_pc", number: "$750", label: "Mini PC", highlight: false },
      { icon: "keyboard", number: "$250", label: "Keyboard", highlight: false },
      { icon: "mouse", number: "$250", label: "Mouse", highlight: false },
    ],
    strip: "Plus your own monitor: the same wide curved screen I have.",
    strip_icon: "monitor",
    notes: "",
  },
  {
    layout: "step_chain",
    eyebrow: "5 · Housekeeping",
    title: "Who writes the policy",
    subtitle: "Carriers first, then people. In this order.",
    steps: [
      { name: "Newbridge", note: "", person: "none", last_resort: false },
      { name: "AHL", note: "American Home Life", person: "none", last_resort: false },
      { name: "American Amicable", note: "", person: "none", last_resort: false },
      { name: "Me", note: "after American Amicable", person: "owner", last_resort: false },
      { name: "Mark", note: "if I’m on a call or busy", person: "mark", last_resort: false },
      { name: "Nobody free?", note: "rare: use the underwriting script", person: "none", last_resort: true },
    ],
    notes: "",
  },
  {
    layout: "script",
    eyebrow: "5 · Housekeeping",
    title: "If nobody’s free",
    subtitle: "",
    rows: [
      { who: "rep", text: "It was sent to underwriting, which is totally normal. That happens a lot.", aside: "" },
      { who: "rep", text: "Do you have any idea what that might be?", aside: "" },
      { who: "client", text: "They tell you.", aside: "" },
      { who: "rep", text: "I’m happy to go to bat for you. I won’t tell them more than they need to know.", aside: "" },
      { who: "rep", text: "I’ll clear it up tomorrow morning, and call you as soon as I’m off the phone with them.", aside: "" },
      { who: "rep", text: "Save this number as James, the insurance guy.", aside: "or your own name" },
    ],
    notes: "",
  },
  { layout: "quote", eyebrow: "From me", quote: "I want to give you every opportunity to outshine me.", name: "Anersi Koka", notes: "" },
];

export const SAMPLE_DECK: DrawnSlide[] = raw.map((s, i) => ({ ...s, index: s.layout === "cover" ? undefined : i + 1, total: s.layout === "cover" ? undefined : raw.length }));

export const SAMPLE_FILES = ["01-cover", "02-scoreboard", "03-agenda", "04-big-news", "05-big-number", "06-chart", "07-key-line", "08-diagram", "09-price-cards", "10-step-chain", "11-script", "12-quote"];
