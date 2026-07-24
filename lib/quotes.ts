export type BookQuote = {
  text: string;
  author: string;
  book: string;
};

// A curated set of well-known, widely-published quotes from books on the
// team's reading list (see FIRST_YEAR_BOOKS / ADVANCED_LIBRARY in
// lib/library-data.ts). This is deliberately NOT exhaustive — it only
// includes lines we're confident are accurately attributed, rather than
// guessing at exact wording for every book on the list. Swap in or add
// more over time as you confirm exact quotes you want included.
export const BOOK_QUOTES: BookQuote[] = [
  {
    text: "Whatever the mind can conceive and believe, it can achieve.",
    author: "Napoleon Hill",
    book: "Think and Grow Rich",
  },
  {
    text: "You can make more friends in two months by becoming interested in other people than you can in two years by trying to get other people interested in you.",
    author: "Dale Carnegie",
    book: "How to Win Friends and Influence People",
  },
  {
    text: "Action cures fear.",
    author: "David Schwartz",
    book: "The Magic of Thinking Big",
  },
  {
    text: "You do not rise to the level of your goals. You fall to the level of your systems.",
    author: "James Clear",
    book: "Atomic Habits",
  },
  {
    text: "Discipline equals freedom.",
    author: "Jocko Willink",
    book: "Extreme Ownership",
  },
  {
    text: "Begin with the end in mind.",
    author: "Stephen Covey",
    book: "The 7 Habits of Highly Effective People",
  },
  {
    text: "People don't buy what you do; they buy why you do it.",
    author: "Simon Sinek",
    book: "Start With Why",
  },
  {
    text: "When we are no longer able to change a situation, we are challenged to change ourselves.",
    author: "Viktor Frankl",
    book: "Man's Search for Meaning",
  },
  {
    text: "You are in danger of living a life so comfortable and soft, that you will die without ever realizing your true potential.",
    author: "David Goggins",
    book: "Can't Hurt Me",
  },
  {
    text: "Your true worth is determined by how much more you give in value than you take in payment.",
    author: "Bob Burg",
    book: "The Go-Giver",
  },
  {
    text: "A leader is one who knows the way, goes the way, and shows the way.",
    author: "John C. Maxwell",
    book: "Developing the Leader Within You",
  },
  {
    text: "Small, smart choices + consistency + time = radical difference.",
    author: "Darren Hardy",
    book: "The Compound Effect",
  },
  {
    text: "Yes is the destination, No is how you get there.",
    author: "Richard Fenton & Andrea Waltz",
    book: "Go For No",
  },
  {
    text: "The impediment to action advances action. What stands in the way becomes the way.",
    author: "Ryan Holiday",
    book: "The Obstacle Is the Way",
  },
];
