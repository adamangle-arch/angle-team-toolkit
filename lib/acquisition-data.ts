export type GuideSection = {
  title: string;
  content: string;
};

export const SAMPLE_BAG_GUIDE: GuideSection[] = [
  {
    title: "Purpose",
    content:
      "Sample bags let customers experience products firsthand, identify favorites, and build trust in product quality. They also help new IBOs learn the products, create customer conversations, build confidence, generate retail profit, and develop repeat customers.",
  },
  {
    title: "Posture",
    content:
      "Low pressure, helpful, fun, relationship-based. Never pressure people, exaggerate results, overcomplicate products, or act desperate for sales.",
  },
  {
    title: "Step-by-step process",
    content:
      "1) Order a starter stack of commonly used products. 2) Split into individual sample bags (e.g. XS, protein bars/powder, hydration, skincare samples, immunity products). 3) Package professionally — clear treat bags, thank-you notes, simple product info cards.",
  },
  {
    title: "Pricing model",
    content:
      "The goal is creating customer value and exposure, not maximizing profit. Example model: $15-18 cost, $30 selling price.",
  },
  {
    title: "Who to offer",
    content:
      "Look for people interested in health, fitness, energy, hydration, skincare, wellness, convenience, or clean products.",
  },
  {
    title: "Outreach example",
    content:
      "\"Hey Sarah, I remember you mentioning wanting better energy lately. I've been putting together some wellness sample bags for people and thought you might enjoy one. I'm selling them for $30 and they include energy, hydration, and immunity products. No worries either way.\" Tone: casual, confident, non-needy, low pressure.",
  },
  {
    title: "Delivery",
    content:
      "Briefly explain each product, keep it simple, avoid overwhelming with information. Optional: a small product info card with purpose, how to use, and favorite benefits.",
  },
  {
    title: "Ditto transition",
    content:
      "Over time, help repeat customers transition to Ditto/autoship for products they consistently use. Don't rush this — the goal is long-term retention and stable monthly volume.",
  },
];

export type SurveyQuestion = {
  question: string;
  followUp?: string;
  recommendations: string;
};

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    question: "Do you spend a lot of time looking at screens?",
    recommendations: "Eye Mojo gummies — lutein, blue-light-filtering antioxidant support.",
  },
  {
    question: "Do you find yourself running out of energy and/or feeling mentally foggy?",
    recommendations:
      "If they drink energy drinks: XS Energy Drinks (lower caffeine, B6/B12). Otherwise: Ultra Focus \"Slay the Day\" gummies or the Energy Focus Pack.",
  },
  {
    question: "Are you interested in supplements aimed at boosting your immunity?",
    recommendations: "Immunity Health Pack, Go Shield gummies, or Immunity Health Twist Tubes (Strawberry Kiwi).",
  },
  {
    question: "Do you take a multivitamin?",
    recommendations: "Double X — 10 vitamins, 12 minerals, 22 nutrients from fruits & vegetables, in 3 pills.",
  },
  {
    question: "Do you experience joint pain or muscle soreness?",
    followUp: "If yes — which one or both?",
    recommendations: "Joint Health, Joint Health Twist Tubes (Raspberry), or CBD Pro Cream.",
  },
  {
    question: "Do you have difficulty falling asleep or staying asleep?",
    recommendations: "Sweet Dream gummies — melatonin, designed to avoid next-day grogginess.",
  },
  {
    question: "Are you interested in a clean, plant-based skin care line?",
    followUp: "If yes — hydration, oil control, or aging? (Women) / general (Men)",
    recommendations:
      "Women: Hydrating Gel Cream (hydration), Balancing Matte Gel Lotion (oil control), Renewing Reactivation Cream (anti-aging). Men: Gentle Face Wash or Glow Boss Cleanser + Exfoliator.",
  },
  {
    question: "Do you experience dry skin on your face or body or both?",
    followUp: "If yes — body, face, or both?",
    recommendations:
      "Women's face: My Main Squeeze Moisturizer. Men's face: Men's Facial Moisturizer. Body: Nourish Body Lotion.",
  },
  {
    question: "Do you use or are you interested in environmentally-friendly, effective cleaning/laundry products?",
    recommendations: "Liquid Laundry Detergent, Kitchen Cleaner, or Automatic Dish Tablets.",
  },
];

export const SURVEY_APPOINTMENT_FLOW: string[] = [
  "New IBO introduces the upline/helper who's guiding the appointment.",
  "Register the customer through the MyShop link.",
  "Share screen and pull up the website; ask the 9 questions together, conversationally.",
  "Only review products tied to their \"yes\" answers — don't overeducate or give a general product overview.",
  "Add discussed products to an example cart and review it slowly; ask \"what are you most interested in?\"",
  "Stop screen share, have the customer log in on their own computer, and walk them through adding only what they wanted.",
  "Stay on the call until checkout is complete — don't end early, momentum matters.",
  "Celebrate the new IBO immediately and have them share the win in the team chat.",
];
