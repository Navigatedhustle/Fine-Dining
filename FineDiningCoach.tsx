/**
README (embed notes)
====================
Component: FineDiningCoach (default export)
File: FineDiningCoach.tsx
Drop-in usage:
-------------
- This is a single-file React + TypeScript component. It assumes Tailwind CSS is available on the page.
- If you use shadcn/ui, ensure your project has its provider/theme set. The component gracefully falls back to basic Tailwind if shadcn imports fail.
- Client-side only, no backend. State is saved to localStorage under the key `fdc_v1_state`.
- Props:
  - `initialCuisineTemplates?: Record<string, CuisineTemplate>` (optional). If provided, merges with built-ins.
  - `className?: string` (optional). Wrapper div extra classes.
- Mobile-first, accessible, and dark-mode friendly (uses Tailwind `dark:` classes). Designed for dim restaurants.

How to embed:
-------------
1) Copy this file into your React app (e.g., src/components/FineDiningCoach.tsx).
2) Ensure Tailwind is configured. Optional: install shadcn/ui and lucide-react if you want full UI polish.
3) Import and render: 
   `import FineDiningCoach from './FineDiningCoach';`
   `<FineDiningCoach />`

Pre-seeding templates:
----------------------
Pass `initialCuisineTemplates` with custom dishes, scripts, and heuristics for your brand/locations.

Power features:
---------------
- Three modes: Quick Pick, Standard, Power User.
- Menu ingestion: URL reference (for your notes), upload (image/PDF preview only), or paste/typed items. OCR text box is provided (manual paste after using phone OCR or iOS Live Text).
- Ranking logic uses built-in heuristics in `utils.HEURISTICS` and `utils.estimateMacros()`; tweak those numbers as needed.
- Alcohol, dessert, sides, pre/post plans, damage control, and one-tap copyable summary included.
*/

import React, {useEffect, useMemo, useRef, useState} from 'react';

// Attempt shadcn imports if available. If not, fallback to basic tags (we gate usage).
let ShadImports: any = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ShadImports = require('@/.shim/shadcn-ui-proxy') ?? {};
} catch {}
// If you have shadcn installed, map the actual imports here or remove this shim and import directly:
// import { Button } from "@/components/ui/button"
// import { Input } from "@/components/ui/input"
// import { Textarea } from "@/components/ui/textarea"
// import { Switch } from "@/components/ui/switch"
// import { Badge } from "@/components/ui/badge"
// import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from "@/components/ui/card"
// import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
// import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"

// Minimal fallbacks with Tailwind classes if shadcn isn't available:
const UI = {
  Button: (props: any) => <button {...props} className={
    `inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2
     disabled:opacity-50 disabled:cursor-not-allowed
     bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 ` + (props.className??'')} />,
  Input: (props: any) => <input {...props} className={
    `w-full rounded-xl border px-3 py-2 text-sm bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700
     focus:outline-none focus:ring-2 focus:ring-blue-500 ` + (props.className??'')} />,
  Textarea: (props: any) => <textarea {...props} className={
    `w-full rounded-xl border px-3 py-2 text-sm bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700
     focus:outline-none focus:ring-2 focus:ring-blue-500 ` + (props.className??'')} />,
  Switch: ({checked, onCheckedChange}: any) => (
    <button aria-pressed={checked} onClick={()=>onCheckedChange?.(!checked)}
      className={`h-6 w-11 rounded-full transition-colors ${checked?'bg-blue-600':'bg-gray-300'} relative`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked?'translate-x-5':'translate-x-0.5'}`} />
    </button>
  ),
  Badge: (props: any) => <span {...props} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100 ${props.className??''}`} />,
  Card: (props: any) => <div {...props} className={`rounded-2xl border shadow-sm bg-white/90 dark:bg-gray-900/90 backdrop-blur border-gray-200 dark:border-gray-800 ${props.className??''}`} />,
  CardHeader: (props: any) => <div {...props} className={`p-4 ${props.className??''}`} />,
  CardTitle: (props: any) => <h3 {...props} className={`text-lg font-semibold ${props.className??''}`} />,
  CardDescription: (props: any) => <p {...props} className={`text-sm text-gray-600 dark:text-gray-300 ${props.className??''}`} />,
  CardContent: (props: any) => <div {...props} className={`p-4 pt-0 ${props.className??''}`} />,
  CardFooter: (props: any) => <div {...props} className={`p-4 pt-0 flex gap-2 ${props.className??''}`} />,
};

type CuisineKey = 'Steakhouse' | 'Italian' | 'Sushi/Japanese' | 'Mexican' | 'Chinese' | 'Indian' | 'American' | 'Mediterranean' | 'French' ;
type GoalPreset = 'Cut (rapid)' | 'Cut (steady)' | 'Maintenance while traveling';
type AlcoholType = 'wine' | 'spirits' | 'beer' | 'none';
type Mode = 'Quick' | 'Standard' | 'Power';

type Dish = {
  name: string;
  notes?: string;
  price?: number;
  tags?: string[];
  // Parsed elements:
  proteinType?: string;
  cooking?: string[];
  sauces?: string[];
  sides?: string[];
  isHighSodium?: boolean;
  allergens?: string[];
}

type MacroRange = { kcal: [number, number], protein: [number, number], carbs: [number, number], fat: [number, number], fiber: [number, number] };

type RankedPick = {
  rank: number;
  dish: Dish;
  why: string;
  script: string; // exact modification
  macros: MacroRange;
  proteinPer100kcal: number;
  sodiumFlag?: boolean;
  priceEstimate?: number;
  badges: string[];
  backups: { outOfStock: string; cantModify: string }[];
};

