import type {
  FashionMood,
  FashionOccasion,
  FashionRecommendationItem,
} from "./fashion-types";

interface FashionTemplate {
  headline: string;
  palette: string[];
  silhouette: string;
  items: FashionRecommendationItem[];
}

const baseItems = {
  outer: {
    slot: "outer",
    brandName: null,
    productUrl: null,
  },
  top: {
    slot: "top",
    brandName: null,
    productUrl: null,
  },
  bottom: {
    slot: "bottom",
    brandName: null,
    productUrl: null,
  },
  shoes: {
    slot: "shoes",
    brandName: null,
    productUrl: null,
  },
  accessory: {
    slot: "accessory",
    brandName: null,
    productUrl: null,
  },
} as const;

const templates: Record<FashionOccasion, Record<FashionMood, FashionTemplate>> = {
  daily: {
    minimal: {
      headline: "Clean daily uniform",
      palette: ["ivory", "charcoal", "washed blue"],
      silhouette: "Straight clean line with a soft shoulder and balanced volume.",
      items: [
        { ...baseItems.outer, name: "Light cropped jacket", description: "A simple waist-length jacket that keeps the hairstyle visible.", color: "charcoal", fit: "regular", material: "cotton twill" },
        { ...baseItems.top, name: "Fine knit tee", description: "A smooth neckline that does not compete with the hair silhouette.", color: "ivory", fit: "regular", material: "fine rib knit" },
        { ...baseItems.bottom, name: "Straight denim", description: "A clean straight leg that balances the upper body.", color: "washed blue", fit: "straight", material: "denim" },
        { ...baseItems.shoes, name: "Low-profile sneakers", description: "A quiet shoe shape for everyday movement.", color: "white", fit: "standard", material: "leather mix" },
        { ...baseItems.accessory, name: "Slim belt watch set", description: "Small accents that keep the look polished.", color: "black and silver", fit: "compact", material: "leather and metal" },
      ],
    },
    trendy: {
      headline: "Modern street daily",
      palette: ["graphite", "cream", "sage"],
      silhouette: "Relaxed top volume with a grounded lower half.",
      items: [
        { ...baseItems.outer, name: "Utility blouson", description: "Pocket detail adds styling weight below the hair.", color: "sage", fit: "relaxed", material: "nylon cotton" },
        { ...baseItems.top, name: "Boxy half-sleeve top", description: "A boxy shape creates a current casual proportion.", color: "cream", fit: "relaxed", material: "cotton jersey" },
        { ...baseItems.bottom, name: "Wide tapered pants", description: "Volume at the leg keeps the outfit intentional.", color: "graphite", fit: "wide tapered", material: "cotton blend" },
        { ...baseItems.shoes, name: "Chunky runner", description: "Adds a contemporary base without looking formal.", color: "silver grey", fit: "standard", material: "mesh and suede" },
        { ...baseItems.accessory, name: "Nylon crossbody", description: "A practical accent that finishes the street mood.", color: "black", fit: "small", material: "nylon" },
      ],
    },
    soft: {
      headline: "Soft casual balance",
      palette: ["oatmeal", "dusty rose", "warm grey"],
      silhouette: "Gentle drape with a neat waist line.",
      items: [
        { ...baseItems.outer, name: "Soft cardigan", description: "Frames the face with a calm texture.", color: "oatmeal", fit: "regular", material: "wool blend" },
        { ...baseItems.top, name: "Scoop neck jersey", description: "Opens the neckline gently for a lighter impression.", color: "warm white", fit: "regular", material: "modal cotton" },
        { ...baseItems.bottom, name: "A-line midi skirt or relaxed slacks", description: "Creates an easy, approachable lower silhouette.", color: "warm grey", fit: "soft A-line", material: "poly rayon" },
        { ...baseItems.shoes, name: "Round-toe flats", description: "Keeps the styling light and wearable.", color: "dusty rose", fit: "standard", material: "soft leather" },
        { ...baseItems.accessory, name: "Small hoop earrings", description: "Adds light near the face without hiding the hair.", color: "gold", fit: "small", material: "metal" },
      ],
    },
    classic: {
      headline: "Relaxed classic daily",
      palette: ["navy", "white", "camel"],
      silhouette: "Structured basics with a relaxed finish.",
      items: [
        { ...baseItems.outer, name: "Single breasted casual blazer", description: "Adds structure while staying easy for daytime.", color: "navy", fit: "regular", material: "cotton linen" },
        { ...baseItems.top, name: "Crisp crewneck tee", description: "A clean base for classic layering.", color: "white", fit: "regular", material: "cotton" },
        { ...baseItems.bottom, name: "Chino trousers", description: "Keeps the look neat without becoming office-heavy.", color: "camel", fit: "straight", material: "cotton twill" },
        { ...baseItems.shoes, name: "Penny loafers", description: "A timeless shoe that sharpens casual styling.", color: "brown", fit: "standard", material: "leather" },
        { ...baseItems.accessory, name: "Leather tote", description: "A practical classic finish.", color: "dark brown", fit: "medium", material: "leather" },
      ],
    },
  },
  work: {
    minimal: {
      headline: "Sharp work minimal",
      palette: ["black", "white", "stone"],
      silhouette: "Vertical lines with restrained shoulder structure.",
      items: [
        { ...baseItems.outer, name: "Collarless blazer", description: "Clean front lines keep the face and hair as the focus.", color: "black", fit: "regular", material: "wool blend" },
        { ...baseItems.top, name: "Silky shell top", description: "Smooth texture reads polished under a jacket.", color: "white", fit: "regular", material: "satin crepe" },
        { ...baseItems.bottom, name: "Tailored straight trousers", description: "A stable office base with lengthening lines.", color: "stone", fit: "straight", material: "poly wool" },
        { ...baseItems.shoes, name: "Square-toe loafers", description: "Professional but comfortable for repeat wear.", color: "black", fit: "standard", material: "leather" },
        { ...baseItems.accessory, name: "Slim metal watch", description: "A precise accent for the work mood.", color: "silver", fit: "compact", material: "metal" },
      ],
    },
    trendy: {
      headline: "Creative office mix",
      palette: ["ink", "soft blue", "taupe"],
      silhouette: "Tailored base with one directional item.",
      items: [
        { ...baseItems.outer, name: "Oversized blazer", description: "A modern jacket shape that still feels work-ready.", color: "ink", fit: "relaxed", material: "wool blend" },
        { ...baseItems.top, name: "Fine striped shirt", description: "Adds visual rhythm near the neckline.", color: "soft blue", fit: "regular", material: "cotton poplin" },
        { ...baseItems.bottom, name: "Pleated wide trousers", description: "Trend-forward volume with office structure.", color: "taupe", fit: "wide", material: "poly rayon" },
        { ...baseItems.shoes, name: "Minimal heeled boots", description: "Sharpens the lower line.", color: "black", fit: "standard", material: "leather" },
        { ...baseItems.accessory, name: "Structured shoulder bag", description: "Keeps the outfit practical and composed.", color: "black", fit: "medium", material: "leather" },
      ],
    },
    soft: {
      headline: "Warm professional polish",
      palette: ["cream", "mauve", "mocha"],
      silhouette: "Soft tailoring with warm color contrast.",
      items: [
        { ...baseItems.outer, name: "Soft lapel blazer", description: "A less rigid jacket that suits softer styling.", color: "mocha", fit: "regular", material: "brushed twill" },
        { ...baseItems.top, name: "Drape blouse", description: "Adds movement without distracting from the hair.", color: "cream", fit: "regular", material: "rayon" },
        { ...baseItems.bottom, name: "Tapered slacks", description: "Keeps the outfit clean and reliable.", color: "warm grey", fit: "tapered", material: "poly blend" },
        { ...baseItems.shoes, name: "Low block heels", description: "A comfortable polished base.", color: "mauve beige", fit: "standard", material: "suede" },
        { ...baseItems.accessory, name: "Pearl stud earrings", description: "Soft light around the face.", color: "pearl", fit: "small", material: "pearl" },
      ],
    },
    classic: {
      headline: "Executive classic",
      palette: ["navy", "ivory", "burgundy"],
      silhouette: "Defined shoulders and long leg line.",
      items: [
        { ...baseItems.outer, name: "Two-button blazer", description: "A reliable jacket for a composed impression.", color: "navy", fit: "tailored", material: "wool blend" },
        { ...baseItems.top, name: "Ivory button-down shirt", description: "A classic neckline that frames the hair neatly.", color: "ivory", fit: "regular", material: "cotton" },
        { ...baseItems.bottom, name: "Pressed trousers", description: "A clean crease lengthens the overall silhouette.", color: "navy", fit: "straight", material: "wool blend" },
        { ...baseItems.shoes, name: "Polished loafers", description: "Traditional and grounded.", color: "burgundy", fit: "standard", material: "leather" },
        { ...baseItems.accessory, name: "Structured brief tote", description: "Completes a classic work profile.", color: "black", fit: "medium", material: "leather" },
      ],
    },
  },
  date: {
    minimal: {
      headline: "Quiet date polish",
      palette: ["black", "cream", "soft grey"],
      silhouette: "Simple fitted top with clean lower movement.",
      items: [
        { ...baseItems.outer, name: "Short wool jacket", description: "Keeps proportions neat and the hairstyle visible.", color: "black", fit: "regular", material: "wool blend" },
        { ...baseItems.top, name: "Knit boat-neck top", description: "A soft neckline adds subtle interest.", color: "cream", fit: "slim regular", material: "fine knit" },
        { ...baseItems.bottom, name: "Clean midi skirt or slim trouser", description: "A refined lower piece for a calm date look.", color: "soft grey", fit: "straight", material: "poly rayon" },
        { ...baseItems.shoes, name: "Slingback shoes", description: "Light and polished without looking formal.", color: "black", fit: "standard", material: "leather" },
        { ...baseItems.accessory, name: "Delicate necklace", description: "Adds a small focal point below the face.", color: "silver", fit: "fine", material: "metal" },
      ],
    },
    trendy: {
      headline: "Confident date styling",
      palette: ["espresso", "ice blue", "black"],
      silhouette: "Defined waist with one statement texture.",
      items: [
        { ...baseItems.outer, name: "Faux leather jacket", description: "Adds a confident edge around the hairstyle.", color: "espresso", fit: "cropped", material: "faux leather" },
        { ...baseItems.top, name: "Asymmetric knit top", description: "A modern neckline creates a memorable profile.", color: "black", fit: "slim", material: "rib knit" },
        { ...baseItems.bottom, name: "Dark straight denim", description: "Grounds the look and keeps it wearable.", color: "ice blue black wash", fit: "straight", material: "denim" },
        { ...baseItems.shoes, name: "Pointed ankle boots", description: "Sharpens the outfit line.", color: "black", fit: "standard", material: "leather" },
        { ...baseItems.accessory, name: "Mini shoulder bag", description: "Adds a date-night scale accent.", color: "black", fit: "mini", material: "leather" },
      ],
    },
    soft: {
      headline: "Romantic soft look",
      palette: ["blush", "cream", "cocoa"],
      silhouette: "Soft neckline and flowing bottom.",
      items: [
        { ...baseItems.outer, name: "Boucle cardigan jacket", description: "Soft texture works well with gentle hairstyles.", color: "cream", fit: "regular", material: "boucle knit" },
        { ...baseItems.top, name: "Soft V-neck knit", description: "Opens the neckline naturally.", color: "blush", fit: "regular", material: "cashmere blend" },
        { ...baseItems.bottom, name: "Flowing midi skirt", description: "Adds movement to the full-body image.", color: "cocoa", fit: "A-line", material: "satin" },
        { ...baseItems.shoes, name: "Mary Jane flats", description: "Keeps the mood sweet and balanced.", color: "brown", fit: "standard", material: "leather" },
        { ...baseItems.accessory, name: "Soft ribbon hair-friendly accent bag", description: "A gentle accessory without covering the hair.", color: "cream", fit: "small", material: "satin" },
      ],
    },
    classic: {
      headline: "Timeless dinner look",
      palette: ["black", "champagne", "deep red"],
      silhouette: "Elegant vertical line with subtle shine.",
      items: [
        { ...baseItems.outer, name: "Long tailored coat", description: "Creates a refined entrance and long body line.", color: "black", fit: "tailored", material: "wool" },
        { ...baseItems.top, name: "Satin blouse", description: "Soft shine flatters evening lighting.", color: "champagne", fit: "regular", material: "satin" },
        { ...baseItems.bottom, name: "Slim long skirt or trousers", description: "A timeless lower line.", color: "black", fit: "slim straight", material: "crepe" },
        { ...baseItems.shoes, name: "Classic pumps", description: "Polished and date-ready.", color: "deep red", fit: "standard", material: "leather" },
        { ...baseItems.accessory, name: "Small clutch", description: "Formal scale without excess detail.", color: "black", fit: "small", material: "satin" },
      ],
    },
  },
  formal: {
    minimal: {
      headline: "Minimal formal set",
      palette: ["black", "white", "silver"],
      silhouette: "Long vertical blocks with a clean neckline.",
      items: [
        { ...baseItems.outer, name: "Long formal blazer", description: "Creates a clean frame for the hair.", color: "black", fit: "tailored", material: "wool blend" },
        { ...baseItems.top, name: "White dress shirt", description: "A crisp formal base.", color: "white", fit: "regular", material: "cotton poplin" },
        { ...baseItems.bottom, name: "Full-length tailored trousers", description: "Lengthens the body line.", color: "black", fit: "straight", material: "wool blend" },
        { ...baseItems.shoes, name: "Black formal loafers", description: "Quiet and polished.", color: "black", fit: "standard", material: "leather" },
        { ...baseItems.accessory, name: "Silver tie bar or slim bracelet", description: "One precise formal accent.", color: "silver", fit: "small", material: "metal" },
      ],
    },
    trendy: {
      headline: "Fashion-forward formal",
      palette: ["midnight", "pearl", "smoke"],
      silhouette: "Structured formal base with modern width.",
      items: [
        { ...baseItems.outer, name: "Double-breasted blazer", description: "A strong shape for a modern formal impression.", color: "midnight", fit: "structured", material: "wool" },
        { ...baseItems.top, name: "Pearl satin top", description: "Adds formal shine under tailoring.", color: "pearl", fit: "regular", material: "satin" },
        { ...baseItems.bottom, name: "Wide formal trousers", description: "Modern volume while staying ceremonial.", color: "smoke", fit: "wide", material: "crepe" },
        { ...baseItems.shoes, name: "Sharp dress boots", description: "Keeps the look directional.", color: "black", fit: "standard", material: "leather" },
        { ...baseItems.accessory, name: "Geometric brooch", description: "A controlled statement near the jacket line.", color: "silver", fit: "small", material: "metal" },
      ],
    },
    soft: {
      headline: "Soft formal elegance",
      palette: ["dove grey", "ivory", "rose gold"],
      silhouette: "Fluid formal pieces with a gentle waist line.",
      items: [
        { ...baseItems.outer, name: "Draped formal jacket", description: "Formal without harsh edges.", color: "dove grey", fit: "regular", material: "crepe" },
        { ...baseItems.top, name: "Ivory cowl-neck top", description: "Soft drape supports a graceful mood.", color: "ivory", fit: "regular", material: "satin" },
        { ...baseItems.bottom, name: "Long fluid skirt or trousers", description: "Elegant movement for a full-body image.", color: "dove grey", fit: "fluid", material: "satin crepe" },
        { ...baseItems.shoes, name: "Low metallic heels", description: "Formal shine with comfort.", color: "rose gold", fit: "standard", material: "metallic leather" },
        { ...baseItems.accessory, name: "Pearl drop earrings", description: "Frames the face softly.", color: "pearl", fit: "small", material: "pearl" },
      ],
    },
    classic: {
      headline: "Classic ceremony formal",
      palette: ["black", "ivory", "gold"],
      silhouette: "Timeless tailoring and balanced shine.",
      items: [
        { ...baseItems.outer, name: "Classic tuxedo jacket", description: "A formal frame with strong confidence.", color: "black", fit: "tailored", material: "wool" },
        { ...baseItems.top, name: "Ivory formal blouse or shirt", description: "Clean and ceremonial.", color: "ivory", fit: "regular", material: "silk cotton" },
        { ...baseItems.bottom, name: "Pressed formal trousers", description: "A timeless, elongated lower line.", color: "black", fit: "straight", material: "wool" },
        { ...baseItems.shoes, name: "Polished dress shoes", description: "Classic formal finish.", color: "black", fit: "standard", material: "leather" },
        { ...baseItems.accessory, name: "Gold minimal jewelry", description: "Warm formal detail near the face.", color: "gold", fit: "small", material: "metal" },
      ],
    },
  },
};

export function getFashionTemplate(occasion: FashionOccasion, mood: FashionMood): FashionTemplate {
  return templates[occasion]?.[mood] ?? templates.daily.minimal;
}
