// Mains, A–K: one adult serving of the curry, dal or sabzi (the rice or roti
// is its own dish). Format: see breakfast.js.

const mains1 = {
  aloo_gobi: {
    served: 230, keeps: 2, batch: true,
    g: [["potato", 100], ["cauliflower", 120], ["tomato", 50], ["cumin", 1], ["turmeric", 0.5], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Prepare", "Cut {0} and {1} into bite-size pieces, and chop {2}.", 6],
      ["Cook", "Heat {5}. Add {3}; when it sizzles, add the potato and cook 5 minutes. Add the cauliflower, {4} and the salt.", 8],
      ["Steam", "Cover and cook on low for 12 minutes, stirring now and then, until both are tender. Add the tomato for the last 3 minutes.", 12, 720],
    ],
  },
  aloo_matar: {
    served: 260, keeps: 3, batch: true,
    g: [["potato", 100], ["peas", 60], ["onion", 40], ["tomato", 60], ["ginger", 3], ["cumin", 1], ["turmeric", 0.5], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Make the masala", "Heat {7}. Add {5}, then {2}, chopped, and cook 4 minutes. Add {4}, grated, {3}, chopped, {6} and the salt; cook until soft.", 8],
      ["Add the vegetables", "Add {0}, cubed, {1} and {water:200}.", 2],
      ["Simmer", "Cover and simmer 15 minutes, until the potatoes are tender.", 15, 900],
    ],
  },
  arbi_fry: {
    served: 150, keeps: 1,
    g: [["colocasia", 150], ["carom", 0.5], ["green_chilli", 3], ["ghee", 8], ["rock_salt", 1.5]],
    steps: [
      ["Boil", "Boil {0} until a knife slides in, about 12 minutes. Peel and slice into rounds.", 15, 720],
      ["Season", "Heat {3}. Add {1} and {2}, slit, then the arbi and the salt.", 2],
      ["Crisp", "Fry on medium, turning, until golden at the edges, about 8 minutes.", 8, 480],
    ],
  },
  avial: {
    served: 250, keeps: 2, batch: true,
    g: [["carrot", 50], ["french_beans", 50], ["pumpkin", 50], ["yam", 40], ["coconut_fresh", 25], ["curd", 40], ["curry_leaves", 1], ["cumin", 1], ["coconut_oil", 6], ["salt", 1.5]],
    steps: [
      ["Cook the vegetables", "Cut {0}, {1}, {2} and {3} into finger-length sticks. Cook them with {water:120} and the salt, covered, for 10 minutes.", 12, 600],
      ["Grind the coconut", "Grind {4} with {7} and a splash of water to a coarse paste.", 3],
      ["Bring it together", "Stir the paste into the vegetables and cook 3 minutes. Take it off the heat and stir in {5}, whisked.", 4],
      ["Finish", "Pour over {8} and add {6}.", 1],
    ],
  },
  baingan_bharta: {
    served: 230, keeps: 2, batch: true,
    g: [["brinjal", 200], ["onion", 50], ["tomato", 60], ["garlic", 6], ["green_chilli", 3], ["mustard_oil", 8], ["salt", 1.5]],
    steps: [
      ["Roast", "Roast {0} over a flame, turning, until the skin is black all over and it is soft inside, about 12 minutes.", 12, 720],
      ["Peel and mash", "Let it cool, peel off the skin and mash the flesh.", 5],
      ["Cook", "Heat {5}. Cook {3}, {4} and {1}, all chopped, for 4 minutes, then {2}, chopped, and the salt for 3 minutes. Stir in the brinjal and cook 5 minutes.", 12],
    ],
  },
  beans_poriyal: {
    served: 170, keeps: 2,
    g: [["french_beans", 150], ["coconut_fresh", 20], ["mustard_seeds", 1], ["curry_leaves", 1], ["green_chilli", 2], ["coconut_oil", 6], ["salt", 1.5]],
    steps: [
      ["Chop", "Chop {0} finely.", 6],
      ["Temper", "Heat {5}. Add {2}; when they splutter, add {3} and {4}, slit.", 2],
      ["Cook", "Add the beans, the salt and {water:30}. Cover and cook 8 minutes, then stir in {1}.", 10, 480],
    ],
  },
  bhindi_masala: {
    served: 170, keeps: 1,
    g: [["okra", 150], ["onion", 50], ["turmeric", 0.5], ["green_chilli", 2], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Prepare", "Wash {0} and dry it well, then cut into 1 cm pieces. Slice {1}.", 8],
      ["Fry the okra", "Heat {4}. Cook the okra on medium, uncovered, for 8 minutes until it is no longer sticky.", 8, 480],
      ["Finish", "Add the onion, {3}, chopped, {2} and the salt. Cook 5 minutes more.", 5],
    ],
  },
  butter_chicken: {
    served: 300, keeps: 3, batch: true,
    g: [["chicken_breast", 150], ["cream", 25], ["tomato", 120], ["onion", 40], ["ginger", 4], ["garlic", 6], ["cashews", 10], ["kasuri_methi", 1], ["garam_masala", 2], ["salt", 2]],
    steps: [
      ["Cook the chicken", "Cut {0} into bite-size pieces, season with half the salt and sear in a hot pan until browned, about 6 minutes.", 8],
      ["Make the sauce", "Cook {3}, {4}, {5} and {2}, all chopped, with {6} and {water:100} for 15 minutes. Blend it smooth.", 18, 900],
      ["Bring it together", "Add the chicken, {8}, {7}, crushed between your palms, and the rest of the salt. Simmer 10 minutes.", 10, 600],
      ["Finish", "Stir in {1} and take it off the heat.", 1],
    ],
  },
  cabbage_poriyal: {
    served: 160, keeps: 2,
    g: [["cabbage", 150], ["coconut_fresh", 15], ["mustard_seeds", 1], ["urad_dal", 3], ["curry_leaves", 1], ["green_chilli", 2], ["coconut_oil", 6], ["salt", 1.5]],
    steps: [
      ["Chop", "Shred {0} finely.", 5],
      ["Temper", "Heat {6}. Add {2} and {3}; when the dal turns golden, add {4} and {5}, slit.", 2],
      ["Cook", "Add the cabbage and the salt. Cover and cook 6 minutes, then stir in {1}.", 7, 360],
    ],
  },
  chana_dal_fry: {
    served: 280, keeps: 3, batch: true,
    g: [["chana_dal", 50], ["onion", 40], ["tomato", 50], ["garlic", 5], ["cumin", 1], ["turmeric", 0.5], ["ghee", 8], ["salt", 1.5]],
    steps: [
      ["Soak", "Soak {0} for 1 hour.", 2],
      ["Cook the dal", "Pressure-cook it with {5} and {water:300} for 4 whistles, or simmer covered for 40 minutes, until soft.", 30, 1800],
      ["Temper", "Heat {6}. Add {4}, then {3}, chopped, and {1}, chopped, and cook 4 minutes. Add {2}, chopped, and the salt; cook until soft.", 8],
      ["Finish", "Pour in the dal and simmer 5 minutes.", 5, 300],
    ],
  },
  chana_masala: {
    served: 280, keeps: 3, batch: true,
    g: [["kabuli_chana", 60], ["onion", 50], ["tomato", 80], ["garlic", 5], ["ginger", 4], ["garam_masala", 2], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Soak", "Soak {0} overnight in plenty of water.", 2],
      ["Cook the chana", "Pressure-cook it with {water:300} and half the salt for 5 whistles, or simmer covered for an hour, until soft.", 30, 1800],
      ["Make the masala", "Heat {6}. Cook {1}, chopped, for 5 minutes, then {3} and {4}, chopped, and {2}, chopped. Cook until it thickens, then add {5}.", 10],
      ["Simmer", "Add the chana with its water and the rest of the salt. Simmer 10 minutes, mashing a few to thicken.", 10, 600],
    ],
  },
  chicken_curry: {
    served: 300, keeps: 3, batch: true,
    g: [["chicken_curry_cut", 150], ["onion", 60], ["tomato", 70], ["garlic", 6], ["ginger", 5], ["garam_masala", 2], ["sunflower_oil", 10], ["salt", 2]],
    steps: [
      ["Brown the onion", "Heat {6}. Cook {1}, sliced, for 8 minutes until golden.", 8],
      ["Make the masala", "Add {3} and {4}, crushed, then {2}, chopped, {5} and the salt. Cook until the oil separates, about 6 minutes.", 6],
      ["Cook the chicken", "Add {0} and stir to coat. Cook 5 minutes, then add {water:150}.", 6],
      ["Simmer", "Cover and simmer 20 minutes, until the chicken is cooked through.", 20, 1200],
    ],
  },
  chicken_stew: {
    served: 320, keeps: 2, batch: true,
    g: [["chicken_curry_cut", 140], ["coconut_milk", 80], ["potato", 60], ["onion", 40], ["ginger", 4], ["black_pepper", 0.5], ["cinnamon", 1], ["cloves", 0.2], ["curry_leaves", 1], ["coconut_oil", 6], ["salt", 1.5]],
    steps: [
      ["Start the stew", "Heat {9}. Add {6}, {7} and {8}, then {3}, sliced, and {4}, cut thin. Cook 4 minutes without browning.", 6],
      ["Cook", "Add {0}, {2}, cubed, {5}, the salt and {water:150}. Cover and simmer 20 minutes.", 20, 1200],
      ["Finish", "Stir in {1} and warm it through for 2 minutes; do not let it boil.", 3],
    ],
  },
  dal_makhani: {
    served: 280, keeps: 3, batch: true,
    g: [["urad_whole", 40], ["rajma", 10], ["cream", 15], ["onion", 30], ["tomato", 60], ["garlic", 4], ["ginger", 3], ["garam_masala", 1], ["ghee", 8], ["salt", 1.5]],
    steps: [
      ["Soak", "Soak {0} and {1} overnight.", 2],
      ["Cook", "Pressure-cook them with {water:400} for 6 whistles, or simmer for 90 minutes, until very soft.", 40, 2400],
      ["Make the masala", "Heat {8}. Cook {3}, chopped, then {5}, {6} and {4}, all chopped, until thick. Add {7} and the salt.", 10],
      ["Simmer", "Add the dal and simmer on low for 20 minutes, stirring. Stir in {2} at the end.", 20, 1200],
    ],
  },
  dal_palak: {
    served: 280, keeps: 2, batch: true,
    g: [["toor_dal", 50], ["spinach", 60], ["garlic", 5], ["tomato", 40], ["cumin", 1], ["turmeric", 0.5], ["ghee", 7], ["salt", 1.5]],
    steps: [
      ["Cook the dal", "Pressure-cook {0} with {5} and {water:300} for 3 whistles, or simmer covered for 30 minutes, until soft.", 25, 1500],
      ["Temper", "Heat {6}. Add {4}, then {2}, sliced, and {3}, chopped. Cook 3 minutes.", 4],
      ["Wilt the spinach", "Add {1}, chopped, and stir until it wilts, about 2 minutes.", 2],
      ["Finish", "Pour in the dal with the salt and simmer 5 minutes.", 5, 300],
    ],
  },
  dal_tadka: {
    served: 280, keeps: 3, batch: true,
    g: [["toor_dal", 50], ["ghee", 8], ["cumin", 1], ["garlic", 5], ["onion", 30], ["tomato", 40], ["turmeric", 0.5], ["green_chilli", 2], ["asafoetida", 0.1], ["salt", 1.5]],
    steps: [
      ["Cook the dal", "Pressure-cook {0} with {6} and {water:300} for 3 whistles, or simmer covered for 30 minutes, until soft. Whisk it smooth.", 25, 1500],
      ["Make the tadka", "Heat {1}. Add {2} and {8}, then {3}, {7} and {4}, all chopped. Cook until golden, about 4 minutes.", 5],
      ["Finish", "Add {5}, chopped, cook 2 minutes, then pour in the dal with the salt and simmer 5 minutes.", 7, 300],
    ],
  },
  dum_aloo: {
    served: 260, keeps: 2, batch: true,
    g: [["potato", 150], ["curd", 50], ["tomato", 50], ["onion", 40], ["ginger", 3], ["garam_masala", 2], ["sunflower_oil", 10], ["salt", 1.5]],
    steps: [
      ["Boil", "Boil {0} until just tender, about 12 minutes. Peel, prick all over with a fork and fry in the oil ({6} in all) until golden.", 20, 720],
      ["Make the gravy", "In the same pan cook {3}, {4} and {2}, all chopped, until soft. Lower the heat, stir in {1}, whisked, {5} and the salt.", 8],
      ["Simmer", "Add the potatoes and {water:80}. Cover and cook on low for 10 minutes.", 10, 600],
    ],
  },
  egg_curry: {
    served: 260, keeps: 2, batch: true,
    g: [["egg", 100], ["onion", 50], ["tomato", 70], ["garlic", 5], ["ginger", 4], ["garam_masala", 2], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Boil the eggs", "Boil {0} for 9 minutes, cool them in water and peel.", 12, 540],
      ["Make the masala", "Heat {6}. Cook {1}, chopped, for 5 minutes, then {3} and {4}, crushed, and {2}, chopped, until soft. Add {5} and the salt.", 10],
      ["Simmer", "Add {water:120} and simmer 5 minutes. Halve the eggs, slide them in and cook 3 minutes more.", 8, 480],
    ],
  },
  fish_curry: {
    served: 280, keeps: 1,
    g: [["fish", 150], ["onion", 40], ["tomato", 60], ["garlic", 5], ["turmeric", 1], ["green_chilli", 3], ["mustard_oil", 8], ["salt", 1.5]],
    steps: [
      ["Marinate", "Rub {0}, in pieces, with {4} and half the salt. Leave it 10 minutes.", 12],
      ["Fry the fish", "Heat {6} and fry the fish 2 minutes a side. Lift it out.", 5],
      ["Make the gravy", "In the same oil cook {1}, {3} and {5}, all chopped, for 4 minutes, then {2}, chopped, until soft. Add {water:150} and the rest of the salt.", 10],
      ["Simmer", "Slide the fish back in and simmer 6 minutes.", 6, 360],
    ],
  },
  fish_fry: {
    served: 140, keeps: 0,
    g: [["fish", 150], ["turmeric", 1], ["green_chilli", 3], ["lemon_juice", 5], ["rice_flour", 10], ["sunflower_oil", 10], ["salt", 1.5]],
    steps: [
      ["Marinate", "Rub {0} with {1}, {2}, crushed, the lemon and the salt. Leave it 15 minutes.", 16],
      ["Coat", "Dust both sides with {4}.", 2],
      ["Fry", "Heat {5} in a flat pan and fry the fish 3 to 4 minutes a side until crisp.", 8, 240],
    ],
  },
  gatte_ki_sabzi: {
    served: 250, keeps: 2,
    g: [["besan", 50], ["curd", 80], ["carom", 0.5], ["turmeric", 0.5], ["green_chilli", 2], ["cumin", 1], ["sunflower_oil", 10], ["salt", 1.5]],
    steps: [
      ["Make the gatte", "Knead {0} with {2}, a pinch of the salt, a teaspoon of the oil ({6} in all) and a little water into a stiff dough. Roll it into thin logs.", 10],
      ["Boil", "Boil the logs in water for 10 minutes, then cut them into pieces. Keep the water.", 12, 600],
      ["Make the gravy", "Heat the rest of the oil. Add {5} and {4}, chopped, then {1}, whisked with {3} and the rest of the salt. Stir all the time until it comes to a boil.", 6],
      ["Simmer", "Add the gatte with {water:100} (use their cooking water). Simmer 8 minutes.", 8, 480],
    ],
  },
  grilled_chicken_salad: {
    served: 330, keeps: 1,
    g: [["chicken_breast", 150], ["cucumber", 80], ["tomato", 60], ["onion", 25], ["lemon_juice", 10], ["black_pepper", 0.5], ["olive_oil", 8], ["salt", 1.5]],
    steps: [
      ["Season", "Rub {0} with {5}, half the salt and a little of the oil ({6} in all).", 3],
      ["Grill", "Cook it in a hot grill pan for 6 minutes a side, until no pink is left inside. Rest it 3 minutes, then slice.", 15, 720],
      ["Toss", "Chop {1}, {2} and {3}, and toss them with the lemon, the rest of the oil and the rest of the salt. Lay the chicken on top.", 5],
    ],
  },
  jain_moong_dal: {
    served: 260, keeps: 2, batch: true,
    g: [["moong_dal", 50], ["ghee", 7], ["cumin", 1], ["tomato", 40], ["turmeric", 0.5], ["salt", 1.5]],
    steps: [
      ["Cook the dal", "Pressure-cook {0} with {4} and {water:300} for 2 whistles, or simmer covered for 20 minutes, until soft.", 20, 1200],
      ["Temper", "Heat {1}. Add {2}, then {3}, chopped, and cook 3 minutes.", 4],
      ["Finish", "Pour in the dal with the salt and simmer 5 minutes.", 5, 300],
    ],
  },
  jeera_aloo: {
    served: 190, keeps: 2,
    g: [["potato", 180], ["cumin", 1.5], ["turmeric", 0.5], ["green_chilli", 2], ["coriander_leaves", 3], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Boil", "Boil {0} until just tender, about 12 minutes. Peel and cut into cubes.", 15, 720],
      ["Temper", "Heat {5}. Add {1}; when it sizzles, add {3}, slit.", 2],
      ["Fry", "Add the potatoes, {2} and the salt. Fry 5 minutes until the edges crisp, then scatter {4}.", 6],
    ],
  },
  kadai_paneer: {
    served: 280, keeps: 2, batch: true,
    g: [["paneer", 120], ["capsicum", 80], ["onion", 50], ["tomato", 70], ["coriander_seeds", 2], ["green_chilli", 2], ["garam_masala", 1], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Crush the spices", "Dry-roast {4} for a minute, then crush coarsely.", 3],
      ["Cook the masala", "Heat {7}. Cook {2}, chopped, for 4 minutes, then {3} and {5}, chopped, until soft. Add the crushed spice, {6} and the salt.", 8],
      ["Add the capsicum", "Add {1}, in squares, and cook 3 minutes so it stays crunchy.", 3],
      ["Add the paneer", "Stir in {0}, cubed, and warm it through for 2 minutes.", 2],
    ],
  },
  kaddu_sabzi: {
    served: 190, keeps: 2,
    g: [["pumpkin", 180], ["fenugreek_seeds", 0.5], ["jaggery", 8], ["amchur", 1], ["green_chilli", 2], ["mustard_oil", 7], ["salt", 1.5]],
    steps: [
      ["Temper", "Heat {5}. Add {1} and {4}, slit.", 2],
      ["Cook", "Add {0}, cubed, and the salt. Cover and cook on low for 12 minutes, until soft.", 12, 720],
      ["Finish", "Mash it lightly with {2} and {3}.", 2],
    ],
  },
  kadhi: {
    served: 300, keeps: 2, batch: true,
    g: [["curd", 120], ["besan", 20], ["fenugreek_seeds", 0.5], ["cumin", 1], ["turmeric", 0.5], ["curry_leaves", 1], ["green_chilli", 2], ["asafoetida", 0.1], ["ghee", 6], ["salt", 1.5]],
    steps: [
      ["Whisk", "Whisk {0} with {1}, {4}, the salt and {water:200} until smooth.", 3],
      ["Simmer", "Bring it to a boil, stirring all the time, then simmer on low for 15 minutes until it thickens.", 15, 900],
      ["Temper", "Heat {8}. Add {2}, {3}, {7}, {5} and {6}, slit, and pour it over the kadhi.", 2],
    ],
  },
};

export default mains1;
