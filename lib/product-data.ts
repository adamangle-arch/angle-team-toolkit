export type Product = {
  name: string;
  brand: string;
  summary: string;
  bestFor: string;
  pv?: string;
};

export const PRODUCTS: Product[] = [
  // Nutrilite
  {
    name: "Double X",
    brand: "Nutrilite",
    summary:
      "Flagship multivitamin/multimineral/phytonutrient system (3 tablets: vitamin, mineral, phytonutrient). Grown on Nutrilite's own farms for full seed-to-supplement traceability.",
    bestFor: "Anyone wanting a foundational daily multivitamin, especially busy professionals and adults 30+.",
  },
  {
    name: "Perfect Pack",
    brand: "Nutrilite",
    summary:
      "Foundational wellness bundle: Double X + Omega-3 + Concentrated Fruits & Vegetables. A complete daily system in one pack.",
    bestFor: "Customers who want comprehensive nutrition without assembling separate products.",
    pv: "~PV varies by current bundle — check catalog",
  },
  {
    name: "Organics Plant Protein",
    brand: "Nutrilite",
    summary: "Plant-based protein (pea, brown rice, chia) — vegan, dairy-free. Supports protein intake, lean muscle, satiety.",
    bestFor: "Vegans, vegetarians, anyone avoiding dairy protein.",
  },
  {
    name: "Fruits & Vegetables Concentrate",
    brand: "Nutrilite",
    summary: "Concentrated phytonutrients from produce, to fill gaps from low fruit/veg intake. Complements, doesn't replace, a healthy diet.",
    bestFor: "Anyone wanting more antioxidant/phytonutrient support.",
  },
  {
    name: "Balance Within Probiotic",
    brand: "Nutrilite",
    summary: "Probiotic supporting digestive and immune health via gut microbiome support.",
    bestFor: "Digestive health, immune support.",
  },
  {
    name: "Magnesium",
    brand: "Nutrilite",
    summary: "Supports muscle function, nervous system, relaxation, and energy production.",
    bestFor: "Active adults and anyone with low dietary magnesium intake.",
  },
  {
    name: "Vitamin D",
    brand: "Nutrilite",
    summary: "Supports bone health, immune function, and muscle function — useful since most people get limited sun exposure.",
    bestFor: "Everyone, especially people with limited outdoor time.",
  },
  {
    name: "Twist Tubes — Immunity Health",
    brand: "Nutrilite",
    summary: "Strawberry Kiwi single-serving stick pack. Vitamin C + Zinc + antioxidants for immune support.",
    bestFor: "Travelers, teachers, healthcare workers, anyone wanting portable immune support.",
    pv: "6.29 PV",
  },
  {
    name: "Twist Tubes — Antioxidant Health",
    brand: "Nutrilite",
    summary: "Mango Citrus stick pack. Vitamins A & C, antioxidant/cellular protection.",
    bestFor: "Active adults, athletes, health-conscious consumers.",
    pv: "6.29 PV",
  },
  {
    name: "Twist Tubes — Joint Health",
    brand: "Nutrilite",
    summary: "Raspberry stick pack supporting joint flexibility and mobility.",
    bestFor: "Adults 35+, active adults, former athletes.",
    pv: "6.29 PV",
  },
  // XS
  {
    name: "XS Energy Drink",
    brand: "XS",
    summary:
      "Sugar-free energy drink, ~114mg caffeine, B vitamins, 15 calories. Many flavors (Classic, Citrus, Tropical, Root Beer, Black Cherry Cola, and more); CF Cranberry-Grape is caffeine-free.",
    bestFor: "Anyone wanting a lower-sugar energy drink alternative.",
    pv: "~9.70 PV (variety case)",
  },
  {
    name: "XS Pre-Workout Boost",
    brand: "XS",
    summary: "Green Apple or Blue Raspberry. Energy, focus, and endurance support for training.",
    bestFor: "Gym-goers, strength training, HIIT.",
  },
  {
    name: "XS Post-Workout Recovery",
    brand: "XS",
    summary: "Fruit Punch. L-Glutamine, amino acids, turmeric, glucosamine for muscle recovery and joint support.",
    bestFor: "Anyone training regularly who wants to recover faster.",
  },
  {
    name: "XS Grass-Fed Whey Protein",
    brand: "XS",
    summary: "30g whey protein isolate, 6.9g BCAAs, gluten/soy free, stevia-sweetened. Chocolate, Vanilla, Strawberry.",
    bestFor: "Active adults increasing protein intake; not for those avoiding dairy.",
    pv: "16.01 PV",
  },
  {
    name: "XS Muscle Multiplier",
    brand: "XS",
    summary: "Essential amino acid + L-Arginine blend, zero sugar, caffeine-free. Supports lean muscle, strength, recovery.",
    bestFor: "Anyone wanting amino acid support before/during/after training.",
    pv: "14.43 PV",
  },
  {
    name: "XS Creatine+",
    brand: "XS",
    summary: "5g Creatine Monohydrate + Calcium HMB + electrolyte matrix for strength, power, and hydration.",
    bestFor: "Strength training, gym performance.",
    pv: "14.43 PV",
  },
  {
    name: "XS Sports Twist Tubes",
    brand: "XS",
    summary: "Fruit Punch or Raspberry Lemonade. Hydration and electrolyte replenishment, portable stick packs.",
    bestFor: "Athletes, golfers, runners, anyone trying to drink more water.",
    pv: "6.03 PV",
  },
  // Artistry
  {
    name: "Artistry Skin Nutrition (Balancing / Hydrating / Renewing)",
    brand: "Artistry",
    summary:
      "Premium skincare line built on White Chia Seed + Acerola Cherry. Balancing = combination/oily skin. Hydrating = dry/mature skin. Renewing = fine lines/firmness/dullness (35+).",
    bestFor: "Matching by skin concern: oiliness, dryness, or anti-aging.",
  },
  {
    name: "Artistry Makeup (Foundation, Concealer, Powder, etc.)",
    brand: "Artistry",
    summary: "Foundation, concealer, powder, blush, bronzer, highlighter, eye/lip products — formulated to support skin comfort while enhancing appearance.",
    bestFor: "Customers wanting makeup with skincare benefits.",
  },
  {
    name: "Artistry Signature Select",
    brand: "Artistry",
    summary: "Customizable mask system: Hydration, Brightening, Purifying, Firming, Polishing.",
    bestFor: "Customers wanting a personalized treatment routine.",
  },
  // Satinique
  {
    name: "Satinique Smooth Moisture",
    brand: "Satinique",
    summary: "Shampoo/conditioner for dry, frizzy, or coarse hair. Enerjuve technology (lipids, creatine, 18-MEA) for shine and manageability.",
    bestFor: "\"My hair is dry/frizzy/hard to manage.\"",
  },
  {
    name: "Satinique Intensive Repair",
    brand: "Satinique",
    summary: "For damaged, color-treated, or heat-styled hair — reduces breakage and improves texture over time.",
    bestFor: "People who color, flat-iron, or frequently blow-dry.",
  },
  {
    name: "Satinique Color Care",
    brand: "Satinique",
    summary: "Gentle, color-safe cleansing that helps maintain vibrancy for color-treated hair.",
    bestFor: "Color-treated or highlighted hair.",
  },
  // G&H
  {
    name: "G&H Protect+ (Body Wash, Bar Soap, Hand Soap/Cream, Lotion)",
    brand: "G&H",
    summary: "Family body care built around White Tea Extract, focused on cleansing while protecting the skin's moisture barrier.",
    bestFor: "Families, anyone with dry skin who wants gentle daily cleansing.",
  },
  // Glister
  {
    name: "Glister Multi-Action Toothpaste",
    brand: "Glister",
    summary: "Fluoride + Reminact remineralization technology + silica polishing agents. Plaque removal, cavity prevention, fresh breath, stain removal.",
    bestFor: "Daily oral care, families.",
    pv: "2.03 PV",
  },
  {
    name: "Glister Multi-Action Concentrated Oral Rinse",
    brand: "Glister",
    summary: "Concentrated mouthwash — complements brushing/flossing for a complete daily oral care routine.",
    bestFor: "Anyone wanting a full oral care system.",
    pv: "3.67 PV",
  },
  {
    name: "Glister Mint Refresher Spray",
    brand: "Glister",
    summary: "Portable breath-freshening spray for on-the-go touch-ups between brushing.",
    bestFor: "On-the-go breath freshening.",
    pv: "1.90 PV",
  },
  {
    name: "Glister Multi-Action Power Toothbrush Refills",
    brand: "Glister",
    summary: "Replacement brush heads for the Glister power toothbrush.",
    bestFor: "Power toothbrush owners due for a refill.",
    pv: "9.45 PV",
  },
  // Home / durables
  {
    name: "eSpring Water Treatment System",
    brand: "Home",
    summary: "Carbon block filtration + UV technology. Reduces lead, chlorine, sediment, and microorganisms while retaining beneficial minerals. Not reverse osmosis.",
    bestFor: "Families and health-conscious homeowners concerned about water quality.",
  },
  {
    name: "Atmosphere Sky Air Treatment",
    brand: "Home",
    summary: "3-stage filtration: pre-filter, HEPA-grade, carbon (odors/VOCs).",
    bestFor: "Allergy sufferers, pet owners, families.",
    pv: "448.69 PV",
  },
  {
    name: "iCook 4-Piece Stock Pot",
    brand: "Home",
    summary: "4 L/4 quart stainless stock pot with steamer/colander insert. Multi-ply construction for even heating; waterless-cooking philosophy for flavor/nutrient retention.",
    bestFor: "Home cooks wanting durable, premium cookware.",
    pv: "83.70 PV",
  },
  {
    name: "iCook 5-Piece Sauté Set",
    brand: "Home",
    summary: "Stainless sauté pans with lids. Multi-ply construction for even heating; waterless-cooking philosophy for flavor/nutrient retention.",
    bestFor: "Home cooks wanting durable, premium cookware.",
    pv: "123.06 PV",
  },
  {
    name: "LOC Multi-Purpose Cleaner",
    brand: "Amway Home",
    summary: "Concentrated cleaner for countertops, floors, appliances, and more — one product replacing several.",
    bestFor: "Anyone wanting to simplify their cleaning cabinet.",
    pv: "3.28 PV",
  },
  {
    name: "LOC Multi-Purpose Wipes",
    brand: "Amway Home",
    summary: "Pre-moistened version of LOC — for quick cleanups without mixing a spray bottle.",
    bestFor: "Grab-and-go cleaning, quick countertop wipe-downs.",
    pv: "4.00 PV",
  },
  {
    name: "Amway Home Glass Cleaner",
    brand: "Amway Home",
    summary: "Streak-free cleaner for windows, mirrors, and other glossy surfaces.",
    bestFor: "Anyone wanting a streak-free clean for windows and mirrors.",
    pv: "4.46 PV",
  },
  {
    name: "Dish Drops",
    brand: "Amway Home",
    summary: "Concentrated, grease-cutting dishwashing liquid.",
    bestFor: "Everyday dishwashing.",
  },
  {
    name: "SA8 Laundry Detergent + Stain Remover + Fabric Softener",
    brand: "Amway Home",
    summary: "Concentrated laundry system: cleaning power, fabric care, HE-compatible (verify current label).",
    bestFor: "Everyday laundry.",
  },
];

