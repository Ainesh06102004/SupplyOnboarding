// One-pot meals (a full plate on their own) and bases (the rice or roti a main
// is eaten with). One adult serving each. Format: see breakfast.js.

const onePotAndBase = {
  bisi_bele_bath: {
    served: 400, keeps: 2, batch: true,
    g: [["rice_white", 50], ["toor_dal", 30], ["tamarind", 8], ["sambar_powder", 7], ["carrot", 30], ["french_beans", 30], ["peas", 20], ["mustard_seeds", 1], ["curry_leaves", 1], ["ghee", 10], ["salt", 2]],
    steps: [
      ["Cook the rice and dal", "Pressure-cook {0} and {1} together with {water:450} for 4 whistles, or simmer covered for 35 minutes, until very soft.", 30, 1800],
      ["Cook the vegetables", "Simmer {4} and {5}, chopped, with {6}, {2}, {3}, the salt and {water:150} for 10 minutes.", 12, 600],
      ["Bring it together", "Stir the vegetables into the rice and dal. Simmer 5 minutes; it should be soft and spoonable.", 5, 300],
      ["Temper", "Heat {9}. Add {7}; when they splutter, add {8}, and pour it over.", 2],
    ],
  },
  chicken_biryani: {
    served: 420, keeps: 2, batch: true,
    g: [["rice_white", 75], ["chicken_curry_cut", 130], ["curd", 50], ["onion", 60], ["ginger", 4], ["garlic", 5], ["mint", 3], ["garam_masala", 2], ["ghee", 12], ["salt", 2]],
    steps: [
      ["Marinate", "Mix {1} with {2}, {4} and {5}, grated, {7}, half the salt and {6}, torn. Leave it 1 hour.", 8],
      ["Fry the onion", "Heat {8} in a heavy pot. Fry {3}, sliced thin, for 10 minutes until deep golden. Take out half for the top.", 10],
      ["Cook the chicken", "Add the chicken to the pot and cook on medium for 10 minutes.", 10, 600],
      ["Par-boil the rice", "Meanwhile boil {0}, rinsed, in plenty of salted water for 5 minutes, until two-thirds cooked. Drain.", 8, 300],
      ["Layer and steam", "Spread the rice over the chicken, scatter the fried onion, cover tightly and cook on the lowest heat for 20 minutes.", 20, 1200],
    ],
  },
  coconut_rice: {
    served: 260, keeps: 1,
    g: [["rice_white", 70], ["coconut_fresh", 35], ["mustard_seeds", 1], ["curry_leaves", 1], ["urad_dal", 4], ["cashews", 6], ["coconut_oil", 7], ["salt", 1.5]],
    steps: [
      ["Cook the rice", "Cook {0} with {water:170} and the salt, covered on low, for 15 minutes. Spread it out to cool a little.", 18, 900],
      ["Temper", "Heat {6}. Add {2} and {4}; when the dal turns golden, add {5} and {3}.", 3],
      ["Toss", "Add {1} and stir 1 minute, then fold in the rice.", 2],
    ],
  },
  curd_rice: {
    served: 350, keeps: 1,
    g: [["rice_white", 60], ["curd", 150], ["mustard_seeds", 1], ["curry_leaves", 1], ["salt", 1.5]],
    steps: [
      ["Cook the rice", "Cook {0} with {water:180} until very soft, about 18 minutes. Mash it lightly and let it cool.", 20, 1080],
      ["Mix", "Stir in {1} and the salt.", 2],
      ["Temper", "Heat a little oil, add {2}; when they splutter, add {3} and pour it over.", 2],
    ],
  },
  egg_fried_rice: {
    served: 330, keeps: 1,
    g: [["rice_white", 70], ["egg", 100], ["spring_onion", 15], ["carrot", 30], ["capsicum", 30], ["garlic", 5], ["soy_sauce", 10], ["sunflower_oil", 10], ["salt", 1]],
    steps: [
      ["Cook the rice", "Cook {0} with {water:150} and let it cool completely, ideally in the fridge overnight.", 18, 900],
      ["Scramble the eggs", "Heat a little of the oil ({7} in all) on high. Scramble {1}, beaten, until just set and take them out.", 3],
      ["Stir-fry", "Add the rest of the oil, {5}, chopped, then {3} and {4}, cut small. Toss 2 minutes.", 3],
      ["Finish", "Add the rice, the eggs, {6} and the salt. Toss on high for 3 minutes, then scatter {2}, sliced.", 4],
    ],
  },
  hakka_noodles: {
    served: 300, keeps: 1,
    g: [["noodles_dry", 75], ["cabbage", 50], ["carrot", 30], ["capsicum", 40], ["spring_onion", 15], ["garlic", 5], ["soy_sauce", 10], ["sunflower_oil", 10], ["salt", 1]],
    steps: [
      ["Boil the noodles", "Boil {0} in plenty of water until just done, about 4 minutes. Drain, rinse in cold water and toss with a little of the oil ({7} in all).", 8, 240],
      ["Stir-fry", "Heat the rest of the oil on high. Add {5}, chopped, then {1}, {2} and {3}, all cut thin. Toss 2 minutes.", 3],
      ["Finish", "Add the noodles, {6} and the salt. Toss 2 minutes and scatter {4}, sliced.", 3],
    ],
  },
  lemon_rice: {
    served: 250, keeps: 1,
    g: [["rice_white", 70], ["lemon_juice", 15], ["mustard_seeds", 1], ["curry_leaves", 1], ["peanuts", 12], ["turmeric", 0.5], ["green_chilli", 2], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Cook the rice", "Cook {0} with {water:170} and the salt, covered on low, for 15 minutes. Spread it out to cool.", 18, 900],
      ["Temper", "Heat {7}. Add {2}; when they splutter, add {4}, {3}, {6}, slit, and {5}.", 3],
      ["Toss", "Fold in the rice, then the lemon juice ({1}).", 2],
    ],
  },
  moong_khichdi: {
    served: 350, keeps: 1,
    g: [["rice_white", 45], ["moong_dal", 30], ["ghee", 8], ["cumin", 1], ["turmeric", 0.5], ["salt", 1.5]],
    steps: [
      ["Rinse", "Rinse {0} and {1} together until the water runs clear.", 2],
      ["Cook", "Pressure-cook them with {4}, the salt and {water:450} for 3 whistles, or simmer covered for 25 minutes, until soft and porridge-like.", 20, 1200],
      ["Temper", "Heat {2}, add {3} and pour it over the khichdi.", 2],
    ],
  },
  pav_bhaji: {
    served: 420, keeps: 2, batch: true,
    g: [["potato", 100], ["cauliflower", 50], ["peas", 40], ["capsicum", 40], ["tomato", 80], ["onion", 40], ["butter", 12], ["pav_bhaji_masala", 5], ["pav", 80], ["lemon_juice", 5], ["salt", 1.5]],
    steps: [
      ["Boil the vegetables", "Boil {0}, {1} and {2}, chopped, until soft, about 15 minutes. Mash them.", 15, 900],
      ["Cook the bhaji", "Melt most of the butter ({6} in all). Cook {5} and {3}, chopped, for 4 minutes, then {4}, chopped, {7} and the salt until soft.", 8],
      ["Bring it together", "Add the mash and {water:100}. Cook 10 minutes, mashing and stirring, until thick.", 10, 600],
      ["Toast the pav", "Toast {8}, split, in the rest of the butter. Serve with the bhaji and the lemon.", 3],
    ],
  },
  quinoa_pulao: {
    served: 280, keeps: 2, batch: true,
    g: [["quinoa", 60], ["onion", 40], ["carrot", 30], ["peas", 30], ["cumin", 1], ["olive_oil", 7], ["salt", 1.5]],
    steps: [
      ["Rinse", "Rinse {0} well in a fine sieve.", 2],
      ["Cook the vegetables", "Heat {5}. Add {4}, then {1}, {2} and {3}, chopped. Cook 3 minutes.", 4],
      ["Cook", "Add the quinoa, the salt and {water:150}. Cover and cook on low for 15 minutes, then leave it covered 5 minutes and fluff it up.", 20, 900],
    ],
  },
  tomato_rice: {
    served: 300, keeps: 2, batch: true,
    g: [["rice_white", 70], ["tomato", 100], ["onion", 40], ["ginger", 3], ["garlic", 4], ["garam_masala", 1], ["mustard_seeds", 1], ["curry_leaves", 1], ["sunflower_oil", 8], ["salt", 1.5]],
    steps: [
      ["Make the masala", "Heat {8}. Add {6} and {7}, then {2}, chopped, for 4 minutes, {3} and {4}, crushed, then {1}, chopped, {5} and the salt. Cook until thick.", 10],
      ["Cook", "Add {0}, rinsed, and {water:150}. Cover and cook on low for 15 minutes.", 15, 900],
      ["Rest", "Leave it covered 5 minutes, then fluff it up.", 5, 300],
    ],
  },
  veg_biryani: {
    served: 400, keeps: 2, batch: true,
    g: [["rice_white", 75], ["carrot", 30], ["french_beans", 30], ["peas", 30], ["potato", 50], ["onion", 50], ["curd", 40], ["mint", 3], ["garam_masala", 2], ["ghee", 10], ["salt", 2]],
    steps: [
      ["Fry the onion", "Heat {9} in a heavy pot. Fry {5}, sliced thin, until deep golden, about 10 minutes. Take out half for the top.", 10],
      ["Cook the vegetables", "Add {1}, {2} and {4}, cut small, with {3}, {6}, {8} and half the salt. Cook 8 minutes.", 8],
      ["Par-boil the rice", "Boil {0}, rinsed, in plenty of salted water for 5 minutes, until two-thirds cooked. Drain.", 8, 300],
      ["Layer and steam", "Spread the rice over the vegetables, scatter the fried onion and {7}, cover tightly and cook on the lowest heat for 18 minutes.", 18, 1080],
    ],
  },
  veg_fried_rice: {
    served: 320, keeps: 1,
    g: [["rice_white", 70], ["carrot", 30], ["french_beans", 30], ["capsicum", 30], ["cabbage", 40], ["spring_onion", 15], ["garlic", 5], ["soy_sauce", 10], ["sunflower_oil", 10], ["salt", 1]],
    steps: [
      ["Cook the rice", "Cook {0} with {water:150} and let it cool completely, ideally in the fridge overnight.", 18, 900],
      ["Stir-fry", "Heat {8} on high. Add {6}, chopped, then {1}, {2}, {3} and {4}, all cut small. Toss 3 minutes.", 4],
      ["Finish", "Add the rice, {7} and the salt. Toss on high for 3 minutes and scatter {5}, sliced.", 4],
    ],
  },
  veg_khichdi: {
    served: 380, keeps: 1,
    g: [["rice_white", 40], ["moong_dal", 30], ["carrot", 30], ["peas", 30], ["potato", 40], ["cumin", 1], ["turmeric", 0.5], ["ghee", 8], ["salt", 1.5]],
    steps: [
      ["Temper", "Heat {7} in a pressure cooker. Add {5}, then {2} and {4}, cut small, and {3}.", 3],
      ["Cook", "Add {0} and {1}, rinsed, {6}, the salt and {water:480}. Cook for 3 whistles, or simmer covered for 25 minutes, until soft.", 20, 1200],
    ],
  },
  veg_pulao: {
    served: 280, keeps: 2, batch: true,
    g: [["rice_white", 70], ["peas", 40], ["carrot", 30], ["onion", 40], ["garam_masala", 1], ["ghee", 8], ["salt", 1.5]],
    steps: [
      ["Soak", "Rinse {0} and soak it for 20 minutes.", 2],
      ["Cook the vegetables", "Heat {5}. Cook {3}, sliced, for 4 minutes, then {2}, cut small, {1} and {4}.", 5],
      ["Cook", "Add the rice, the salt and {water:150}. Cover and cook on low for 15 minutes, then leave it 5 minutes and fluff it up.", 20, 900],
    ],
  },
  samak_khichdi: {
    served: 280, keeps: 1,
    g: [["barnyard_millet", 60], ["potato", 60], ["peanuts", 15], ["cumin", 1], ["green_chilli", 2], ["ghee", 8], ["rock_salt", 1.5]],
    steps: [
      ["Rinse", "Rinse {0} and soak it for 15 minutes.", 2],
      ["Temper", "Heat {5}. Add {3} and {4}, slit, then {1}, cubed, and {2}, crushed. Cook 3 minutes.", 4],
      ["Cook", "Add the millet, the salt and {water:200}. Cover and cook on low for 12 minutes, until soft.", 12, 720],
    ],
  },

  bajra_roti: {
    served: 90, keeps: 1,
    g: [["bajra_flour", 60], ["salt", 0.5]],
    steps: [
      ["Make the dough", "Mix {0} and the salt with warm water, a little at a time, and knead with the heel of your hand until smooth.", 6],
      ["Shape", "Pat small balls flat between wet palms, or on a floured board, into thick rounds.", 6],
      ["Cook", "Cook on a hot tawa for 2 minutes a side, pressing the edges, until brown spots appear.", 8, 120],
    ],
  },
  brown_rice: {
    served: 200, keeps: 3, batch: true,
    g: [["rice_brown", 70]],
    steps: [
      ["Soak", "Rinse {0} and soak it for 30 minutes.", 2],
      ["Cook", "Cook it with {water:190}, covered on low, for 35 minutes, then leave it covered 5 minutes.", 40, 2100],
    ],
  },
  jeera_rice: {
    served: 210, keeps: 3, batch: true,
    g: [["rice_white", 70], ["cumin", 1], ["ghee", 5], ["salt", 1]],
    steps: [
      ["Rinse", "Rinse {0} until the water runs clear.", 2],
      ["Temper", "Heat {2}. Add {1}; when it sizzles, add the rice and stir 1 minute.", 2],
      ["Cook", "Add {water:150} and the salt. Cover and cook on low for 15 minutes, then fluff it up.", 15, 900],
    ],
  },
  kuttu_roti: {
    served: 100, keeps: 0,
    g: [["buckwheat_flour", 50], ["potato", 40], ["rock_salt", 0.5]],
    steps: [
      ["Make the dough", "Mash {1}, boiled, into {0} with the salt, adding a little water, into a soft dough.", 8],
      ["Roll", "Roll small balls into thick rounds between two sheets of plastic.", 6],
      ["Cook", "Cook on a hot tawa for 2 minutes a side.", 6, 120],
    ],
  },
  makki_roti: {
    served: 100, keeps: 0,
    g: [["maize_flour", 60], ["ghee", 6], ["salt", 0.5]],
    steps: [
      ["Make the dough", "Knead {0} and the salt with warm water, a little at a time, until smooth.", 6],
      ["Shape", "Pat balls flat between wet palms into thick rounds.", 6],
      ["Cook", "Cook on a hot tawa for 2 minutes a side, then brush with {1}.", 8, 120],
    ],
  },
  millet_roti: {
    served: 90, keeps: 1,
    g: [["jowar_flour", 60], ["salt", 0.5]],
    steps: [
      ["Make the dough", "Mix {0} and the salt with warm water, a little at a time, and knead until smooth.", 6],
      ["Shape", "Pat small balls flat on a floured board into thin rounds.", 6],
      ["Cook", "Cook on a hot tawa for a minute a side, then press with a cloth so it puffs.", 8, 60],
    ],
  },
  missi_roti: {
    served: 100, keeps: 1,
    g: [["besan", 30], ["atta", 30], ["onion", 15], ["green_chilli", 2], ["carom", 0.5], ["ghee", 6], ["salt", 0.5]],
    steps: [
      ["Make the dough", "Mix {0} and {1} with {2} and {3}, finely chopped, {4}, the salt and a teaspoon of the ghee ({5} in all). Knead with water into a firm dough.", 8],
      ["Roll", "Roll small balls into rounds.", 6],
      ["Cook", "Cook on a hot tawa for a minute a side and brush with the rest of the ghee.", 8, 60],
    ],
  },
  phulka: {
    served: 80, keeps: 1,
    g: [["atta", 60]],
    steps: [
      ["Make the dough", "Knead {0} with about {water:40} into a soft dough. Cover it for 15 minutes.", 18],
      ["Roll", "Roll small balls into thin rounds, about 2 a serving.", 6],
      ["Cook", "Cook on a hot tawa for 30 seconds a side, then hold over the flame with tongs until it puffs.", 6, 30],
    ],
  },
  plain_paratha: {
    served: 90, keeps: 1,
    g: [["atta", 60], ["ghee", 8], ["salt", 0.5]],
    steps: [
      ["Make the dough", "Knead {0} and the salt with about {water:40} into a soft dough.", 12],
      ["Fold", "Roll a ball out, brush with a little ghee ({1} in all), fold it into a triangle and roll it out again.", 6],
      ["Cook", "Cook on a hot tawa for a minute a side, brushing with the rest of the ghee, until flaky and golden.", 8, 60],
    ],
  },
  ragi_mudde: {
    served: 180, keeps: 0,
    g: [["ragi_flour", 60], ["salt", 0.5]],
    steps: [
      ["Boil", "Bring {water:120} to a boil with the salt.", 4],
      ["Stir in the ragi", "Tip in {0} all at once and leave it 1 minute without stirring, then stir hard with a wooden spoon until smooth.", 6, 60],
      ["Shape", "Cook 3 minutes more on low, then shape into balls with wet hands.", 4],
    ],
  },
  rajgira_roti: {
    served: 100, keeps: 0,
    g: [["amaranth_flour", 50], ["potato", 40], ["rock_salt", 0.5]],
    steps: [
      ["Make the dough", "Mash {1}, boiled, into {0} with the salt and a little water into a soft dough.", 8],
      ["Roll", "Roll small balls into rounds between two sheets of plastic.", 6],
      ["Cook", "Cook on a hot tawa for 2 minutes a side.", 6, 120],
    ],
  },
  steamed_rice: {
    served: 210, keeps: 3, batch: true,
    g: [["rice_white", 70]],
    steps: [
      ["Rinse", "Rinse {0} until the water runs clear.", 2],
      ["Cook", "Cook it with {water:150}, covered on the lowest heat, for 15 minutes. Leave it covered 5 minutes, then fluff it up.", 20, 900],
    ],
  },
};

export default onePotAndBase;