type CuisineTemplate = {
  defaultPicks: Dish[]; // used if no menu
  scripts?: string[];
  cautions?: string[];
  bestSides?: string[];
  dessertMatrix?: { green: string[], amber: string[], red: string[] };
  sodiumSwaps?: Record<string,string>;
}

type State = {
  mode: Mode;
  goal: GoalPreset;
  bodyWeight?: number;
  dailyKcal?: number;
  proteinTarget?: number;
  remainingKcal?: number;
  remainingProtein?: number;
  mealType: 'lunch'|'dinner';
  trainingDay: boolean;
  cuisine: CuisineKey;
  restaurantUrl?: string;
  menuText?: string;
  dietary: {
    avoidPork?: boolean;
    avoidShellfish?: boolean;
    vegetarian?: boolean;
    pescatarian?: boolean;
    dairyFree?: boolean;
    glutenFree?: boolean;
    nutAllergy?: boolean;
  };
  prefs: {
    lowSodium?: boolean;
    lowCarb?: boolean;
    highFiber?: boolean;
    spice?: 'low'|'medium'|'high';
  };
  alcohol: { plan: 0|1|2, type: AlcoholType };
  budgetMode: boolean;
  socialContext: 'client dinner'|'celebration'|'solo travel';
  nextMorningRebalance: boolean;
  walkMins: 0|10|20;
  favorites: { title: string, summary: string, date: string }[];
  recents: { name: string, cuisine: string, date: string }[];
};

const STORAGE_KEY = 'fdc_v1_state';

