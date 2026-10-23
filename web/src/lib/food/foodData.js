// GENERATED from the Indian Food Composition Tables 2017 (ICMR-NIN) and cited
// references. Do not edit by hand: change the source list and regenerate.
//
// One row per food a recipe line can be sized with: figures per 100 g edible
// portion, raw. IFCT energy is kJ / 4.184; carbs are IFCT's available
// carbohydrate, so fibre is separate. Oils carry IFCT's 37 kJ per g of fat.
// `source` says where each row comes from: ifct_2017 (with its food code),
// usda_fdc, icmr_nvif_1989, or koi_estimate (a typical label, to be replaced by
// the product's own label wherever KOI sells it).

export const FOOD_VERSION = "e47c5369839e";

export const FOODS = Object.freeze([
 {
  "key": "rice_white",
  "name": "White rice (raw)",
  "per100": {
   "kcal": 356,
   "protein": 7.94,
   "carbs": 78.24,
   "fat": 0.52,
   "fibre": 2.81
  },
  "source": "ifct_2017",
  "sourceRef": "A015 Rice, raw, milled",
  "cookedYield": 3.0,
  "measures": {
   "cup": 185,
   "tbsp": 12
  }
 },
 {
  "key": "rice_brown",
  "name": "Brown rice (raw)",
  "per100": {
   "kcal": 354,
   "protein": 9.16,
   "carbs": 74.8,
   "fat": 1.24,
   "fibre": 4.43
  },
  "source": "ifct_2017",
  "sourceRef": "A013 Rice, raw, brown",
  "cookedYield": 2.8,
  "measures": {
   "cup": 185
  }
 },
 {
  "key": "poha",
  "name": "Poha (flattened rice)",
  "per100": {
   "kcal": 354,
   "protein": 7.44,
   "carbs": 76.75,
   "fat": 1.14,
   "fibre": 3.46
  },
  "source": "ifct_2017",
  "sourceRef": "A011 Rice flakes",
  "measures": {
   "cup": 60
  }
 },
 {
  "key": "puffed_rice",
  "name": "Puffed rice (murmura)",
  "per100": {
   "kcal": 362,
   "protein": 7.47,
   "carbs": 77.68,
   "fat": 1.62,
   "fibre": 2.56
  },
  "source": "ifct_2017",
  "sourceRef": "A012 Rice puffed",
  "measures": {
   "cup": 15
  }
 },
 {
  "key": "atta",
  "name": "Whole wheat flour (atta)",
  "per100": {
   "kcal": 320,
   "protein": 10.57,
   "carbs": 64.17,
   "fat": 1.53,
   "fibre": 11.36
  },
  "source": "ifct_2017",
  "sourceRef": "A019 Wheat flour, atta",
  "measures": {
   "cup": 120,
   "tbsp": 8
  }
 },
 {
  "key": "maida",
  "name": "Refined wheat flour (maida)",
  "per100": {
   "kcal": 352,
   "protein": 10.36,
   "carbs": 74.27,
   "fat": 0.76,
   "fibre": 2.76
  },
  "source": "ifct_2017",
  "sourceRef": "A018 Wheat flour, refined",
  "measures": {
   "cup": 125,
   "tbsp": 8
  }
 },
 {
  "key": "semolina",
  "name": "Semolina (rava/sooji)",
  "per100": {
   "kcal": 334,
   "protein": 11.38,
   "carbs": 68.43,
   "fat": 0.74,
   "fibre": 9.72
  },
  "source": "ifct_2017",
  "sourceRef": "A022 Wheat, semolina",
  "measures": {
   "cup": 170,
   "tbsp": 11
  }
 },
 {
  "key": "broken_wheat",
  "name": "Broken wheat (dalia)",
  "per100": {
   "kcal": 342,
   "protein": 10.84,
   "carbs": 69.06,
   "fat": 1.45,
   "fibre": 8.81
  },
  "source": "ifct_2017",
  "sourceRef": "A021 Wheat, bulgur",
  "cookedYield": 3.0,
  "measures": {
   "cup": 140
  }
 },
 {
  "key": "ragi_flour",
  "name": "Ragi flour",
  "per100": {
   "kcal": 321,
   "protein": 7.16,
   "carbs": 66.82,
   "fat": 1.92,
   "fibre": 11.18
  },
  "source": "ifct_2017",
  "sourceRef": "A010 Ragi",
  "measures": {
   "cup": 120,
   "tbsp": 8
  }
 },
 {
  "key": "jowar_flour",
  "name": "Jowar flour",
  "per100": {
   "kcal": 334,
   "protein": 9.97,
   "carbs": 67.68,
   "fat": 1.73,
   "fibre": 10.22
  },
  "source": "ifct_2017",
  "sourceRef": "A005 Jowar",
  "measures": {
   "cup": 120
  }
 },
 {
  "key": "bajra_flour",
  "name": "Bajra flour",
  "per100": {
   "kcal": 348,
   "protein": 10.96,
   "carbs": 61.78,
   "fat": 5.43,
   "fibre": 11.49
  },
  "source": "ifct_2017",
  "sourceRef": "A003 Bajra",
  "measures": {
   "cup": 120
  }
 },
 {
  "key": "maize_flour",
  "name": "Makki atta (maize flour)",
  "per100": {
   "kcal": 334,
   "protein": 8.8,
   "carbs": 64.77,
   "fat": 3.77,
   "fibre": 12.24
  },
  "source": "ifct_2017",
  "sourceRef": "A006 Maize, dry",
  "measures": {
   "cup": 120,
   "tbsp": 8
  }
 },
 {
  "key": "quinoa",
  "name": "Quinoa (raw)",
  "per100": {
   "kcal": 328,
   "protein": 13.11,
   "carbs": 53.65,
   "fat": 5.5,
   "fibre": 14.66
  },
  "source": "ifct_2017",
  "sourceRef": "A009 Quinoa",
  "cookedYield": 2.7,
  "measures": {
   "cup": 170
  }
 },
 {
  "key": "amaranth_flour",
  "name": "Rajgira (amaranth) flour",
  "per100": {
   "kcal": 356,
   "protein": 13.27,
   "carbs": 61.46,
   "fat": 5.56,
   "fibre": 7.47
  },
  "source": "ifct_2017",
  "sourceRef": "A002 Amaranth seed, pale brown",
  "measures": {
   "cup": 110
  }
 },
 {
  "key": "sweet_corn",
  "name": "Sweet corn kernels",
  "per100": {
   "kcal": 97,
   "protein": 4.16,
   "carbs": 16.42,
   "fat": 1.35,
   "fibre": 3.3
  },
  "source": "ifct_2017",
  "sourceRef": "A008 Maize, tender, sweet",
  "fridgeDays": 3,
  "measures": {
   "cup": 150
  }
 },
 {
  "key": "rice_flour",
  "name": "Rice flour",
  "per100": {
   "kcal": 366,
   "protein": 5.9,
   "carbs": 77.7,
   "fat": 1.4,
   "fibre": 2.4
  },
  "source": "usda_fdc",
  "sourceRef": "Rice flour, white",
  "measures": {
   "cup": 160,
   "tbsp": 10
  }
 },
 {
  "key": "oats",
  "name": "Rolled oats",
  "per100": {
   "kcal": 379,
   "protein": 13.2,
   "carbs": 57.6,
   "fat": 6.5,
   "fibre": 10.1
  },
  "source": "usda_fdc",
  "sourceRef": "Oats, rolled",
  "measures": {
   "cup": 80,
   "tbsp": 5
  }
 },
 {
  "key": "buckwheat_flour",
  "name": "Kuttu (buckwheat) flour",
  "per100": {
   "kcal": 335,
   "protein": 12.6,
   "carbs": 60.6,
   "fat": 3.1,
   "fibre": 10.0
  },
  "source": "usda_fdc",
  "sourceRef": "Buckwheat flour, whole-groat",
  "measures": {
   "cup": 120
  }
 },
 {
  "key": "barnyard_millet",
  "name": "Samak (barnyard millet)",
  "per100": {
   "kcal": 307,
   "protein": 6.2,
   "carbs": 65.5,
   "fat": 2.2,
   "fibre": 9.8
  },
  "source": "icmr_nvif_1989",
  "sourceRef": "Nutritive Value of Indian Foods: Barnyard millet",
  "cookedYield": 3.0,
  "measures": {
   "cup": 180
  }
 },
 {
  "key": "sago",
  "name": "Sabudana (sago pearls)",
  "per100": {
   "kcal": 358,
   "protein": 0.2,
   "carbs": 86.9,
   "fat": 0.0,
   "fibre": 0.9
  },
  "source": "usda_fdc",
  "sourceRef": "Tapioca, pearl, dry",
  "measures": {
   "cup": 150
  }
 },
 {
  "key": "makhana",
  "name": "Makhana (fox nuts)",
  "per100": {
   "kcal": 347,
   "protein": 9.7,
   "carbs": 76.9,
   "fat": 0.1,
   "fibre": 0.0
  },
  "source": "koi_estimate",
  "sourceRef": "Fox nut, popped (typical label)",
  "measures": {
   "cup": 15
  }
 },
 {
  "key": "sattu",
  "name": "Sattu (roasted gram flour)",
  "per100": {
   "kcal": 406,
   "protein": 22.0,
   "carbs": 55.0,
   "fat": 5.6,
   "fibre": 15.0
  },
  "source": "koi_estimate",
  "sourceRef": "Roasted bengal gram flour (typical label)",
  "measures": {
   "cup": 100,
   "tbsp": 8
  }
 },
 {
  "key": "noodles_dry",
  "name": "Hakka noodles (dry)",
  "per100": {
   "kcal": 350,
   "protein": 11.0,
   "carbs": 72.0,
   "fat": 1.5,
   "fibre": 2.5
  },
  "source": "koi_estimate",
  "sourceRef": "Wheat noodles, dry (typical label)",
  "cookedYield": 2.4
 },
 {
  "key": "bread_white",
  "name": "White bread",
  "per100": {
   "kcal": 266,
   "protein": 7.6,
   "carbs": 46.5,
   "fat": 3.3,
   "fibre": 2.7
  },
  "source": "usda_fdc",
  "sourceRef": "Bread, white, commercially prepared",
  "fridgeDays": 4,
  "measures": {
   "slice": 30
  }
 },
 {
  "key": "bread_brown",
  "name": "Whole wheat bread",
  "per100": {
   "kcal": 252,
   "protein": 12.4,
   "carbs": 36.7,
   "fat": 3.5,
   "fibre": 6.0
  },
  "source": "usda_fdc",
  "sourceRef": "Bread, whole-wheat, commercially prepared",
  "fridgeDays": 4,
  "measures": {
   "slice": 32
  }
 },
 {
  "key": "pav",
  "name": "Pav (bread roll)",
  "per100": {
   "kcal": 280,
   "protein": 8.5,
   "carbs": 50.0,
   "fat": 4.5,
   "fibre": 2.0
  },
  "source": "koi_estimate",
  "sourceRef": "Soft white bread roll",
  "fridgeDays": 3,
  "measures": {
   "piece": 40
  },
  "pieceName": "pav",
  "pieceIsName": true
 },
 {
  "key": "chana_dal",
  "name": "Chana dal",
  "per100": {
   "kcal": 329,
   "protein": 21.55,
   "carbs": 46.72,
   "fat": 5.31,
   "fibre": 15.15
  },
  "source": "ifct_2017",
  "sourceRef": "B001 Bengal gram, dal",
  "cookedYield": 2.6,
  "measures": {
   "cup": 190,
   "tbsp": 12
  }
 },
 {
  "key": "kala_chana",
  "name": "Kala chana (whole bengal gram)",
  "per100": {
   "kcal": 287,
   "protein": 18.77,
   "carbs": 39.56,
   "fat": 5.11,
   "fibre": 25.22
  },
  "source": "ifct_2017",
  "sourceRef": "B002 Bengal gram, whole",
  "cookedYield": 2.3,
  "measures": {
   "cup": 190
  }
 },
 {
  "key": "kabuli_chana",
  "name": "Kabuli chana (chickpeas)",
  "per100": {
   "kcal": 378,
   "protein": 20.5,
   "carbs": 50.7,
   "fat": 6.0,
   "fibre": 12.2
  },
  "source": "usda_fdc",
  "sourceRef": "Chickpeas (garbanzo), mature, raw",
  "cookedYield": 2.4,
  "measures": {
   "cup": 200
  }
 },
 {
  "key": "roasted_chana",
  "name": "Roasted chana",
  "per100": {
   "kcal": 287,
   "protein": 18.77,
   "carbs": 39.56,
   "fat": 5.11,
   "fibre": 25.22
  },
  "source": "ifct_2017",
  "sourceRef": "B002 Bengal gram, whole",
  "measures": {
   "cup": 110,
   "tbsp": 8
  }
 },
 {
  "key": "besan",
  "name": "Besan (gram flour)",
  "per100": {
   "kcal": 387,
   "protein": 22.4,
   "carbs": 47.0,
   "fat": 6.7,
   "fibre": 10.8
  },
  "source": "usda_fdc",
  "sourceRef": "Chickpea flour (besan)",
  "measures": {
   "cup": 90,
   "tbsp": 7
  }
 },
 {
  "key": "sev",
  "name": "Sev",
  "per100": {
   "kcal": 550,
   "protein": 15.0,
   "carbs": 45.0,
   "fat": 35.0,
   "fibre": 6.0
  },
  "source": "koi_estimate",
  "sourceRef": "Fried gram-flour noodles (typical label)",
  "measures": {
   "tbsp": 6
  }
 },
 {
  "key": "toor_dal",
  "name": "Toor dal",
  "per100": {
   "kcal": 331,
   "protein": 21.7,
   "carbs": 55.23,
   "fat": 1.56,
   "fibre": 9.06
  },
  "source": "ifct_2017",
  "sourceRef": "B021 Red gram, dal",
  "cookedYield": 2.7,
  "measures": {
   "cup": 190,
   "tbsp": 12
  }
 },
 {
  "key": "moong_dal",
  "name": "Moong dal (split, yellow)",
  "per100": {
   "kcal": 326,
   "protein": 23.88,
   "carbs": 52.59,
   "fat": 1.35,
   "fibre": 9.37
  },
  "source": "ifct_2017",
  "sourceRef": "B010 Green gram, dal",
  "cookedYield": 2.7,
  "measures": {
   "cup": 190,
   "tbsp": 12
  }
 },
 {
  "key": "moong_whole",
  "name": "Whole green moong",
  "per100": {
   "kcal": 294,
   "protein": 22.53,
   "carbs": 46.13,
   "fat": 1.14,
   "fibre": 17.04
  },
  "source": "ifct_2017",
  "sourceRef": "B011 Green gram, whole",
  "cookedYield": 2.6,
  "measures": {
   "cup": 190
  }
 },
 {
  "key": "moong_sprouts",
  "name": "Moong sprouts",
  "per100": {
   "kcal": 30,
   "protein": 3.0,
   "carbs": 4.1,
   "fat": 0.2,
   "fibre": 1.8
  },
  "source": "usda_fdc",
  "sourceRef": "Mung beans, mature seeds, sprouted, raw",
  "fridgeDays": 3,
  "measures": {
   "cup": 105
  }
 },
 {
  "key": "urad_dal",
  "name": "Urad dal",
  "per100": {
   "kcal": 324,
   "protein": 23.06,
   "carbs": 51.0,
   "fat": 1.69,
   "fibre": 11.93
  },
  "source": "ifct_2017",
  "sourceRef": "B003 Black gram, dal",
  "cookedYield": 2.6,
  "measures": {
   "cup": 190,
   "tbsp": 12,
   "tsp": 4
  }
 },
 {
  "key": "masoor_dal",
  "name": "Masoor dal",
  "per100": {
   "kcal": 322,
   "protein": 24.35,
   "carbs": 52.53,
   "fat": 0.75,
   "fibre": 10.43
  },
  "source": "ifct_2017",
  "sourceRef": "B013 Lentil dal",
  "cookedYield": 2.7,
  "measures": {
   "cup": 190,
   "tbsp": 12
  }
 },
 {
  "key": "urad_whole",
  "name": "Whole black urad",
  "per100": {
   "kcal": 291,
   "protein": 21.97,
   "carbs": 43.99,
   "fat": 1.58,
   "fibre": 20.41
  },
  "source": "ifct_2017",
  "sourceRef": "B004 Black gram, whole",
  "cookedYield": 2.5,
  "measures": {
   "cup": 190
  }
 },
 {
  "key": "rajma",
  "name": "Rajma (red kidney beans)",
  "per100": {
   "kcal": 299,
   "protein": 19.91,
   "carbs": 48.61,
   "fat": 1.77,
   "fibre": 16.57
  },
  "source": "ifct_2017",
  "sourceRef": "B020 Rajmah, red",
  "cookedYield": 2.5,
  "measures": {
   "cup": 180
  }
 },
 {
  "key": "lobia",
  "name": "Lobia (black-eyed peas)",
  "per100": {
   "kcal": 320,
   "protein": 21.25,
   "carbs": 53.77,
   "fat": 1.14,
   "fibre": 11.7
  },
  "source": "ifct_2017",
  "sourceRef": "B006 Cowpea, white",
  "cookedYield": 2.5,
  "measures": {
   "cup": 170
  }
 },
 {
  "key": "soya_chunks",
  "name": "Soya chunks",
  "per100": {
   "kcal": 345,
   "protein": 52.0,
   "carbs": 33.0,
   "fat": 0.5,
   "fibre": 13.0
  },
  "source": "koi_estimate",
  "sourceRef": "Defatted soya chunks (typical label)",
  "cookedYield": 3.0,
  "measures": {
   "cup": 50
  }
 },
 {
  "key": "tofu",
  "name": "Tofu (firm)",
  "per100": {
   "kcal": 144,
   "protein": 17.3,
   "carbs": 0.5,
   "fat": 8.7,
   "fibre": 2.3
  },
  "source": "usda_fdc",
  "sourceRef": "Tofu, raw, firm, prepared with calcium sulfate",
  "fridgeDays": 4,
  "measures": {
   "cup": 250
  }
 },
 {
  "key": "onion",
  "name": "Onion",
  "per100": {
   "kcal": 48,
   "protein": 1.5,
   "carbs": 9.56,
   "fat": 0.24,
   "fibre": 2.45
  },
  "source": "ifct_2017",
  "sourceRef": "G017 Onion, big",
  "fridgeDays": 30,
  "measures": {
   "piece": 110,
   "cup": 160
  },
  "pieceName": "medium onion",
  "pieceIsName": true
 },
 {
  "key": "shallot",
  "name": "Shallots (sambar onion)",
  "per100": {
   "kcal": 57,
   "protein": 1.82,
   "carbs": 11.58,
   "fat": 0.16,
   "fibre": 1.16
  },
  "source": "ifct_2017",
  "sourceRef": "G018 Onion, small",
  "fridgeDays": 30,
  "measures": {
   "piece": 10
  },
  "pieceName": "shallot",
  "pieceIsName": true
 },
 {
  "key": "spring_onion",
  "name": "Spring onion",
  "per100": {
   "kcal": 26,
   "protein": 2.07,
   "carbs": 2.99,
   "fat": 0.26,
   "fibre": 5.21
  },
  "source": "ifct_2017",
  "sourceRef": "D058 Onion, stalk",
  "fridgeDays": 5,
  "measures": {
   "piece": 15
  },
  "pieceName": "spring onion",
  "pieceIsName": true
 },
 {
  "key": "tomato",
  "name": "Tomato",
  "per100": {
   "kcal": 20,
   "protein": 0.9,
   "carbs": 2.71,
   "fat": 0.47,
   "fibre": 1.77
  },
  "source": "ifct_2017",
  "sourceRef": "D076 Tomato, ripe, local",
  "fridgeDays": 7,
  "measures": {
   "piece": 100,
   "cup": 180
  },
  "pieceName": "medium tomato",
  "pieceIsName": true
 },
 {
  "key": "green_chilli",
  "name": "Green chilli",
  "per100": {
   "kcal": 46,
   "protein": 2.62,
   "carbs": 6.32,
   "fat": 0.73,
   "fibre": 4.86
  },
  "source": "ifct_2017",
  "sourceRef": "G001 Chillies, green-1",
  "fridgeDays": 7,
  "measures": {
   "piece": 4
  },
  "pieceName": "green chilli",
  "pieceIsName": true
 },
 {
  "key": "garlic",
  "name": "Garlic",
  "per100": {
   "kcal": 124,
   "protein": 6.92,
   "carbs": 21.93,
   "fat": 0.16,
   "fibre": 5.22
  },
  "source": "ifct_2017",
  "sourceRef": "G011 Garlic, big clove",
  "fridgeDays": 30,
  "measures": {
   "piece": 4,
   "tsp": 4
  },
  "pieceName": "clove"
 },
 {
  "key": "ginger",
  "name": "Ginger",
  "per100": {
   "kcal": 55,
   "protein": 2.22,
   "carbs": 8.97,
   "fat": 0.85,
   "fibre": 5.36
  },
  "source": "ifct_2017",
  "sourceRef": "G014 Ginger, fresh",
  "fridgeDays": 21,
  "measures": {
   "piece": 6,
   "tsp": 5
  },
  "pieceName": "inch"
 },
 {
  "key": "potato",
  "name": "Potato",
  "per100": {
   "kcal": 70,
   "protein": 1.54,
   "carbs": 14.89,
   "fat": 0.23,
   "fibre": 1.71
  },
  "source": "ifct_2017",
  "sourceRef": "F006 Potato, brown skin, big",
  "fridgeDays": 30,
  "cookedYield": 0.95,
  "measures": {
   "piece": 150,
   "cup": 150
  },
  "pieceName": "medium potato",
  "pieceIsName": true
 },
 {
  "key": "sweet_potato",
  "name": "Sweet potato",
  "per100": {
   "kcal": 109,
   "protein": 1.33,
   "carbs": 24.25,
   "fat": 0.26,
   "fibre": 3.99
  },
  "source": "ifct_2017",
  "sourceRef": "F013 Sweet potato, brown skin",
  "fridgeDays": 21,
  "measures": {
   "piece": 150
  },
  "pieceName": "sweet potato",
  "pieceIsName": true
 },
 {
  "key": "colocasia",
  "name": "Arbi (colocasia)",
  "per100": {
   "kcal": 89,
   "protein": 3.31,
   "carbs": 17.85,
   "fat": 0.17,
   "fibre": 3.22
  },
  "source": "ifct_2017",
  "sourceRef": "F004 Colocasia",
  "fridgeDays": 10,
  "measures": {
   "piece": 40
  },
  "pieceName": "arbi",
  "pieceIsName": true
 },
 {
  "key": "yam",
  "name": "Yam",
  "per100": {
   "kcal": 84,
   "protein": 2.56,
   "carbs": 17.46,
   "fat": 0.14,
   "fibre": 4.17
  },
  "source": "ifct_2017",
  "sourceRef": "F017 Yam, elephant",
  "fridgeDays": 21,
  "measures": {
   "cup": 150
  }
 },
 {
  "key": "curry_leaves",
  "name": "Curry leaves",
  "per100": {
   "kcal": 64,
   "protein": 7.41,
   "carbs": 4.51,
   "fat": 1.06,
   "fibre": 16.83
  },
  "source": "ifct_2017",
  "sourceRef": "G010 Curry leaves",
  "fridgeDays": 7,
  "measures": {
   "piece": 1
  },
  "pieceName": "sprig"
 },
 {
  "key": "coriander_leaves",
  "name": "Coriander leaves",
  "per100": {
   "kcal": 31,
   "protein": 3.52,
   "carbs": 1.93,
   "fat": 0.7,
   "fibre": 4.66
  },
  "source": "ifct_2017",
  "sourceRef": "G009 Coriander leaves",
  "fridgeDays": 4,
  "measures": {
   "cup": 16,
   "tbsp": 1
  }
 },
 {
  "key": "mint",
  "name": "Mint leaves",
  "per100": {
   "kcal": 37,
   "protein": 4.66,
   "carbs": 2.39,
   "fat": 0.65,
   "fibre": 5.89
  },
  "source": "ifct_2017",
  "sourceRef": "G016 Mint leaves",
  "fridgeDays": 4,
  "measures": {
   "cup": 20,
   "tbsp": 1.5
  }
 },
 {
  "key": "fenugreek_leaves",
  "name": "Methi leaves",
  "per100": {
   "kcal": 34,
   "protein": 3.68,
   "carbs": 2.17,
   "fat": 0.83,
   "fibre": 4.9
  },
  "source": "ifct_2017",
  "sourceRef": "C020 Fenugreek leaves",
  "fridgeDays": 3,
  "measures": {
   "cup": 30
  }
 },
 {
  "key": "spinach",
  "name": "Spinach (palak)",
  "per100": {
   "kcal": 24,
   "protein": 2.14,
   "carbs": 2.05,
   "fat": 0.64,
   "fibre": 2.38
  },
  "source": "ifct_2017",
  "sourceRef": "C033 Spinach",
  "fridgeDays": 3,
  "cookedYield": 0.3,
  "measures": {
   "cup": 30
  }
 },
 {
  "key": "mustard_greens",
  "name": "Sarson (mustard greens)",
  "per100": {
   "kcal": 30,
   "protein": 3.52,
   "carbs": 2.41,
   "fat": 0.51,
   "fibre": 3.92
  },
  "source": "ifct_2017",
  "sourceRef": "C026 Mustard leaves",
  "fridgeDays": 3,
  "cookedYield": 0.35,
  "measures": {
   "cup": 55
  }
 },
 {
  "key": "peas",
  "name": "Green peas",
  "per100": {
   "kcal": 81,
   "protein": 7.25,
   "carbs": 11.88,
   "fat": 0.13,
   "fibre": 6.32
  },
  "source": "ifct_2017",
  "sourceRef": "D061 Peas, fresh",
  "fridgeDays": 3,
  "measures": {
   "cup": 145
  }
 },
 {
  "key": "carrot",
  "name": "Carrot",
  "per100": {
   "kcal": 33,
   "protein": 0.95,
   "carbs": 5.55,
   "fat": 0.47,
   "fibre": 4.18
  },
  "source": "ifct_2017",
  "sourceRef": "F002 Carrot, orange",
  "fridgeDays": 14,
  "measures": {
   "piece": 70,
   "cup": 120
  },
  "pieceName": "carrot",
  "pieceIsName": true
 },
 {
  "key": "capsicum",
  "name": "Capsicum",
  "per100": {
   "kcal": 16,
   "protein": 1.11,
   "carbs": 1.84,
   "fat": 0.34,
   "fibre": 2.06
  },
  "source": "ifct_2017",
  "sourceRef": "D033 Capsicum, green",
  "fridgeDays": 7,
  "measures": {
   "piece": 120,
   "cup": 100
  },
  "pieceName": "capsicum",
  "pieceIsName": true
 },
 {
  "key": "french_beans",
  "name": "French beans",
  "per100": {
   "kcal": 22,
   "protein": 2.12,
   "carbs": 2.63,
   "fat": 0.19,
   "fibre": 4.18
  },
  "source": "ifct_2017",
  "sourceRef": "D050 French beans, hybrid",
  "fridgeDays": 5,
  "measures": {
   "cup": 110
  }
 },
 {
  "key": "cauliflower",
  "name": "Cauliflower",
  "per100": {
   "kcal": 23,
   "protein": 2.15,
   "carbs": 2.03,
   "fat": 0.44,
   "fibre": 3.71
  },
  "source": "ifct_2017",
  "sourceRef": "D036 Cauliflower",
  "fridgeDays": 5,
  "measures": {
   "cup": 100
  }
 },
 {
  "key": "cabbage",
  "name": "Cabbage",
  "per100": {
   "kcal": 22,
   "protein": 1.36,
   "carbs": 3.25,
   "fat": 0.12,
   "fibre": 2.76
  },
  "source": "ifct_2017",
  "sourceRef": "C015 Cabbage, green",
  "fridgeDays": 10,
  "measures": {
   "cup": 90
  }
 },
 {
  "key": "pumpkin",
  "name": "Pumpkin",
  "per100": {
   "kcal": 23,
   "protein": 0.84,
   "carbs": 4.0,
   "fat": 0.16,
   "fibre": 2.56
  },
  "source": "ifct_2017",
  "sourceRef": "D066 Pumpkin, orange, round",
  "fridgeDays": 10,
  "measures": {
   "cup": 115
  }
 },
 {
  "key": "cucumber",
  "name": "Cucumber",
  "per100": {
   "kcal": 20,
   "protein": 0.71,
   "carbs": 3.48,
   "fat": 0.16,
   "fibre": 2.14
  },
  "source": "ifct_2017",
  "sourceRef": "D043 Cucumber, green, elongate",
  "fridgeDays": 5,
  "measures": {
   "piece": 200,
   "cup": 120
  },
  "pieceName": "cucumber",
  "pieceIsName": true
 },
 {
  "key": "mushroom",
  "name": "Button mushroom",
  "per100": {
   "kcal": 27,
   "protein": 3.68,
   "carbs": 1.98,
   "fat": 0.42,
   "fibre": 3.11
  },
  "source": "ifct_2017",
  "sourceRef": "J001 Button mushroom, fresh",
  "fridgeDays": 3,
  "cookedYield": 0.6,
  "measures": {
   "cup": 70
  }
 },
 {
  "key": "brinjal",
  "name": "Brinjal",
  "per100": {
   "kcal": 27,
   "protein": 1.77,
   "carbs": 3.49,
   "fat": 0.39,
   "fibre": 3.57
  },
  "source": "ifct_2017",
  "sourceRef": "D010 Brinjal-1",
  "fridgeDays": 5,
  "measures": {
   "piece": 250
  },
  "pieceName": "large brinjal",
  "pieceIsName": true
 },
 {
  "key": "okra",
  "name": "Bhindi (okra)",
  "per100": {
   "kcal": 27,
   "protein": 2.08,
   "carbs": 3.62,
   "fat": 0.22,
   "fibre": 4.08
  },
  "source": "ifct_2017",
  "sourceRef": "D056 Ladies finger",
  "fridgeDays": 4,
  "measures": {
   "cup": 100
  }
 },
 {
  "key": "bottle_gourd",
  "name": "Lauki (bottle gourd)",
  "per100": {
   "kcal": 11,
   "protein": 0.53,
   "carbs": 1.68,
   "fat": 0.13,
   "fibre": 2.12
  },
  "source": "ifct_2017",
  "sourceRef": "D007 Bottle gourd, elongate, pale green",
  "fridgeDays": 7,
  "measures": {
   "cup": 115
  }
 },
 {
  "key": "bitter_gourd",
  "name": "Karela (bitter gourd)",
  "per100": {
   "kcal": 21,
   "protein": 1.44,
   "carbs": 2.82,
   "fat": 0.24,
   "fibre": 3.78
  },
  "source": "ifct_2017",
  "sourceRef": "D004 Bitter gourd, jagged, teeth ridges, elongate",
  "fridgeDays": 5,
  "measures": {
   "piece": 100
  },
  "pieceName": "karela",
  "pieceIsName": true
 },
 {
  "key": "coconut_fresh",
  "name": "Fresh coconut, grated",
  "per100": {
   "kcal": 409,
   "protein": 3.84,
   "carbs": 6.3,
   "fat": 41.38,
   "fibre": 10.42
  },
  "source": "ifct_2017",
  "sourceRef": "H007 Coconut, kernel, fresh",
  "fridgeDays": 3,
  "measures": {
   "cup": 80,
   "tbsp": 6
  }
 },
 {
  "key": "coconut_water",
  "name": "Coconut water",
  "per100": {
   "kcal": 15,
   "protein": 0.26,
   "carbs": 3.16,
   "fat": 0.16,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "K002 Coconut Water",
  "fridgeDays": 1,
  "measures": {
   "cup": 240
  }
 },
 {
  "key": "coconut_milk",
  "name": "Coconut milk",
  "per100": {
   "kcal": 197,
   "protein": 2.0,
   "carbs": 2.8,
   "fat": 21.3,
   "fibre": 0.0
  },
  "source": "usda_fdc",
  "sourceRef": "Coconut milk, canned",
  "fridgeDays": 3,
  "measures": {
   "cup": 240,
   "tbsp": 15
  }
 },
 {
  "key": "banana",
  "name": "Banana",
  "per100": {
   "kcal": 105,
   "protein": 1.23,
   "carbs": 23.63,
   "fat": 0.33,
   "fibre": 1.94
  },
  "source": "ifct_2017",
  "sourceRef": "E012 Banana, ripe, robusta",
  "fridgeDays": 4,
  "measures": {
   "piece": 118
  },
  "pieceName": "banana",
  "pieceIsName": true
 },
 {
  "key": "lemon_juice",
  "name": "Lemon",
  "per100": {
   "kcal": 37,
   "protein": 0.41,
   "carbs": 0.0,
   "fat": 0.75,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "E033 Lemon, juice",
  "fridgeDays": 14,
  "measures": {
   "piece": 25,
   "tbsp": 15,
   "tsp": 5
  },
  "pieceName": "lemon",
  "pieceIsName": true
 },
 {
  "key": "mango",
  "name": "Mango (ripe)",
  "per100": {
   "kcal": 55,
   "protein": 0.54,
   "carbs": 11.36,
   "fat": 0.57,
   "fibre": 2.02
  },
  "source": "ifct_2017",
  "sourceRef": "E039 Mango, ripe, kesar",
  "fridgeDays": 4,
  "measures": {
   "piece": 200
  },
  "pieceName": "mango",
  "pieceIsName": true
 },
 {
  "key": "raw_mango",
  "name": "Raw mango",
  "per100": {
   "kcal": 49,
   "protein": 0.69,
   "carbs": 10.59,
   "fat": 0.08,
   "fibre": 3.01
  },
  "source": "ifct_2017",
  "sourceRef": "D057 Mango, green, raw",
  "fridgeDays": 7,
  "measures": {
   "piece": 150
  },
  "pieceName": "raw mango",
  "pieceIsName": true
 },
 {
  "key": "amchur",
  "name": "Amchur (dry mango powder)",
  "per100": {
   "kcal": 330,
   "protein": 2.5,
   "carbs": 75.0,
   "fat": 1.0,
   "fibre": 8.0
  },
  "source": "koi_estimate",
  "sourceRef": "Dry mango powder",
  "measures": {
   "tsp": 2.5
  }
 },
 {
  "key": "pomegranate",
  "name": "Pomegranate seeds",
  "per100": {
   "kcal": 55,
   "protein": 1.33,
   "carbs": 11.58,
   "fat": 0.15,
   "fibre": 2.83
  },
  "source": "ifct_2017",
  "sourceRef": "E055 Pomegranate, maroon seeds",
  "fridgeDays": 7,
  "measures": {
   "cup": 175
  }
 },
 {
  "key": "apple",
  "name": "Apple",
  "per100": {
   "kcal": 62,
   "protein": 0.29,
   "carbs": 13.11,
   "fat": 0.64,
   "fibre": 2.59
  },
  "source": "ifct_2017",
  "sourceRef": "E001 Apple, big",
  "fridgeDays": 21,
  "measures": {
   "piece": 180
  },
  "pieceName": "apple",
  "pieceIsName": true
 },
 {
  "key": "papaya",
  "name": "Papaya",
  "per100": {
   "kcal": 24,
   "protein": 0.42,
   "carbs": 4.61,
   "fat": 0.16,
   "fibre": 2.83
  },
  "source": "ifct_2017",
  "sourceRef": "E049 Papaya, ripe",
  "fridgeDays": 4,
  "measures": {
   "cup": 145
  }
 },
 {
  "key": "guava",
  "name": "Guava",
  "per100": {
   "kcal": 32,
   "protein": 1.44,
   "carbs": 5.13,
   "fat": 0.32,
   "fibre": 8.59
  },
  "source": "ifct_2017",
  "sourceRef": "E028 Guava, white flesh",
  "fridgeDays": 4,
  "measures": {
   "piece": 100
  },
  "pieceName": "guava",
  "pieceIsName": true
 },
 {
  "key": "dates",
  "name": "Dates",
  "per100": {
   "kcal": 311,
   "protein": 2.38,
   "carbs": 72.67,
   "fat": 0.35,
   "fibre": 9.1
  },
  "source": "ifct_2017",
  "sourceRef": "E018 Dates, dry, dark brown",
  "measures": {
   "piece": 8
  },
  "pieceName": "date",
  "pieceIsName": true
 },
 {
  "key": "milk_toned",
  "name": "Toned milk",
  "per100": {
   "kcal": 58,
   "protein": 3.1,
   "carbs": 4.7,
   "fat": 3.0,
   "fibre": 0.0
  },
  "source": "koi_estimate",
  "sourceRef": "Toned milk, 3% fat (typical label)",
  "fridgeDays": 3,
  "measures": {
   "cup": 245,
   "tbsp": 15
  }
 },
 {
  "key": "milk_whole",
  "name": "Whole milk",
  "per100": {
   "kcal": 73,
   "protein": 3.26,
   "carbs": 4.94,
   "fat": 4.48,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "L002 Milk, whole, Cow",
  "fridgeDays": 3,
  "measures": {
   "cup": 245,
   "tbsp": 15
  }
 },
 {
  "key": "curd",
  "name": "Curd (dahi)",
  "per100": {
   "kcal": 61,
   "protein": 3.5,
   "carbs": 4.7,
   "fat": 3.3,
   "fibre": 0.0
  },
  "source": "usda_fdc",
  "sourceRef": "Yogurt, plain, whole milk",
  "fridgeDays": 5,
  "measures": {
   "cup": 245,
   "tbsp": 15
  }
 },
 {
  "key": "paneer",
  "name": "Paneer",
  "per100": {
   "kcal": 258,
   "protein": 18.86,
   "carbs": 12.41,
   "fat": 14.78,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "L003 Paneer",
  "fridgeDays": 5
 },
 {
  "key": "cream",
  "name": "Fresh cream",
  "per100": {
   "kcal": 248,
   "protein": 2.4,
   "carbs": 3.4,
   "fat": 25.0,
   "fibre": 0.0
  },
  "source": "koi_estimate",
  "sourceRef": "Fresh cream, 25% fat (typical label)",
  "fridgeDays": 5,
  "measures": {
   "tbsp": 15
  }
 },
 {
  "key": "butter",
  "name": "Butter",
  "per100": {
   "kcal": 717,
   "protein": 0.9,
   "carbs": 0.1,
   "fat": 81.1,
   "fibre": 0.0
  },
  "source": "usda_fdc",
  "sourceRef": "Butter, salted",
  "measures": {
   "tbsp": 14,
   "tsp": 5
  }
 },
 {
  "key": "ghee",
  "name": "Ghee",
  "per100": {
   "kcal": 884,
   "protein": 0.0,
   "carbs": 0.0,
   "fat": 100.0,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "T013 Ghee",
  "measures": {
   "tbsp": 13,
   "tsp": 4.5
  }
 },
 {
  "key": "sunflower_oil",
  "name": "Sunflower oil",
  "per100": {
   "kcal": 884,
   "protein": 0.0,
   "carbs": 0.0,
   "fat": 100.0,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "T012 Sunflower oil",
  "measures": {
   "tbsp": 13.6,
   "tsp": 4.5
  }
 },
 {
  "key": "groundnut_oil",
  "name": "Groundnut oil",
  "per100": {
   "kcal": 884,
   "protein": 0.0,
   "carbs": 0.0,
   "fat": 100.0,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "T005 Groundnut oil",
  "measures": {
   "tbsp": 13.6,
   "tsp": 4.5
  }
 },
 {
  "key": "coconut_oil",
  "name": "Coconut oil",
  "per100": {
   "kcal": 884,
   "protein": 0.0,
   "carbs": 0.0,
   "fat": 100.0,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "T001 Coconut oil",
  "measures": {
   "tbsp": 13.6,
   "tsp": 4.5
  }
 },
 {
  "key": "mustard_oil",
  "name": "Mustard oil",
  "per100": {
   "kcal": 884,
   "protein": 0.0,
   "carbs": 0.0,
   "fat": 100.0,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "T006 Mustard oil",
  "measures": {
   "tbsp": 13.6,
   "tsp": 4.5
  }
 },
 {
  "key": "olive_oil",
  "name": "Olive oil",
  "per100": {
   "kcal": 884,
   "protein": 0.0,
   "carbs": 0.0,
   "fat": 100.0,
   "fibre": 0.0
  },
  "source": "usda_fdc",
  "sourceRef": "Oil, olive, salad or cooking",
  "measures": {
   "tbsp": 13.6,
   "tsp": 4.5
  }
 },
 {
  "key": "sesame_oil",
  "name": "Sesame oil",
  "per100": {
   "kcal": 884,
   "protein": 0.0,
   "carbs": 0.0,
   "fat": 100.0,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "T004 Gingelly oil",
  "measures": {
   "tbsp": 13.6,
   "tsp": 4.5
  }
 },
 {
  "key": "egg",
  "name": "Egg",
  "per100": {
   "kcal": 135,
   "protein": 13.28,
   "carbs": 0.0,
   "fat": 9.15,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "M001 Egg, poultry, whole, raw",
  "fridgeDays": 21,
  "measures": {
   "piece": 50
  },
  "pieceName": "egg",
  "pieceIsName": true
 },
 {
  "key": "egg_white",
  "name": "Egg white",
  "per100": {
   "kcal": 45,
   "protein": 10.84,
   "carbs": 0.0,
   "fat": 0.06,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "M002 Egg, poultry, white, raw",
  "fridgeDays": 21,
  "measures": {
   "piece": 33
  },
  "pieceName": "egg white",
  "pieceIsName": true
 },
 {
  "key": "chicken_breast",
  "name": "Chicken breast, boneless",
  "per100": {
   "kcal": 168,
   "protein": 21.81,
   "carbs": 0.0,
   "fat": 9.0,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "N003 Chicken, poultry, breast, skinless",
  "fridgeDays": 2,
  "cookedYield": 0.75
 },
 {
  "key": "chicken_curry_cut",
  "name": "Curry-cut chicken",
  "per100": {
   "kcal": 200,
   "protein": 18.18,
   "carbs": 0.0,
   "fat": 14.23,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "N002 Chicken, poultry, thigh, skinless",
  "fridgeDays": 2,
  "cookedYield": 0.75
 },
 {
  "key": "mutton",
  "name": "Mutton (goat)",
  "per100": {
   "kcal": 160,
   "protein": 22.07,
   "carbs": 0.0,
   "fat": 7.94,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "O003 Goat, legs",
  "fridgeDays": 2,
  "cookedYield": 0.65
 },
 {
  "key": "mutton_keema",
  "name": "Mutton keema",
  "per100": {
   "kcal": 188,
   "protein": 20.33,
   "carbs": 0.0,
   "fat": 11.94,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "O001 Goat, shoulder, meat",
  "fridgeDays": 1,
  "cookedYield": 0.7
 },
 {
  "key": "fish",
  "name": "Fish (rohu)",
  "per100": {
   "kcal": 102,
   "protein": 19.71,
   "carbs": 0.0,
   "fat": 2.39,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "S006 Rohu",
  "fridgeDays": 1,
  "cookedYield": 0.8,
  "measures": {
   "piece": 100
  },
  "pieceName": "fish fillet",
  "pieceIsName": true
 },
 {
  "key": "prawns",
  "name": "Prawns",
  "per100": {
   "kcal": 91,
   "protein": 19.24,
   "carbs": 0.0,
   "fat": 0.52,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "S008 Prawns, big",
  "fridgeDays": 1,
  "cookedYield": 0.8
 },
 {
  "key": "almonds",
  "name": "Almonds",
  "per100": {
   "kcal": 609,
   "protein": 18.41,
   "carbs": 3.04,
   "fat": 58.49,
   "fibre": 13.06
  },
  "source": "ifct_2017",
  "sourceRef": "H001 Almond",
  "measures": {
   "piece": 1.2,
   "tbsp": 9
  },
  "pieceName": "almond",
  "pieceIsName": true
 },
 {
  "key": "cashews",
  "name": "Cashews",
  "per100": {
   "kcal": 583,
   "protein": 18.78,
   "carbs": 25.46,
   "fat": 45.2,
   "fibre": 3.86
  },
  "source": "ifct_2017",
  "sourceRef": "H005 Cashew nut",
  "measures": {
   "piece": 1.5,
   "tbsp": 9
  },
  "pieceName": "cashew",
  "pieceIsName": true
 },
 {
  "key": "peanuts",
  "name": "Peanuts",
  "per100": {
   "kcal": 520,
   "protein": 23.65,
   "carbs": 17.27,
   "fat": 39.63,
   "fibre": 10.38
  },
  "source": "ifct_2017",
  "sourceRef": "H012 Ground nut",
  "measures": {
   "tbsp": 9,
   "cup": 145
  }
 },
 {
  "key": "peanut_butter",
  "name": "Peanut butter",
  "per100": {
   "kcal": 588,
   "protein": 25.1,
   "carbs": 14.0,
   "fat": 50.4,
   "fibre": 6.0
  },
  "source": "usda_fdc",
  "sourceRef": "Peanut butter, smooth",
  "measures": {
   "tbsp": 16,
   "tsp": 5
  }
 },
 {
  "key": "sesame",
  "name": "Sesame seeds",
  "per100": {
   "kcal": 520,
   "protein": 21.7,
   "carbs": 10.83,
   "fat": 43.05,
   "fibre": 16.99
  },
  "source": "ifct_2017",
  "sourceRef": "H011 Gingelly seeds, white",
  "measures": {
   "tbsp": 9,
   "tsp": 3
  }
 },
 {
  "key": "chia",
  "name": "Chia seeds",
  "per100": {
   "kcal": 486,
   "protein": 16.5,
   "carbs": 7.7,
   "fat": 30.7,
   "fibre": 34.4
  },
  "source": "usda_fdc",
  "sourceRef": "Seeds, chia seeds, dried",
  "measures": {
   "tbsp": 12,
   "tsp": 4
  }
 },
 {
  "key": "sugar",
  "name": "Sugar",
  "per100": {
   "kcal": 387,
   "protein": 0.0,
   "carbs": 100.0,
   "fat": 0.0,
   "fibre": 0.0
  },
  "source": "usda_fdc",
  "sourceRef": "Sugars, granulated",
  "measures": {
   "tsp": 4,
   "tbsp": 12.5
  }
 },
 {
  "key": "jaggery",
  "name": "Jaggery",
  "per100": {
   "kcal": 354,
   "protein": 1.85,
   "carbs": 84.87,
   "fat": 0.16,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "I001 Jaggery, cane",
  "measures": {
   "tsp": 5,
   "tbsp": 15
  }
 },
 {
  "key": "honey",
  "name": "Honey",
  "per100": {
   "kcal": 304,
   "protein": 0.3,
   "carbs": 82.2,
   "fat": 0.0,
   "fibre": 0.2
  },
  "source": "usda_fdc",
  "sourceRef": "Honey",
  "measures": {
   "tsp": 7,
   "tbsp": 21
  }
 },
 {
  "key": "tamarind",
  "name": "Tamarind pulp",
  "per100": {
   "kcal": 288,
   "protein": 2.92,
   "carbs": 67.35,
   "fat": 0.15,
   "fibre": 5.31
  },
  "source": "ifct_2017",
  "sourceRef": "E064 Tamarind, pulp",
  "measures": {
   "tbsp": 15,
   "tsp": 5
  }
 },
 {
  "key": "cumin",
  "name": "Cumin seeds",
  "per100": {
   "kcal": 304,
   "protein": 13.91,
   "carbs": 22.62,
   "fat": 16.64,
   "fibre": 30.35
  },
  "source": "ifct_2017",
  "sourceRef": "G025 Cumin seeds",
  "measures": {
   "tsp": 2
  }
 },
 {
  "key": "turmeric",
  "name": "Turmeric powder",
  "per100": {
   "kcal": 281,
   "protein": 7.66,
   "carbs": 49.22,
   "fat": 5.03,
   "fibre": 21.38
  },
  "source": "ifct_2017",
  "sourceRef": "G033 Turmeric powder",
  "measures": {
   "tsp": 3
  }
 },
 {
  "key": "coriander_seeds",
  "name": "Coriander seeds",
  "per100": {
   "kcal": 269,
   "protein": 10.66,
   "carbs": 12.98,
   "fat": 17.47,
   "fibre": 44.81
  },
  "source": "ifct_2017",
  "sourceRef": "G024 Coriander seeds",
  "measures": {
   "tsp": 2
  }
 },
 {
  "key": "fenugreek_seeds",
  "name": "Methi seeds",
  "per100": {
   "kcal": 235,
   "protein": 25.41,
   "carbs": 10.57,
   "fat": 5.72,
   "fibre": 47.55
  },
  "source": "ifct_2017",
  "sourceRef": "G026 Fenugreek seeds",
  "measures": {
   "tsp": 4
  }
 },
 {
  "key": "kasuri_methi",
  "name": "Kasuri methi",
  "per100": {
   "kcal": 34,
   "protein": 3.68,
   "carbs": 2.17,
   "fat": 0.83,
   "fibre": 4.9
  },
  "source": "ifct_2017",
  "sourceRef": "C020 Fenugreek leaves",
  "measures": {
   "tsp": 1
  }
 },
 {
  "key": "mustard_seeds",
  "name": "Mustard seeds",
  "per100": {
   "kcal": 510,
   "protein": 19.51,
   "carbs": 16.8,
   "fat": 40.19,
   "fibre": 14.1
  },
  "source": "ifct_2017",
  "sourceRef": "H013 Mustard seeds",
  "measures": {
   "tsp": 3.5
  }
 },
 {
  "key": "black_pepper",
  "name": "Black pepper",
  "per100": {
   "kcal": 217,
   "protein": 10.12,
   "carbs": 36.22,
   "fat": 2.74,
   "fibre": 33.16
  },
  "source": "ifct_2017",
  "sourceRef": "G031 Pepper, black",
  "measures": {
   "tsp": 2.5
  }
 },
 {
  "key": "cardamom",
  "name": "Cardamom",
  "per100": {
   "kcal": 255,
   "protein": 8.1,
   "carbs": 47.76,
   "fat": 2.6,
   "fibre": 23.1
  },
  "source": "ifct_2017",
  "sourceRef": "G020 Cardamom, green",
  "measures": {
   "piece": 0.2
  },
  "pieceName": "pod"
 },
 {
  "key": "cloves",
  "name": "Cloves",
  "per100": {
   "kcal": 187,
   "protein": 5.86,
   "carbs": 18.73,
   "fat": 8.41,
   "fibre": 34.52
  },
  "source": "ifct_2017",
  "sourceRef": "G023 Cloves",
  "measures": {
   "piece": 0.1
  },
  "pieceName": "clove"
 },
 {
  "key": "cinnamon",
  "name": "Cinnamon",
  "per100": {
   "kcal": 247,
   "protein": 4.0,
   "carbs": 27.5,
   "fat": 1.2,
   "fibre": 53.1
  },
  "source": "usda_fdc",
  "sourceRef": "Spices, cinnamon, ground",
  "measures": {
   "piece": 1
  },
  "pieceName": "inch of stick"
 },
 {
  "key": "carom",
  "name": "Ajwain (carom seeds)",
  "per100": {
   "kcal": 357,
   "protein": 15.89,
   "carbs": 24.53,
   "fat": 21.11,
   "fibre": 20.58
  },
  "source": "ifct_2017",
  "sourceRef": "G029 Omum",
  "measures": {
   "tsp": 2
  }
 },
 {
  "key": "asafoetida",
  "name": "Hing (asafoetida)",
  "per100": {
   "kcal": 332,
   "protein": 6.34,
   "carbs": 71.95,
   "fat": 1.26,
   "fibre": 5.13
  },
  "source": "ifct_2017",
  "sourceRef": "G019 Asafoetida",
  "measures": {
   "pinch": 0.1
  }
 },
 {
  "key": "garam_masala",
  "name": "Garam masala",
  "per100": {
   "kcal": 380,
   "protein": 13.0,
   "carbs": 45.0,
   "fat": 15.0,
   "fibre": 20.0
  },
  "source": "koi_estimate",
  "sourceRef": "Spice blend",
  "measures": {
   "tsp": 2
  }
 },
 {
  "key": "chaat_masala",
  "name": "Chaat masala",
  "per100": {
   "kcal": 250,
   "protein": 8.0,
   "carbs": 40.0,
   "fat": 5.0,
   "fibre": 15.0
  },
  "source": "koi_estimate",
  "sourceRef": "Spice blend",
  "measures": {
   "tsp": 2.5
  }
 },
 {
  "key": "sambar_powder",
  "name": "Sambar powder",
  "per100": {
   "kcal": 330,
   "protein": 13.0,
   "carbs": 40.0,
   "fat": 10.0,
   "fibre": 20.0
  },
  "source": "koi_estimate",
  "sourceRef": "Spice blend",
  "measures": {
   "tsp": 2.5,
   "tbsp": 7
  }
 },
 {
  "key": "rasam_powder",
  "name": "Rasam powder",
  "per100": {
   "kcal": 330,
   "protein": 13.0,
   "carbs": 40.0,
   "fat": 10.0,
   "fibre": 20.0
  },
  "source": "koi_estimate",
  "sourceRef": "Spice blend",
  "measures": {
   "tsp": 2.5
  }
 },
 {
  "key": "pav_bhaji_masala",
  "name": "Pav bhaji masala",
  "per100": {
   "kcal": 330,
   "protein": 12.0,
   "carbs": 45.0,
   "fat": 10.0,
   "fibre": 20.0
  },
  "source": "koi_estimate",
  "sourceRef": "Spice blend",
  "measures": {
   "tsp": 2.5
  }
 },
 {
  "key": "soy_sauce",
  "name": "Soy sauce",
  "per100": {
   "kcal": 53,
   "protein": 8.1,
   "carbs": 4.1,
   "fat": 0.6,
   "fibre": 0.8
  },
  "source": "usda_fdc",
  "sourceRef": "Soy sauce (shoyu)",
  "measures": {
   "tsp": 5,
   "tbsp": 16
  }
 },
 {
  "key": "tea_leaves",
  "name": "Tea leaves",
  "per100": {
   "kcal": 0,
   "protein": 0,
   "carbs": 0,
   "fat": 0,
   "fibre": 0
  },
  "source": "koi_estimate",
  "sourceRef": "Brewed: negligible energy",
  "measures": {
   "tsp": 2
  }
 },
 {
  "key": "coffee_powder",
  "name": "Coffee powder",
  "per100": {
   "kcal": 0,
   "protein": 0,
   "carbs": 0,
   "fat": 0,
   "fibre": 0
  },
  "source": "koi_estimate",
  "sourceRef": "Brewed: negligible energy",
  "measures": {
   "tsp": 2
  }
 },
 {
  "key": "salt",
  "name": "Salt",
  "per100": {
   "kcal": 0,
   "protein": 0,
   "carbs": 0,
   "fat": 0,
   "fibre": 0
  },
  "source": "koi_estimate",
  "sourceRef": "No energy",
  "measures": {
   "tsp": 6,
   "pinch": 0.4
  }
 },
 {
  "key": "black_salt",
  "name": "Black salt (kala namak)",
  "per100": {
   "kcal": 0,
   "protein": 0,
   "carbs": 0,
   "fat": 0,
   "fibre": 0
  },
  "source": "koi_estimate",
  "sourceRef": "No energy",
  "measures": {
   "tsp": 5,
   "pinch": 0.4
  }
 },
 {
  "key": "rock_salt",
  "name": "Rock salt (sendha namak)",
  "per100": {
   "kcal": 0,
   "protein": 0,
   "carbs": 0,
   "fat": 0,
   "fibre": 0
  },
  "source": "koi_estimate",
  "sourceRef": "No energy",
  "measures": {
   "tsp": 6,
   "pinch": 0.4
  }
 },
 {
  "key": "baking_soda",
  "name": "Baking soda",
  "per100": {
   "kcal": 0,
   "protein": 0,
   "carbs": 0,
   "fat": 0,
   "fibre": 0
  },
  "source": "koi_estimate",
  "sourceRef": "No energy",
  "measures": {
   "tsp": 4.6,
   "pinch": 0.3
  }
 },
 {
  "key": "khoya",
  "name": "Khoya (khoa)",
  "per100": {
   "kcal": 316,
   "protein": 16.34,
   "carbs": 16.53,
   "fat": 20.62,
   "fibre": 0.0
  },
  "source": "ifct_2017",
  "sourceRef": "L004 Khoa",
  "fridgeDays": 5,
  "measures": {
   "tbsp": 15
  }
 },
 {
  "key": "cheese",
  "name": "Cheese (mozzarella)",
  "per100": {
   "kcal": 300,
   "protein": 22.17,
   "carbs": 2.19,
   "fat": 22.35,
   "fibre": 0
  },
  "source": "usda_fdc",
  "sourceRef": "Cheese, mozzarella, whole milk",
  "fridgeDays": 14,
  "measures": {
   "cup": 113,
   "tbsp": 7
  }
 },
 {
  "key": "mayonnaise",
  "name": "Mayonnaise (eggless)",
  "per100": {
   "kcal": 300,
   "protein": 1.0,
   "carbs": 10.0,
   "fat": 29.0,
   "fibre": 0
  },
  "source": "koi_estimate",
  "sourceRef": "Typical Indian eggless mayonnaise label, about 300 kcal per 100 g",
  "measures": {
   "tbsp": 15
  }
 },
 {
  "key": "ice_cream",
  "name": "Ice cream (vanilla)",
  "per100": {
   "kcal": 207,
   "protein": 3.5,
   "carbs": 22.9,
   "fat": 11.0,
   "fibre": 0.7
  },
  "source": "usda_fdc",
  "sourceRef": "Ice creams, vanilla",
  "measures": {
   "cup": 132
  }
 },
 {
  "key": "cola",
  "name": "Cola",
  "per100": {
   "kcal": 42,
   "protein": 0,
   "carbs": 10.6,
   "fat": 0,
   "fibre": 0
  },
  "source": "koi_estimate",
  "sourceRef": "Typical Indian cola label, 42 kcal and 10.6 g sugar per 100 ml",
  "measures": {
   "cup": 240
  }
 },
 {
  "key": "ketchup",
  "name": "Tomato ketchup",
  "per100": {
   "kcal": 101,
   "protein": 1.04,
   "carbs": 27.1,
   "fat": 0.1,
   "fibre": 0.3
  },
  "source": "usda_fdc",
  "sourceRef": "Catsup",
  "measures": {
   "tbsp": 17
  }
 },
 {
  "key": "pasta",
  "name": "Pasta (dry)",
  "per100": {
   "kcal": 371,
   "protein": 13.04,
   "carbs": 71.5,
   "fat": 1.51,
   "fibre": 3.2
  },
  "source": "usda_fdc",
  "sourceRef": "Pasta, dry, unenriched",
  "cookedYield": 2.3,
  "measures": {
   "cup": 100
  }
 }
]);
