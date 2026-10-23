// Breakfasts: one adult serving each. `g` is [food, grams] per dish line, in
// the dish's own line order (dishData.js); `served` is the plated weight in g;
// `keeps` is days in the fridge once cooked (0 = eat it fresh). Steps are
// [title, text, minutes, timerSeconds]; {n} and {water:g} are filled in by
// recipes.js at the servings being cooked.

const breakfast = {
  aloo_paratha: {
    served: 220, keeps: 0,
    g: [["atta", 80], ["potato", 120], ["green_chilli", 4], ["coriander_leaves", 4], ["ghee", 8], ["salt", 2]],
    steps: [
      ["Make the dough", "Knead {0} with a pinch of the salt and about {water:50} into a soft dough. Cover it for 10 minutes.", 12],
      ["Make the filling", "Boil {1} until soft, about 15 minutes. Peel and mash with {2} and {3}, both finely chopped, and the rest of the salt.", 20, 900],
      ["Roll and stuff", "Divide the dough into 2 balls. Roll each into a small circle, put half the filling in the middle, pinch it shut and roll it out gently.", 8],
      ["Cook", "Cook each paratha on a hot tawa for a minute a side, then brush with {4} and cook until golden spots appear.", 8, 120],
    ],
  },
  besan_chilla: {
    served: 200, keeps: 0,
    g: [["besan", 60], ["onion", 30], ["tomato", 30], ["coriander_leaves", 3], ["green_chilli", 3], ["turmeric", 0.5], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Make the batter", "Whisk {0} with {water:90} into a smooth, pourable batter. Stir in {5} and the salt.", 5],
      ["Add the vegetables", "Finely chop {1}, {2}, {4} and {3}, and mix them into the batter.", 5],
      ["Cook", "Brush a hot non-stick pan with a little oil ({6} in all). Pour in a ladle of batter, spread it thin and cook 2 minutes a side until golden. Repeat with the rest.", 10, 120],
    ],
  },
  boiled_eggs: {
    served: 100, keeps: 1,
    g: [["egg", 100], ["black_pepper", 0.3], ["salt", 0.5]],
    steps: [
      ["Boil", "Put {0} in a pan, cover with water and bring to a boil. Simmer 9 minutes for firm yolks.", 12, 540],
      ["Cool and peel", "Move them to cold water for 2 minutes, then peel.", 3, 120],
      ["Season", "Halve them and sprinkle with the pepper and salt.", 1],
    ],
  },
  bread_omelette: {
    served: 200, keeps: 0,
    g: [["egg", 100], ["bread_white", 60], ["onion", 25], ["green_chilli", 3], ["sunflower_oil", 6], ["salt", 1]],
    steps: [
      ["Beat the eggs", "Beat {0} with {2} and {3}, both finely chopped, and the salt.", 4],
      ["Cook", "Heat {4} in a pan. Pour in the eggs and lay {1} on top while it is still wet.", 3],
      ["Flip and fold", "After a minute, flip it so the bread toasts. Fold the omelette over the bread and cook 1 more minute.", 3, 60],
    ],
  },
  curd_fruit_bowl: {
    served: 360, keeps: 0,
    g: [["curd", 200], ["banana", 100], ["pomegranate", 40], ["almonds", 12], ["honey", 7]],
    steps: [
      ["Fill the bowl", "Spoon {0} into a bowl.", 1],
      ["Add the fruit", "Slice {1} on top and scatter {2}.", 3],
      ["Finish", "Add {3}, chopped, and drizzle with {4}.", 1],
    ],
  },
  egg_bhurji: {
    served: 230, keeps: 0,
    g: [["egg", 150], ["onion", 40], ["tomato", 50], ["green_chilli", 3], ["turmeric", 0.5], ["sunflower_oil", 7], ["salt", 1.5]],
    steps: [
      ["Cook the onion", "Heat {5} in a pan. Cook {1}, chopped, and {3} for 3 minutes until soft.", 4],
      ["Add the tomato", "Add {2}, chopped, {4} and the salt. Cook 2 minutes.", 3],
      ["Scramble", "Pour in {0}, beaten. Stir gently over medium heat until just set, about 2 minutes.", 3, 120],
    ],
  },
  gobi_paratha: {
    served: 210, keeps: 0,
    g: [["atta", 80], ["cauliflower", 100], ["green_chilli", 3], ["coriander_leaves", 4], ["carom", 0.5], ["ghee", 8], ["salt", 2]],
    steps: [
      ["Make the dough", "Knead {0} with a pinch of the salt and about {water:50} into a soft dough. Cover it for 10 minutes.", 12],
      ["Make the filling", "Grate {1} finely, sprinkle with the rest of the salt and squeeze out the water after 5 minutes. Mix in {2}, chopped, {3} and {4}.", 10],
      ["Roll and stuff", "Divide the dough into 2 balls. Roll each into a small circle, put half the filling in the middle, pinch it shut and roll it out gently.", 8],
      ["Cook", "Cook each paratha on a hot tawa for a minute a side, then brush with {5} and cook until golden spots appear.", 8, 120],
    ],
  },
  idli: {
    served: 200, keeps: 1,
    g: [["rice_white", 50], ["urad_dal", 20], ["fenugreek_seeds", 0.5], ["salt", 1]],
    steps: [
      ["Soak", "Soak {0} and, separately, {1} with {2} in water for 5 hours.", 5],
      ["Grind and ferment", "Grind each to a smooth batter, mix them with the salt and leave covered overnight, about 10 hours, to rise.", 15],
      ["Steam", "Pour the batter into greased idli moulds and steam for 12 minutes.", 15, 720],
    ],
  },
  kanda_poha: {
    served: 180, keeps: 0,
    g: [["poha", 60], ["onion", 50], ["mustard_seeds", 1], ["turmeric", 0.5], ["curry_leaves", 1], ["green_chilli", 3], ["peanuts", 10], ["lemon_juice", 5], ["sunflower_oil", 7], ["salt", 1.5]],
    steps: [
      ["Rinse the poha", "Rinse {0} in a sieve under the tap for 30 seconds and leave it to soften.", 2],
      ["Temper", "Heat {8}. Add {2}; when they splutter, add {4}, {5}, chopped, and {6}. Fry 1 minute.", 3],
      ["Add the onion", "Cook {1}, chopped, for 3 minutes until soft. Stir in {3} and the salt.", 4],
      ["Finish", "Fold in the poha, cover and steam 2 minutes on low. Squeeze over the lemon.", 3, 120],
    ],
  },
  kuttu_chilla: {
    served: 180, keeps: 0,
    g: [["buckwheat_flour", 60], ["potato", 60], ["green_chilli", 3], ["coriander_leaves", 3], ["ghee", 8], ["rock_salt", 1.5]],
    steps: [
      ["Boil the potato", "Boil {1} until soft, about 15 minutes, then peel and grate it.", 15, 900],
      ["Make the batter", "Mix {0} with the potato, {2} and {3}, both chopped, the salt and {water:90} into a thick batter.", 5],
      ["Cook", "Brush a hot tawa with a little ghee ({4} in all). Spread a ladle of batter and cook 2 minutes a side until crisp.", 10, 120],
    ],
  },
  masala_dosa: {
    served: 300, keeps: 0,
    g: [["rice_white", 60], ["urad_dal", 20], ["fenugreek_seeds", 0.5], ["potato", 120], ["onion", 40], ["mustard_seeds", 1], ["curry_leaves", 1], ["turmeric", 0.5], ["sunflower_oil", 10], ["salt", 2]],
    steps: [
      ["Soak", "Soak {0} and, separately, {1} with {2} in water for 5 hours.", 5],
      ["Grind and ferment", "Grind each to a smooth batter, mix with half the salt and leave covered overnight to rise.", 15],
      ["Make the potato filling", "Boil {3}, peel and break into chunks. Heat half the oil ({8} in all), add {5} and {6}, then {4}, sliced. Cook 4 minutes, then add {7}, the potatoes and the rest of the salt.", 25],
      ["Make the dosa", "Spread a ladle of batter thin on a hot tawa, drizzle the rest of the oil around it and cook until crisp, about 2 minutes. Fill with the potato and fold.", 10, 120],
    ],
  },
  masala_oats: {
    served: 260, keeps: 0,
    g: [["oats", 50], ["onion", 30], ["tomato", 40], ["carrot", 30], ["peas", 20], ["turmeric", 0.5], ["sunflower_oil", 5], ["salt", 1.5]],
    steps: [
      ["Cook the vegetables", "Heat {6}. Cook {1}, {2} and {3}, all chopped, with {4} for 4 minutes.", 5],
      ["Add the oats", "Stir in {0}, {5} and the salt, then {water:240}.", 2],
      ["Simmer", "Cook on low, stirring, for 4 minutes until thick.", 4, 240],
    ],
  },
  masala_omelette: {
    served: 180, keeps: 0,
    g: [["egg", 150], ["onion", 30], ["green_chilli", 3], ["sunflower_oil", 5], ["salt", 1]],
    steps: [
      ["Beat", "Beat {0} with {1} and {2}, both finely chopped, and the salt.", 3],
      ["Cook", "Heat {3} in a pan, pour in the eggs and cook on medium until the top is nearly set, about 2 minutes.", 3, 120],
      ["Fold", "Fold it in half and cook 30 seconds more.", 1],
    ],
  },
  medu_vada: {
    served: 120, keeps: 0,
    g: [["urad_dal", 50], ["green_chilli", 3], ["curry_leaves", 1], ["black_pepper", 0.5], ["ginger", 3], ["sunflower_oil", 12], ["salt", 1.5]],
    steps: [
      ["Soak", "Soak {0} in water for 4 hours, then drain.", 2],
      ["Grind", "Grind the dal with very little water into a thick, fluffy batter. Mix in {1}, {4} and {2}, all finely chopped, {3} and the salt.", 10],
      ["Fry", "Heat oil for deep frying. Wet your hands, shape the batter into rings and fry until golden, about 4 minutes. Each serving soaks up about {5}.", 15, 240],
    ],
  },
  misal_pav: {
    served: 350, keeps: 2, batch: true,
    g: [["moong_whole", 50], ["onion", 40], ["tomato", 40], ["garlic", 4], ["ginger", 3], ["green_chilli", 3], ["coconut_fresh", 8], ["garam_masala", 2], ["pav", 80], ["sunflower_oil", 10], ["salt", 2]],
    steps: [
      ["Cook the moong", "Boil {0}, sprouted overnight if you can, with {water:300} until soft, about 15 minutes.", 15, 900],
      ["Make the masala", "Heat {9}. Cook {1}, chopped, for 4 minutes, then {3}, {4}, {5} and {6}. Add {2}, chopped, and {7}; cook until the oil separates.", 10],
      ["Bring it together", "Add the moong with its water and the salt. Simmer 10 minutes.", 10, 600],
      ["Serve", "Serve hot with {8}, toasted.", 2],
    ],
  },
  moong_chilla: {
    served: 200, keeps: 0,
    g: [["moong_dal", 60], ["ginger", 3], ["green_chilli", 3], ["coriander_leaves", 3], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Soak", "Soak {0} in water for 3 hours, then drain.", 2],
      ["Grind", "Grind the dal with {1}, {2} and {water:60} into a smooth batter. Stir in {3}, chopped, and the salt.", 6],
      ["Cook", "Brush a hot tawa with a little oil ({4} in all). Spread a ladle of batter thin and cook 2 minutes a side until golden.", 10, 120],
    ],
  },
  muesli_curd: {
    served: 310, keeps: 0,
    g: [["oats", 50], ["curd", 200], ["banana", 60]],
    steps: [
      ["Mix", "Stir {0} into {1}.", 1],
      ["Rest", "Leave it 5 minutes to soften.", 5, 300],
      ["Top", "Slice {2} over the top.", 1],
    ],
  },
  mushroom_omelette: {
    served: 220, keeps: 0,
    g: [["egg", 150], ["mushroom", 60], ["onion", 20], ["black_pepper", 0.3], ["sunflower_oil", 6], ["salt", 1]],
    steps: [
      ["Cook the mushrooms", "Heat {4}. Cook {1}, sliced, and {2}, chopped, for 4 minutes until the mushrooms brown.", 5],
      ["Add the eggs", "Pour in {0}, beaten with the salt and {3}.", 1],
      ["Cook and fold", "Cook on medium until nearly set, about 2 minutes, then fold.", 3, 120],
    ],
  },
  oats_porridge: {
    served: 330, keeps: 0,
    g: [["oats", 50], ["milk_toned", 250], ["banana", 60], ["honey", 7]],
    steps: [
      ["Simmer", "Bring {1} to a simmer, stir in {0} and cook on low for 4 minutes, stirring.", 5, 240],
      ["Top", "Serve with {2}, sliced, and {3}.", 1],
    ],
  },
  overnight_oats: {
    served: 270, keeps: 2, batch: true,
    g: [["oats", 50], ["milk_toned", 150], ["chia", 5], ["banana", 60], ["honey", 7]],
    steps: [
      ["Mix", "In a jar, stir {0}, {1} and {2} together.", 2],
      ["Chill", "Close the jar and leave it in the fridge overnight, at least 6 hours.", 1],
      ["Top", "In the morning, add {3}, sliced, and {4}.", 1],
    ],
  },
  paneer_paratha: {
    served: 220, keeps: 0,
    g: [["atta", 80], ["paneer", 60], ["green_chilli", 3], ["coriander_leaves", 4], ["ghee", 8], ["salt", 2]],
    steps: [
      ["Make the dough", "Knead {0} with a pinch of the salt and about {water:50} into a soft dough. Cover it for 10 minutes.", 12],
      ["Make the filling", "Crumble {1} and mix it with {2}, chopped, {3} and the rest of the salt.", 4],
      ["Roll and stuff", "Divide the dough into 2 balls. Roll each into a small circle, put half the filling in the middle, pinch it shut and roll it out gently.", 8],
      ["Cook", "Cook each paratha on a hot tawa for a minute a side, then brush with {4} and cook until golden spots appear.", 8, 120],
    ],
  },
  peanut_butter_toast: {
    served: 160, keeps: 0,
    g: [["bread_brown", 64], ["peanut_butter", 32], ["banana", 60]],
    steps: [
      ["Toast", "Toast {0}.", 3],
      ["Spread", "Spread {1} over them.", 1],
      ["Top", "Slice {2} on top.", 1],
    ],
  },
  pesarattu: {
    served: 200, keeps: 0,
    g: [["moong_whole", 60], ["ginger", 3], ["green_chilli", 3], ["onion", 25], ["cumin", 1], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Soak", "Soak {0} in water for 4 hours, then drain.", 2],
      ["Grind", "Grind the moong with {1}, {2}, {4}, the salt and {water:80} into a smooth batter.", 6],
      ["Cook", "Spread a ladle of batter thin on a hot tawa, scatter {3}, finely chopped, and drizzle a little oil around it ({5} in all). Cook until crisp, about 3 minutes.", 10, 180],
    ],
  },
  ragi_dosa: {
    served: 200, keeps: 0,
    g: [["ragi_flour", 40], ["rice_flour", 20], ["onion", 25], ["green_chilli", 3], ["cumin", 1], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Make the batter", "Whisk {0} and {1} with {water:150} and the salt into a thin batter. Stir in {2} and {3}, both chopped, and {4}.", 5],
      ["Rest", "Leave it for 10 minutes.", 10, 600],
      ["Cook", "Pour the batter onto a hot tawa from a height, like a lacy net. Drizzle {5} around it and cook 3 minutes until crisp.", 10, 180],
    ],
  },
  ragi_porridge: {
    served: 260, keeps: 0,
    g: [["ragi_flour", 30], ["milk_toned", 200], ["jaggery", 10]],
    steps: [
      ["Mix", "Whisk {0} into {water:100} until smooth, with no lumps.", 2],
      ["Cook", "Add {1} and cook on low, stirring all the time, for 6 minutes until thick.", 7, 360],
      ["Sweeten", "Stir in {2}.", 1],
    ],
  },
  rajgira_porridge: {
    served: 260, keeps: 0,
    g: [["amaranth_flour", 35], ["milk_toned", 200], ["jaggery", 10], ["cardamom", 0.2]],
    steps: [
      ["Mix", "Whisk {0} into {water:100} until smooth.", 2],
      ["Cook", "Add {1} and cook on low, stirring, for 6 minutes until thick.", 7, 360],
      ["Finish", "Stir in {2} and {3}, crushed.", 1],
    ],
  },
  rava_upma: {
    served: 230, keeps: 0,
    g: [["semolina", 50], ["onion", 40], ["mustard_seeds", 1], ["curry_leaves", 1], ["ginger", 3], ["green_chilli", 3], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Roast the rava", "Dry-roast {0} in a pan for 4 minutes, until it smells nutty. Set it aside.", 5],
      ["Temper", "Heat {6}. Add {2}; when they splutter, add {3}, {4} and {5}, chopped, then {1}, chopped. Cook 3 minutes.", 4],
      ["Cook", "Pour in {water:200} with the salt and bring to a boil. Stir in the rava slowly, cover and cook on low for 3 minutes.", 5, 180],
    ],
  },
  sabudana_khichdi: {
    served: 220, keeps: 0,
    g: [["sago", 60], ["peanuts", 15], ["potato", 60], ["green_chilli", 3], ["cumin", 1], ["ghee", 8], ["rock_salt", 1.5], ["lemon_juice", 5]],
    steps: [
      ["Soak", "Rinse {0} and soak it in just enough water to cover for 5 hours.", 2],
      ["Prepare", "Roast {1} and crush them coarsely. Boil {2} and cut it into cubes.", 15],
      ["Cook", "Heat {5}, add {4} and {3}, then the potato. Add the drained sabudana, the peanuts and the salt. Stir on low until the pearls turn clear, about 5 minutes.", 7, 300],
      ["Finish", "Squeeze over the lemon.", 1],
    ],
  },
  sprouts_chaat: {
    served: 260, keeps: 1,
    g: [["moong_sprouts", 200], ["onion", 30], ["tomato", 40], ["lemon_juice", 10], ["green_chilli", 2], ["salt", 1]],
    steps: [
      ["Steam the sprouts", "Steam {0} for 5 minutes so they soften a little.", 6, 300],
      ["Chop", "Chop {1}, {2} and {4} finely.", 4],
      ["Toss", "Mix everything with {3} and the salt.", 1],
    ],
  },
  thepla: {
    served: 150, keeps: 2,
    g: [["atta", 70], ["fenugreek_leaves", 25], ["curd", 20], ["turmeric", 0.5], ["green_chilli", 2], ["carom", 0.5], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Make the dough", "Mix {0} with {1}, finely chopped, {2}, {3}, {4}, chopped, {5}, the salt and a teaspoon of the oil ({6} in all). Knead with about {water:30} into a firm dough.", 10],
      ["Roll", "Divide it into small balls, about 3 a serving, and roll each thin.", 6],
      ["Cook", "Cook each on a hot tawa for a minute a side, brushing with the rest of the oil, until golden spots appear.", 8, 60],
    ],
  },
  uttapam: {
    served: 220, keeps: 0,
    g: [["rice_white", 50], ["urad_dal", 15], ["onion", 30], ["tomato", 30], ["green_chilli", 2], ["coriander_leaves", 2], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Soak", "Soak {0} and, separately, {1} in water for 5 hours.", 5],
      ["Grind and ferment", "Grind each to a smooth batter, mix with the salt and leave covered overnight to rise.", 15],
      ["Cook", "Pour a thick ladle of batter onto a hot tawa. Scatter {2}, {3}, {4} and {5}, all chopped, on top and press them in. Drizzle {6} and cook 3 minutes a side.", 10, 180],
    ],
  },
  veg_dalia: {
    served: 280, keeps: 2, batch: true,
    g: [["broken_wheat", 50], ["carrot", 30], ["peas", 25], ["onion", 30], ["cumin", 1], ["turmeric", 0.5], ["sunflower_oil", 6], ["salt", 1.5]],
    steps: [
      ["Roast", "Dry-roast {0} for 3 minutes.", 4],
      ["Cook the vegetables", "Heat {6}, add {4}, then {3}, {1} and {2}, chopped. Cook 3 minutes with {5} and the salt.", 4],
      ["Cook the dalia", "Add the dalia and {water:250}. Pressure-cook for 2 whistles, or simmer covered for 15 minutes.", 15, 900],
    ],
  },
  ven_pongal: {
    served: 260, keeps: 1,
    g: [["rice_white", 45], ["moong_dal", 20], ["black_pepper", 1], ["cumin", 1], ["ginger", 3], ["curry_leaves", 1], ["cashews", 6], ["ghee", 10], ["salt", 1.5]],
    steps: [
      ["Roast the dal", "Dry-roast {1} for 2 minutes.", 3],
      ["Cook", "Cook it with {0} and {water:300} until very soft: 3 whistles, or 20 minutes covered.", 20, 1200],
      ["Temper", "Heat {7}. Fry {6}, then {2}, {3}, {4}, chopped, and {5}. Pour it over the pongal with the salt and mix.", 4],
    ],
  },
};

export default breakfast;
