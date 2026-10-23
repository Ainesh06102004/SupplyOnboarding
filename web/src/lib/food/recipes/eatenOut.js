// ============================================================================
// Eaten-out dishes: what a meal out is made of, as the place makes it.
//
// A dish KOI's home week never cooks (samosa, chole bhature, a pizza) but people
// eat out, written like a home recipe: food item and grams for ONE serving as
// it is served (unit "plate"), or one piece (unit "piece": a samosa, a naan).
// The grams are the place's, oil included, so a street samosa carries its
// frying. context says where it is usually eaten, and lib/food/estimate.js
// scales from there: the same samosa at a restaurant is set against the
// restaurant's factors, relative to the stall's.
//
// A home dish eaten out (biryani, butter chicken, dosa) is NOT repeated here:
// it is the home recipe with the setting's factors. Together they are the seed
// of the eaten-out half of KOI's dish database (food.dish.context, 00091); the
// database mirror is written once the ingredient graph can be checked for
// every line.
// ============================================================================

export const OUT_DISHES = Object.freeze({
  // ── Street and stalls ───────────────────────────────────────────────────
  samosa: {
    name: "Samosa", context: "street", unit: "piece", noun: ["samosa", "samosas"], slots: ["snack", "breakfast"],
    aliases: ["samosa", "samose", "singara"],
    served: 100, g: [["maida", 30], ["potato", 60], ["peas", 8], ["green_chilli", 2], ["garam_masala", 0.5], ["sunflower_oil", 15], ["salt", 1]],
  },
  vada_pav: {
    name: "Vada pav", context: "street", unit: "piece", noun: ["vada pav", "vada pavs"], slots: ["snack", "breakfast"],
    aliases: ["vada pav", "wada pav", "vadapav"],
    served: 150, g: [["pav", 45], ["potato", 80], ["besan", 15], ["garlic", 3], ["green_chilli", 3], ["peanuts", 5], ["sunflower_oil", 10], ["salt", 1]],
  },
  pani_puri: {
    name: "Pani puri", context: "street", unit: "plate", slots: ["snack"],
    aliases: ["pani puri", "golgappa", "gol gappa", "golgappe", "puchka", "phuchka"],
    served: 180, g: [["semolina", 15], ["maida", 5], ["potato", 30], ["kabuli_chana", 8], ["tamarind", 5], ["jaggery", 6], ["mint", 3], ["sunflower_oil", 6], ["black_salt", 1]],
  },
  aloo_tikki_chaat: {
    name: "Aloo tikki chaat", context: "street", unit: "plate", slots: ["snack"],
    aliases: ["aloo tikki", "aloo tikki chaat", "tikki chaat", "tikki"],
    served: 230, g: [["potato", 120], ["kabuli_chana", 15], ["curd", 40], ["tamarind", 8], ["sugar", 6], ["onion", 10], ["chaat_masala", 1], ["sunflower_oil", 12], ["salt", 1]],
  },
  momos_veg: {
    name: "Veg momos", context: "street", unit: "plate", slots: ["snack", "lunch", "dinner"],
    aliases: ["veg momos", "momos", "dumplings"],
    served: 200, g: [["maida", 60], ["cabbage", 50], ["carrot", 15], ["onion", 15], ["garlic", 2], ["soy_sauce", 2], ["sunflower_oil", 4], ["salt", 1]],
  },
  momos_chicken: {
    name: "Chicken momos", context: "street", unit: "plate", slots: ["snack", "lunch", "dinner"],
    aliases: ["chicken momos", "momos", "dumplings"],
    served: 220, g: [["maida", 60], ["chicken_breast", 70], ["onion", 20], ["garlic", 2], ["soy_sauce", 2], ["sunflower_oil", 4], ["salt", 1]],
  },
  egg_roll: {
    name: "Egg roll", context: "street", unit: "piece", noun: ["egg roll", "egg rolls"], slots: ["snack", "lunch", "dinner"],
    aliases: ["egg roll", "egg kathi roll", "egg frankie"],
    served: 200, g: [["maida", 60], ["egg", 50], ["onion", 25], ["green_chilli", 2], ["ketchup", 10], ["sunflower_oil", 10], ["salt", 1]],
  },
  chicken_roll: {
    name: "Chicken roll", context: "street", unit: "piece", noun: ["chicken roll", "chicken rolls"], slots: ["snack", "lunch", "dinner"],
    aliases: ["chicken roll", "chicken kathi roll", "kathi roll", "chicken frankie"],
    served: 230, g: [["maida", 60], ["chicken_breast", 80], ["curd", 10], ["onion", 25], ["mint", 3], ["sunflower_oil", 12], ["salt", 1]],
  },
  paneer_roll: {
    name: "Paneer roll", context: "street", unit: "piece", noun: ["paneer roll", "paneer rolls"], slots: ["snack", "lunch", "dinner"],
    aliases: ["paneer roll", "paneer kathi roll", "paneer frankie"],
    served: 220, g: [["maida", 60], ["paneer", 60], ["capsicum", 20], ["onion", 20], ["ketchup", 10], ["sunflower_oil", 12], ["salt", 1]],
  },
  chicken_shawarma: {
    name: "Chicken shawarma", context: "street", unit: "piece", noun: ["shawarma", "shawarmas"], slots: ["snack", "lunch", "dinner"],
    aliases: ["shawarma", "shawarama", "chicken shawarma"],
    served: 220, g: [["maida", 70], ["chicken_breast", 90], ["mayonnaise", 20], ["cabbage", 15], ["onion", 10], ["sunflower_oil", 8], ["salt", 1]],
  },
  veg_sandwich: {
    name: "Grilled veg sandwich", context: "street", unit: "plate", slots: ["breakfast", "snack", "lunch"],
    aliases: ["sandwich", "veg sandwich", "grilled sandwich", "cheese sandwich", "bombay sandwich"],
    served: 200, g: [["bread_white", 60], ["potato", 40], ["cucumber", 25], ["tomato", 25], ["onion", 10], ["cheese", 15], ["mint", 3], ["butter", 8], ["salt", 0.5]],
  },
  maggi: {
    name: "Instant noodles", context: "street", unit: "plate", slots: ["breakfast", "snack", "dinner"],
    aliases: ["maggi", "instant noodles"],
    // Instant noodles are fried before they are packed: the oil line carries that fat.
    served: 260, g: [["noodles_dry", 70], ["onion", 15], ["peas", 10], ["carrot", 10], ["sunflower_oil", 11], ["butter", 5], ["salt", 1]],
  },
  jalebi: {
    name: "Jalebi", context: "street", unit: "plate", slots: ["snack", "breakfast"],
    aliases: ["jalebi", "imarti"],
    served: 100, g: [["maida", 35], ["curd", 5], ["sugar", 45], ["ghee", 15]],
  },

  // ── Canteens and dhabas ─────────────────────────────────────────────────
  poori_bhaji: {
    name: "Poori bhaji", context: "canteen", unit: "plate", slots: ["breakfast", "lunch"],
    aliases: ["poori bhaji", "puri bhaji", "poori sabzi", "puri sabzi", "poori", "puri"],
    served: 300, g: [["atta", 60], ["potato", 120], ["onion", 20], ["mustard_seeds", 1], ["turmeric", 0.5], ["green_chilli", 2], ["sunflower_oil", 24], ["salt", 1.5]],
  },
  veg_thali: {
    name: "Veg thali", context: "canteen", unit: "plate", slots: ["lunch", "dinner"],
    aliases: ["veg thali", "thali", "meals", "veg meals", "south indian meals"],
    served: 750, g: [["rice_white", 60], ["atta", 60], ["toor_dal", 30], ["potato", 40], ["peas", 20], ["cauliflower", 40], ["paneer", 40], ["tomato", 40], ["onion", 30], ["curd", 80], ["sugar", 15], ["sunflower_oil", 20], ["ghee", 5], ["salt", 3]],
  },
  nonveg_thali: {
    name: "Non-veg thali", context: "canteen", unit: "plate", slots: ["lunch", "dinner"],
    aliases: ["non veg thali", "nonveg thali", "chicken thali", "fish thali", "mutton thali", "thali"],
    served: 750, g: [["rice_white", 60], ["atta", 60], ["chicken_curry_cut", 120], ["toor_dal", 25], ["potato", 40], ["tomato", 40], ["onion", 40], ["curd", 60], ["sunflower_oil", 22], ["salt", 3]],
  },

  // ── Restaurants and delivery ────────────────────────────────────────────
  chole_bhature: {
    name: "Chole bhature", context: "restaurant", unit: "plate", slots: ["breakfast", "lunch"],
    aliases: ["chole bhature", "chole bhatura", "chhole bhature", "bhature", "bhatura"],
    served: 400, g: [["maida", 100], ["curd", 15], ["kabuli_chana", 50], ["onion", 30], ["tomato", 40], ["ginger", 3], ["garlic", 3], ["garam_masala", 1], ["sunflower_oil", 35], ["salt", 2]],
  },
  mutton_biryani: {
    name: "Mutton biryani", context: "restaurant", unit: "plate", slots: ["lunch", "dinner"],
    aliases: ["mutton biryani", "gosht biryani", "biryani"],
    served: 450, g: [["rice_white", 110], ["mutton", 120], ["onion", 50], ["curd", 30], ["mint", 3], ["garam_masala", 2], ["ghee", 15], ["sunflower_oil", 10], ["salt", 2]],
  },
  chicken_fried_rice: {
    name: "Chicken fried rice", context: "restaurant", unit: "plate", slots: ["lunch", "dinner"],
    aliases: ["chicken fried rice", "fried rice"],
    served: 380, g: [["rice_white", 90], ["chicken_breast", 60], ["egg", 25], ["onion", 20], ["carrot", 20], ["spring_onion", 10], ["soy_sauce", 6], ["sunflower_oil", 15], ["salt", 1]],
  },
  gobi_manchurian: {
    name: "Gobi manchurian", context: "restaurant", unit: "plate", slots: ["lunch", "dinner", "snack"],
    aliases: ["gobi manchurian", "manchurian", "veg manchurian"],
    served: 250, g: [["cauliflower", 120], ["maida", 25], ["spring_onion", 10], ["garlic", 4], ["soy_sauce", 6], ["ketchup", 10], ["sunflower_oil", 18], ["salt", 1]],
  },
  chilli_paneer: {
    name: "Chilli paneer", context: "restaurant", unit: "plate", slots: ["lunch", "dinner", "snack"],
    aliases: ["chilli paneer", "chili paneer"],
    served: 260, g: [["paneer", 100], ["maida", 10], ["capsicum", 40], ["onion", 30], ["garlic", 4], ["soy_sauce", 6], ["ketchup", 10], ["sunflower_oil", 15], ["salt", 1]],
  },
  chilli_chicken: {
    name: "Chilli chicken", context: "restaurant", unit: "plate", slots: ["lunch", "dinner", "snack"],
    aliases: ["chilli chicken", "chili chicken"],
    served: 280, g: [["chicken_breast", 120], ["maida", 12], ["capsicum", 40], ["onion", 30], ["garlic", 4], ["soy_sauce", 6], ["ketchup", 10], ["sunflower_oil", 18], ["salt", 1]],
  },
  seekh_kebab: {
    name: "Seekh kebab", context: "restaurant", unit: "plate", slots: ["lunch", "dinner", "snack"],
    aliases: ["seekh kebab", "seekh kabab", "kebab", "kabab"],
    served: 120, g: [["mutton_keema", 100], ["onion", 15], ["ginger", 3], ["garlic", 3], ["garam_masala", 1], ["sunflower_oil", 5], ["salt", 1]],
  },
  butter_naan: {
    name: "Butter naan", context: "restaurant", unit: "piece", noun: ["naan", "naans"], slots: ["lunch", "dinner"],
    aliases: ["butter naan", "naan", "nan", "garlic naan"],
    served: 90, g: [["maida", 70], ["curd", 10], ["sugar", 2], ["butter", 8], ["salt", 1]],
  },
  tandoori_roti: {
    name: "Tandoori roti", context: "restaurant", unit: "piece", noun: ["roti", "rotis"], slots: ["lunch", "dinner"],
    aliases: ["tandoori roti", "tandoor roti"],
    served: 60, g: [["atta", 45], ["salt", 0.5]],
  },
  veg_burger: {
    name: "Veg burger", context: "restaurant", unit: "piece", noun: ["burger", "burgers"], slots: ["snack", "lunch", "dinner"],
    aliases: ["veg burger", "aloo tikki burger", "burger"],
    served: 180, g: [["pav", 60], ["potato", 60], ["peas", 10], ["maida", 10], ["cabbage", 10], ["tomato", 15], ["onion", 10], ["mayonnaise", 15], ["sunflower_oil", 10], ["salt", 1]],
  },
  chicken_burger: {
    name: "Chicken burger", context: "restaurant", unit: "piece", noun: ["burger", "burgers"], slots: ["snack", "lunch", "dinner"],
    aliases: ["chicken burger", "crispy chicken burger", "burger"],
    served: 200, g: [["pav", 60], ["chicken_breast", 70], ["maida", 10], ["cabbage", 10], ["tomato", 15], ["mayonnaise", 15], ["sunflower_oil", 12], ["salt", 1]],
  },
  french_fries: {
    name: "French fries", context: "restaurant", unit: "plate", slots: ["snack"],
    aliases: ["french fries", "fries", "finger chips"],
    served: 120, g: [["potato", 170], ["sunflower_oil", 17], ["salt", 1]],
  },
  veg_pizza: {
    name: "Veg pizza", context: "restaurant", unit: "plate", slots: ["lunch", "dinner", "snack"],
    aliases: ["veg pizza", "pizza", "margherita", "cheese pizza"],
    // One regular (7-inch) pizza.
    served: 280, g: [["maida", 90], ["tomato", 40], ["cheese", 50], ["capsicum", 25], ["onion", 20], ["sweet_corn", 15], ["olive_oil", 8], ["salt", 1]],
  },
  chicken_pizza: {
    name: "Chicken pizza", context: "restaurant", unit: "plate", slots: ["lunch", "dinner", "snack"],
    aliases: ["chicken pizza", "non veg pizza", "pepperoni pizza", "pizza"],
    served: 300, g: [["maida", 90], ["tomato", 40], ["cheese", 50], ["chicken_breast", 40], ["capsicum", 20], ["onion", 20], ["olive_oil", 8], ["salt", 1]],
  },
  white_sauce_pasta: {
    name: "White sauce pasta", context: "restaurant", unit: "plate", slots: ["lunch", "dinner"],
    aliases: ["white sauce pasta", "white pasta", "alfredo", "pasta"],
    served: 350, g: [["pasta", 90], ["maida", 6], ["milk_whole", 120], ["cheese", 20], ["capsicum", 20], ["mushroom", 20], ["garlic", 3], ["butter", 10], ["salt", 1.5]],
  },
  red_sauce_pasta: {
    name: "Red sauce pasta", context: "restaurant", unit: "plate", slots: ["lunch", "dinner"],
    aliases: ["red sauce pasta", "red pasta", "arrabbiata", "arrabiata", "tomato pasta", "pasta"],
    served: 330, g: [["pasta", 90], ["tomato", 120], ["onion", 20], ["garlic", 4], ["cheese", 10], ["olive_oil", 10], ["salt", 1.5]],
  },
  gulab_jamun: {
    name: "Gulab jamun", context: "restaurant", unit: "piece", noun: ["gulab jamun", "gulab jamuns"], slots: ["snack", "lunch", "dinner"],
    aliases: ["gulab jamun", "jamun"],
    served: 45, g: [["khoya", 15], ["maida", 3], ["sugar", 15], ["ghee", 4]],
  },
  rasgulla: {
    name: "Rasgulla", context: "restaurant", unit: "piece", noun: ["rasgulla", "rasgullas"], slots: ["snack", "lunch", "dinner"],
    aliases: ["rasgulla", "rosogolla", "rasagola"],
    served: 50, g: [["paneer", 25], ["sugar", 15]],
  },
  ice_cream_scoop: {
    name: "Ice cream", context: "restaurant", unit: "piece", noun: ["scoop", "scoops"], slots: ["snack", "lunch", "dinner"],
    aliases: ["ice cream", "icecream", "kulfi", "sundae"],
    served: 70, g: [["ice_cream", 70]],
  },
  soft_drink: {
    name: "Cola or soft drink", context: "restaurant", unit: "piece", noun: ["can or glass", "cans or glasses"], slots: ["drinks", "snack", "lunch", "dinner"],
    aliases: ["cola", "coke", "pepsi", "thums up", "soft drink", "cold drink", "soda"],
    served: 330, g: [["cola", 330]],
  },
  cafe_coffee: {
    name: "Cappuccino or latte", context: "restaurant", unit: "piece", noun: ["cup", "cups"], slots: ["drinks", "breakfast", "snack"],
    aliases: ["cappuccino", "latte", "cafe latte", "flat white"],
    served: 200, g: [["milk_whole", 180], ["coffee_powder", 2], ["sugar", 8]],
  },
});
