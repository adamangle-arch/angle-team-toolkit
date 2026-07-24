export type ScriptEntry = {
  category: string;
  question: string;
  answer: string;
};

export const SCRIPTS: ScriptEntry[] = [
  // Compensation plan / pyramid scheme
  {
    category: "Compensation Plan",
    question: "What are PV and BV?",
    answer:
      "PV (Point Value) is used for qualification — monthly, bonus, and leadership qualifications. BV (Business Volume) is the dollar value used to calculate bonuses. 1 PV ≈ $3.43.",
  },
  {
    category: "Compensation Plan",
    question: "How does retail profit work?",
    answer:
      "Buy at IBO pricing, sell at retail pricing — the difference is your retail margin. The most traditional form of income in the business.",
  },
  {
    category: "Compensation Plan",
    question: "What is the Monthly Performance Bonus?",
    answer:
      "As organizational volume increases, your bonus percentage increases, ranging from 3% to 25%. It rewards consistent volume, not one-time activity.",
  },
  {
    category: "Compensation Plan",
    question: "What is the Differential Bonus?",
    answer:
      "When you qualify at a higher bonus level than a leader in your organization, you may earn the difference between those levels on their volume. It exists to reward developing other leaders.",
  },
  {
    category: "Compensation Plan",
    question: "What happens at 7,500 PV?",
    answer:
      "When a frontline organization reaches ~7,500 PV, the sponsor may start earning ~6% leadership bonus on that volume. This is the shift from being paid for personal production to being paid for developing a leader.",
  },
  {
    category: "Compensation Plan",
    question: "What's the difference between width and depth?",
    answer:
      "Width = multiple personal frontline organizations (stability, since you don't rely on one leg). Depth = leaders developing leaders below them (leverage). Strong organizations need both — width is profitability, depth is stability.",
  },
  {
    category: "Compensation Plan",
    question: "Can someone earn more than the person who sponsored them?",
    answer:
      "Yes — compensation is based on volume and leadership development, not seniority. A person who joins today can out-earn their sponsor by generating more volume and developing more leaders. Helping someone surpass you is one of the highest forms of leadership.",
  },
  {
    category: "Compensation Plan",
    question: "Is Amway a pyramid scheme?",
    answer:
      "A pyramid scheme pays primarily for recruiting, with little or no real product/customer value, and collapses when recruiting slows. This business pays for product movement, customer acquisition, and leadership development — sponsoring alone with no volume creates very little compensation. Many legitimate organizations (companies, schools, the military) are pyramid-shaped on paper; shape isn't what makes something illegal, how compensation is generated is.",
  },
  {
    category: "Compensation Plan",
    question: "\"You only make money by recruiting people.\"",
    answer:
      "You can sponsor many people and earn very little if no customers are served and no volume is generated. The plan doesn't meaningfully reward enrollment alone — it rewards product movement, customer acquisition, and leadership development.",
  },
  // Handling "what is it"
  {
    category: "What Is It?",
    question: "\"What is it?\" (early text/DM)",
    answer:
      "Don't panic, oversell, or send paragraphs explaining comp plans. Say: \"I'd rather not explain it poorly over text honestly — it makes more sense conversationally. I'm still newer myself so I'd rather connect you with the people teaching me.\"",
  },
  {
    category: "What Is It?",
    question: "They seem confused after a brief explanation",
    answer:
      "Confusion isn't rejection — it usually means curiosity, and they need context or conversation, not more text. \"Totally fair lol, it's harder to explain over text — makes WAY more sense in person. I'd rather just let you meet the people I'm learning from.\"",
  },
  {
    category: "What Is It?",
    question: "Transitioning to a phone call",
    answer:
      "\"You free sometime this week for a quick 10-15 minute call? I'd love to hear more about what you're working toward too.\" The first call is relationship-building and assessing fit — not a pitch or a full business explanation.",
  },
  // Objections / posture
  {
    category: "Objections & Posture",
    question: "A prospect is being rude, defensive, or ghosting",
    answer:
      "Default to selection over convincing. Don't chase, over-explain, or beg for a response. Bless and release with posture: \"Hey, totally get it if the timing isn't right. I'm running hard with a few people right now so I'm going to keep moving, but I wish you the best!\" Walking away with posture builds more long-term duplication than chasing an uncoachable prospect.",
  },
  {
    category: "Objections & Posture",
    question: "A prospect asks a lot of hesitant questions",
    answer:
      "\"You've got a lot of questions, and it's honestly tough to cover everything over a quick call/text like this. Based on our interaction, it sounds like you're probably more curious right now than actually looking for an opportunity. Am I reading you right?\" If they agree, thank them for their time and move on — right now you're looking for people actively running and looking.",
  },
  {
    category: "Objections & Posture",
    question: "\"Is this a pyramid scheme?\" / hard questions from a prospect",
    answer:
      "Acknowledge the concern, answer honestly, explain the Angle Team perspective — never become defensive or shame skepticism. Healthy skepticism is normal, and both sides are evaluating fit.",
  },
  // Low-pressure invitations
  {
    category: "Outreach Examples",
    question: "Low-pressure invitation lines",
    answer:
      "\"If it sounds interesting I could maybe connect you with him sometime.\" / \"No pressure at all but I thought you'd appreciate hearing about it.\" / \"If not, all good — you just seemed ambitious so I thought of you.\"",
  },
  {
    category: "Outreach Examples",
    question: "Checking appreciation instead of asking \"are you interested?\"",
    answer:
      "Most people don't know if they're interested yet — they don't understand enough. Ask instead: \"I don't know if you're looking for anything right now, but if you'd appreciate it, I'd be willing to have a conversation and see if I can help.\"",
  },
  {
    category: "Outreach Examples",
    question: "C-list / marketplace: leading with who, not what",
    answer:
      "Don't lead with \"I have a business\" or \"are you interested in making money.\" Lead with mentorship: \"I got connected to mentors who have built more options in their life,\" then check appreciation for a conversation.",
  },
];
