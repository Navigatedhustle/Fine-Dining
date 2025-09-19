# Fine Dining Coach

This zip contains:
- `FineDiningCoach.tsx` — Single-file React + TypeScript component using Tailwind (shadcn-friendly). Client-side only; localStorage persistence.
- `fallback-finedining-coach.html` — Pure HTML/CSS/JS widget for GoHighLevel or any page builder.
- Heuristics are inlined in the TSX (`utils.HEURISTICS`) with comments for easy tuning.

## Quick Start (React)
1) Copy `FineDiningCoach.tsx` into your app.
2) Ensure Tailwind is configured. If you use shadcn/ui, replace the fallback `UI` object with real imports.
3) Render `<FineDiningCoach />` anywhere.

## Acceptance criteria covered
- Steakhouse: The template and heuristics rank an 8 oz grilled filet with “no butter; sauce on side; double veg; skip béarnaise” at ~520–650 kcal, 55–65 g protein.
- Sushi: Returns sashimi + edamame + cucumber salad, warns on sauces.
- Italian (650 kcal, 45 g protein, training day): Suggests grilled fish or chicken piccata (light) + grilled veg; swap half pasta for veg.

## Fallback
Open `fallback-finedining-coach.html` directly in a browser or paste into GHL. It stores state locally and provides quick picks.