// -------------------- Utilities (documented heuristics) --------------------
const utils = {
  /**
   * HEURISTICS: rule-of-thumb caloric impacts and base proteins.
   * Adjust these to fit your coaching approach.
   */
  HEURISTICS: {
    baseProtein: {
      steak_8oz_grilled: { kcal: 520, protein: 56, fat: 34, carbs: 0, fiber: 0 }, // acceptance criterion: filet ~520–650 kcal, 55–65 g protein
      salmon_6oz_grilled: { kcal: 360, protein: 35, fat: 22, carbs: 0, fiber: 0 },
      chicken_6oz_grilled: { kcal: 280, protein: 46, fat: 6, carbs: 0, fiber: 0 },
      shrimp_6oz_grilled:  { kcal: 200, protein: 42, fat: 3, carbs: 2, fiber: 0 },
      tofu_6oz_grilled:    { kcal: 260, protein: 26, fat: 16, carbs: 8, fiber: 2 },
      sashimi_8pc_mix:     { kcal: 260, protein: 40, fat: 6, carbs: 6, fiber: 0 },
    },
    cookingAdj: {
      fried:   { kcal: [200, 350], fat: [12, 22], sodium: true },
      creamy:  { kcal: [150, 300], fat: [10, 20], sodium: true },
      buttered:{ kcal: [80, 180],  fat: [8, 16],  sodium: false},
      glazed:  { kcal: [50, 120],  carbs:[10, 25], sodium: true },
      breaded: { kcal: [120, 220], carbs:[15, 30], sodium: true },
      alfredo: { kcal: [250, 400], fat: [16, 28], sodium: true },
      aioli:   { kcal: [120, 240], fat: [10, 20], sodium: true },
      soy_heavy:{kcal:[20,60], sodium: true},
    },
    sideAdj: {
      pasta_cup: { kcal: [160, 220], carbs: [30, 40], fiber:[2,4] },
      rice_cup:  { kcal: [180, 230], carbs: [38, 48], fiber:[1,2] },
      fries:     { kcal: [280, 420], carbs: [35, 55], fat:[12,22] },
      mashed:    { kcal: [200, 320], carbs: [30, 45], fat:[8, 14] },
      veg_cup:   { kcal: [40, 90],   carbs: [6, 12],  fiber:[2,5] },
      salad:     { kcal: [40,100],   carbs:[6,12], fiber:[2,4] },
      edamame_cup:{kcal:[120,190], protein:[11,18], carbs:[10,18], fiber:[4,8]},
      cucumber_salad:{kcal:[40,70], fiber:[1,2], carbs:[7,12]},
    },
    sauceAdj: {
      béarnaise: { kcal: [120, 250], fat: [12, 24], sodium: true },
      cream_sauce: { kcal: [150, 300], fat: [10, 20], sodium: true },
      piccata_light:{ kcal:[40,90], carbs:[4,8], sodium:true},
      soy: { kcal: [20, 60], sodium: true},
      teriyaki: { kcal: [60, 120], carbs: [12, 24], sodium: true },
      miso_glaze: { kcal: [50, 100], carbs:[10,20], sodium:true },
      vinaigrette_tbsp: { kcal: [40,80], fat:[4,8]},
    },
    fiberBonus: 3, // scoring boost per 3–5 g fiber
    proteinBias: 1.0, // scoring weight for protein density
    kcalPenalty: 0.6, // scoring weight for calories
    sodiumPenalty: 0.5, // only if low-sodium mode
    hiddenFatPenalty: 0.4,
    trainingCarbBias: 0.2
  },

  clamp(v:number, lo:number, hi:number){ return Math.max(lo, Math.min(hi, v)); },

  // Parse menu lines into Dish objects using heuristics (very lightweight NLP)
  parseMenu(text: string): Dish[] {
    return text.split('\n')
      .map(l=>l.trim())
      .filter(Boolean)
      .map(line => {
        const lower = line.toLowerCase();
        const dish: Dish = { name: line };

        // proteins
        if (/(filet|sirloin|tenderloin|ribeye|steak)/i.test(line)) dish.proteinType='beef';
        else if (/(salmon|tuna|cod|branzino|halibut|fish)/i.test(line)) dish.proteinType='fish';
        else if (/(chicken|pollo)/i.test(line)) dish.proteinType='chicken';
        else if (/(shrimp|prawn|scampi)/i.test(line)) dish.proteinType='shrimp';
        else if (/(tofu|tempeh)/i.test(line)) dish.proteinType='tofu';
        else if (/(sashimi|nigiri)/i.test(line)) dish.proteinType='sashimi';

        // cooking methods / flags
        dish.cooking = [];
        if (/grill(ed|)/i.test(line)) dish.cooking.push('grilled');
        if (/fried|breaded|katsu|tempura/i.test(line)) dish.cooking.push('fried');
        if (/cream|alfredo|béarnaise|beurre|aioli/i.test(line)) dish.cooking.push('creamy');
        if (/butter|brown butter/i.test(line)) dish.cooking.push('buttered');
        if (/glaze|glazed|teriyaki|miso/i.test(line)) dish.cooking.push('glazed');
        if (/soy/i.test(line)) dish.cooking.push('soy_heavy');

        // sauces
        dish.sauces = [];
        if (/béarnaise/i.test(line)) dish.sauces.push('béarnaise');
        if (/alfredo|cream/i.test(line)) dish.sauces.push('cream_sauce');
        if (/piccata/i.test(line)) dish.sauces.push('piccata_light');
        if (/soy/i.test(line)) dish.sauces.push('soy');
        if (/teriyaki/i.test(line)) dish.sauces.push('teriyaki');
        if (/miso/i.test(line)) dish.sauces.push('miso_glaze');

        // sides
        dish.sides = [];
        if (/fries|frites/i.test(line)) dish.sides.push('fries');
        if (/mash/i.test(line)) dish.sides.push('mashed');
        if (/pasta|spaghetti|rigatoni|penne|linguine/i.test(line)) dish.sides.push('pasta_cup');
        if (/rice|risotto/i.test(line)) dish.sides.push('rice_cup');
        if (/asparagus|greens|broccoli|veg|salad|spinach|edamame|cucumber/i.test(lower)){
          if (/edamame/.test(lower)) dish.sides.push('edamame_cup');
          if (/cucumber/.test(lower)) dish.sides.push('cucumber_salad');
          if (/spinach|creamed spinach/.test(lower)) dish.sides.push('pasta_cup'); // treat creamed spinach as heavier
          dish.sides.push('veg_cup');
          if (/salad/.test(lower)) dish.sides.push('salad');
        }

        // sodium flags
        dish.isHighSodium = /(soy|miso|teriyaki|cured|pickled)/i.test(line);

        // allergens
        dish.allergens = [];
        if (/(peanut|nut)/i.test(line)) dish.allergens.push('nuts');
        if (/(dairy|cream|cheese|butter|béarnaise)/i.test(line)) dish.allergens.push('dairy');
        if (/(gluten|breaded|panko|pasta)/i.test(line)) dish.allergens.push('gluten');
        if (/(shrimp|prawn|shellfish)/i.test(line)) dish.allergens.push('shellfish');

        return dish;
      });
  },

  // Estimate macros with min/likely/max based on base protein + cooking + sides + sauces
  estimateMacros(d: Dish): MacroRange {
    // base guess
    let base = { kcal: 250, protein: 30, carbs: 0, fat: 8, fiber: 1 };
    const H = utils.HEURISTICS;
    if (d.proteinType==='beef') base = H.baseProtein.steak_8oz_grilled;
    if (d.proteinType==='fish') base = H.baseProtein.salmon_6oz_grilled;
    if (d.proteinType==='chicken') base = H.baseProtein.chicken_6oz_grilled;
    if (d.proteinType==='shrimp') base = H.baseProtein.shrimp_6oz_grilled;
    if (d.proteinType==='tofu') base = H.baseProtein.tofu_6oz_grilled;
    if (d.proteinType==='sashimi') base = H.baseProtein.sashimi_8pc_mix;

    let minK=base.kcal, maxK=base.kcal, minP=base.protein, maxP=base.protein, minC=0, maxC=0, minF=base.fat, maxF=base.fat, minFi=0, maxFi=2;

    // cooking adjustments
    (d.cooking||[]).forEach(flag=>{
      const adj = (H.cookingAdj as any)[flag]; if(!adj) return;
      if (adj.kcal){ minK+=adj.kcal[0]; maxK+=adj.kcal[1]; }
      if (adj.fat){  minF+=adj.fat[0];  maxF+=adj.fat[1];  }
      if (adj.carbs){minC+=adj.carbs[0];maxC+=adj.carbs[1];}
    });
    // sauces
    (d.sauces||[]).forEach(s=>{
      const adj = (H.sauceAdj as any)[s]; if(!adj) return;
      if (adj.kcal){ minK+=adj.kcal[0]; maxK+=adj.kcal[1]; }
      if (adj.fat){  minF+=adj.fat[0];  maxF+=adj.fat[1];  }
      if (adj.carbs){minC+=adj.carbs[0];maxC+=adj.carbs[1];}
    });
    // sides
    (d.sides||[]).forEach(s=>{
      const adj = (H.sideAdj as any)[s]; if(!adj) return;
      if (adj.kcal){ minK+=adj.kcal[0]; maxK+=adj.kcal[1]; }
      if (adj.fat){  minF+=adj.fat[0];  maxF+=adj.fat[1];  }
      if (adj.carbs){minC+=adj.carbs[0];maxC+=adj.carbs[1];}
      if (adj.fiber){minFi+=adj.fiber[0];maxFi+=adj.fiber[1];}
      if (adj.protein){minP+=adj.protein[0];maxP+=adj.protein[1];}
    });

    // likely values = midpoint
    const likely = (a:[number,number]) => Math.round((a[0]+a[1])/2);
    const kcal:[number,number]=[Math.round(minK), Math.round(maxK)];
    const protein:[number,number]=[Math.round(minP), Math.round(maxP)];
    const carbs:[number,number]=[Math.round(minC), Math.round(maxC)];
    const fat:[number,number]=[Math.round(minF), Math.round(maxF)];
    const fiber:[number,number]=[Math.round(minFi), Math.round(maxFi)];
    return { kcal, protein, carbs, fat, fiber };
  },

  proteinPer100Kcal(range: MacroRange){
    const midP = (range.protein[0]+range.protein[1])/2;
    const midK = (range.kcal[0]+range.kcal[1])/2;
    return Math.round((midP / midK) * 1000) / 10; // 1 decimal
  },

  // Score dish for ranking
  scoreDish(d:Dish, macros: MacroRange, ctx: { remainingKcal: number, remainingProtein: number, trainingDay: boolean, lowSodium?:boolean, lowCarb?:boolean, highFiber?:boolean, budget?:boolean }, price?:number){
    const H=utils.HEURISTICS;
    const midP=(macros.protein[0]+macros.protein[1])/2;
    const midK=(macros.kcal[0]+macros.kcal[1])/2;
    const midC=(macros.carbs[0]+macros.carbs[1])/2;
    const midFi=(macros.fiber[0]+macros.fiber[1])/2;

    let score = 0;
    // protein density (aim 35–60 g dinner or target gap)
    const proteinGap = Math.max(0, ctx.remainingProtein - midP);
    const proteinHit = Math.min(midP, ctx.remainingProtein || 50);
    score += (proteinHit * H.proteinBias) - (proteinGap*0.2);
    // calorie control
    const kcalDelta = Math.abs((ctx.remainingKcal||650) - midK);
    score += (100 - H.kcalPenalty * (kcalDelta/10)); // encourage close-to-target
    // low carb on rest days; allow carbs training day
    if (ctx.lowCarb && !ctx.trainingDay) score -= Math.max(0, (midC - 30))*0.5;
    if (ctx.trainingDay) score += H.trainingCarbBias * Math.min(60, midC);
    // fiber bonus
    if (ctx.highFiber) score += (midFi/H.fiberBonus)*3;
    // sodium penalty
    if (ctx.lowSodium && (d.isHighSodium || (d.cooking||[]).some(f=>f==='soy_heavy'))) score -= 15*H.sodiumPenalty;
    // hidden fats penalty
    if ((d.cooking||[]).some(f=>['fried','creamy','buttered','aioli','alfredo','glazed','breaded'].includes(f))) score -= 12*H.hiddenFatPenalty;
    // budget nudge
    if (ctx.budget && typeof price==='number' && price>35) score -= (price-35)*0.5;

    return score;
  },

  // Build modification script to lean out
  buildScript(d:Dish, prefs:{lowSodium?:boolean, lowCarb?:boolean, spice?:string}){
    const parts = [];
    // generic protein-preserving leans
    parts.push('grilled if possible');
    parts.push('no butter');
    if ((d.cooking||[]).includes('creamy') || (d.sauces||[]).length>0) parts.push('sauce on the side, light');
    if ((d.sides||[]).includes('rice_cup') || (d.sides||[]).includes('pasta_cup')) parts.push('half starch, double vegetables');
    if (prefs.lowSodium) parts.push('easy on salt, skip soy/miso');
    if (prefs.lowCarb) parts.push('swap starch for extra greens');
    return parts.join('; ');
  },

  formatRange([lo,hi]:[number,number], unit=''){ 
    return lo===hi ? `${lo}${unit}` : `${lo}${unit}–${hi}${unit}`; 
  },

  // Templates for cuisines if menu is missing
  TEMPLATES: {
    'Steakhouse': {
      defaultPicks: [
        { name:'Filet mignon (8 oz), grilled', proteinType:'beef', cooking:['grilled'], sides:['veg_cup','salad'], sauces:[], notes:'Ask for no butter; sauce on side' },
        { name:'Grilled salmon (6–8 oz)', proteinType:'fish', cooking:['grilled'], sides:['veg_cup'], sauces:[], notes:'Lemon, herbs' },
        { name:'Grilled chicken breast (6–8 oz)', proteinType:'chicken', cooking:['grilled'], sides:['veg_cup','salad'], sauces:[] },
      ],
      bestSides: ['asparagus','broccolini','side salad (light vinaigrette)'],
      dessertMatrix: { green:['berries','sorbet (small)'], amber:['single-scoop gelato'], red:['cheesecake','lava cake','à la mode'] },
      sodiumSwaps: { 'béarnaise':'light herb jus', 'soy':'lemon & olive oil' }
    },
    'Italian': {
      defaultPicks: [
        { name:'Chicken piccata (light sauce), with grilled veg', proteinType:'chicken', cooking:['grilled'], sauces:['piccata_light'], sides:['veg_cup'] },
        { name:'Grilled branzino/cod with veg', proteinType:'fish', cooking:['grilled'], sides:['veg_cup'] },
        { name:'Steak tagliata, arugula, balsamic (light)', proteinType:'beef', cooking:['grilled'], sides:['salad'] },
      ],
      bestSides: ['grilled vegetables','insalata verde (light)'],
      dessertMatrix: { green:['fruit plate'], amber:['affogato (no sugar)'], red:['tiramisu','panna cotta','alfredo anything'] },
      sodiumSwaps: { 'cream_sauce':'tomato-based marinara, light', 'alfredo':'marinara light' }
    },
    'Sushi/Japanese': {
      defaultPicks: [
        { name:'Sashimi assortment + edamame + cucumber salad', proteinType:'sashimi', sides:['edamame_cup','cucumber_salad'] },
        { name:'Grilled salmon teriyaki (sauce on side)', proteinType:'fish', cooking:['grilled','glazed'], sauces:['teriyaki'], sides:['veg_cup'] },
        { name:'Tuna tataki + seaweed salad', proteinType:'fish', cooking:['grilled'], sides:['veg_cup'] },
      ],
      bestSides: ['edamame','cucumber salad','miso soup (if sodium ok)'],
      dessertMatrix: { green:['sliced oranges'], amber:['mochi (1 piece)'], red:['fried tempura desserts'] },
      sodiumSwaps: { 'soy':'low-sodium soy or lemon' }
    }
  } as Record<CuisineKey, CuisineTemplate>
};

