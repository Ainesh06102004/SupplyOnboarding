// Every editorial recipe, by dish key. See recipes.js for the format.
import breakfast from "./breakfast";
import mains1 from "./mains1";
import mains2 from "./mains2";
import onePotAndBase from "./onePotAndBase";
import snacksAndDrinks from "./snacksAndDrinks";

export const RECIPES = Object.freeze({ ...breakfast, ...mains1, ...mains2, ...onePotAndBase, ...snacksAndDrinks });
