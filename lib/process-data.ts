export type ProcessStage = {
  stage: string;
  philosophy: string;
  exampleQuestions?: string[];
  homework?: string;
};

export const PROCESS_STAGES: ProcessStage[] = [
  {
    stage: "QI1 — Quality Interview 1",
    philosophy:
      "Not pitching, convincing, closing, or impressing. QI1 is curiosity, trust, listening, evaluating mindset, and identifying vision. Flow: rapport → expectations → vision → honest network marketing discussion → fit + next step. Keep the conversation relational and selective — both sides are evaluating fit. Curiosity beats convincing.",
    exampleQuestions: [
      "What would a 10/10 life look like for you 10 years from now?",
      "What are you hoping to build that your current path may not fully provide?",
      "If you had more control of your time, what would you actually want to do with it?",
      "Where did your interest in business/financial freedom come from?",
      "Do you see yourself as someone who would enjoy mentoring other people someday?",
    ],
    homework: "Business of the 21st Century (Robert Kiyosaki) — 15-page summary. Focus on the Cashflow Quadrant and the 8 assets.",
  },
  {
    stage: "QI2 — Quality Interview 2",
    philosophy:
      "Educational, conversational, curiosity-driven — not a hard close. Review the homework, revisit the Cashflow Quadrant, set expectations for the 3-4 week education process, explain Amway as the product supplier and LTD as the education system (franchise analogy), and the 3 core skills: change buying habits, create customers, duplicate. Always clarify income is not guaranteed and results take time.",
    exampleQuestions: [
      "What did you think about the article?",
      "What parts stood out to you?",
      "Was anything confusing?",
      "Did the Cashflow Quadrant concept make sense?",
    ],
    homework: "Digital Flea Market of Dreams (audio, John Resch) + The Go-Giver (book, Bob Burg).",
  },
  {
    stage: "IS1 — Info Session 1",
    philosophy: "Community and leadership exposure — seeing the team environment, not just hearing information one-on-one.",
    homework: "Financial Stability of the 21st Century (audio, Greg Duncan) + How Do You Want to Live? (audio, Alex & Laura Angle).",
  },
  {
    stage: "FU1 — Follow Up 1",
    philosophy:
      "Reinforces standards, expectations, and partnership guidelines: self-education, changing buying habits, developing customers, Core 300, budgeting, networking, long-term thinking. Healthy organizations are customer-based, not hype-based.",
    homework: "List, Ditto, Associate (audio, Dirk & Laura Taylor) + The 25 Laws of Doing the Impossible (book, Patrick Bet-David).",
  },
  {
    stage: "IS2 — Info Session 2",
    philosophy: "Deeper business exposure and vision reinforcement, building on IS1.",
    homework: "Dissatisfied (audio, Manny Winston) + At the Highest Level (audio, Mark Nathan).",
  },
  {
    stage: "FU2 — Follow Up 2",
    philosophy:
      "Review FU1 slides, expectations, and the operational blueprint. Make sure there are no red flags or unanswered questions before moving to the questionnaire.",
  },
  {
    stage: "Questionnaire",
    philosophy:
      "Done near the end of the process to confirm the prospect fully understands what they're getting into. Use ONLY the official 9 questions below — never add to or alter them.",
  },
  {
    stage: "Offer Call",
    philosophy:
      "A Zoom call where the prospect meets Alex and Laura Angle, who welcome them to the team.",
  },
  {
    stage: "Onboarding",
    philosophy:
      "Mindset: slow down to speed up. Launch = sign up with Amway/LTD, order a 100 PV personal order, download apps, buy conference tickets. Then Onboarding 1: Budget Session, 2: List Building, 3: Customers, 4: A/B List Networking, 5: 30 Day Core Run.",
  },
];

export const QUESTIONNAIRE_QUESTIONS: string[] = [
  "Why do you feel that you would be a good investment of our time and resources, and what separates you from other potential candidates?",
  "What are you looking to accomplish through this opportunity? Why are you excited about that?",
  "What is the difference between Amway and LTD? What makes our program different than other network marketing businesses out there?",
  "What are the dates of the next Apprenticeship Workshop, Masterclass, and Major Conference? Why is attending each team event essential to a successful business?",
  "Are you willing to go through a budgeting session? If so, why do you feel this would be valuable to you?",
  "What are the monthly personal PV standards that we've discussed? Why is DITTO necessary for developing a stable, long-term business?",
  "Why is transparent and consistent communication with your mentor in all areas (life, business, finances, etc) so important for a successful business?",
  "As you face adversity in life and in business, are you willing to press into the mentorship that is available to you? Why is it so important to avoid pulling away/trying to navigate obstacles on your own?",
  "Are there any other questions or concerns that you would like to address with us prior to moving forward?",
];

export type FirstMonthStep = {
  step: string;
  substeps?: string[];
};

// Step-by-step for someone who just launched - what to actually do,
// in order, not just a loose bag of targets.
export const FIRST_MONTH_STEPS: FirstMonthStep[] = [
  { step: "Budget Session" },
  { step: "Create your A/B List" },
  { step: "Create your Customer List" },
  { step: "Book your first QI1s" },
  { step: "Create Sample Bags" },
  {
    step: "Commit to a 30 Day Core Run",
    substeps: [
      "Daily communication with your upline",
      "Reading 20+ minutes",
      "Listening to 1+ audio",
      "Reaching out to 2 potential IBOs",
      "Building towards 150 PV",
    ],
  },
  { step: "Attend weekly events" },
];
