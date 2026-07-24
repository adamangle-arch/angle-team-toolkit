export type TriviaQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
};

// Placeholder questions demonstrating the format the Trivia game
// (app/trivia/page.tsx) expects. Swap these out for real questions
// about products, process, or scripts whenever you're ready — send them
// over and they'll be added here. correctIndex is 0-based into options.
export const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  {
    question: "PLACEHOLDER — replace with a real question, e.g. about a product line.",
    options: ["Option A", "Option B (replace me)", "Option C", "Option D"],
    correctIndex: 0,
  },
  {
    question: "PLACEHOLDER — replace with a real question about the QI1/QI2 process.",
    options: ["Option A", "Option B", "Option C (replace me)", "Option D"],
    correctIndex: 2,
  },
  {
    question: "PLACEHOLDER — replace with a real question from Scripts & FAQ.",
    options: ["Option A (replace me)", "Option B", "Option C", "Option D"],
    correctIndex: 0,
  },
];
