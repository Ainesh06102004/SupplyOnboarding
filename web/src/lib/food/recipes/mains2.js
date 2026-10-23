// Mains, K–Z: one adult serving of the curry, dal or sabzi. Format: see breakfast.js.

const mains2 = {
  kala_chana_curry: {
    served: 280, keeps: 3, batch: true,
    g: [["kala_chana", 60], ["onion", 50], ["tomato", 70], ["ginger", 4], ["garlic", 5], ["coriander_seeds", 2], ["garam_masala", 1], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Soak", "Soak {0} overnight in plenty of water.", 2],
      ["Cook the chana", "Pressure-cook it with {water:300} and half the salt for 6 whistles, or simmer covered for an hour, until soft.", 35, 2100],
      ["Make the masala", "Heat {7}. Cook {1}, chopped, for 5 minutes, then {3} and {4}, crushed, {2}, chopped, and {5}, crushed, until thick. Add {6}.", 10],
      ["Simmer", "Add the chana with its water and the rest of the salt. Simmer 10 minutes.", 10, 600],
    ],
  },
  karela_sabzi: {
    served: 170, keeps: 2,
    g: [["bitter_gourd", 150], ["onion", 60], ["turmeric", 0.5], ["green_chilli", 2], ["amchur", 1], ["sunflower_oil", 10], ["salt", 2]],
    steps: [
      ["Salt the karela", "Slice {0} thin, rub with half the salt and leave 15 minutes. Squeeze out the bitter juice.", 17],
      ["Fry", "Heat {5}. Fry the karela on medium for 8 minutes until crisp at the edges.", 8, 480],
      ["Finish", "Add {1}, sliced, {3}, slit, {2} and the rest of the salt. Cook 5 minutes, then stir in {4}.", 6],
    ],
  },
  keema_matar: {
    served: 260, keeps: 3, batch: true,
    g: [["mutton_keema", 130], ["peas", 50], ["onion", 50], ["tomato", 60], ["ginger", 4], ["garlic", 6], ["garam_masala", 2], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Brown the onion", "Heat {7}. Cook {2}, chopped, for 6 minutes until golden, then {4} and {5}, crushed.", 8],
      ["Cook the keema", "Add {0} and cook on high, breaking it up, until it browns, about 8 minutes.", 8],
      ["Simmer", "Add {3}, chopped, {6}, the salt and {water:100}. Cover and simmer 15 minutes.", 15, 900],
      ["Add the peas", "Stir in {1} and cook 5 minutes more.", 5, 300],
    ],
  },
  lauki_sabzi: {
    served: 220, keeps: 2,
    g: [["bottle_gourd", 200], ["tomato", 50], ["cumin", 1], ["turmeric", 0.5], ["sunflower_oil", 6], ["salt", 1.5]],
    steps: [
      ["Prepare", "Peel {0} and cut it into small cubes. Chop {1}.", 6],
      ["Temper", "Heat {4}. Add {2}, then the tomato, {3} and the salt. Cook 2 minutes.", 3],
      ["Cook", "Add the lauki, cover and cook on low for 12 minutes, until soft and see-through.", 12, 720],
    ],
  },
  lobia_curry: {
    served: 270, keeps: 3, batch: true,
    g: [["lobia", 55], ["onion", 40], ["tomato", 60], ["garlic", 5], ["ginger", 4], ["garam_masala", 2], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Soak", "Soak {0} for 4 hours.", 2],
      ["Cook the lobia", "Pressure-cook it with {water:300} for 3 whistles, or simmer covered for 40 minutes, until soft.", 25, 1500],
      ["Make the masala", "Heat {6}. Cook {1}, chopped, for 5 minutes, then {3} and {4}, crushed, and {2}, chopped, until soft. Add {5} and the salt.", 10],
      ["Simmer", "Add the lobia with its water and simmer 10 minutes.", 10, 600],
    ],
  },
  masoor_dal: {
    served: 270, keeps: 3, batch: true,
    g: [["masoor_dal", 50], ["onion", 30], ["tomato", 40], ["garlic", 5], ["cumin", 1], ["turmeric", 0.5], ["green_chilli", 2], ["sunflower_oil", 7], ["salt", 1.5]],
    steps: [
      ["Cook the dal", "Rinse {0} and simmer it with {5} and {water:300} for 15 minutes, until soft. Whisk it smooth.", 15, 900],
      ["Temper", "Heat {7}. Add {4}, then {3}, {6} and {1}, all chopped. Cook 4 minutes, then add {2}, chopped, and cook 2 minutes.", 7],
      ["Finish", "Pour the tadka into the dal with the salt and simmer 3 minutes.", 3, 180],
    ],
  },
  matar_paneer: {
    served: 300, keeps: 3, batch: true,
    g: [["paneer", 100], ["peas", 60], ["onion", 50], ["tomato", 80], ["ginger", 4], ["garlic", 5], ["garam_masala", 2], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Make the masala", "Heat {7}. Cook {2}, chopped, for 5 minutes, then {4} and {5}, crushed, and {3}, chopped, until thick. Add {6} and the salt.", 12],
      ["Simmer", "Add {1} and {water:120}. Cover and simmer 8 minutes.", 8, 480],
      ["Add the paneer", "Stir in {0}, cubed, and simmer 3 minutes.", 3],
    ],
  },
  methi_aloo: {
    served: 190, keeps: 2,
    g: [["potato", 150], ["fenugreek_leaves", 60], ["cumin", 1], ["turmeric", 0.5], ["green_chilli", 2], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Prepare", "Cut {0} into small cubes. Pick the leaves of {1} and chop them.", 8],
      ["Cook the potato", "Heat {5}. Add {2} and {4}, slit, then the potato, {3} and the salt. Cover and cook 10 minutes.", 10, 600],
      ["Add the methi", "Add the methi and cook, uncovered, for 4 minutes until it wilts.", 4],
    ],
  },
  mixed_veg: {
    served: 260, keeps: 3, batch: true,
    g: [["potato", 60], ["cauliflower", 60], ["peas", 40], ["carrot", 40], ["onion", 40], ["tomato", 50], ["turmeric", 0.5], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Make the base", "Heat {7}. Cook {4}, chopped, for 4 minutes, then {5}, chopped, {6} and the salt until soft.", 7],
      ["Add the vegetables", "Add {0}, {1} and {3}, all cut small, with {2} and {water:80}.", 3],
      ["Cook", "Cover and cook on low for 15 minutes, until the potato is tender.", 15, 900],
    ],
  },
  mushroom_matar: {
    served: 280, keeps: 2, batch: true,
    g: [["mushroom", 120], ["peas", 60], ["onion", 50], ["tomato", 70], ["ginger", 4], ["garlic", 5], ["garam_masala", 2], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Make the masala", "Heat {7}. Cook {2}, chopped, for 5 minutes, then {4} and {5}, crushed, and {3}, chopped, until thick. Add {6} and the salt.", 12],
      ["Cook", "Add {0}, sliced, and {1}. Cook 5 minutes, then add {water:100}.", 6],
      ["Simmer", "Cover and simmer 8 minutes.", 8, 480],
    ],
  },
  mushroom_pepper_fry: {
    served: 200, keeps: 2,
    g: [["mushroom", 180], ["capsicum", 60], ["onion", 50], ["garlic", 5], ["black_pepper", 1.5], ["curry_leaves", 1], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Prepare", "Quarter {0}, and cut {1} and {2} into chunks.", 6],
      ["Fry", "Heat {6}. Add {5}, {3}, crushed, and the onion. Cook 2 minutes, then add the mushrooms on high heat.", 4],
      ["Finish", "Cook until the mushrooms brown and their water dries up, about 7 minutes. Add the capsicum, {4}, crushed, and the salt for 2 minutes.", 9, 420],
    ],
  },
  mutton_curry: {
    served: 300, keeps: 3, batch: true,
    g: [["mutton", 150], ["onion", 70], ["tomato", 60], ["ginger", 5], ["garlic", 6], ["garam_masala", 2], ["sunflower_oil", 10], ["salt", 2]],
    steps: [
      ["Brown the onion", "Heat {6}. Cook {1}, sliced, for 10 minutes until deep golden.", 10],
      ["Sear the mutton", "Add {0} with {3} and {4}, crushed. Cook on high for 8 minutes, stirring.", 8],
      ["Make the masala", "Add {2}, chopped, {5} and the salt. Cook until the oil separates, about 6 minutes.", 6],
      ["Cook", "Add {water:250}. Pressure-cook for 5 whistles, or simmer covered for an hour, until tender.", 45, 2700],
    ],
  },
  palak_paneer: {
    served: 280, keeps: 2, batch: true,
    g: [["spinach", 150], ["paneer", 100], ["onion", 40], ["garlic", 5], ["ginger", 4], ["garam_masala", 1], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Blanch the spinach", "Drop {0} into boiling water for 2 minutes, then into cold water. Blend it smooth.", 6, 120],
      ["Make the masala", "Heat {6}. Cook {2}, chopped, for 4 minutes, then {3} and {4}, crushed, for 1 minute.", 6],
      ["Bring it together", "Add the spinach, {5} and the salt. Simmer 4 minutes, then stir in {1}, cubed, and warm it through.", 6],
    ],
  },
  paneer_bhurji: {
    served: 230, keeps: 1,
    g: [["paneer", 120], ["onion", 50], ["tomato", 60], ["green_chilli", 2], ["turmeric", 0.5], ["sunflower_oil", 7], ["salt", 1.5]],
    steps: [
      ["Cook the base", "Heat {5}. Cook {1} and {3}, chopped, for 4 minutes, then {2}, chopped, {4} and the salt until soft.", 7],
      ["Add the paneer", "Crumble in {0} and stir on medium for 3 minutes.", 3],
    ],
  },
  paneer_butter_masala: {
    served: 300, keeps: 3, batch: true,
    g: [["paneer", 120], ["tomato", 120], ["onion", 40], ["cashews", 10], ["cream", 20], ["kasuri_methi", 1], ["garam_masala", 2], ["salt", 1.5]],
    steps: [
      ["Make the sauce", "Cook {1} and {2}, chopped, with {3} and {water:100} for 15 minutes. Blend it smooth.", 18, 900],
      ["Season", "Simmer the sauce with {6}, {5}, crushed, and the salt for 5 minutes.", 5, 300],
      ["Finish", "Add {0}, cubed, and simmer 3 minutes. Stir in {4} and take it off the heat.", 4],
    ],
  },
  prawn_curry: {
    served: 300, keeps: 1,
    g: [["prawns", 150], ["coconut_milk", 80], ["onion", 40], ["tomato", 50], ["garlic", 5], ["turmeric", 0.5], ["green_chilli", 3], ["coconut_oil", 7], ["salt", 1.5]],
    steps: [
      ["Marinate", "Toss {0}, cleaned, with {5} and half the salt.", 4],
      ["Make the base", "Heat {7}. Cook {2}, {4} and {6}, all chopped, for 4 minutes, then {3}, chopped, until soft.", 7],
      ["Cook", "Add {1}, the rest of the salt and the prawns. Simmer 5 minutes, just until the prawns curl and turn pink.", 5, 300],
    ],
  },
  rajma: {
    served: 300, keeps: 3, batch: true,
    g: [["rajma", 60], ["onion", 50], ["tomato", 80], ["garlic", 5], ["ginger", 4], ["garam_masala", 2], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Soak", "Soak {0} overnight in plenty of water.", 2],
      ["Cook the rajma", "Pressure-cook it with {water:350} for 6 whistles, or simmer covered for 90 minutes, until soft. Boil hard for the first 10 minutes either way.", 40, 2400],
      ["Make the masala", "Heat {6}. Cook {1}, chopped, for 6 minutes, then {3} and {4}, crushed, and {2}, chopped, until thick. Add {5} and the salt.", 12],
      ["Simmer", "Add the rajma with its water. Simmer 15 minutes, mashing a few beans to thicken.", 15, 900],
    ],
  },
  rasam: {
    served: 300, keeps: 2, batch: true,
    g: [["tomato", 120], ["tamarind", 8], ["rasam_powder", 4], ["black_pepper", 1], ["cumin", 1], ["garlic", 4], ["mustard_seeds", 1], ["curry_leaves", 1], ["asafoetida", 0.1], ["ghee", 4], ["salt", 2]],
    steps: [
      ["Boil", "Crush {0} and {5}, and boil them with {1}, {2}, {3} and {4}, crushed, the salt and {water:300} for 10 minutes.", 12, 600],
      ["Temper", "Heat {9}. Add {6}; when they splutter, add {7} and {8}.", 2],
      ["Finish", "Pour the tempering into the rasam and turn off the heat as soon as it froths.", 2],
    ],
  },
  sambar: {
    served: 330, keeps: 3, batch: true,
    g: [["toor_dal", 40], ["tamarind", 8], ["sambar_powder", 7], ["brinjal", 60], ["carrot", 30], ["tomato", 50], ["shallot", 20], ["mustard_seeds", 1], ["curry_leaves", 1], ["asafoetida", 0.1], ["sunflower_oil", 6], ["salt", 2]],
    steps: [
      ["Cook the dal", "Pressure-cook {0} with {water:250} for 3 whistles, or simmer for 30 minutes, until soft. Mash it.", 25, 1500],
      ["Cook the vegetables", "Simmer {3}, {4}, {5} and {6}, all chopped, with {1}, {2}, the salt and {water:150} for 10 minutes.", 12, 600],
      ["Bring it together", "Stir in the dal and simmer 5 minutes.", 5, 300],
      ["Temper", "Heat {10}. Add {7}; when they splutter, add {8} and {9}, and pour it over the sambar.", 2],
    ],
  },
  sarson_ka_saag: {
    served: 250, keeps: 3, batch: true,
    g: [["mustard_greens", 150], ["spinach", 70], ["maize_flour", 10], ["garlic", 6], ["ginger", 4], ["onion", 40], ["green_chilli", 2], ["ghee", 10], ["salt", 1.5]],
    steps: [
      ["Cook the greens", "Chop {0} and {1}, and cook them with {water:100} and the salt, covered, for 20 minutes.", 22, 1200],
      ["Thicken", "Mash or blend coarsely, stir in {2} and cook on low for 10 minutes, stirring.", 10, 600],
      ["Temper", "Heat {7}. Cook {3}, {4}, {6} and {5}, all chopped, until golden, and stir it into the saag.", 6],
    ],
  },
  soya_curry: {
    served: 280, keeps: 3, batch: true,
    g: [["soya_chunks", 40], ["onion", 50], ["tomato", 70], ["garlic", 5], ["ginger", 4], ["garam_masala", 2], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Soak the chunks", "Soak {0} in hot water for 10 minutes, then squeeze them dry.", 11, 600],
      ["Make the masala", "Heat {6}. Cook {1}, chopped, for 5 minutes, then {3} and {4}, crushed, and {2}, chopped, until thick. Add {5} and the salt.", 10],
      ["Simmer", "Add the chunks and {water:150}. Cover and simmer 10 minutes.", 10, 600],
    ],
  },
  soya_keema: {
    served: 260, keeps: 3, batch: true,
    g: [["soya_chunks", 40], ["onion", 50], ["tomato", 60], ["peas", 40], ["ginger", 4], ["garlic", 5], ["garam_masala", 2], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Soak and mince", "Soak {0} in hot water for 10 minutes, squeeze them dry and pulse them coarse in a mixer.", 12, 600],
      ["Make the masala", "Heat {7}. Cook {1}, chopped, for 5 minutes, then {4} and {5}, crushed, and {2}, chopped, until thick. Add {6} and the salt.", 10],
      ["Cook", "Add the minced soya, {3} and {water:80}. Cook 8 minutes, stirring, until dry.", 8, 480],
    ],
  },
  tandoori_chicken: {
    served: 180, keeps: 2, batch: true,
    g: [["chicken_curry_cut", 200], ["curd", 50], ["ginger", 5], ["garlic", 6], ["lemon_juice", 10], ["green_chilli", 3], ["garam_masala", 2], ["sunflower_oil", 5], ["salt", 2]],
    steps: [
      ["Marinate", "Slash {0} a few times. Mix {1} with {2} and {3}, grated, {5}, crushed, {6}, the lemon and the salt, and rub it all over the chicken. Leave it at least 2 hours in the fridge.", 10],
      ["Roast", "Brush with {7} and roast at 220 °C for 25 minutes, turning once, until charred at the edges and cooked through.", 25, 1500],
      ["Rest", "Rest it 5 minutes before eating.", 5, 300],
    ],
  },
  tofu_bhurji: {
    served: 280, keeps: 1,
    g: [["tofu", 150], ["onion", 50], ["tomato", 60], ["capsicum", 40], ["turmeric", 0.5], ["green_chilli", 2], ["sunflower_oil", 7], ["salt", 1.5]],
    steps: [
      ["Cook the base", "Heat {6}. Cook {1}, {5} and {3}, all chopped, for 4 minutes, then {2}, chopped, {4} and the salt until soft.", 7],
      ["Add the tofu", "Crumble in {0} and stir on medium for 4 minutes.", 4],
    ],
  },
  tofu_stir_fry: {
    served: 300, keeps: 1,
    g: [["tofu", 150], ["capsicum", 60], ["carrot", 40], ["cabbage", 60], ["garlic", 5], ["ginger", 4], ["soy_sauce", 10], ["sesame_oil", 7], ["salt", 0.5]],
    steps: [
      ["Sear the tofu", "Press {0} dry, cut it into cubes and sear in half the oil ({7} in all) until golden on two sides. Lift it out.", 8],
      ["Stir-fry", "Heat the rest of the oil on high. Add {4} and {5}, chopped, then {1}, {2} and {3}, all cut thin. Toss 3 minutes.", 4],
      ["Finish", "Return the tofu with {6} and the salt, and toss 1 minute.", 1],
    ],
  },
  veg_korma: {
    served: 280, keeps: 3, batch: true,
    g: [["carrot", 40], ["french_beans", 40], ["peas", 40], ["potato", 60], ["cashews", 12], ["curd", 50], ["onion", 40], ["ginger", 4], ["garlic", 4], ["garam_masala", 2], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Make the paste", "Soak {4} in hot water for 10 minutes, then grind them with {5} until smooth.", 12],
      ["Cook the base", "Heat {10}. Cook {6}, chopped, for 5 minutes, then {7} and {8}, crushed, and {9}.", 7],
      ["Add the vegetables", "Add {0}, {1} and {3}, all cut small, with {2}, the salt and {water:150}. Cover and cook 12 minutes.", 12, 720],
      ["Finish", "Stir in the cashew paste on low heat and cook 3 minutes.", 3],
    ],
  },
  vrat_aloo: {
    served: 190, keeps: 1,
    g: [["potato", 180], ["cumin", 1], ["green_chilli", 2], ["coriander_leaves", 3], ["ghee", 8], ["rock_salt", 1.5], ["lemon_juice", 5]],
    steps: [
      ["Boil", "Boil {0} until tender, about 12 minutes. Peel and cut into cubes.", 15, 720],
      ["Temper", "Heat {4}. Add {1} and {2}, slit.", 2],
      ["Finish", "Add the potatoes and the salt and fry 4 minutes. Finish with {3} and the lemon.", 5],
    ],
  },
  vrat_kaddu: {
    served: 200, keeps: 2,
    g: [["pumpkin", 200], ["cumin", 1], ["green_chilli", 2], ["ginger", 3], ["ghee", 7], ["rock_salt", 1.5]],
    steps: [
      ["Temper", "Heat {4}. Add {1}, {2}, slit, and {3}, grated.", 2],
      ["Cook", "Add {0}, cubed, and the salt. Cover and cook on low for 12 minutes, until soft. Mash it lightly.", 12, 720],
    ],
  },
};

export default mains2;
