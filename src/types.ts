

export const AppTab = {
  Recipe: '調理',
  WeeklyMenu: '献立',
  StockList: '在庫',
  ShoppingList: '買物',
};

export interface RecipeIngredient {
  name: string;
  quantity: string;
}

export interface Recipe {
  id: string;
  name: string;
  category: string;
  cookingTime: number;
  tags: string[];
  ingredients: RecipeIngredient[];
  instructions: string;
  linkUrl: string;
  memo: string;
  imageUrl?: string;
  isFavorite: boolean;
  timesCooked: number;
}

export type NewRecipeData = Omit<Recipe, 'id' | 'imageUrl' | 'memo' | 'isFavorite' | 'timesCooked'>;

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number; // This is the "pristine" quantity, before any planned consumption.
  unit: string;
  notificationThreshold: number;
  purchaseUnit: string;
  purchaseQuantity: number;
  isPersisted: boolean; // True if the user has explicitly added this to their inventory.
}

export type MealPlanData = {
    [day in 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday']?: string[];
};

export interface ConsumedItem {
  inventoryId: string;
  consumedAmount: number;
}

export interface WeeklyMealPlan {
    id: string;
    startDate: string;
    plan: MealPlanData;
    isCounted?: boolean;
    consumedItems?: ConsumedItem[];
}

export interface ShoppingListItem {
    name:string;
    quantity: string; // The user-editable "purchased" quantity
    checked: boolean;
    isHeader?: boolean;
    shortfallQuantity: string; // The original calculated shortfall
    isNewItem: boolean; // True if item was not in inventory when list was generated
    isManual?: boolean;
}

export interface AppContextType {
    recipes: Recipe[];
    mealPlans: WeeklyMealPlan[];
    currentWeekIndex: number;
    inventory: InventoryItem[];
    shoppingList: ShoppingListItem[];
    isLoading: boolean;
    error: string | null;
    addRecipeFromImage: (coverImage: File, infoImages: File[]) => Promise<void>;
    addManualRecipe: (recipeData: NewRecipeData, imageFile: File | null, memo: string) => void;
    updateRecipe: (recipeId: string, updatedFields: Partial<Omit<Recipe, 'id' | 'imageUrl'>>) => Promise<void>;
    updateRecipeImage: (recipeId: string, imageFile: File) => Promise<void>;
    deleteRecipe: (recipeId: string) => Promise<void>;
    toggleFavorite: (recipeId: string) => void;
    handleGenerateMealPlan: (request?: string) => Promise<boolean>;
    clearMealPlan: () => Promise<void>;
    addMealPlanItem: (day: keyof MealPlanData, value: string) => void;
    removeMealPlanItem: (day: keyof MealPlanData, itemIndex: number) => void;
    addNextWeek: () => void;
    setCurrentWeekIndex: (index: number) => void;
    deleteWeek: (weekId: string) => void;
    updateShoppingList: () => Promise<void>;
    addPurchasedItemsToInventory: () => Promise<void>;
    updateInventoryItem: (id: string, updatedFields: Partial<Omit<InventoryItem, 'id'>>) => void;
    addInventoryItem: (item: Omit<InventoryItem, 'id' | 'isPersisted'>) => void;
    addManualShoppingItem: (name: string, quantity: string) => void;
    updateShoppingItemQuantity: (name: string, newQuantity: string) => void;
    reorganizeShoppingList: (listToReorganize?: ShoppingListItem[]) => Promise<void>;
    toggleShoppingItem: (name: string) => void;
    removeShoppingItem: (index: number) => void;
    clearShoppingList: () => void;
    handleRenameTag: (oldName: string, newName: string) => void;
    handleDeleteTagGlobally: (tagName: string) => void;
    handleAddGlobalTag: (tagName: string) => void;
    allTags: string[];
    handleSelectRecipe: (recipeId: string | null) => void;
    selectedRecipeId: string | null;
    lastInteractedDay: keyof MealPlanData | null;
    setLastInteractedDay: (day: keyof MealPlanData | null) => void;
    isSwapMode: boolean;
    firstSelectedItem: keyof MealPlanData | null;
    toggleSwapMode: () => void;
    setFirstSelectedItem: (day: keyof MealPlanData | null) => void;
    swapMealPlanDays: (day1: keyof MealPlanData, day2: keyof MealPlanData) => void;
    isPastWeek: boolean;
    isNextWeekDisabled: boolean;
    lowStockItems: InventoryItem[];
    onNotificationClick: () => void;
}