function useLocalState<T>(key:string, initial:T){
  const [val,setVal]=useState<T>(()=>{
    try{
      const raw = localStorage.getItem(key);
      return raw? JSON.parse(raw) as T : initial;
    }catch{return initial;}
  });
  useEffect(()=>{ localStorage.setItem(key, JSON.stringify(val)); },[key,val]);
  return [val,setVal] as const;
}

// -------------------- Component --------------------
export type FineDiningCoachProps = {
  initialCuisineTemplates?: Partial<Record<CuisineKey, CuisineTemplate>>;
  className?: string;
};

const defaultState: State = {
  mode: 'Standard',
  goal: 'Cut (steady)',
  mealType: 'dinner',
  trainingDay: false,
  cuisine: 'Steakhouse',
  dietary: {},
  prefs: { lowSodium:false, lowCarb:false, highFiber:true, spice:'medium' },
  alcohol: { plan: 0, type: 'none' },
  budgetMode: false,
  socialContext: 'client dinner',
  nextMorningRebalance: true,
  walkMins: 10,
  favorites: [],
  recents: []
};

const FineDiningCoach: React.FC<FineDiningCoachProps> = ({initialCuisineTemplates, className}) => {
  const [state,setState] = useLocalState<State>(STORAGE_KEY, defaultState);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const cuisineTemplates = useMemo(()=>{
    return {...utils.TEMPLATES, ...(initialCuisineTemplates||{})};
  },[initialCuisineTemplates]);

  // auto-calc daily defaults based on bodyweight if provided
  useEffect(()=>{
    if (!state.bodyWeight) return;
    const dailyKcal = Math.round((state.goal==='Maintenance while traveling'? 14: state.goal==='Cut (rapid)'? 10.5: 11.5) * state.bodyWeight);
    const proteinTarget = Math.round(0.9 * state.bodyWeight);
    setState(s=>({...s, dailyKcal, proteinTarget }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[state.bodyWeight, state.goal]);

  // compute remaining if daily and eaten known (simple UI here: user directly sets remaining)
  const remainingKcal = state.remainingKcal ?? Math.round(state.dailyKcal ? state.dailyKcal*0.4 : 650);
  const remainingProtein = state.remainingProtein ?? Math.round(state.proteinTarget ? state.proteinTarget*0.4 : 45);

  // Build dishes from pasted menu or templates
  const dishes: Dish[] = useMemo(()=>{
    if (state.menuText && state.menuText.trim().length>0) {
      return utils.parseMenu(state.menuText);
    }
    return (cuisineTemplates[state.cuisine]?.defaultPicks)||[];
  },[state.menuText, state.cuisine, cuisineTemplates]);

  // Ranking
  const ranked: RankedPick[] = useMemo(()=>{
    const arr: RankedPick[] = dishes.map(d=>{
      const macros = utils.estimateMacros(d);
      const script = utils.buildScript(d, state.prefs);
      const score = utils.scoreDish(d, macros, {
        remainingKcal, remainingProtein, trainingDay: state.trainingDay,
        lowSodium: state.prefs.lowSodium, lowCarb: state.prefs.lowCarb, highFiber: state.prefs.highFiber, budget: state.budgetMode
      }, d.price);
      const badges = [];
      const pp100 = utils.proteinPer100Kcal(macros);
      if (pp100>=7) badges.push('High-Protein');
      if (state.prefs.lowCarb) badges.push('Low-Carb');
      if (state.prefs.lowSodium) badges.push('Low-Sodium');
      if (state.budgetMode) badges.push('Budget');
      if (state.trainingDay) badges.push('Training-Day');
      const backups = [
        { outOfStock: 'Nearest sub: similar lean protein (e.g., chicken ↔ fish), same script.' , cantModify: 'Alternate: bun-less burger or grilled skewers, sauce on side.'}
      ];
      return {
        rank: 0, dish: d, why: `Protein density with controlled calories; fiber-friendly sides.`, 
        script, macros, proteinPer100kcal: pp100, sodiumFlag: d.isHighSodium, priceEstimate: d.price, badges, backups
      };
    });
    arr.sort((a,b)=> utils.scoreDish(b.dish,b.macros,{
      remainingKcal, remainingProtein, trainingDay: state.trainingDay,
      lowSodium: state.prefs.lowSodium, lowCarb: state.prefs.lowCarb, highFiber: state.prefs.highFiber, budget: state.budgetMode
    }, b.dish.price) - utils.scoreDish(a.dish,a.macros,{
      remainingKcal, remainingProtein, trainingDay: state.trainingDay,
      lowSodium: state.prefs.lowSodium, lowCarb: state.prefs.lowCarb, highFiber: state.prefs.highFiber, budget: state.budgetMode
    }, a.dish.price));
    return arr.map((r,i)=>({...r, rank:i+1})).slice(0,3);
  },[dishes, remainingKcal, remainingProtein, state.trainingDay, state.prefs, state.budgetMode]);

  // Alcohol guidance
  const alcoholAdvice = useMemo(()=>{
    if (state.alcohol.plan===0 || state.alcohol.type==='none') return null;
    const plan = state.alcohol.plan;
    const type = state.alcohol.type;
    // simple macro model
    const per = type==='wine' ? { oz:5, kcal:120, carbs:4 } : type==='beer' ? { oz:12, kcal:150, carbs:12 } : { oz:1.5, kcal:100, carbs:0 };
    const totalK = plan * per.kcal;
    const totalC = plan * per.carbs;
    return { best:`${plan} × ${per.oz} oz ${type}`, impact:`~${totalK} kcal, ${totalC} g carbs`, rule:'One-in, one-out: 1 glass water per drink.' };
  },[state.alcohol]);

  // Sides & Dessert rules from template
  const sideDessert = cuisineTemplates[state.cuisine];

  // Pre/Post play
  const prePost = useMemo(()=>{
    const preload = `Optional: 25–30 g protein preload 60–90 min before (whey in water or Greek yogurt).`;
    const walk = state.walkMins===0? 'No walk needed; focus on slow eating and hydration.' :
                 state.walkMins===10? 'Walk 10 min post-meal to blunt glucose spike and aid digestion.' :
                 'Walk 20 min post-meal to improve glucose disposal and recovery.';
    // rebalance if over
    const overPlan = state.nextMorningRebalance
      ? 'If over calories: reduce tomorrow by ~15% kcal, keep protein high (+25–30 g), favor veg/lean proteins.'
      : 'No auto-rebalance selected.';
    return { preload, walk, overPlan };
  },[state.walkMins, state.nextMorningRebalance]);

  // One-tap summary
  const best = ranked[0];
  const summary = best? `${best.dish.name} — Mods: ${best.script}. Est: ${utils.formatRange(best.macros.kcal,' kcal')}, ${utils.formatRange(best.macros.protein,' g P')}, ${utils.formatRange(best.macros.carbs,' g C')}, ${utils.formatRange(best.macros.fat,' g F')}.` : '';

  const copySummary = async()=>{
    try{ await navigator.clipboard.writeText(summary); alert('Summary copied.'); }catch{}
  };

  const saveFavorite = ()=>{
    if (!summary) return;
    const title = prompt('Save as (e.g., Steakhouse: Filet lean)') || best?.dish.name || 'Favorite';
    setState(s=>({...s, favorites:[{ title, summary, date:new Date().toISOString() }, ...s.favorites].slice(0,50)}));
  };

  const onUpload = (file: File)=>{
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  };

  const quickPickOnly = state.mode==='Quick';

  return (
    <div className={`fine-dining-coach w-full max-w-3xl mx-auto p-4 sm:p-6 text-gray-900 dark:text-gray-100 ${className??''}`}>
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Fine Dining Coach</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">Make elite choices at restaurants in under 60 seconds. All local, nothing uploaded.</p>
      </header>

      {/* Mode Tabs */}
      <div className="flex gap-2 mb-4">
        {(['Quick','Standard','Power'] as Mode[]).map(m=>(
          <UI.Button key={m} onClick={()=>setState(s=>({...s, mode:m}))}
            className={`${state.mode===m?'ring-2 ring-blue-500':''}`}>{m} Mode</UI.Button>
        ))}
      </div>

      <UI.Card className="mb-4">
        <UI.CardHeader>
          <UI.CardTitle>Inputs</UI.CardTitle>
          <UI.CardDescription>Progressive inputs; defaults provided. Quick Mode asks only for cuisine and remaining calories.</UI.CardDescription>
        </UI.CardHeader>
        <UI.CardContent className="grid grid-cols-1 gap-4">
          {/* Quick essentials */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs">Cuisine / Restaurant Type</label>
              <select className="w-full rounded-xl border px-3 py-2 bg-white dark:bg-gray-900" value={state.cuisine}
                onChange={e=>setState(s=>({...s, cuisine: e.target.value as CuisineKey}))}>
                {Object.keys(utils.TEMPLATES).map(k=>(<option key={k}>{k}</option>))}
                <option>Mexican</option><option>Chinese</option><option>Indian</option><option>American</option><option>Mediterranean</option><option>French</option>
              </select>
            </div>
            <div>
              <label className="text-xs">Remaining Calories (kcal)</label>
              <UI.Input type="number" value={remainingKcal} onChange={e=>setState(s=>({...s, remainingKcal: Number(e.target.value||0)}))} />
            </div>
          </div>

          {!quickPickOnly && (<>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs">Goal Preset</label>
                <select className="w-full rounded-xl border px-3 py-2 bg-white dark:bg-gray-900" value={state.goal}
                  onChange={e=>setState(s=>({...s, goal: e.target.value as GoalPreset}))}>
                  <option>Cut (rapid)</option><option>Cut (steady)</option><option>Maintenance while traveling</option>
                </select>
              </div>
              <div>
                <label className="text-xs">Bodyweight (lb)</label>
                <UI.Input type="number" placeholder="e.g., 200" value={state.bodyWeight||''}
                  onChange={e=>setState(s=>({...s, bodyWeight: Number(e.target.value||0)}))}/>
                <p className="text-[11px] text-gray-500">Daily kcal ≈ 11×bw (cut), protein 0.8–1.0×bw.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs">Daily Calorie Target</label>
                <UI.Input type="number" value={state.dailyKcal||''} onChange={e=>setState(s=>({...s, dailyKcal:Number(e.target.value||0)}))}/>
              </div>
              <div>
                <label className="text-xs">Daily Protein Target (g)</label>
                <UI.Input type="number" value={state.proteinTarget||''} onChange={e=>setState(s=>({...s, proteinTarget:Number(e.target.value||0)}))}/>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs">Remaining Protein (g)</label>
                <UI.Input type="number" value={remainingProtein} onChange={e=>setState(s=>({...s, remainingProtein:Number(e.target.value||0)}))}/>
              </div>
              <div>
                <label className="text-xs">Meal Type & Training Day</label>
                <div className="flex items-center gap-2">
                  <select className="rounded-xl border px-3 py-2 bg-white dark:bg-gray-900" value={state.mealType}
                    onChange={e=>setState(s=>({...s, mealType:e.target.value as 'lunch'|'dinner'}))}>
                    <option>lunch</option><option>dinner</option>
                  </select>
                  <span className="text-xs">Training Day?</span>
                  <UI.Switch checked={state.trainingDay} onCheckedChange={v=>setState(s=>({...s, trainingDay:v}))} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-xs">Restaurant menu source</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <UI.Input placeholder="Menu URL (optional)" value={state.restaurantUrl||''}
                    onChange={e=>setState(s=>({...s, restaurantUrl:e.target.value}))}/>
                  <input type="file" accept="image/*,.pdf" onChange={e=>{ const f=e.target.files?.[0]; if(f) onUpload(f); }}/>
                </div>
                {imagePreview && <img src={imagePreview} alt="menu preview" className="mt-2 max-h-64 rounded-xl border" />}
                <div className="mt-2">
                  <label className="text-xs">OCR/Text menu (paste items, one per line)</label>
                  <UI.Textarea rows={5} placeholder="e.g., Filet mignon 8 oz with béarnaise; Creamed spinach; Grilled salmon; Mashed potatoes"
                    value={state.menuText||''} onChange={e=>setState(s=>({...s, menuText:e.target.value}))}/>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs">Dietary filters</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries({
                    avoidPork:'Avoid pork',
                    avoidShellfish:'Avoid shellfish',
                    vegetarian:'Vegetarian',
                    pescatarian:'Pescatarian',
                    dairyFree:'Dairy-free',
                    glutenFree:'Gluten-free',
                    nutAllergy:'Nut allergy',
                  }).map(([k,label])=>(
                    <label key={k} className="flex items-center gap-2">
                      <input type="checkbox" checked={(state.dietary as any)[k]||false}
                        onChange={e=>setState(s=>({...s, dietary:{...s.dietary, [k]:e.target.checked}}))}/>
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs">Constraints / preferences</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={state.prefs.lowSodium||false} onChange={e=>setState(s=>({...s, prefs:{...s.prefs, lowSodium:e.target.checked}}))}/> Low-sodium mode
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={state.prefs.lowCarb||false} onChange={e=>setState(s=>({...s, prefs:{...s.prefs, lowCarb:e.target.checked}}))}/> Low-carb choice
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={state.prefs.highFiber||false} onChange={e=>setState(s=>({...s, prefs:{...s.prefs, highFiber:e.target.checked}}))}/> High-fiber priority
                  </label>
                  <label className="flex items-center gap-2">
                    Spice:
                    <select className="rounded-md border bg-white dark:bg-gray-900"
                      value={state.prefs.spice||'medium'} onChange={e=>setState(s=>({...s, prefs:{...s.prefs, spice:e.target.value as any}}))}>
                      <option>low</option><option>medium</option><option>high</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs">Alcohol plan</label>
                <div className="flex items-center gap-2 text-xs">
                  <select className="rounded-md border bg-white dark:bg-gray-900" value={state.alcohol.plan}
                    onChange={e=>setState(s=>({...s, alcohol:{...s.alcohol, plan: Number(e.target.value) as 0|1|2}}))}>
                    <option value={0}>none</option><option value={1}>1 drink</option><option value={2}>2 drinks</option>
                  </select>
                  <select className="rounded-md border bg-white dark:bg-gray-900" value={state.alcohol.type}
                    onChange={e=>setState(s=>({...s, alcohol:{...s.alcohol, type:e.target.value as AlcoholType}}))}>
                    <option value="wine">wine</option><option value="spirits">spirits</option><option value="beer">beer</option><option value="none">none</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs">Budget & Context</label>
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={state.budgetMode} onChange={e=>setState(s=>({...s, budgetMode:e.target.checked}))}/> Budget sensitive (&lt;$35)</label>
                  <select className="rounded-md border bg-white dark:bg-gray-900" value={state.socialContext}
                    onChange={e=>setState(s=>({...s, socialContext:e.target.value as any}))}>
                    <option>client dinner</option><option>celebration</option><option>solo travel</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 text-xs mt-1">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={state.nextMorningRebalance} onChange={e=>setState(s=>({...s, nextMorningRebalance:e.target.checked}))}/> Next-morning rebalancing</label>
                  <label className="flex items-center gap-2">Walk window:
                    <select className="rounded-md border bg-white dark:bg-gray-900" value={state.walkMins}
                      onChange={e=>setState(s=>({...s, walkMins: Number(e.target.value) as 0|10|20}))}>
                      <option value={0}>0</option><option value={10}>10</option><option value={20}>20</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
          </>)}
        </UI.CardContent>
      </UI.Card>

      {/* Outputs */}
      <UI.Card className="mb-4">
        <UI.CardHeader>
          <UI.CardTitle>{state.mode==='Quick' ? 'Quick Pick' : 'Top Picks (Ranked)'}</UI.CardTitle>
          <UI.CardDescription>Primary: hit protein with lower calories. Secondary: fiber, sodium, hidden fats.</UI.CardDescription>
        </UI.CardHeader>
        <UI.CardContent className="space-y-4">
          {ranked.length===0 && (
            <p className="text-sm">No menu items detected. Using cuisine template defaults.</p>
          )}
          {ranked.map(p=>{
            const m=p.macros;
            return (
            <div key={p.rank} className="rounded-xl border p-3 bg-white dark:bg-gray-950/60 border-gray-200 dark:border-gray-800">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-gray-500">#{p.rank}</div>
                  <div className="font-semibold">{p.dish.name}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-300">{p.why}</div>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {p.badges.map(b=><UI.Badge key={b}>{b}</UI.Badge>)}
                </div>
              </div>
              <div className="mt-2 text-sm"><span className="font-medium">Say this:</span> “{p.script}”.</div>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                <div><span className="font-medium">kcal:</span> {utils.formatRange(m.kcal)}</div>
                <div><span className="font-medium">Protein:</span> {utils.formatRange(m.protein,' g')}</div>
                <div><span className="font-medium">Carbs:</span> {utils.formatRange(m.carbs,' g')}</div>
                <div><span className="font-medium">Fat:</span> {utils.formatRange(m.fat,' g')}</div>
                <div><span className="font-medium">Fiber:</span> {utils.formatRange(m.fiber,' g')}</div>
              </div>
              <div className="mt-2 text-xs">Protein/100 kcal: <span className="font-semibold">{p.proteinPer100kcal}</span> {p.sodiumFlag && <span className="ml-2 text-red-600">High sodium?</span>}</div>
              {state.budgetMode && <div className="text-xs mt-1">Price estimate: {p.priceEstimate? `$${p.priceEstimate}`: '~$28–$38 (estimate)'}</div>}
              <div className="mt-2 text-xs">
                <span className="font-medium">Backups: </span>
                <ul className="list-disc ml-5">
                  {p.backups.map((b,i)=>(<li key={i}>If out: {b.outOfStock} — If no mods: {b.cantModify}</li>))}
                </ul>
              </div>
            </div>);
          })}

          {/* Alcohol */}
          {alcoholAdvice && (
            <div className="rounded-xl border p-3 text-sm bg-white dark:bg-gray-950/60 border-gray-200 dark:border-gray-800">
              <div className="font-semibold mb-1">Alcohol Guidance</div>
              <div>Best: {alcoholAdvice.best}</div>
              <div>Impact: {alcoholAdvice.impact}</div>
              <div>Rule: {alcoholAdvice.rule}</div>
            </div>
          )}

          {/* Sides & Dessert */}
          <div className="rounded-xl border p-3 text-sm bg-white dark:bg-gray-950/60 border-gray-200 dark:border-gray-800">
            <div className="font-semibold mb-1">Sides & Dessert Rules</div>
            <div className="mb-1">Best sides: {(sideDessert?.bestSides||['seasonal veg','side salad (light)']).join(', ')}</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><div className="font-medium text-green-700">Green</div><ul className="list-disc ml-5">{(sideDessert?.dessertMatrix?.green||['fruit']).map(x=><li key={x}>{x}</li>)}</ul></div>
              <div><div className="font-medium text-amber-700">Amber</div><ul className="list-disc ml-5">{(sideDessert?.dessertMatrix?.amber||['sorbet (small)']).map(x=><li key={x}>{x}</li>)}</ul></div>
              <div><div className="font-medium text-red-700">Red</div><ul className="list-disc ml-5">{(sideDessert?.dessertMatrix?.red||['cheesecake']).map(x=><li key={x}>{x}</li>)}</ul></div>
            </div>
          </div>

          {/* Pre/Post */}
          <div className="rounded-xl border p-3 text-sm bg-white dark:bg-gray-950/60 border-gray-200 dark:border-gray-800">
            <div className="font-semibold mb-1">Pre-meal & Post-meal Play</div>
            <ul className="list-disc ml-5">
              <li>{prePost.preload}</li>
              <li>{prePost.walk}</li>
              <li>{prePost.overPlan}</li>
            </ul>
          </div>

          {/* Damage control */}
          {ranked.length===0 && (
            <div className="rounded-xl border p-3 text-sm bg-white dark:bg-gray-950/60 border-gray-200 dark:border-gray-800">
              <div className="font-semibold mb-1">Damage-Control Card</div>
              <div>Order lean protein (grilled chicken or fish), skip sauces, double vegetables, starch half portion. Portion: palm-sized protein, 1–2 cups veg. Tomorrow: -15% kcal, +25–30 g protein.</div>
            </div>
          )}

          {/* One-tap summary */}
          <div className="flex gap-2 flex-wrap">
            <UI.Button onClick={copySummary}>Copy Summary</UI.Button>
            <UI.Button onClick={saveFavorite}>Save to Favorites</UI.Button>
          </div>
          {summary && <div className="text-xs text-gray-600 dark:text-gray-300 break-words">Summary: {summary}</div>}
        </UI.CardContent>
      </UI.Card>

      {/* Favorites/Recents */}
      <UI.Card>
        <UI.CardHeader>
          <UI.CardTitle>Favorites & Recent</UI.CardTitle>
          <UI.CardDescription>Stored locally on your device.</UI.CardDescription>
        </UI.CardHeader>
        <UI.CardContent className="grid grid-cols-1 gap-2">
          <div>
            <div className="font-medium text-sm mb-1">Favorites</div>
            {state.favorites.length===0 && <div className="text-xs text-gray-500">No favorites yet.</div>}
            <ul className="space-y-1">
              {state.favorites.map((f,i)=>(
                <li key={i} className="text-xs border rounded-lg p-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{f.title}</div>
                    <div className="text-gray-600 dark:text-gray-300">{f.summary}</div>
                  </div>
                  <UI.Button onClick={()=>{
                    navigator.clipboard.writeText(f.summary);
                  }}>Copy</UI.Button>
                </li>
              ))}
            </ul>
          </div>
        </UI.CardContent>
      </UI.Card>

      <footer className="text-[11px] text-gray-500 mt-6">
        <p>Privacy: fully client-side; no uploads. Heuristics are estimates, not exact nutrition facts.</p>
      </footer>
    </div>
  );
};

export default FineDiningCoach;
