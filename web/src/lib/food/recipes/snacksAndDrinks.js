// Snacks and drinks: one adult serving each. Format: see breakfast.js.

const snacksAndDrinks = {
  banana_peanut_butter: {
    served: 134, keeps: 0,
    g: [["banana", 118], ["peanut_butter", 16]],
    steps: [
      ["Slice", "Slice {0} into rounds.", 1],
      ["Top", "Spread or spoon {1} over them.", 1],
    ],
  },
  bhel_puri: {
    served: 150, keeps: 0,
    g: [["puffed_rice", 25], ["onion", 25], ["tomato", 25], ["potato", 40], ["tamarind", 8], ["sev", 10], ["chaat_masala", 1], ["coriander_leaves", 2], ["lemon_juice", 5]],
    steps: [
      ["Prepare", "Boil {3}, peel and dice it. Chop {1}, {2} and {7} finely.", 15],
      ["Mix", "Just before eating, toss {0} with the vegetables, {4} loosened with a little water, {6} and the lemon.", 2],
      ["Finish", "Scatter {5} on top and eat it straight away, before it softens.", 1],
    ],
  },
  chana_salad: {
    served: 230, keeps: 1, batch: true,
    g: [["kabuli_chana", 40], ["cucumber", 50], ["tomato", 40], ["onion", 20], ["lemon_juice", 10], ["chaat_masala", 1], ["coriander_leaves", 2], ["salt", 1]],
    steps: [
      ["Cook the chana", "Soak {0} overnight, then pressure-cook it with fresh water for 5 whistles, or simmer for an hour, until soft. Drain and cool.", 30, 1800],
      ["Chop", "Dice {1}, {2} and {3}.", 5],
      ["Toss", "Toss the chana and vegetables with the lemon, {5}, {6} and the salt.", 2],
    ],
  },
  corn_chaat: {
    served: 180, keeps: 0,
    g: [["sweet_corn", 120], ["onion", 20], ["tomato", 30], ["lemon_juice", 5], ["chaat_masala", 1], ["butter", 5], ["salt", 1]],
    steps: [
      ["Cook the corn", "Boil or steam {0} for 5 minutes, then toss it with {5}.", 6, 300],
      ["Toss", "Mix in {1} and {2}, chopped, the lemon, {4} and the salt.", 2],
    ],
  },
  dates_and_nuts: {
    served: 36, keeps: 0,
    g: [["dates", 24], ["almonds", 12]],
    steps: [
      ["Plate", "Put {0} and {1} on a plate.", 1],
      ["Eat slowly", "Pit the dates as you go.", 1],
    ],
  },
  dhokla: {
    served: 150, keeps: 2,
    g: [["besan", 40], ["curd", 30], ["ginger", 3], ["green_chilli", 2], ["mustard_seeds", 1], ["curry_leaves", 1], ["sugar", 4], ["lemon_juice", 5], ["baking_soda", 1], ["sunflower_oil", 6], ["salt", 1]],
    steps: [
      ["Make the batter", "Whisk {0} with {1}, {2}, grated, half of {3}, chopped, the salt and {water:40} into a thick, smooth batter. Rest it 10 minutes.", 12, 600],
      ["Steam", "Stir in {8} and the lemon, pour it into a greased tin and steam for 15 minutes, until a knife comes out clean.", 16, 900],
      ["Temper", "Heat {9}. Add {4}; when they splutter, add {5} and the rest of the chilli, then {6} dissolved in {water:40}. Pour it over the dhokla and cut it into squares.", 4],
    ],
  },
  fruit_bowl: {
    served: 268, keeps: 0,
    g: [["banana", 118], ["apple", 150]],
    steps: [
      ["Cut", "Slice {0} and core and cut {1} into chunks.", 3],
      ["Serve", "Eat it straight away, before the apple browns.", 1],
    ],
  },
  fruit_chaat: {
    served: 310, keeps: 0,
    g: [["banana", 60], ["apple", 80], ["papaya", 80], ["pomegranate", 40], ["guava", 50], ["chaat_masala", 1], ["lemon_juice", 5]],
    steps: [
      ["Cut", "Cut {0}, {1}, {2} and {4} into bite-size pieces.", 6],
      ["Toss", "Toss with {3}, {5} and the lemon.", 1],
    ],
  },
  handful_nuts: {
    served: 30, keeps: 0,
    g: [["almonds", 30]],
    steps: [
      ["Measure", "Count out {0}, or any mix of nuts about the same weight.", 1],
      ["Eat", "Eat them as they are; roasting is optional.", 1],
    ],
  },
  hummus: {
    served: 200, keeps: 3, batch: true,
    g: [["kabuli_chana", 30], ["sesame", 8], ["lemon_juice", 10], ["garlic", 3], ["olive_oil", 7], ["cucumber", 100], ["salt", 1]],
    steps: [
      ["Cook the chana", "Soak {0} overnight and cook it until very soft, about 5 whistles. Drain, keeping a little of the water.", 30, 1800],
      ["Blend", "Toast {1} lightly, then blend it with the chana, the lemon, {3}, half of {4}, the salt and a splash of the cooking water until smooth.", 5],
      ["Serve", "Drizzle the rest of the oil over it and eat with {5}, cut into sticks.", 2],
    ],
  },
  masala_peanuts: {
    served: 85, keeps: 0,
    g: [["peanuts", 30], ["onion", 20], ["tomato", 25], ["lemon_juice", 5], ["chaat_masala", 1], ["coriander_leaves", 2]],
    steps: [
      ["Roast", "Dry-roast {0} in a pan for 4 minutes, until they smell toasty. Let them cool.", 5],
      ["Toss", "Toss with {1}, {2} and {5}, all chopped, the lemon and {4}.", 2],
    ],
  },
  paneer_tikka: {
    served: 200, keeps: 1,
    g: [["paneer", 100], ["curd", 30], ["capsicum", 50], ["onion", 40], ["green_chilli", 2], ["garam_masala", 1], ["lemon_juice", 5], ["sunflower_oil", 5], ["salt", 1]],
    steps: [
      ["Marinate", "Mix {1} with {4}, crushed, {5}, the lemon and the salt. Toss {0}, cubed, and {2} and {3}, in squares, through it. Leave it 20 minutes.", 22],
      ["Skewer", "Thread the paneer and vegetables onto skewers.", 4],
      ["Grill", "Brush with {7} and grill or pan-roast on high for 8 minutes, turning, until charred at the edges.", 8, 480],
    ],
  },
  roasted_chana: {
    served: 40, keeps: 0,
    g: [["roasted_chana", 40]],
    steps: [
      ["Measure", "Measure out {0}.", 1],
      ["Eat", "Eat it as it is, or toss it with a squeeze of lemon and a pinch of chaat masala.", 1],
    ],
  },
  roasted_makhana: {
    served: 29, keeps: 0,
    g: [["makhana", 25], ["ghee", 4]],
    steps: [
      ["Roast", "Warm {1} in a pan and roast {0} on low, stirring, for 8 minutes until they crunch when pressed.", 9, 480],
      ["Season", "Sprinkle with a pinch of salt and let them cool so they stay crisp.", 1],
    ],
  },
  sundal: {
    served: 130, keeps: 1,
    g: [["kabuli_chana", 40], ["coconut_fresh", 10], ["mustard_seeds", 1], ["curry_leaves", 1], ["green_chilli", 2], ["coconut_oil", 4], ["salt", 1]],
    steps: [
      ["Cook the chana", "Soak {0} overnight and cook it until soft, about 5 whistles. Drain.", 30, 1800],
      ["Temper", "Heat {5}. Add {2}; when they splutter, add {3} and {4}, slit.", 2],
      ["Toss", "Add the chana and the salt, toss 2 minutes, then stir in {1}.", 3],
    ],
  },
  sweet_potato_chaat: {
    served: 150, keeps: 0,
    g: [["sweet_potato", 150], ["lemon_juice", 5], ["black_salt", 0.5], ["cumin", 1], ["coriander_leaves", 2]],
    steps: [
      ["Cook", "Roast {0} at 200 °C for 30 minutes, or boil it for 20, until soft. Peel and cube.", 30, 1800],
      ["Season", "Toast {3} and crush it. Toss the sweet potato with it, {2}, the lemon and {4}.", 3],
    ],
  },

  aam_panna: {
    served: 250, keeps: 2,
    g: [["raw_mango", 60], ["jaggery", 20], ["cumin", 0.5], ["black_salt", 0.5], ["mint", 2]],
    steps: [
      ["Cook the mango", "Boil {0} until soft, about 15 minutes. Cool, peel and squeeze out the pulp.", 18, 900],
      ["Blend", "Blend the pulp with {1}, {2}, roasted and crushed, {3} and {water:200}.", 3],
      ["Serve", "Pour it over ice with {4}.", 1],
    ],
  },
  badam_milk: {
    served: 220, keeps: 1,
    g: [["milk_toned", 200], ["almonds", 12], ["cardamom", 0.2], ["sugar", 8]],
    steps: [
      ["Soak", "Soak {1} in hot water for 15 minutes, then peel them.", 15],
      ["Blend", "Blend the almonds with a little of {0} to a smooth paste.", 2],
      ["Simmer", "Simmer the rest of the milk with the paste, {2}, crushed, and {3} for 5 minutes. Drink it warm or chilled.", 6, 300],
    ],
  },
  banana_smoothie: {
    served: 320, keeps: 0,
    g: [["milk_toned", 200], ["banana", 100], ["oats", 15], ["honey", 7]],
    steps: [
      ["Blend", "Blend {0}, {1}, {2} and {3} until smooth.", 2],
      ["Serve", "Drink it straight away.", 1],
    ],
  },
  chaas: {
    served: 250, keeps: 1,
    g: [["curd", 100], ["cumin", 0.5], ["salt", 1]],
    steps: [
      ["Whisk", "Whisk {0} with {water:150} until frothy.", 2],
      ["Season", "Toast {1}, crush it and stir it in with the salt.", 2],
    ],
  },
  coconut_water: {
    served: 250, keeps: 0,
    g: [["coconut_water", 250]],
    steps: [
      ["Pour", "Pour {0} into a glass.", 1],
      ["Serve", "Drink it chilled.", 1],
    ],
  },
  cold_coffee: {
    served: 220, keeps: 0,
    g: [["coffee_powder", 2], ["milk_toned", 200], ["sugar", 8]],
    steps: [
      ["Dissolve", "Whisk {0} and {2} with {water:30:hot} until dissolved.", 2],
      ["Blend", "Blend with {1}, chilled, and a few ice cubes until frothy.", 2],
    ],
  },
  filter_coffee: {
    served: 150, keeps: 0,
    g: [["coffee_powder", 4], ["milk_toned", 100], ["sugar", 5]],
    steps: [
      ["Brew", "Brew {0} in a filter with {water:60:boiling} for 10 minutes.", 10, 600],
      ["Mix", "Heat {1} until it froths, then pour in the decoction and {2}.", 3],
    ],
  },
  green_tea: {
    served: 200, keeps: 0,
    g: [["tea_leaves", 2], ["lemon_juice", 5], ["honey", 5]],
    steps: [
      ["Steep", "Pour {water:200}, just off the boil, over {0}. Steep 2 minutes, then strain.", 3, 120],
      ["Finish", "Stir in a squeeze of the lemon and {2}, if you like.", 1],
    ],
  },
  haldi_doodh: {
    served: 210, keeps: 0,
    g: [["milk_toned", 200], ["turmeric", 1], ["jaggery", 8]],
    steps: [
      ["Simmer", "Simmer {0} with {1} for 4 minutes, stirring.", 5, 240],
      ["Sweeten", "Take it off the heat and stir in {2}.", 1],
    ],
  },
  jaljeera: {
    served: 250, keeps: 1,
    g: [["cumin", 2], ["mint", 3], ["lemon_juice", 10], ["black_salt", 1], ["tamarind", 5]],
    steps: [
      ["Make the paste", "Toast {0} and crush it. Grind it with {1}, {3} and {4}.", 4],
      ["Mix", "Stir the paste into {water:250:cold} with the lemon.", 1],
    ],
  },
  masala_chai: {
    served: 150, keeps: 0,
    g: [["tea_leaves", 3], ["milk_toned", 100], ["ginger", 3], ["sugar", 6]],
    steps: [
      ["Boil", "Boil {water:80} with {2}, crushed, and {0} for 2 minutes.", 3, 120],
      ["Add the milk", "Add {1} and {3}, bring it back to a boil and simmer 2 minutes. Strain.", 3, 120],
    ],
  },
  nimbu_pani: {
    served: 250, keeps: 0,
    g: [["lemon_juice", 20], ["sugar", 12], ["salt", 0.5]],
    steps: [
      ["Dissolve", "Stir {1} and the salt into {water:240:cold} until dissolved.", 2],
      ["Squeeze", "Squeeze in {0} and stir.", 1],
    ],
  },
  sattu_sharbat: {
    served: 280, keeps: 0,
    g: [["sattu", 30], ["lemon_juice", 10], ["cumin", 0.5], ["black_salt", 0.5], ["mint", 2]],
    steps: [
      ["Whisk", "Whisk {0} into {water:250:cold} until smooth.", 2],
      ["Season", "Stir in the lemon, {2}, roasted and crushed, {3} and {4}, torn.", 1],
    ],
  },
  sweet_lassi: {
    served: 200, keeps: 0,
    g: [["curd", 150], ["sugar", 12], ["cardamom", 0.2]],
    steps: [
      ["Whisk", "Whisk {0} with {1} and {water:50:cold} until frothy.", 2],
      ["Serve", "Stir in {2}, crushed, and serve chilled.", 1],
    ],
  },
};

export default snacksAndDrinks;
