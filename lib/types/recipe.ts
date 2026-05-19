export interface RecipeIngredient {
  itemId: string;
  itemName: string;
  quantity: number;
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
}

export const RECIPE_CATEGORIES = [
  'Breakfast',
  'Lunch',
  'Dinner',
  'Dessert',
  'Beverage',
  'Snack',
  'General',
];
