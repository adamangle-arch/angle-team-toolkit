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
];
