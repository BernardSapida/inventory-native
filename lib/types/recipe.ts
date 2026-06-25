export interface RecipeIngredient {
  name: string;             // matched to product by name (case-insensitive)
  quantityPerServing: number;
  unit: string;
}

export interface RecipeModel {
  id: string;
  name: string;
  category: string;
  servingSize: number;
  instructions: string;
  ingredients: RecipeIngredient[];
  createdAt?: Date;
  createdBy: string;
  updatedAt?: Date;
}

export const RECIPE_CATEGORIES = [
  "Appetizer",
  "Main Course",
  "Side Dish",
  "Soup",
  "Salad",
  "Dessert",
  "Beverage",
];