export type PVReference = { item: string; pv: string };

export const PV_REFERENCE: PVReference[] = [
  { item: "Nutrilite Twist Tubes (any flavor)", pv: "6.29 PV" },
  { item: "XS Sports Twist Tubes", pv: "6.03 PV" },
  { item: "XS CocoWater Hydration Mix", pv: "7.35 PV" },
  { item: "XS Energy Variety Case", pv: "9.70 PV" },
  { item: "XS Protein Crisps", pv: "10.23 PV" },
  { item: "XS Protein Bars", pv: "11.02 PV" },
  { item: "Artistry Go Lipstick", pv: "6.82 PV" },
  { item: "Artistry Ever Perfect Foundation", pv: "11.28 PV" },
  { item: "Artistry Signature Select Hydrating Mask", pv: "11.02 PV" },
  { item: "XS Sports Protein Shakes", pv: "13.91 PV" },
  { item: "XS Creatine+ / XS Muscle Multiplier", pv: "14.43 PV" },
  { item: "XS Grass-Fed Whey / XS CBD Cream", pv: "16.01 PV" },
  { item: "Artistry Renewing Reactivation Day Lotion SPF 30", pv: "19.41 PV" },
  { item: "Artistry Labs Retexturizing Serum", pv: "28.86 PV" },
  { item: "Artistry Renewing System Bundle", pv: "37.77 PV" },
  { item: "Artistry LongXevity Soft Cream", pv: "95.77 PV" },
  { item: "Satinique Smooth Moisture Conditioner", pv: "3.94 PV" },
];

