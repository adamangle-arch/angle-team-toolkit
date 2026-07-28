export type TriviaQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
};

// Real team trivia questions. Send more anytime and they'll be added
// here. correctIndex is 0-based into options. Convention: when a
// question asks about a specific diamond/platinum on the team, the
// wrong-answer options should be other real leader names pulled from
// lib/leaders-data.ts (not made-up names) - but leave book/audio
// questions (Go-Giver, Think and Grow Rich, etc.) as-is, since their
// wrong answers are about the book's own content, not our team.
export const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  {
    question: "What is the main message of The Go-Giver?",
    options: [
      "Compete aggressively to win every deal",
      "Focus on adding value to others leads to greater success",
      "Success is only measured by income",
      "Sell as much as possible to as many people as possible",
    ],
    correctIndex: 1,
  },
  {
    question:
      'What did Paul Kopecky say to his professor after he was giving him a hard time about building the business in the audio "New Emeralds - Kopecky"?',
    options: ["Thanks, Professor!", "I quit!", "Oh Harry!", "That's alright!"],
    correctIndex: 2,
  },
  {
    question:
      'In the audio "Dissatisfied," what does Manny Winston call people that play Pokémon?',
    options: ["Pokénomo", "Brokemon", "Brokéman", "Pokéboke"],
    correctIndex: 1,
  },
  {
    question: "What is ditto?",
    options: [
      "A referral bonus program",
      "A type of sample bag",
      "A reoccurring monthly subscription",
      "A one-time product discount",
    ],
    correctIndex: 2,
  },
  {
    question:
      "Which diamond had to dig through dumpsters to find aluminum cans to pay for their conference tickets when they first got started?",
    options: [
      "Mike and Susan Bundy",
      "Larry and Pam Winters",
      "Derrick and Kaprice Tucker",
      "Kent and Jenna Scheerer",
    ],
    correctIndex: 1,
  },
  {
    question: 'What is the "failure disease" in chapter 2 of The Magic of Thinking Big?',
    options: ["Analysis Paralysis", "Procrastination", "Excusitis", "Perfectionism"],
    correctIndex: 2,
  },
  {
    question: "Which Amway product line has been around longer than Amway?",
    options: ["Artistry", "eSpring", "Nutrilite", "XS Energy"],
    correctIndex: 2,
  },
  {
    question:
      "What is the name of the audio where Kent and Jenna Scheerer share their journey of beating breast cancer and winning in their business at the same time?",
    options: [
      "Stronger Together",
      "The Comeback",
      "Get Through It or Win Through It",
      "Faith Over Fear",
    ],
    correctIndex: 2,
  },
  {
    question:
      "In Chapter 2 of Think and Grow Rich, Napoleon Hill talks about having a burning desire. He uses an example of a man pursuing Thomas Edison with the intention of one day becoming his business associate. What is that man's name?",
    options: ["Henry Ford", "Charles Schwab", "Edwin Barnes", "Andrew Carnegie"],
    correctIndex: 2,
  },
  {
    question:
      'In Chapter 1 of Atomic Habits, James Clear says "you do not rise to the level of your goals, you fall to the level of your ____."',
    options: ["Habits", "Environment", "Systems", "Discipline"],
    correctIndex: 2,
  },
  {
    question:
      'In the audio "First Round Draft Pick," Mark Nathan says he will rock your face at what video game?',
    options: ["Mario Kart", "Call of Duty", "Madden NFL", "Fortnite"],
    correctIndex: 0,
  },
  {
    question:
      'In Think and Grow Rich, Napoleon Hill says, "Every adversity, every failure, every heartbreak, carries with it the ________."',
    options: [
      "seed of an equal or greater benefit",
      "lesson you must learn to move forward",
      "price you must pay for success",
      "test of your true character",
    ],
    correctIndex: 0,
  },
  {
    question: "Which of these is NOT one of the Angle Team's 9 Core Steps?",
    options: ["Read 20 Minutes / Day", "Attend all Meetings", "Post on social media daily", "Be Coachable"],
    correctIndex: 2,
  },
  {
    question: "Which Diamond has a background in professional soccer?",
    options: ["Derek Kosek", "Paul Kopecky", "Manny Winston", "Toby Ayers"],
    correctIndex: 0,
  },
  {
    question: "Which vitamin is recommended for people with limited sun exposure?",
    options: ["Vitamin D", "Vitamin C", "Vitamin B12", "Vitamin E"],
    correctIndex: 0,
  },
  {
    question: "Who were Larry & Pam Winters' first Diamonds?",
    options: [
      "Danny and Renate Snipes",
      "Gary and Tammy Newell",
      "Mike and Susan Bundy",
      "Jake and Jackie Baker",
    ],
    correctIndex: 0,
  },
  {
    question: 'Who is the speaker of the audio "Networking Is Normal"?',
    options: ["Derek & Jill Kosek", "Kyle & Austin Brown", "Joe Markiewicz", "Manny Winston"],
    correctIndex: 0,
  },
  {
    question: '"Ditch the Pitch" moves you from a recruiting mindset to what kind of mindset?',
    options: ["Filtering", "Closing", "Coaching", "Selling"],
    correctIndex: 0,
  },
  {
    question: 'In "10 Seconds Of Courage," what does Matt Grotewold say courage really is?',
    options: [
      "A moment-by-moment decision",
      "A personality trait",
      "Something you're born with",
      "A result of confidence",
    ],
    correctIndex: 0,
  },
  {
    question: 'Who interviews Kent & Jenna Scheerer in the audio "Get Through Or Win Through"?',
    options: ["Alex Angle", "Joe Markiewicz", "Mark Nathan", "Drew Tidwell"],
    correctIndex: 0,
  },
  {
    question: "What was Alex Angle's career before the business?",
    options: ["Corporate IT sales", "UPS driver", "Car wash manager", "Bank manager"],
    correctIndex: 0,
  },
  {
    question: "What was Laura Angle's career before the business?",
    options: ["Elementary education", "Nursing", "Cosmetology", "Accounting"],
    correctIndex: 0,
  },
  {
    question: "Where did Alex Angle go to college?",
    options: ["William & Mary", "UVA", "Virginia Tech", "UMBC"],
    correctIndex: 0,
  },
  {
    question: "What was Mike Bundy's job before building the business full time?",
    options: ["UPS Driver", "Car Wash Manager", "Police Officer", "Restaurant Owner"],
    correctIndex: 0,
  },
  {
    question:
      "Which Diamond couple is based in the Chicago area and works in acting/massage therapy?",
    options: [
      "Mark & Meredith Nathan",
      "Paul & Morgan Kopecky",
      "Danny & Renate Snipes",
      "Joe & Marybeth Markiewicz",
    ],
    correctIndex: 0,
  },
  {
    question: "How many QI's per week does the 9 Core Steps call for?",
    options: ["3-5", "1-2", "5-7", "2-4"],
    correctIndex: 0,
  },
  {
    question: 'What VCS percentage is part of "Grow Your Income" in the 9 Core Steps?',
    options: ["60%", "50%", "70%", "40%"],
    correctIndex: 0,
  },
  {
    question: "How many minutes of reading per day does the 9 Core Steps call for?",
    options: ["20 minutes", "10 minutes", "30 minutes", "15 minutes"],
    correctIndex: 0,
  },
  {
    question: 'What\'s the PV goal under "Grow Your Income" in the 9 Core Steps?',
    options: ["300 PV Personal Circle", "150 PV", "600 PV", "100 PV"],
    correctIndex: 0,
  },
  {
    question: 'In "10 Seconds Of Courage," what fear did Matt Grotewold have to overcome?',
    options: ["Flying", "Public speaking", "Failure", "Rejection"],
    correctIndex: 0,
  },
  {
    question:
      "What is the name of the premier Bundy/Angle Team Myrtle Beach leadership weekend?",
    options: ["Lighthouse Leadership", "Coastal Diamonds", "Beacon Summit", "Shoreline Leaders"],
    correctIndex: 0,
  },
  {
    question: "What was Manny Winston's occupation when he saw the Amway business at 19 years old?",
    options: ["Bowling Alley", "Fast Food Restaurant", "Retail Store", "Landscaping Crew"],
    correctIndex: 0,
  },
];