export type StarterStack = {
  name: string;
  detail: string;
  bestFor: string;
};

export const STARTER_STACKS: StarterStack[] = [
  { name: "Beauty Starter Stack", detail: "7 products, ~53.71 PV", bestFor: "Beauty/skincare customers, self-care routines" },
  { name: "Customer Faves Starter Stack", detail: "8 products, ~53.72 PV", bestFor: "First-time customers, families, people unsure where to start" },
  { name: "Nutrition Starter Stack", detail: "6 products, ~54.66 PV", bestFor: "Nutrition-focused, wellness-minded households" },
  { name: "Sports Nutrition Starter Stack", detail: "8 products, ~73.19 PV", bestFor: "Athletes, gym-goers, recovery-focused" },
  { name: "The Essentials Stack", detail: "10 products, ~56.30 PV", bestFor: "New IBOs building consistent monthly consumption" },
  { name: "Fitness Jump Start Solution", detail: "Item #128210, ~46.44 PV", bestFor: "Weight loss goals, new fitness journeys, beginners" },
  { name: "Muscle Gains Stack", detail: "7 products, ~77.27 PV", bestFor: "Muscle growth, bulking phases" },
  { name: "Toning Stack", detail: "~7 products", bestFor: "Lean muscle, fat loss, body recomposition" },
  { name: "Peak Performance Stack", detail: "5 products, ~53.98 PV", bestFor: "Competitive athletes, advanced training" },
];
