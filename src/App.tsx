
import React, { useState, useCallback, useMemo, createContext, useContext, useRef, useEffect } from 'react';
import { AppTab, Recipe, MealPlanData, WeeklyMealPlan, InventoryItem, ShoppingListItem, NewRecipeData, AppContextType, RecipeIngredient, ConsumedItem } from './types';
import { extractRecipeFromImage, generateMealPlan, generateShoppingListStream, getUnitSuggestionsForIngredient, reorganizeShoppingListStream, getDynamicConversionRate } from '../services/geminiService';
import { BellIcon, BookOpenIcon, CalendarIcon, BoxIcon, ShoppingCartIcon, PlusIcon, SparklesIcon, SearchIcon, MinusIcon, TrashIcon, XIcon, CameraIcon, PencilIcon, ClockIcon, HeartIcon, ChevronDownIcon, LinkIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, ArrowPathIcon, ArrowsRightLeftIcon } from '../components/Icons';

// --- Synonym and text normalization helpers for search ---
const toKatakana = (str: string): string => {
  return str.replace(/[\u3041-\u3096]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) + 0x60)
  );
};

const toHiragana = (str: string): string => {
  return str.replace(/[\u30a1-\u30f6]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) - 0x60)
  );
};

const synonymGroups: string[][] = [
  ['豚', 'ぶた', 'ポーク'],
  ['鶏', '鳥', 'とり', 'チキン'],
  ['牛', 'ぎゅう', 'ビーフ'],
  ['卵', '玉子', 'たまご', 'エッグ'],
  ['じゃがいも', 'ジャガイモ', 'ポテト', '馬鈴薯'],
  ['玉葱', 'たまねぎ', 'タマネギ', 'オニオン'],
  ['人参', 'にんじん', 'ニンジン', 'キャロット'],
  ['魚', 'さかな'],
  ['米', 'ごはん', '御飯', 'ライス'],
  ['パン', 'ぱん', 'ブレッド'],
  ['鮭', 'さけ', 'しゃけ', 'サーモン'],
  ['海老', 'えび', 'エビ'],
  ['豆腐', 'とうふ'],
  ['茸', 'きのこ', 'キノコ'],
  ['ピーマン', 'ぴーまん'],
  ['茄子', 'なす', 'ナス'],
  ['大根', 'だいこん'],
  ['醤油', 'しょうゆ', '薄口醤油', '濃口醤油'],
  ['にんにく', 'ニンニク', 'ガーリック'],
  ['生姜', 'しょうが', 'ジンジャー'],
];


// --- INITIAL DATA ---
const INITIAL_RECIPES: Recipe[] = [
    { id: 'recipe-1', name: '豚の生姜焼き', category: '炒め物', cookingTime: 15, tags: ['豚肉', '定番', '簡単', '和食'], ingredients: [{ name: '豚ロース肉', quantity: '200g' }, { name: '玉ねぎ', quantity: '1/2個' }, { name: '生姜', quantity: '1かけ' }, { name: '醤油', quantity: '大さじ2' }, { name: 'みりん', quantity: '大さじ2' }], instructions: '玉ねぎは薄切り、生姜はすりおろす。\n豚肉を焼き、玉ねぎを加えて炒める。\n調味料を加えて絡める。', linkUrl: '', memo: '', isFavorite: true, timesCooked: 12 },
    { id: 'recipe-2', name: '肉じゃが', category: '煮物', cookingTime: 30, tags: ['牛肉', '野菜', '定番', '和食'], ingredients: [{ name: '牛肉', quantity: '150g' }, { name: 'じゃがいも', quantity: '3個' }, { name: '人参', quantity: '1本' }, { name: '玉ねぎ', quantity: '1個' }, { name: '醤油', quantity: '大さじ3' }, { name: '砂糖', quantity: '大さじ2' }], instructions: '材料を食べやすい大きさに切る。\n鍋で牛肉を炒め、野菜を加えてさらに炒める。\n水と調味料を加えて、野菜が柔らかくなるまで煮込む。', linkUrl: '', memo: 'じゃがいもはメークインが煮崩れしにくい。', isFavorite: false, timesCooked: 5 },
    { id: 'recipe-3', name: '鶏の唐揚げ', category: '揚げ物', cookingTime: 25, tags: ['鶏肉', '人気', 'お弁当'], ingredients: [{ name: '鶏もも肉', quantity: '300g' }, { name: '片栗粉', quantity: '大さじ3' }, { name: '醤油', quantity: '大さじ2' }, { name: 'にんにく', quantity: '1かけ' }], instructions: '鶏肉を一口大に切り、調味料に漬け込む。\n片栗粉をまぶし、170℃の油で揚げる。', linkUrl: '', memo: '二度揚げすると更にカリッと仕上がる。', isFavorite: true, timesCooked: 21 },
    { id: 'recipe-4', name: 'きんぴらごぼう', category: '炒め物', cookingTime: 20, tags: ['野菜', '常備菜', '和食'], ingredients: [{ name: 'ごぼう', quantity: '1本' }, { name: '人参', quantity: '1/2本' }, { name: 'ごま油', quantity: '大さじ1' }, { name: '鷹の爪', quantity: '1本' }], instructions: 'ごぼうと人参を千切りにする。\nごま油で炒め、調味料で味付けする。', linkUrl: '', memo: '', isFavorite: false, timesCooked: 8 },
    { id: 'recipe-5', name: 'だし巻き卵', category: '焼き物', cookingTime: 10, tags: ['卵', '定番', '朝食'], ingredients: [{ name: '卵', quantity: '3個' }, { name: 'だし汁', quantity: '50ml' }, { name: '薄口醤油', quantity: '小さじ1' }], instructions: '材料を混ぜ合わせる。\n卵焼き器で数回に分けて焼く。', linkUrl: '', memo: '', isFavorite: false, timesCooked: 3 },
    { id: 'recipe-6', name: '味噌汁', category: '汁物', cookingTime: 10, tags: ['豆腐', '基本', '和食'], ingredients: [{ name: '豆腐', quantity: '1/4丁' }, { name: 'わかめ', quantity: '少々' }, { name: 'だし汁', quantity: '400ml' }, { name: '味噌', quantity: '大さじ2' }], instructions: 'だし汁を温め、具材を入れる。\n火を止めて味噌を溶き入れる。', linkUrl: '', memo: '', isFavorite: false, timesCooked: 35 },
    { id: 'recipe-7', name: '鮭の塩焼き', category: '焼き物', cookingTime: 15, tags: ['魚', '簡単', '和食'], ingredients: [{ name: '生鮭', quantity: '2切れ' }, { name: '塩', quantity: '少々' }], instructions: '鮭に塩を振る。\nグリルで両面を焼く。', linkUrl: '', memo: '', isFavorite: false, timesCooked: 15 },
];

const INITIAL_INVENTORY: InventoryItem[] = [
    { id: 'inv-1', name: '醤油', category: '調味料', quantity: 1000, unit: 'ml', notificationThreshold: 200, purchaseUnit: '本', purchaseQuantity: 1, isPersisted: true },
    { id: 'inv-2', name: 'みりん', category: '調味料', quantity: 500, unit: 'ml', notificationThreshold: 100, purchaseUnit: '本', purchaseQuantity: 1, isPersisted: true },
    { id: 'inv-3', name: '砂糖', category: '調味料', quantity: 1000, unit: 'g', notificationThreshold: 200, purchaseUnit: '袋', purchaseQuantity: 1, isPersisted: true },
    { id: 'inv-4', name: '塩', category: '調味料', quantity: 1000, unit: 'g', notificationThreshold: 200, purchaseUnit: '袋', purchaseQuantity: 1, isPersisted: true },
    { id: 'inv-5', name: 'ごま油', category: '調味料', quantity: 200, unit: 'ml', notificationThreshold: 50, purchaseUnit: '本', purchaseQuantity: 1, isPersisted: true },
    { id: 'inv-6', name: '片栗粉', category: '乾物・穀物・粉類', quantity: 200, unit: 'g', notificationThreshold: 50, purchaseUnit: '袋', purchaseQuantity: 1, isPersisted: true },
    { id: 'inv-7', name: '味噌', category: '調味料', quantity: 750, unit: 'g', notificationThreshold: 100, purchaseUnit: 'パック', purchaseQuantity: 1, isPersisted: true },
    { id: 'inv-8', name: '卵', category: '乳製品・卵・大豆製品', quantity: 6, unit: '個', notificationThreshold: 2, purchaseUnit: 'パック', purchaseQuantity: 10, isPersisted: true },
    { id: 'inv-9', name: '玉ねぎ', category: '野菜・果物', quantity: 3, unit: '個', notificationThreshold: 1, purchaseUnit: '袋', purchaseQuantity: 3, isPersisted: true },
].sort((a,b) => a.name.localeCompare(b.name, 'ja'));

const DAYS_OF_WEEK_JP = { monday: "月", tuesday: "火", wednesday: "水", thursday: "木", friday: "金", saturday: "土", sunday: "日" };

// --- CONTEXT for State Management ---
const AppContext = createContext<AppContextType | null>(null);

// --- HELPER FUNCTIONS for Ingredient Consumption ---
const parseQuantity = (quantityStr: string): { amount: number, unit: string } | null => {
    if (!quantityStr) return null;
    
    const normalizedStr = quantityStr.replace(/[０-９．／]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
    
    // Handle unquantifiable units first
    const unquantifiable = ['少々', '適量', 'お好みで', 'ひとつまみ'];
    if (unquantifiable.some(u => normalizedStr.includes(u))) {
        return null;
    }

    // Case 1: "1/2個", "0.5個", "200g" (Number first)
    let match = normalizedStr.match(/^(\d+(\.\d+)?|\d+\/\d+)\s*(.*)$/);
    if (match) {
        let amountStr = match[1];
        let amount;
        if (amountStr.includes('/')) {
            const parts = amountStr.split('/');
            amount = parseFloat(parts[0]) / parseFloat(parts[1]);
        } else {
            amount = parseFloat(amountStr);
        }
        const unit = match[3].trim();
        if (!isNaN(amount) && unit) return { amount, unit };
    }

    // Case 2: "大さじ2", "1かけ" (Unit or text first, then number)
    match = normalizedStr.match(/^(.*?)\s*(\d+(\.\d+)?)$/);
    if (match) {
        const unit = match[1].trim();
        const amount = parseFloat(match[2]);
         if (!isNaN(amount) && unit) return { amount, unit };
    }
    
    // Fallback for numberless units like "1本", "1玉"
    match = normalizedStr.match(/^(\d+)\s*(.*)$/);
    if (match) {
        const amount = parseFloat(match[1]);
        const unit = match[2].trim();
        if (!isNaN(amount) && unit) return { amount, unit };
    }

    return null;
}

const INGREDIENT_SPECIFIC_CONVERSIONS: { 
    [ingredientName: string]: { from: string; to: string; rate: number }[] 
} = {
    "生姜": [ { from: "かけ", to: "g", rate: 15 }, { from: "g", to: "かけ", rate: 1/15 } ],
    "にんにく": [ { from: "かけ", to: "g", rate: 5 }, { from: "g", to: "かけ", rate: 1/5 } ]
};

const CONVERSION_RATES: { [key: string]: { to: string, rate: number } } = {
    '大さじ': { to: 'ml', rate: 15 },
    '小さじ': { to: 'ml', rate: 5 },
    'カップ': { to: 'ml', rate: 200 },
    'cc': { to: 'ml', rate: 1 },
    'kg': { to: 'g', rate: 1000 },
    'l': { to: 'ml', rate: 1000 },
};

const getBaseAmount = (amount: number, unit: string): { baseAmount: number, baseUnit: string } | null => {
    const trimmedUnit = unit.trim().toLowerCase();
    
    if (trimmedUnit in CONVERSION_RATES) {
        const conversion = CONVERSION_RATES[trimmedUnit];
        return { baseAmount: amount * conversion.rate, baseUnit: conversion.to };
    }
    return { baseAmount: amount, baseUnit: trimmedUnit };
}


// --- HELPER COMPONENTS ---

const LoadingOverlay: React.FC<{ message: string }> = ({ message }) => (
    <div className="fixed inset-0 bg-base/80 backdrop-blur-sm flex flex-col items-center justify-center z-50">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary-dark"></div>
        <p className="text-gray-700 text-xl mt-4 font-serif">{message}</p>
    </div>
);

const NoImagePlaceholder: React.FC<{className?: string}> = ({ className="" }) => (
    <div className={`flex items-center justify-center bg-[#e6e6e6] text-primary-dark w-full h-full ${className}`}>
        <div className="text-center font-sans">
            <span className="text-xs font-semibold">NO IMAGE</span>
        </div>
    </div>
);


const ModalBase: React.FC<{isOpen: boolean; onClose: () => void; children: React.ReactNode; className?: string}> = ({ isOpen, onClose, children, className="" }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-40 p-4" onClick={onClose}>
            <div className={`bg-base w-full ${className}`} onClick={e => e.stopPropagation()}>
                {children}
            </div>
        </div>
    )
};

const LowStockNotificationModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    items: InventoryItem[];
}> = ({ isOpen, onClose, items }) => (
    <ModalBase isOpen={isOpen} onClose={onClose} className="max-w-md">
        <div className="p-8">
            <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold text-gray-900 tracking-wider">在庫不足のお知らせ</h2>
                <button onClick={onClose} className="p-1 -mt-1 -mr-1 text-gray-500 hover:text-gray-800">
                    <XIcon className="w-5 h-5" />
                </button>
            </div>
            {items.length > 0 ? (
                <ul className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    {items.map(item => (
                        <li key={item.id} className="text-gray-700 text-lg leading-relaxed">
                            「<span className="font-bold text-primary-dark">{item.name}</span>」が残りわずかです。
                            <span className="text-sm block text-gray-500 mt-1">
                                (現在: {item.quantity}{item.unit} / しきい値: {item.notificationThreshold}{item.unit})
                            </span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-gray-500 py-4">現在、在庫が不足している品目はありません。</p>
            )}
            <div className="flex justify-end mt-6 font-sans">
                <button onClick={onClose} className="px-5 py-2.5 text-white font-semibold bg-primary-dark text-sm tracking-widest">閉じる</button>
            </div>
        </div>
    </ModalBase>
);

const Header: React.FC<{
    activeTab: string;
    setActiveTab: (tab: string) => void;
}> = ({ activeTab, setActiveTab }) => {
    const TABS = [
        { name: AppTab.Recipe },
        { name: AppTab.WeeklyMenu },
        { name: AppTab.StockList },
        { name: AppTab.ShoppingList },
    ];

    return (
        <header className="bg-base/80 backdrop-blur-md sticky top-0 z-30">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-center sm:justify-between h-16">
                    <h1 className="hidden sm:block text-xl font-bold text-gray-800 font-serif">
                        AI Chef Assistant
                    </h1>
                     <div className="flex items-center">
                        <nav className="hidden md:flex space-x-1">
                            {TABS.map(tab => (
                                <button
                                    key={tab.name}
                                    onClick={() => setActiveTab(tab.name)}
                                    className={`px-4 pt-2 pb-[calc(0.5rem-2px)] text-sm font-medium font-serif tracking-extra-widest border-b-2 text-black ${
                                        activeTab === tab.name
                                            ? 'border-black'
                                            : 'border-transparent'
                                    }`}
                                >
                                    {tab.name}
                                </button>
                            ))}
                        </nav>
                    </div>
                </div>
            </div>
            <nav className="md:hidden flex justify-around bg-base fixed bottom-0 left-0 right-0 z-30">
                {TABS.map(tab => (
                    <button
                        key={tab.name}
                        onClick={() => setActiveTab(tab.name)}
                        className="flex flex-col items-center justify-center w-full py-2 font-serif text-black"
                    >
                        <span className="text-xs tracking-extra-widest font-medium">{tab.name}</span>
                        <span
                            className={`mt-1.5 w-1 h-1 rounded-full ${
                                activeTab === tab.name ? 'bg-black' : 'bg-transparent'
                            }`}
                        ></span>
                    </button>
                ))}
            </nav>
        </header>
    );
};

const PhotoAddRecipeModal: React.FC<{ isOpen: boolean; onClose: () => void; onAddRecipe: (coverImage: File, infoImages: File[]) => void; }> = ({ isOpen, onClose, onAddRecipe }) => {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [coverImageIndex, setCoverImageIndex] = useState(0);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            setSelectedFiles(files);
            setCoverImageIndex(0);
            
            const newPreviews = files.map(file => URL.createObjectURL(file));
            previews.forEach(URL.revokeObjectURL);
            setPreviews(newPreviews);
        }
    };

    const handleSubmit = () => {
        if (selectedFiles.length === 0) return;

        const coverImage = selectedFiles[coverImageIndex];
        let infoImages: File[];

        if (selectedFiles.length === 1) {
            infoImages = [selectedFiles[0]];
        } else {
            infoImages = selectedFiles.filter((_, index) => index !== coverImageIndex);
        }

        onAddRecipe(coverImage, infoImages);
    };
    
    useEffect(() => {
        if (!isOpen) {
            previews.forEach(URL.revokeObjectURL);
            setSelectedFiles([]);
            setPreviews([]);
            setCoverImageIndex(0);
        }
    }, [isOpen]);

    return (
        <ModalBase isOpen={isOpen} onClose={onClose} className="max-w-xl">
            <div className="p-8">
                <h2 className="text-2xl font-bold mb-2 text-gray-900 tracking-wider">レシピを写真から追加</h2>
                <p className="text-gray-500 mb-6">完成画像と、材料や作り方が書かれた画像を一度に選択してください。</p>
                <div className="mb-6">
                    <label htmlFor="recipe-upload" className="block w-full cursor-pointer p-8 text-center bg-gray-300/50">
                        <span className="text-gray-600 font-serif">
                            {selectedFiles.length > 0 ? `${selectedFiles.length}個のファイルを選択中` : 'クリックしてファイルを選択 (複数可)'}
                        </span>
                        <input id="recipe-upload" type="file" className="hidden" accept="image/*" multiple onChange={handleFileChange} />
                    </label>
                </div>
                
                {previews.length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-sm font-semibold mb-3 font-serif tracking-wider">カバー画像を選択してください</h3>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                            {previews.map((preview, index) => (
                                <div key={index} onClick={() => setCoverImageIndex(index)} className={`relative aspect-square cursor-pointer transition-all ${coverImageIndex === index ? 'border-2 border-primary-dark' : ''}`}>
                                    <img src={preview} alt={`preview ${index + 1}`} className="w-full h-full object-cover"/>
                                    {coverImageIndex === index && <div className="absolute inset-0 bg-primary-dark/30"></div>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex justify-between items-center font-sans">
                    <button onClick={onClose} className="px-5 py-2.5 text-gray-700 font-semibold">キャンセル</button>
                    <button onClick={handleSubmit} disabled={selectedFiles.length === 0} className="px-5 py-2.5 text-white font-semibold bg-primary-dark disabled:cursor-not-allowed transition-colors text-sm tracking-widest">AIで追加</button>
                </div>
            </div>
        </ModalBase>
    );
};

const ManualAddRecipeModal: React.FC<{ isOpen: boolean; onClose: () => void; onAddRecipe: (recipeData: NewRecipeData, imageFile: File | null, memo: string) => void; allTags: string[]; allCategories: string[]; }> = ({ isOpen, onClose, onAddRecipe, allTags, allCategories }) => {
    const [name, setName] = useState('');
    const [category, setCategory] = useState('');
    const [cookingTime, setCookingTime] = useState('');
    const [ingredients, setIngredients] = useState([{ name: '', quantity: '' }]);
    const [instructions, setInstructions] = useState('');
    const [linkUrl, setLinkUrl] = useState('');
    const [memo, setMemo] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [newTag, setNewTag] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isCategorySelectorVisible, setIsCategorySelectorVisible] = useState(false);
    const categoryInputContainerRef = useRef<HTMLDivElement>(null);


    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleIngredientChange = (index: number, field: 'name' | 'quantity', value: string) => {
        const newIngredients = [...ingredients]; newIngredients[index][field] = value; setIngredients(newIngredients);
    };
    const addIngredient = () => setIngredients([...ingredients, { name: '', quantity: '' }]);
    const removeIngredient = (index: number) => setIngredients(ingredients.filter((_, i) => i !== index));

    const handleAddTag = () => {
        if (newTag && !tags.includes(newTag)) {
            setTags([...tags, newTag]);
        }
        setNewTag('');
    };

    const handleSelectExistingTag = (tagToAdd: string) => {
        if (!tags.includes(tagToAdd)) {
            setTags([...tags, tagToAdd]);
        }
    };
    
    const removeTag = (tagToRemove: string) => setTags(tags.filter(tag => tag !== tagToRemove));

    const availableTags = useMemo(() => allTags.filter(t => !tags.includes(t)), [allTags, tags]);
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !category || !cookingTime) { alert('レシピ名、カテゴリ、調理時間は必須です。'); return; }
        onAddRecipe({ name, category, cookingTime: parseInt(cookingTime, 10), ingredients: ingredients.filter(i => i.name), instructions, tags, linkUrl }, imageFile, memo);
        onClose();
    };
    
    useEffect(() => {
        if (!isOpen) {
            setName(''); setCategory(''); setCookingTime(''); setIngredients([{ name: '', quantity: '' }]); setInstructions('');
            setLinkUrl('');
            setMemo('');
            setTags([]); setNewTag(''); setImageFile(null);
            if(imagePreview) URL.revokeObjectURL(imagePreview);
            setImagePreview(null);
            setIsCategorySelectorVisible(false);
        }
    }, [isOpen, imagePreview]);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (categoryInputContainerRef.current && !categoryInputContainerRef.current.contains(event.target as Node)) {
                setIsCategorySelectorVisible(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <ModalBase isOpen={isOpen} onClose={onClose} className="max-w-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 flex-shrink-0"> <h2 className="text-xl font-bold text-gray-900 tracking-wider">手動でレシピを追加</h2> </div>
            <form id="manual-recipe-form" onSubmit={handleSubmit} className="flex-grow overflow-y-auto p-6 space-y-6">
                <div>
                    <label className="block text-lg font-serif font-bold tracking-widest text-primary-dark mb-2">レシピ画像 (任意)</label>
                    <label htmlFor="manual-image-upload" className="cursor-pointer block w-full aspect-[4/5] flex items-center justify-center bg-[#e6e6e6]">
                       {imagePreview ? <img src={imagePreview} alt="Recipe preview" className="w-full h-full object-cover"/> : <span className="text-primary-dark flex flex-col items-center font-serif">画像を選択</span>}
                    </label>
                    <input id="manual-image-upload" type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2"><label htmlFor="name" className="block text-lg font-serif font-bold tracking-widest text-primary-dark mb-2">レシピ名</label><input id="name" type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm px-3 py-2 focus:outline-none font-serif"/></div>
                     <div className="md:col-span-1 relative" ref={categoryInputContainerRef}>
                        <label htmlFor="category" className="block text-lg font-serif font-bold tracking-widest text-primary-dark mb-2">カテゴリ</label>
                        <input id="category" type="text" value={category} onFocus={() => setIsCategorySelectorVisible(true)} onChange={e => setCategory(e.target.value)} required autoComplete="off" className="w-full bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm px-3 py-2 focus:outline-none font-serif"/>
                        {isCategorySelectorVisible && (
                            <div className="absolute z-10 w-full mt-1 bg-base max-h-40 overflow-y-auto font-serif">
                                <ul className="py-1">
                                    {allCategories.filter(cat => cat.toLowerCase().includes(category.toLowerCase())).map(cat => (
                                        <li key={cat} onClick={() => { setCategory(cat); setIsCategorySelectorVisible(false); }} className="cursor-pointer px-3 py-2 text-sm text-gray-700">{cat}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                     <div className="md:col-span-1">
                        <div>
                            <label className="block text-lg font-serif font-bold tracking-widest text-primary-dark mb-2">タグ</label>
                            <div className="flex gap-2">
                                <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="新しいタグを追加" className="flex-grow bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm text-sm px-3 py-1.5 focus:outline-none"/>
                                <button type="button" onClick={handleAddTag} className="font-sans bg-primary-dark text-white px-3 py-1.5 font-semibold text-sm tracking-widest">追加</button>
                            </div>
                            <div className="flex flex-wrap gap-2 my-2 font-sans">
                               {tags.map(tag => (
                                    <span key={tag} className="flex items-center text-primary-dark border border-primary-dark text-xs px-2 py-1 rounded-lg font-medium">
                                        {tag}
                                        <button type="button" onClick={() => removeTag(tag)} className="ml-1.5 -mr-0.5 p-0.5 rounded-full hover:bg-gray-300 transition-colors"><XIcon className="w-3 h-3"/></button>
                                    </span>
                               ))}
                            </div>
                            {availableTags.length > 0 && (
                                 <div className="pt-1 font-sans">
                                     <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                                         {availableTags.map(tag => (
                                             <button key={tag} type="button" onClick={() => handleSelectExistingTag(tag)} className="text-xs text-primary-dark border border-primary-dark px-2 py-1 rounded-lg font-medium hover:bg-primary-dark hover:text-white transition-colors">
                                                 {tag}
                                             </button>
                                         ))}
                                     </div>
                                 </div>
                            )}
                        </div>
                    </div>
                </div>
                 <div className="md:col-span-1"><label htmlFor="cookingTime" className="block text-lg font-serif font-bold tracking-widest text-primary-dark mb-2">調理時間 (分)</label><input id="cookingTime" type="number" value={cookingTime} onChange={e => setCookingTime(e.target.value)} required placeholder="例: 20" className="w-full bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm px-3 py-2 focus:outline-none font-serif"/></div>
                <div>
                    <label className="block text-lg font-serif font-bold tracking-widest text-primary-dark mb-2">材料</label>
                    <div className="space-y-2">
                        {ingredients.map((ing, i) => (
                            <div key={i} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                                <input type="text" placeholder="材料名" value={ing.name} onChange={e => handleIngredientChange(i, 'name', e.target.value)} className="min-w-0 bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm px-3 py-2 focus:outline-none font-serif"/>
                                <input type="text" placeholder="数量" value={ing.quantity} onChange={e => handleIngredientChange(i, 'quantity', e.target.value)} className="w-24 bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm px-3 py-2 focus:outline-none font-serif"/>
                                <button type="button" onClick={() => removeIngredient(i)} className="p-2 text-gray-500 hover:text-gray-600 transition-colors font-sans"><XIcon className="w-5 h-5"/></button>
                            </div>
                        ))}
                    </div>
                    <button type="button" onClick={addIngredient} className="flex items-center gap-2 mt-3 text-gray-700 font-semibold text-sm hover:text-gray-900 font-sans"><PlusIcon className="w-4 h-4"/>材料を追加</button>
                </div>
                 <div>
                    <label className="block text-lg font-serif font-bold tracking-widest text-primary-dark mb-2">作り方 (任意)</label>
                    <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={5} placeholder="各手順を改行で区切って入力してください。" className="w-full bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm px-3 py-2 focus:outline-none"/>
                </div>
                <div>
                    <label htmlFor="linkUrl" className="block text-lg font-serif font-bold tracking-widest text-primary-dark mb-2">リンク</label>
                    <input id="linkUrl" type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://example.com/recipe" className="w-full bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm px-3 py-2 focus:outline-none font-serif"/>
                </div>
                <div>
                    <label htmlFor="memo" className="block text-lg font-serif font-bold tracking-widest text-primary-dark mb-2">メモ</label>
                    <textarea id="memo" value={memo} onChange={e => setMemo(e.target.value)} rows={3} placeholder="調理のコツや感想などを記録しましょう" className="w-full bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm px-3 py-2 focus:outline-none font-serif"/>
                </div>
            </form>
            <div className="flex-shrink-0 justify-between items-center p-4 bg-base flex font-sans">
                <button type="button" onClick={onClose} className="px-5 py-2.5 text-gray-700 font-semibold">キャンセル</button>
                <button type="submit" form="manual-recipe-form" className="px-5 py-2.5 text-white font-semibold bg-primary-dark transition-colors text-sm tracking-widest">レシピを保存</button>
            </div>
        </ModalBase>
    );
};

const AddInventoryItemModal: React.FC<{ isOpen: boolean; onClose: () => void; onAddItem: (item: Omit<InventoryItem, 'id' | 'isPersisted'>) => void; }> = ({ isOpen, onClose, onAddItem }) => {
    const [name, setName] = useState('');
    const [category, setCategory] = useState('調味料');
    const [quantity, setQuantity] = useState('');
    const [unit, setUnit] = useState('');
    const [notificationThreshold, setNotificationThreshold] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !quantity || !unit) {
            alert('品名、数量、単位は必須です。');
            return;
        }
        onAddItem({
            name,
            category,
            quantity: parseFloat(quantity),
            unit,
            notificationThreshold: parseFloat(notificationThreshold) || 0,
            purchaseUnit: unit, // Sensible default
            purchaseQuantity: 1, // Sensible default
        });
        onClose();
    };

    useEffect(() => {
        if (!isOpen) {
            setName('');
            setCategory('調味料');
            setQuantity('');
            setUnit('');
            setNotificationThreshold('');
        }
    }, [isOpen]);

    const categories = ['調味料', '野菜・果物', '肉', '魚介類', '乳製品・卵・大豆製品', '乾物・穀物・粉類', 'その他・加工品'];

    return (
        <ModalBase isOpen={isOpen} onClose={onClose} className="max-w-lg">
            <form onSubmit={handleSubmit} id="add-inventory-form">
                <div className="p-8">
                    <h2 className="text-2xl font-bold mb-6 text-gray-900 tracking-wider">在庫品目を追加</h2>
                    <div className="space-y-4 font-serif">
                        <div>
                            <label htmlFor="itemName" className="block text-sm font-medium text-gray-700">品名</label>
                            <input type="text" id="itemName" value={name} onChange={e => setName(e.target.value)} required className="mt-1 block w-full bg-transparent border-b border-gray-400 focus:border-primary-dark focus:outline-none py-2" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="itemQuantity" className="block text-sm font-medium text-gray-700">数量</label>
                                <input type="number" id="itemQuantity" value={quantity} onChange={e => setQuantity(e.target.value)} required className="mt-1 block w-full bg-transparent border-b border-gray-400 focus:border-primary-dark focus:outline-none py-2" />
                            </div>
                            <div>
                                <label htmlFor="itemUnit" className="block text-sm font-medium text-gray-700">単位 (例: g, ml, 個)</label>
                                <input type="text" id="itemUnit" value={unit} onChange={e => setUnit(e.target.value)} required className="mt-1 block w-full bg-transparent border-b border-gray-400 focus:border-primary-dark focus:outline-none py-2" />
                            </div>
                        </div>
                        <div>
                            <label htmlFor="itemCategory" className="block text-sm font-medium text-gray-700">カテゴリ</label>
                            <select id="itemCategory" value={category} onChange={e => setCategory(e.target.value)} className="mt-1 block w-full bg-transparent border-b border-gray-400 focus:border-primary-dark focus:outline-none py-2 appearance-none">
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="itemThreshold" className="block text-sm font-medium text-gray-700">通知しきい値 (任意)</label>
                            <input type="number" id="itemThreshold" value={notificationThreshold} onChange={e => setNotificationThreshold(e.target.value)} placeholder="この数量を下回ると通知" className="mt-1 block w-full bg-transparent border-b border-gray-400 focus:border-primary-dark focus:outline-none py-2" />
                        </div>
                    </div>
                </div>
                <div className="px-8 py-4 flex justify-end gap-3 font-sans">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 text-gray-700 font-semibold">キャンセル</button>
                    <button type="submit" form="add-inventory-form" className="px-5 py-2.5 text-white font-semibold bg-primary-dark text-sm tracking-widest">追加</button>
                </div>
            </form>
        </ModalBase>
    );
};

const ConfirmationModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmText?: string;}> = ({ isOpen, onClose, onConfirm, title, message, confirmText = "削除" }) => (
    <ModalBase isOpen={isOpen} onClose={onClose} className="max-w-md">
        <div className="p-8">
            <h2 className="text-2xl font-bold mb-2 text-gray-900 tracking-wider">{title}</h2>
            <p className="text-gray-500 mb-6">{message}</p>
            <div className="flex justify-end space-x-3 font-sans">
                <button onClick={onClose} className="px-5 py-2.5 text-gray-700 font-semibold">キャンセル</button>
                <button onClick={onConfirm} className="px-5 py-2.5 text-white font-semibold bg-primary-dark text-sm tracking-widest">{confirmText}</button>
            </div>
        </div>
    </ModalBase>
);

const TagManagementModal: React.FC<{isOpen: boolean; onClose: () => void; allTags: string[]; onRenameTag: (oldName: string, newName: string) => void; onDeleteTag: (tagName: string) => void; onAddTag: (tagName: string) => void;}> = ({ isOpen, onClose, allTags, onRenameTag, onDeleteTag, onAddTag }) => {
    const [editingTag, setEditingTag] = useState<string | null>(null);
    const [newName, setNewName] = useState('');
    const [tagToDelete, setTagToDelete] = useState<string | null>(null);
    const [newGlobalTag, setNewGlobalTag] = useState('');

    const handleStartRename = (tag: string) => {
        setEditingTag(tag);
        setNewName(tag);
    };

    const handleConfirmRename = () => {
        if (newName && newName.trim() !== '' && newName !== editingTag && editingTag) {
            onRenameTag(editingTag, newName.trim());
        }
        setEditingTag(null);
        setNewName('');
    };
    
    const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleConfirmRename();
        if (e.key === 'Escape') setEditingTag(null);
    }
    
    const handleAddNewTag = () => {
        if (newGlobalTag.trim()) {
            onAddTag(newGlobalTag.trim());
            setNewGlobalTag('');
        }
    };
    
    const handleAddKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleAddNewTag();
    };

    const handleDeleteConfirm = () => {
      if (tagToDelete) {
        onDeleteTag(tagToDelete);
        setTagToDelete(null);
      }
    };

    return (
        <>
            <ModalBase isOpen={isOpen} onClose={onClose} className="max-w-lg flex flex-col max-h-[80vh]">
                <div className="p-6 flex justify-between items-center flex-shrink-0">
                    <h2 className="text-xl font-bold text-gray-900 font-serif tracking-wider">タグを管理</h2>
                    <button onClick={onClose} className="p-2"><XIcon className="w-5 h-5 text-gray-600"/></button>
                </div>
                <div className="p-6 flex-grow overflow-y-auto">
                    <ul className="space-y-2">
                        {allTags.map(tag => (
                            <li key={tag} className="flex items-center justify-between p-2">
                                {editingTag === tag ? (
                                    <div className="flex-grow flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={newName}
                                            onChange={(e) => setNewName(e.target.value)}
                                            onKeyDown={handleRenameKeyDown}
                                            onBlur={handleConfirmRename}
                                            autoFocus
                                            className="flex-grow bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm px-3 py-1.5 focus:outline-none"
                                        />
                                    </div>
                                ) : (
                                    <>
                                        <span className="text-gray-700">{tag}</span>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handleStartRename(tag)} className="p-1.5 text-gray-500 hover:text-gray-800 transition-colors"><PencilIcon className="w-4 h-4"/></button>
                                            <button onClick={() => setTagToDelete(tag)} className="p-1.5 text-gray-500 hover:text-gray-800 transition-colors"><TrashIcon className="w-4 h-4"/></button>
                                        </div>
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                    {allTags.length === 0 && <p className="text-center text-gray-500 py-4">タグがありません。</p>}
                </div>
                <div className="p-6 flex-shrink-0">
                    <h3 className="text-md font-semibold text-gray-800 mb-3 font-serif tracking-wider">新しいタグを追加</h3>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={newGlobalTag}
                            onChange={e => setNewGlobalTag(e.target.value)}
                            onKeyDown={handleAddKeyDown}
                            placeholder="タグ名を入力"
                            className="flex-grow bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm px-3 py-1.5 focus:outline-none"
                        />
                        <button onClick={handleAddNewTag} className="font-sans bg-primary-dark text-white px-4 py-1.5 font-semibold text-sm tracking-widest">追加</button>
                    </div>
                </div>
            </ModalBase>
            <ConfirmationModal
                isOpen={!!tagToDelete}
                onClose={() => setTagToDelete(null)}
                onConfirm={handleDeleteConfirm}
                title="タグの削除"
                message={`タグ「${tagToDelete}」をすべてのレシピから削除しますか？この操作は元に戻せません。`}
            />
        </>
    );
};

const SectionHeader: React.FC<{ title: string; onEdit?: () => void; isEditing?: boolean; onFinish?: () => void;}> = ({ title, onEdit, isEditing, onFinish }) => (
    <div className="flex justify-between items-center mb-2">
        <h4 className="text-lg font-serif font-bold tracking-widest text-primary-dark">{title}</h4>
        {isEditing ? (
             <button onClick={onFinish} className="font-sans bg-primary-dark text-white px-3 py-1.5 font-semibold text-sm tracking-widest">完了</button>
        ) : (
            onEdit && <button onClick={onEdit} className="p-1.5 text-gray-500 hover:text-gray-800 transition-colors font-sans"><PencilIcon className="w-4 h-4"/></button>
        )}
    </div>
);


const IngredientsEditor: React.FC<{ recipe: Recipe; onFinish: () => void; }> = ({ recipe, onFinish }) => {
    const { updateRecipe } = useContext(AppContext)!;
    const [ingredients, setIngredients] = useState<RecipeIngredient[]>(() => JSON.parse(JSON.stringify(recipe.ingredients)));

    const handleIngredientChange = (index: number, field: 'name' | 'quantity', value: string) => {
        const newIngredients = [...ingredients];
        newIngredients[index][field] = value;
        setIngredients(newIngredients);
    };
    const addIngredient = () => setIngredients([...ingredients, { name: '', quantity: '' }]);
    const removeIngredient = (index: number) => setIngredients(ingredients.filter((_, i) => i !== index));
    const handleSave = () => {
        const finalIngredients = ingredients.filter(ing => ing.name.trim() !== '');
        updateRecipe(recipe.id, { ingredients: finalIngredients });
        onFinish();
    };

    return (
        <div>
            <div className="space-y-2">
                {ingredients.map((ing, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                        <input type="text" placeholder="材料名" value={ing.name} onChange={e => handleIngredientChange(i, 'name', e.target.value)} className="min-w-0 bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm px-3 py-2 focus:outline-none font-serif"/>
                        <input type="text" placeholder="数量" value={ing.quantity} onChange={e => handleIngredientChange(i, 'quantity', e.target.value)} className="w-24 bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm px-3 py-2 focus:outline-none font-serif"/>
                        <button type="button" onClick={() => removeIngredient(i)} className="p-2 text-gray-500 hover:text-gray-600 transition-colors"><XIcon className="w-5 h-5"/></button>
                    </div>
                ))}
            </div>
            <button type="button" onClick={addIngredient} className="flex items-center gap-2 mt-3 text-gray-700 font-semibold text-sm hover:text-gray-900"><PlusIcon className="w-4 h-4"/>材料を追加</button>
            <div className="flex justify-end gap-2 mt-4 font-sans">
                <button onClick={onFinish} className="px-4 py-2 text-gray-700 font-semibold text-sm">キャンセル</button>
                <button onClick={handleSave} className="px-4 py-2 text-white font-semibold bg-primary-dark text-sm tracking-widest">保存</button>
            </div>
        </div>
    );
};

const InstructionsEditor: React.FC<{ recipe: Recipe; onFinish: () => void; }> = ({ recipe, onFinish }) => {
    const { updateRecipe } = useContext(AppContext)!;
    const [instructions, setInstructions] = useState(recipe.instructions);
    const handleSave = () => {
        updateRecipe(recipe.id, { instructions });
        onFinish();
    };
    return (
        <div>
            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={10} className="w-full bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm px-3 py-2 focus:outline-none font-serif"/>
            <div className="flex justify-end gap-2 mt-2 font-sans">
                <button onClick={onFinish} className="px-4 py-2 text-gray-700 font-semibold text-sm">キャンセル</button>
                <button onClick={handleSave} className="px-4 py-2 text-white font-semibold bg-primary-dark text-sm tracking-widest">保存</button>
            </div>
        </div>
    );
};

const LinkEditor: React.FC<{ recipe: Recipe; onFinish: () => void; }> = ({ recipe, onFinish }) => {
    const { updateRecipe } = useContext(AppContext)!;
    const [linkUrl, setLinkUrl] = useState(recipe.linkUrl || '');
    const handleSave = () => {
        updateRecipe(recipe.id, { linkUrl });
        onFinish();
    };
    return (
        <div>
            <input 
                type="url" 
                value={linkUrl} 
                onChange={e => setLinkUrl(e.target.value)}
                placeholder="https://example.com/recipe"
                className="w-full bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm px-3 py-2 focus:outline-none font-serif"
                autoFocus
            />
            <div className="flex justify-end gap-2 mt-2 font-sans">
                <button onClick={onFinish} className="px-4 py-2 text-gray-700 font-semibold text-sm">キャンセル</button>
                <button onClick={handleSave} className="px-4 py-2 text-white font-semibold bg-primary-dark text-sm tracking-widest">保存</button>
            </div>
        </div>
    );
};

const MemoEditor: React.FC<{ recipe: Recipe; onFinish: () => void; }> = ({ recipe, onFinish }) => {
    const { updateRecipe } = useContext(AppContext)!;
    const [memo, setMemo] = useState(recipe.memo);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [memo]);
    const handleSave = () => {
        if(memo !== recipe.memo) {
             updateRecipe(recipe.id, { memo });
        }
        onFinish();
    };
    return (
        <div>
            <textarea
                ref={textareaRef}
                value={memo}
                onChange={e => setMemo(e.target.value)}
                rows={3}
                autoFocus
                placeholder="調理のコツや感想などを記録しましょう"
                className="w-full bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm px-3 py-2 focus:outline-none overflow-hidden resize-none font-serif"
            />
            <div className="flex justify-end gap-2 mt-2 font-sans">
                <button onClick={onFinish} className="px-4 py-2 text-gray-700 font-semibold text-sm">キャンセル</button>
                <button onClick={handleSave} className="px-4 py-2 text-white font-semibold bg-primary-dark text-sm tracking-widest">保存</button>
            </div>
        </div>
    );
};

const TagEditor: React.FC<{ recipe: Recipe; allTags: string[]; onFinish: () => void; }> = ({ recipe, allTags, onFinish }) => {
    const { updateRecipe } = useContext(AppContext)!;
    const [newTag, setNewTag] = useState('');
    
    const handleAddTag = () => {
        if (newTag && !recipe.tags.includes(newTag)) {
            updateRecipe(recipe.id, { tags: [...recipe.tags, newTag] });
        }
        setNewTag('');
    };

    const handleSelectExistingTag = (tagToAdd: string) => {
        if (!recipe.tags.includes(tagToAdd)) {
            updateRecipe(recipe.id, { tags: [...recipe.tags, tagToAdd] });
        }
    };

    const removeTag = (tagToRemove: string) => {
        updateRecipe(recipe.id, { tags: recipe.tags.filter(tag => tag !== tagToRemove) });
    };

    const availableTags = useMemo(() => allTags.filter(t => !recipe.tags.includes(t)), [allTags, recipe.tags]);
    
    return (
        <div>
            <div className="flex flex-wrap gap-2 mb-3">
                {recipe.tags.map(tag => (
                    <span key={tag} className="flex items-center text-primary-dark border border-primary-dark text-xs px-2 py-1 rounded-lg font-medium">
                        {tag}
                        <button onClick={() => removeTag(tag)} className="ml-1.5 -mr-0.5 p-0.5 rounded-full hover:bg-gray-300"><XIcon className="w-3 h-3"/></button>
                    </span>
                ))}
            </div>
            <div>
                <div className="flex gap-2">
                    <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="新しいタグを追加" className="flex-grow bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm text-sm px-3 py-1.5 focus:outline-none"/>
                    <button type="button" onClick={handleAddTag} className="font-sans bg-primary-dark text-white px-3 py-1.5 font-semibold text-sm tracking-widest">追加</button>
                </div>

                {availableTags.length > 0 && (
                    <div className="mt-4 pt-3">
                        <h5 className="text-sm font-semibold text-gray-600 mb-2">既存のタグから選択</h5>
                        <div className="flex flex-wrap gap-2">
                            {availableTags.map(tag => (
                                <button key={tag} type="button" onClick={() => handleSelectExistingTag(tag)} className="text-xs text-primary-dark border border-primary-dark px-2 py-1 rounded-lg font-medium hover:bg-primary-dark hover:text-white transition-colors">
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const CookingTimeEditor: React.FC<{ recipe: Recipe }> = ({ recipe }) => {
    const { updateRecipe } = useContext(AppContext)!;
    const [isEditing, setIsEditing] = useState(false);
    const [timeValue, setTimeValue] = useState(String(recipe.cookingTime));
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { if (isEditing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [isEditing]);
    useEffect(() => { if (!isEditing) setTimeValue(String(recipe.cookingTime)); }, [recipe.cookingTime, isEditing]);
    const handleSave = () => {
        const newTime = parseInt(timeValue, 10);
        if (!isNaN(newTime) && newTime > 0) updateRecipe(recipe.id, { cookingTime: newTime });
        setIsEditing(false);
    };
    const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); handleSave(); } else if (e.key === 'Escape') setIsEditing(false); };
    if (isEditing) {
        return (
            <div className="flex items-center text-black text-sm font-serif">
                <span className="mr-1">調理時間</span>
                <input ref={inputRef} type="number" value={timeValue} onChange={(e) => setTimeValue(e.target.value)} onBlur={handleSave} onKeyDown={handleKeyDown} className="w-16 bg-transparent text-black px-2 py-0.5 focus:outline-none" min="1"/>
                <span className="ml-1">分</span>
            </div>
        );
    }
    return (
        <div className="flex items-center text-black text-sm group/time-editor cursor-pointer font-serif" onClick={() => setIsEditing(true)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setIsEditing(true); }}>
            <span>調理時間 {recipe.cookingTime}分</span>
            <PencilIcon className="w-3.5 h-3.5 ml-2 text-gray-400 opacity-0 group-hover/time-editor:opacity-100 transition-opacity" />
        </div>
    );
};

const RecipeNameEditor: React.FC<{ recipe: Recipe; }> = ({ recipe }) => {
    const { updateRecipe } = useContext(AppContext)!;
    const [isEditing, setIsEditing] = useState(false);
    const [nameValue, setNameValue] = useState(recipe.name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);
    
    useEffect(() => {
        if (!isEditing) {
            setNameValue(recipe.name);
        }
    }, [recipe.name, isEditing]);

    const handleSave = () => {
        if (nameValue.trim() && nameValue.trim() !== recipe.name) {
            updateRecipe(recipe.id, { name: nameValue.trim() });
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
        }
    };

    if (isEditing) {
        return (
            <input
                ref={inputRef}
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent text-gray-900 text-xl font-bold px-2 py-1 focus:outline-none font-serif"
            />
        );
    }

    return (
        <div onClick={() => setIsEditing(true)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setIsEditing(true); }} className="group/name-editor cursor-pointer flex items-center gap-2">
            <h2 className="font-serif text-xl font-bold text-gray-900 tracking-wider">{recipe.name}</h2>
            <PencilIcon className="w-4 h-4 text-gray-400 opacity-0 group-hover/name-editor:opacity-100" />
        </div>
    );
};

const ThresholdEditor: React.FC<{ item: InventoryItem }> = ({ item }) => {
    const { updateInventoryItem } = useContext(AppContext)!;
    const [isEditing, setIsEditing] = useState(false);
    const [threshold, setThreshold] = useState(String(item.notificationThreshold));
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);

    useEffect(() => {
        if (!isEditing) {
            setThreshold(String(item.notificationThreshold));
        }
    }, [item.notificationThreshold, isEditing]);

    const handleSave = () => {
        const newThreshold = parseFloat(threshold);
        if (!isNaN(newThreshold) && newThreshold >= 0) {
            updateInventoryItem(item.id, { notificationThreshold: newThreshold });
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
        }
    };

    if (isEditing) {
        return (
            <div className="flex items-center text-sm mt-1">
                <span className="text-gray-500 mr-1 font-serif">しきい値:</span>
                <input
                    ref={inputRef}
                    type="number"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    className="w-16 bg-gray-100 text-gray-700 px-1 py-0.5 focus:outline-none rounded font-serif"
                    min="0"
                    step="any"
                />
                 <span className="text-gray-500 ml-1 font-serif">{item.unit}</span>
            </div>
        );
    }

    return (
        <div
            onClick={() => setIsEditing(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') setIsEditing(true); }}
            className="group/threshold-editor cursor-pointer flex items-center mt-1"
        >
            <span className="text-sm text-gray-500 font-serif">
                しきい値: {item.notificationThreshold}{item.unit}
            </span>
            <PencilIcon className="w-3 h-3 ml-1.5 text-gray-400 opacity-0 group-hover/threshold-editor:opacity-100 transition-opacity" />
        </div>
    );
};


const RecipeCard: React.FC<{ recipe: Recipe; onClick: () => void }> = ({ recipe, onClick }) => {
    const { toggleFavorite } = useContext(AppContext)!;
    const [linkCopied, setLinkCopied] = useState(false);

    const handleFavoriteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        toggleFavorite(recipe.id);
    };

    const handleCopyLink = (e: React.MouseEvent) => {
        e.stopPropagation();
        const url = `${window.location.origin}${window.location.pathname}#/recipe/${recipe.id}`;
        navigator.clipboard.writeText(url).then(() => {
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
        });
    };

    return (
        <div onClick={onClick} className="relative group/card bg-base overflow-hidden transition-all duration-300 cursor-pointer flex flex-row">
            <div className="w-2/5 flex-shrink-0 aspect-[4/5] overflow-hidden">
                 {recipe.imageUrl ? (
                    <img src={recipe.imageUrl} alt={recipe.name} className="w-full h-full object-cover" />
                ) : (
                    <NoImagePlaceholder />
                )}
            </div>
            <div className="p-4 flex flex-col w-3/5">
                <div className="flex-grow">
                    <span className="text-gray-800 text-xs font-semibold font-sans">{recipe.category}</span>
                    <h3 className="font-serif text-md font-bold text-gray-800 mt-1 mb-2 leading-tight tracking-wider">{recipe.name}</h3>
                    {recipe.tags && recipe.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2 font-sans">
                            {recipe.tags.slice(0, 3).map(tag => (
                                <span key={tag} className="text-xs text-primary-dark border border-primary-dark px-2 py-0.5 rounded-lg font-medium">{tag}</span>
                            ))}
                        </div>
                    )}
                    <p className="font-serif text-base text-black tracking-widest mt-2">{String(recipe.timesCooked || 0).padStart(4, '0')}</p>
                </div>
                <div className="flex justify-start items-baseline text-sm mt-auto pt-2">
                    <span className="font-serif text-black">
                        {recipe.cookingTime}分
                    </span>
                </div>
            </div>

            <button 
                onClick={handleFavoriteClick} 
                className={`absolute top-2 right-2 p-1.5 bg-base/70 backdrop-blur-sm rounded-full transition-colors duration-200 ${recipe.isFavorite ? 'text-primary-dark' : 'text-gray-700 hover:text-primary-dark'}`}
                aria-label="Toggle favorite"
            >
                <HeartIcon className="w-5 h-5" filled={recipe.isFavorite} />
            </button>
            
            <div className="absolute bottom-2 right-2">
                <div className="relative">
                    <button 
                        onClick={handleCopyLink} 
                        className="p-1.5 bg-base/70 backdrop-blur-sm rounded-full text-gray-700 hover:text-primary-dark transition-colors duration-200"
                        aria-label="Copy recipe link"
                    >
                        <LinkIcon className="w-5 h-5" />
                    </button>
                    {linkCopied && (
                        <div className="absolute bottom-full mb-1 right-0 bg-primary-dark text-white text-xs px-2 py-1 rounded font-sans whitespace-nowrap z-10">
                            コピーしました！
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
};

const RecipeDetailModal: React.FC<{recipe: Recipe | null; allTags: string[]; onClose: () => void}> = ({ recipe, allTags, onClose }) => {
    const { updateRecipeImage, deleteRecipe, toggleFavorite } = useContext(AppContext)!;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isEditingIngredients, setIsEditingIngredients] = useState(false);
    const [isEditingInstructions, setIsEditingInstructions] = useState(false);
    const [isEditingTags, setIsEditingTags] = useState(false);
    const [isEditingLink, setIsEditingLink] = useState(false);
    const [isEditingMemo, setIsEditingMemo] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    
    useEffect(() => {
        if (!recipe) {
            setIsEditingIngredients(false);
            setIsEditingInstructions(false);
            setIsEditingTags(false);
            setIsEditingLink(false);
            setIsEditingMemo(false);
            setLinkCopied(false);
        }
    }, [recipe]);

    if (!recipe) return null;

    const handleImageChangeClick = (e: React.MouseEvent) => { e.stopPropagation(); fileInputRef.current?.click(); };
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            await updateRecipeImage(recipe.id, e.target.files[0]);
        }
    };
    const handleDeleteClick = () => setIsConfirmOpen(true);
    const handleDeleteConfirm = () => { deleteRecipe(recipe.id); setIsConfirmOpen(false); onClose(); };

    const handleCopyLink = () => {
        const url = `${window.location.origin}${window.location.pathname}#/recipe/${recipe.id}`;
        navigator.clipboard.writeText(url).then(() => {
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2500);
        });
    };

    return (
        <>
            <ModalBase isOpen={!!recipe} onClose={onClose} className="max-w-3xl flex flex-col max-h-[90vh]">
                <div className="p-4 flex-shrink-0 flex justify-between items-center"> 
                    <RecipeNameEditor recipe={recipe} />
                    <button onClick={onClose} className="p-2 font-sans"><XIcon className="w-5 h-5 text-gray-600"/></button>
                </div>
                <div className="flex-grow overflow-y-auto p-6 pt-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                        {/* Left Column */}
                        <div>
                            <div className="relative group/image mb-4 overflow-hidden">
                                <div className="aspect-[4/5] relative">
                                     {recipe.imageUrl ? (
                                        <img src={recipe.imageUrl} alt={recipe.name} className="absolute inset-0 w-full h-full object-cover" />
                                    ) : (
                                        <NoImagePlaceholder className="absolute inset-0" />
                                    )}
                                </div>
                                <div onClick={handleImageChangeClick} className="absolute inset-0 bg-black/60 opacity-0 group-hover/image:opacity-100 flex items-center justify-center transition-opacity duration-300 cursor-pointer font-sans">
                                    <span className="flex items-center text-white font-semibold text-xs px-3 py-1.5"><CameraIcon className="w-4 h-4 mr-1.5" />画像変更</span>
                                </div>
                                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                                <button 
                                    onClick={() => toggleFavorite(recipe.id)} 
                                    className={`absolute top-3 right-3 p-2 text-white transition-colors duration-200 [filter:drop-shadow(0_2px_2px_rgb(0_0_0/0.6))]`}
                                    aria-label="Toggle favorite"
                                >
                                    <HeartIcon className="w-6 h-6" filled={recipe.isFavorite} />
                                </button>
                                <div className="absolute bottom-3 right-3 bg-white/80 backdrop-blur-sm shadow-md rounded-lg px-2 py-1 font-sans font-medium text-xs text-primary-dark">
                                    {String(recipe.timesCooked || 0).padStart(4, '0')}
                                </div>
                            </div>
                            <div className="flex justify-between items-center mb-4">
                               <span className="text-gray-800 text-sm font-semibold font-sans tracking-wider">{recipe.category}</span>
                               <div className="flex items-center gap-x-4">
                                    <CookingTimeEditor recipe={recipe} />
                               </div>
                            </div>
                            <div className="mt-4 pt-4">
                                <SectionHeader 
                                    title="タグ" 
                                    onEdit={() => setIsEditingTags(true)}
                                    isEditing={isEditingTags}
                                    onFinish={() => setIsEditingTags(false)}
                                />
                                {isEditingTags ? (
                                    <TagEditor recipe={recipe} allTags={allTags} onFinish={() => setIsEditingTags(false)} />
                                ) : (
                                    <div className="flex flex-wrap gap-2 font-sans">
                                        {recipe.tags.map(tag => (
                                            <span key={tag} className="text-primary-dark border border-primary-dark text-xs px-2 py-1 rounded-lg font-medium">{tag}</span>
                                        ))}
                                        {recipe.tags.length === 0 && <p className="text-sm text-gray-500 font-serif">タグはありません。</p>}
                                    </div>
                                )}
                            </div>
                        </div>
                        {/* Right Column */}
                        <div className="mt-6 md:mt-0">
                            <div className="mb-6">
                                {isEditingIngredients ? (
                                    <IngredientsEditor recipe={recipe} onFinish={() => setIsEditingIngredients(false)} />
                                ) : (
                                    <>
                                        <SectionHeader title="材料" onEdit={() => setIsEditingIngredients(true)} />
                                        {recipe.ingredients.map((ing, i) => (
                                            <div key={i} className="flex justify-between items-baseline py-2">
                                                <span className="text-black font-serif">{ing.name}</span>
                                                <span className="text-black font-serif">{ing.quantity}</span>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                            <div className="mb-6">
                               {isEditingInstructions ? (
                                    <InstructionsEditor recipe={recipe} onFinish={() => setIsEditingInstructions(false)} />
                                ) : (
                                     <>
                                        <SectionHeader title="作り方" onEdit={() => setIsEditingInstructions(true)} />
                                        <ol className="space-y-4">
                                            {recipe.instructions.split('\n').filter(step => step.trim()).map((step, index) => (
                                                <li key={index} className="flex items-start">
                                                    <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center border border-gray-800 rounded-full mr-3">
                                                        <span className="text-sm font-serif text-black leading-none">{index + 1}</span>
                                                    </div>
                                                    <span className="text-black leading-relaxed flex-1 font-serif">
                                                        {step.replace(/^\d+[\.\)]?\s*/, '').trim()}
                                                    </span>
                                                </li>
                                            ))}
                                        </ol>
                                    </>
                                )}
                            </div>
                             <div className="mb-6">
                                {isEditingLink ? (
                                    <LinkEditor recipe={recipe} onFinish={() => setIsEditingLink(false)} />
                                ) : (
                                    <>
                                        <SectionHeader title="リンク" onEdit={() => setIsEditingLink(true)} />
                                        {recipe.linkUrl ? (
                                            <a href={recipe.linkUrl} target="_blank" rel="noopener noreferrer" className="text-black break-all underline font-serif">
                                                {recipe.linkUrl}
                                            </a>
                                        ) : (
                                            <p className="text-sm text-gray-500 font-serif">リンクはありません。</p>
                                        )}
                                    </>
                                )}
                            </div>
                             <div className="mb-6">
                                {isEditingMemo ? (
                                    <MemoEditor recipe={recipe} onFinish={() => setIsEditingMemo(false)} />
                                ) : (
                                    <>
                                        <SectionHeader title="メモ" onEdit={() => setIsEditingMemo(true)} />
                                        {recipe.memo ? (
                                            <p className="text-black whitespace-pre-wrap min-h-[1.5rem] font-serif">
                                                {recipe.memo}
                                            </p>
                                        ) : (
                                            <p className="text-sm text-gray-500 font-serif">メモはありません。</p>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex-shrink-0 justify-between items-center p-4 bg-base flex font-sans">
                    <button 
                        onClick={handleCopyLink} 
                        className="flex items-center text-sm font-semibold text-gray-700 hover:text-primary-dark px-4 py-2.5 transition-colors tracking-widest disabled:opacity-50"
                        disabled={linkCopied}
                    >
                        <LinkIcon className="w-4 h-4 mr-2" />
                        {linkCopied ? 'コピーしました！' : 'リンクをコピー'}
                    </button>
                    <button onClick={handleDeleteClick} className="flex items-center text-sm font-semibold text-white bg-primary-dark px-4 py-2.5 transition-colors tracking-widest">
                        <TrashIcon className="w-4 h-4 mr-2" />レシピを削除
                    </button>
                </div>
            </ModalBase>
            <ConfirmationModal isOpen={isConfirmOpen} onClose={() => setIsConfirmOpen(false)} onConfirm={handleDeleteConfirm} title="レシピの削除" message={`「${recipe.name}」を本当に削除しますか？この操作は元に戻せません。`}/>
        </>
    )
};


// --- VIEW COMPONENTS ---

const LowStockNotification: React.FC = () => {
    const { lowStockItems, onNotificationClick } = useContext(AppContext)!;

    if (lowStockItems.length === 0) {
        return null;
    }

    return (
        <button onClick={onNotificationClick} className="relative text-gray-600 hover:text-primary-dark" aria-label={`在庫不足のお知らせ (${lowStockItems.length}件)`}>
            <BellIcon className="w-6 h-6" />
            <span className="absolute top-0 right-0 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border border-base"></span>
            </span>
        </button>
    );
};

const RecipeView: React.FC<{ onSelectRecipe: (id: string) => void }> = ({ onSelectRecipe }) => {
    const { recipes, addRecipeFromImage, addManualRecipe, handleRenameTag, handleDeleteTagGlobally, handleAddGlobalTag, allTags } = useContext(AppContext)!;
    const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
    const [isManualModalOpen, setIsManualModalOpen] = useState(false);
    const [isTagManagementModalOpen, setIsTagManagementModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
    const categoryDropdownRef = useRef<HTMLDivElement>(null);
    const FAVORITES_TAG = 'お気に入り';

    const handleAddFromImage = async (coverImage: File, infoImages: File[]) => { await addRecipeFromImage(coverImage, infoImages); setIsPhotoModalOpen(false); };
    const handleAddManually = (recipeData: NewRecipeData, imageFile: File | null, memo: string) => { addManualRecipe(recipeData, imageFile, memo); setIsManualModalOpen(false); };

    const categories = useMemo(() => ['All', ...new Set(recipes.map(r => r.category))], [recipes]);
    const allUniqueCategories = useMemo(() => [...new Set(recipes.map(r => r.category))], [recipes]);
    
    const handleTagClick = (tag: string) => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
                setIsCategoryDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const filteredRecipes = useMemo(() => {
        const favoritesSelected = selectedTags.includes(FAVORITES_TAG);
        const regularTagsToFilter = selectedTags.filter(t => t !== FAVORITES_TAG);

        const lowerSearchTerm = searchTerm.toLowerCase().trim();
        let searchKeywords: Set<string> = new Set();

        if (lowerSearchTerm) {
            const hiraganaSearch = toHiragana(lowerSearchTerm);
            const katakanaSearch = toKatakana(lowerSearchTerm);

            searchKeywords.add(lowerSearchTerm);
            searchKeywords.add(hiraganaSearch);
            searchKeywords.add(katakanaSearch);

            const matchingGroup = synonymGroups.find(group => 
                group.includes(lowerSearchTerm) ||
                group.includes(hiraganaSearch) ||
                group.includes(katakanaSearch)
            );

            if (matchingGroup) {
                matchingGroup.forEach(synonym => {
                    const lowerSynonym = synonym.toLowerCase();
                    searchKeywords.add(lowerSynonym);
                    searchKeywords.add(toHiragana(lowerSynonym));
                    searchKeywords.add(toKatakana(lowerSynonym));
                });
            }
        }

        return recipes.filter(recipe => {
            const matchesCategory = selectedCategory === 'All' || recipe.category === selectedCategory;
            if (!matchesCategory) return false;

            const matchesTags = regularTagsToFilter.length === 0 || regularTagsToFilter.every(tag => recipe.tags?.includes(tag));
            if (!matchesTags) return false;
            
            const matchesFavorites = !favoritesSelected || recipe.isFavorite;
            if (!matchesFavorites) return false;

            if (searchKeywords.size === 0) {
                return true; // No search term, so if other filters pass, show it.
            }

            const nameLower = recipe.name.toLowerCase();
            const ingredientsLower = recipe.ingredients.map(ing => ing.name.toLowerCase());

            const matchesSearch = [...searchKeywords].some(keyword => 
                nameLower.includes(keyword) || 
                ingredientsLower.some(ingName => ingName.includes(keyword))
            );
            
            return matchesSearch;
        });
    }, [recipes, searchTerm, selectedCategory, selectedTags]);


    const displayTags = useMemo(() => [FAVORITES_TAG, ...allTags.filter(t => t !== FAVORITES_TAG)], [allTags]);

    return (
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12">
            <div className="flex flex-col items-center text-center gap-8 mb-4 sm:flex-row sm:justify-between sm:items-center sm:text-left">
                <h2 className="text-4xl font-bold text-gray-800 font-serif">調理</h2>
                <div className="flex flex-row gap-3 w-full sm:w-auto font-sans">
                    <button onClick={() => setIsManualModalOpen(true)} className="flex items-center justify-center bg-primary-dark text-white px-4 py-2.5 w-full font-semibold text-sm tracking-widest h-11">
                        <PencilIcon className="w-5 h-5 mr-2" />手動レシピを追加
                    </button>
                    <button onClick={() => setIsPhotoModalOpen(true)} className="flex items-center justify-center bg-primary-dark text-white px-4 py-2.5 w-full font-semibold text-sm tracking-widest h-11">
                        <CameraIcon className="w-5 h-5 mr-2" />自動レシピを追加
                    </button>
                </div>
            </div>
            <div className="mb-4">
                <div className="flex flex-col sm:flex-row gap-4 mb-4">
                    <div className="relative w-full sm:w-2/3">
                        <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"/>
                        <input type="text" placeholder="レシピ名や材料で検索..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm pl-11 pr-4 py-2 focus:outline-none border border-primary-dark h-11 font-serif" />
                    </div>
                     <div className="relative w-full sm:w-1/3" ref={categoryDropdownRef}>
                        <button
                            onClick={() => setIsCategoryDropdownOpen(prev => !prev)}
                            className="w-full flex items-center justify-between bg-transparent text-gray-900 px-4 py-2 focus:outline-none border border-primary-dark h-11"
                        >
                            <span className="font-serif">{selectedCategory}</span>
                            <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isCategoryDropdownOpen && (
                            <div className="absolute z-10 w-full mt-1 bg-base border border-gray-300">
                                <ul className="max-h-60 overflow-y-auto">
                                    {categories.map(cat => (
                                        <li key={cat}>
                                            <button
                                                onClick={() => { setSelectedCategory(cat); setIsCategoryDropdownOpen(false); }}
                                                className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 font-serif"
                                            >
                                                {cat}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
                     <div className="flex-grow flex flex-wrap items-center gap-2 font-sans">
                         {displayTags.map(tag => (
                            <button key={tag} onClick={() => handleTagClick(tag)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${selectedTags.includes(tag) ? 'bg-primary-dark text-white' : 'bg-transparent text-primary-dark border border-primary-dark'}`}>
                                {tag}
                            </button>
                        ))}
                        {allTags.length > 5 && (
                             <button onClick={() => setIsTagManagementModalOpen(true)} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-primary-dark transition-colors">
                                タグを管理...
                            </button>
                        )}
                     </div>
                 </div>
            </div>

            {filteredRecipes.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredRecipes.map(recipe => (
                        <RecipeCard key={recipe.id} recipe={recipe} onClick={() => onSelectRecipe(recipe.id)} />
                    ))}
                </div>
            ) : (
                <div className="text-center py-16">
                    <p className="text-gray-500">条件に合うレシピが見つかりませんでした。</p>
                </div>
            )}
            
            <PhotoAddRecipeModal isOpen={isPhotoModalOpen} onClose={() => setIsPhotoModalOpen(false)} onAddRecipe={handleAddFromImage} />
            <ManualAddRecipeModal isOpen={isManualModalOpen} onClose={() => setIsManualModalOpen(false)} onAddRecipe={handleAddManually} allTags={allTags} allCategories={allUniqueCategories} />
            <TagManagementModal 
                isOpen={isTagManagementModalOpen} 
                onClose={() => setIsTagManagementModalOpen(false)}
                allTags={allTags}
                onRenameTag={handleRenameTag}
                onDeleteTag={handleDeleteTagGlobally}
                onAddTag={handleAddGlobalTag}
            />
        </div>
    );
};

const MealPlanRecipeSelectorModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onToggleItem: (value: string) => void;
    recipes: Recipe[];
    allTags: string[];
    categories: string[];
    currentPlanForDay: string[];
}> = ({ isOpen, onClose, onToggleItem, recipes, allTags, categories, currentPlanForDay }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [customEntry, setCustomEntry] = useState('');
    const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
    const categoryDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
                setIsCategoryDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredRecipes = useMemo(() => {
        return recipes.filter(recipe => {
            const matchesSearch = recipe.name.toLowerCase().includes(searchTerm.toLowerCase()) || recipe.ingredients.some(ing => ing.name.toLowerCase().includes(searchTerm.toLowerCase()));
            const matchesCategory = selectedCategory === 'All' || recipe.category === selectedCategory;
            const matchesTags = selectedTags.length === 0 || selectedTags.every(tag => recipe.tags?.includes(tag));
            return matchesSearch && matchesCategory && matchesTags;
        });
    }, [recipes, searchTerm, selectedCategory, selectedTags]);

    useEffect(() => {
        if (!isOpen) {
            setSearchTerm('');
            setSelectedCategory('All');
            setSelectedTags([]);
            setCustomEntry('');
            setIsCategoryDropdownOpen(false);
        }
    }, [isOpen]);

    const handleToggleItem = (value: string) => {
        onToggleItem(value);
    };

    const handleAddCustomEntry = (e: React.FormEvent) => {
        e.preventDefault();
        if (customEntry.trim()) {
            handleToggleItem(customEntry.trim());
            setCustomEntry('');
        }
    };

    const handleTagClick = (tag: string) => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    
    const manualEntries = [
        { label: '外食', value: '外食' },
        { label: 'テイクアウト', value: 'テイクアウト' },
        { label: 'デリバリー', value: 'デリバリー' },
        { label: 'つくりおき', value: 'つくりおき' },
        { label: '惣菜', value: '惣菜' },
        { label: '料理をしない日', value: '料理をしない日' },
        { label: '未定', value: '未定' },
    ];

    return (
        <ModalBase isOpen={isOpen} onClose={onClose} className="max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex-shrink-0 p-6 flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900 tracking-wider">予定を選択</h2>
                <button onClick={onClose} className="px-5 py-2.5 text-gray-700 font-semibold font-sans">完了</button>
            </div>
            <div className="overflow-y-auto">
                <div className="p-6 pt-0 border-b border-gray-200">
                    <h3 className="text-md font-semibold text-gray-800 mb-3 font-serif tracking-wider">手動で追加</h3>
                    <div className="flex flex-col gap-4">
                        <div className="flex gap-2 flex-wrap">
                            {manualEntries.map(({label, value}) => {
                                const isSelected = currentPlanForDay.includes(value);
                                return (
                                    <button 
                                        key={value}
                                        onClick={() => handleToggleItem(value)}
                                        className={`h-11 flex items-center justify-center px-4 text-sm font-semibold transition-colors font-sans ${isSelected ? 'bg-primary-dark text-white' : 'bg-[#e6e6e6] text-primary-dark hover:bg-[#f7f6f5]'}`}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                        <form onSubmit={handleAddCustomEntry} className="flex-grow flex gap-2">
                            <input
                                type="text"
                                value={customEntry}
                                onChange={(e) => setCustomEntry(e.target.value)}
                                placeholder="その他の予定 (例: パーティー)"
                                className="h-11 flex-grow bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm px-3 py-2 focus:outline-none border border-primary-dark font-serif"
                            />
                            <button type="submit" className="font-sans h-11 bg-primary-dark text-white font-semibold px-6 tracking-widest whitespace-nowrap">追加</button>
                        </form>
                    </div>
                </div>
                
                <div className="p-6 pb-2">
                    <h3 className="text-md font-semibold text-gray-800 mb-3 font-serif tracking-wider">レシピから選択</h3>
                    <div className="flex flex-col sm:flex-row gap-4 mb-4">
                        <div className="relative w-full sm:w-2/3">
                            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"/>
                            <input type="text" placeholder="レシピ名や材料で検索..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm pl-11 pr-4 py-2 focus:outline-none border border-primary-dark h-11 font-serif" />
                        </div>
                        <div className="relative w-full sm:w-1/3" ref={categoryDropdownRef}>
                            <button onClick={() => setIsCategoryDropdownOpen(prev => !prev)} className="w-full flex items-center justify-between bg-transparent text-gray-900 px-4 py-2 focus:outline-none border border-primary-dark h-11">
                                <span className="font-serif">{selectedCategory}</span>
                                <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isCategoryDropdownOpen && (
                                <div className="absolute z-10 w-full mt-1 bg-base border border-gray-300">
                                    <ul className="max-h-60 overflow-y-auto">
                                        {categories.map(cat => (
                                            <li key={cat}><button onClick={() => { setSelectedCategory(cat); setIsCategoryDropdownOpen(false); }} className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 font-serif">{cat}</button></li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                     <div className="flex flex-wrap items-center gap-2 font-sans">
                         {allTags.map(tag => (
                            <button key={tag} onClick={() => handleTagClick(tag)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${selectedTags.includes(tag) ? 'bg-primary-dark text-white' : 'bg-transparent text-primary-dark border border-primary-dark'}`}>
                                {tag}
                            </button>
                        ))}
                     </div>
                </div>

                <div className="p-6 pt-4">
                     {filteredRecipes.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {filteredRecipes.map(recipe => {
                                const isSelected = currentPlanForDay.includes(recipe.id);
                                return (
                                 <div key={recipe.id} onClick={() => handleToggleItem(recipe.id)} className="cursor-pointer group">
                                     <div className="aspect-[4/5] overflow-hidden relative">
                                         {recipe.imageUrl ? (
                                            <img src={recipe.imageUrl} alt={recipe.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"/>
                                         ) : (
                                            <NoImagePlaceholder className="absolute inset-0 transition-transform duration-300 group-hover:scale-105" />
                                         )}
                                         {isSelected && (
                                             <div className="absolute inset-0 bg-primary-dark/60 flex items-center justify-center transition-opacity">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                             </div>
                                         )}
                                     </div>
                                     <h4 className="font-serif mt-2 text-sm font-semibold text-center">{recipe.name}</h4>
                                 </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-10"><p className="text-gray-500">条件に合うレシピが見つかりませんでした。</p></div>
                    )}
                </div>
            </div>
        </ModalBase>
    );
};

const MealPlanView: React.FC = () => {
    const { 
        recipes, mealPlans, currentWeekIndex, setCurrentWeekIndex, 
        handleGenerateMealPlan, addMealPlanItem, removeMealPlanItem, 
        clearMealPlan, allTags, toggleFavorite, handleSelectRecipe, 
        selectedRecipeId, lastInteractedDay, setLastInteractedDay, 
        addNextWeek, deleteWeek,
        isSwapMode, firstSelectedItem, toggleSwapMode, setFirstSelectedItem, swapMealPlanDays,
        isPastWeek, isNextWeekDisabled
    } = useContext(AppContext)!;
    const [selectedDay, setSelectedDay] = useState<keyof MealPlanData | null>(null);
    const [isRecipeSelectorOpen, setIsRecipeSelectorOpen] = useState(false);
    const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
    const [isDeleteWeekConfirmOpen, setIsDeleteWeekConfirmOpen] = useState(false);
    const [mealPlanRequest, setMealPlanRequest] = useState('');
    const [isSwapButtonVisible, setIsSwapButtonVisible] = useState(false);
    const [showCheckmark, setShowCheckmark] = useState(false);
    const [isSwapping, setIsSwapping] = useState(false);

    const dayRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
    const prevSelectedRecipeIdRef = useRef<string | null>(null);

    const isSpinning = isSwapMode && !isPastWeek;
    const currentWeeklyPlan = mealPlans[currentWeekIndex];
    const mealPlan = currentWeeklyPlan?.plan || {};

    const handleGoToNextWeek = () => {
        if (currentWeekIndex >= mealPlans.length - 1) {
            addNextWeek();
        } else {
            setCurrentWeekIndex(currentWeekIndex + 1);
        }
    };
    
    useEffect(() => {
        // When in swap mode, the button should always be visible, regardless of scroll.
        if (isSwapMode) {
            setIsSwapButtonVisible(true);
            return; 
        }

        const mediaQuery = window.matchMedia('(min-width: 768px)');
        
        const updateVisibility = () => {
            if (mediaQuery.matches) {
                setIsSwapButtonVisible(true);
            } else {
                setIsSwapButtonVisible(window.scrollY > 200);
            }
        };

        const handleScroll = () => {
            if (!mediaQuery.matches) {
                setIsSwapButtonVisible(window.scrollY > 200);
            }
        };

        updateVisibility();
        
        mediaQuery.addEventListener('change', updateVisibility);
        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            mediaQuery.removeEventListener('change', updateVisibility);
            window.removeEventListener('scroll', handleScroll);
        };
    }, [isSwapMode]);

    useEffect(() => {
        prevSelectedRecipeIdRef.current = selectedRecipeId;
    });
    const prevSelectedRecipeId = prevSelectedRecipeIdRef.current;

    useEffect(() => {
        if (prevSelectedRecipeId && !selectedRecipeId && lastInteractedDay) {
            const element = dayRefs.current[lastInteractedDay];
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            setLastInteractedDay(null);
        }
    }, [selectedRecipeId, prevSelectedRecipeId, lastInteractedDay, setLastInteractedDay]);

    const allUniqueCategories = useMemo(() => ['All', ...new Set(recipes.map(r => r.category))], [recipes]);
    
    const handleToggleItem = (value: string) => {
        if (selectedDay) {
            const dayItems = mealPlan[selectedDay] || [];
            const itemIndex = dayItems.indexOf(value);
            if (itemIndex > -1) {
                removeMealPlanItem(selectedDay, itemIndex);
            } else {
                addMealPlanItem(selectedDay, value);
            }
        }
    };

    const handleOpenSelector = (day: keyof MealPlanData) => {
        if (isSwapMode || isPastWeek) return;
        setSelectedDay(day);
        setIsRecipeSelectorOpen(true);
    }
    
    const getRecipeById = (id: string) => recipes.find(r => r.id === id);

    const handleRemoveItem = (e: React.MouseEvent, day: keyof MealPlanData, index: number) => {
        e.stopPropagation();
        if (isSwapMode || isPastWeek) return;
        removeMealPlanItem(day, index);
    };

    const handleFavoriteClick = (e: React.MouseEvent, recipeId: string) => {
        e.stopPropagation();
        if (isSwapMode || isPastWeek) return;
        toggleFavorite(recipeId);
    };
    
    const handleClearConfirm = async () => {
        await clearMealPlan();
        setIsClearConfirmOpen(false);
    };

    const handleDeleteWeekConfirm = () => {
        if (currentWeeklyPlan) {
            deleteWeek(currentWeeklyPlan.id);
        }
        setIsDeleteWeekConfirmOpen(false);
    };
    
    const handleDayClick = (day: keyof MealPlanData) => {
        if (!isSwapMode || isPastWeek || isSwapping) return;

        if (firstSelectedItem === null) {
            setFirstSelectedItem(day);
        } else if (firstSelectedItem === day) {
            // Clicked the same day again, so de-select
            setFirstSelectedItem(null);
        } else {
            // Second click (different day): perform swap
            setIsSwapping(true);
            swapMealPlanDays(firstSelectedItem, day);
            setFirstSelectedItem(null); // Reset selection state immediately

            // Keep spinning for a bit, then show checkmark and exit swap mode
            setTimeout(() => {
                setShowCheckmark(true);
                toggleSwapMode();

                // Hide checkmark after a while and unlock UI
                setTimeout(() => {
                    setShowCheckmark(false);
                    setIsSwapping(false);
                }, 1500);
            }, 200); // 200ms of extra spinning after swap
        }
    };

    return (
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12">
            <div className="flex flex-col items-center text-center gap-8 mb-4 sm:flex-row sm:justify-between sm:items-center sm:text-left">
                <h2 className="text-4xl font-bold text-gray-800 font-serif">献立</h2>
                 <div className="flex gap-2 w-full sm:w-auto">
                    <button 
                        onClick={async () => {
                            const success = await handleGenerateMealPlan(mealPlanRequest);
                            if (success) {
                                setMealPlanRequest('');
                            }
                        }} 
                        disabled={isPastWeek}
                        className="flex-grow flex items-center justify-center bg-primary-dark text-white px-4 py-2.5 font-semibold text-sm tracking-widest font-sans disabled:bg-gray-400 disabled:cursor-not-allowed h-11"
                    >
                        <SparklesIcon className="w-5 h-5 mr-2" />
                        AIが献立を生成
                    </button>
                    <button onClick={() => setIsClearConfirmOpen(true)} disabled={isPastWeek} className="flex items-center justify-center bg-transparent border border-primary-dark text-primary-dark px-4 py-2.5 font-semibold text-sm tracking-widest font-sans disabled:border-gray-400 disabled:text-gray-400 disabled:cursor-not-allowed h-11">
                       <TrashIcon className="w-5 h-5 mr-2"/>クリア
                    </button>
                </div>
            </div>
            <div className="flex items-center gap-4 w-full mb-8">
                <input
                    type="text"
                    value={mealPlanRequest}
                    onChange={(e) => setMealPlanRequest(e.target.value)}
                    placeholder="AIへの要望を入力 (例:魚料理を2回入れて)"
                    disabled={isPastWeek}
                    className="flex-grow bg-transparent text-gray-900 placeholder-gray-400 placeholder:text-sm px-4 py-2 focus:outline-none border border-primary-dark font-serif h-11 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
            </div>

            <div className="flex justify-between items-center mb-6">
                <button 
                    onClick={() => setCurrentWeekIndex(currentWeekIndex - 1)} 
                    disabled={currentWeekIndex === 0}
                    className="flex items-center gap-2 px-4 py-3 font-semibold text-primary-dark disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                    aria-label="前週へ"
                >
                    <ChevronLeftIcon className="w-6 h-6" />
                    <span className="font-serif text-lg tracking-wider">前週</span>
                </button>
                <div className="flex-grow flex justify-center items-center">
                    <button
                        onClick={() => setIsDeleteWeekConfirmOpen(true)}
                        disabled={isPastWeek || mealPlans.length <= 1}
                        className="p-2 rounded-md transition-colors hover:bg-[#f3f3f2] disabled:hover:bg-transparent disabled:cursor-not-allowed"
                        aria-label="この週の献立を削除"
                    >
                        <h3 className="text-xl font-bold tracking-wider text-center text-gray-800 font-serif disabled:text-gray-400" aria-live="polite">
                            {currentWeeklyPlan?.startDate ? `${currentWeeklyPlan.startDate.replace(/\//g, '.')} ~` : '献立'}
                        </h3>
                    </button>
                </div>
                <button 
                    onClick={handleGoToNextWeek}
                    disabled={isNextWeekDisabled}
                    className="flex items-center gap-2 px-4 py-3 font-semibold text-primary-dark disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                    aria-label="次週へ"
                >
                    <span className="font-serif text-lg tracking-wider">次週</span>
                    <ChevronRightIcon className="w-6 h-6" />
                </button>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-6">
                {Object.entries(DAYS_OF_WEEK_JP).map(([dayKey, dayName]) => {
                    const dayItems = mealPlan[dayKey as keyof MealPlanData] || [];
                    
                    return (
                        <div 
                            key={dayKey}
                            className={`flex flex-col rounded-lg transition-colors duration-200 
                                ${isSwapMode && !isPastWeek ? 'cursor-pointer' : ''} 
                                ${firstSelectedItem === dayKey ? 'bg-[#edeae4]' : ''}
                            `}
                            onClick={() => handleDayClick(dayKey as keyof MealPlanData)}
                            ref={el => { dayRefs.current[dayKey as keyof MealPlanData] = el; }}
                        >
                            <div className="flex items-center justify-center relative mb-4 pt-2">
                                <h3 className="text-lg font-bold tracking-wider font-serif">{dayName}</h3>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleOpenSelector(dayKey as keyof MealPlanData); }}
                                    className={`absolute top-1/2 right-0 -translate-y-1/2 p-1 text-primary-dark hover:bg-gray-200/80 rounded-full transition-colors ${isSwapMode || isPastWeek ? 'hidden' : ''}`}
                                    aria-label={`${dayName}曜日に予定を追加`}
                                >
                                    <PlusIcon className="w-5 h-5" strokeWidth={1.5}/>
                                </button>
                            </div>
                            <div className="flex flex-col flex-grow p-2 space-y-2">
                                {(dayItems).map((itemValue, index) => {
                                    const recipe = getRecipeById(itemValue);
                                    
                                    const handleItemClick = (e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        if (isSwapMode && !isPastWeek) {
                                            handleDayClick(dayKey as keyof MealPlanData);
                                            return;
                                        }
                                        if (recipe) {
                                            setLastInteractedDay(dayKey as keyof MealPlanData);
                                            handleSelectRecipe(recipe.id);
                                        }
                                    };
                                    
                                    if(recipe) {
                                        return (
                                            <div key={index} onClick={handleItemClick} className={`relative group bg-base ${isSwapMode || isPastWeek ? '' : 'cursor-pointer'}`}>
                                                <div className="relative aspect-[4/5] overflow-hidden">
                                                    {recipe.imageUrl ? (
                                                        <img src={recipe.imageUrl} alt={recipe.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                                    ) : (
                                                        <NoImagePlaceholder className="absolute inset-0 transition-transform duration-300 group-hover:scale-105" />
                                                    )}
                                                </div>
                                                <div className="p-2">
                                                    <div className="flex justify-between items-start gap-1">
                                                        <h4 className="font-serif flex-1 text-sm font-bold text-gray-800 leading-tight tracking-wider">{recipe.name}</h4>
                                                         {!isSwapMode && !isPastWeek && recipe.isFavorite && (
                                                            <button
                                                                onClick={(e) => handleFavoriteClick(e, recipe.id)}
                                                                className="flex-shrink-0 p-0.5 rounded-full text-primary-dark"
                                                                aria-label="お気に入りを切り替え"
                                                            >
                                                                <HeartIcon className="w-4 h-4" filled={true} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={(e) => handleRemoveItem(e, dayKey as keyof MealPlanData, index)}
                                                    className={`absolute top-1 right-1 p-1 bg-white/50 backdrop-blur-sm rounded-full text-gray-600 hover:text-primary-dark transition-colors opacity-0 ${!isSwapMode && !isPastWeek ? 'group-hover:opacity-100' : ''} z-10`}
                                                    aria-label="予定をクリア"
                                                >
                                                    <XIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )
                                    } else {
                                        return (
                                            <div key={index} className="relative group bg-[#f3f3f2] hover:bg-[#f7f6f5] transition-colors">
                                                {/* Invisible structure for height matching */}
                                                <div className="invisible">
                                                    <div className="aspect-[4/5]"></div>
                                                    <div className="p-2">
                                                        <h4 className="text-sm font-bold text-transparent leading-tight tracking-wider select-none">-</h4>
                                                    </div>
                                                </div>
                                                {/* Centered content */}
                                                <div className="absolute inset-0 flex items-center justify-center p-3 text-center">
                                                    <p className="text-sm font-semibold text-primary-dark tracking-wider">{itemValue}</p>
                                                </div>
                                                {/* Remove button */}
                                                <button
                                                    onClick={(e) => handleRemoveItem(e, dayKey as keyof MealPlanData, index)}
                                                    className={`absolute top-1 right-1 p-1 bg-white/50 backdrop-blur-sm rounded-full text-gray-600 hover:text-primary-dark transition-colors opacity-0 ${!isSwapMode && !isPastWeek ? 'group-hover:opacity-100' : ''} z-10`}
                                                    aria-label="予定をクリア"
                                                >
                                                    <XIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )
                                    }
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
            
            <div className={`fixed bottom-8 md:bottom-6 left-1/2 -translate-x-1/2 z-20 transition-all duration-300 ease-out ${isSwapButtonVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <button
                    onClick={toggleSwapMode}
                    disabled={isPastWeek}
                    className="w-14 h-14 bg-primary-dark text-white rounded-full flex items-center justify-center shadow-xl focus:outline-none focus:ring-4 focus:ring-gray-500 transform hover:scale-105 transition-all duration-300 ease-in-out disabled:bg-gray-400 disabled:cursor-not-allowed"
                    aria-label={isSwapMode ? '入れ替えをキャンセル' : '献立を入れ替え'}
                >
                    <div className="relative w-7 h-7">
                        <CheckIcon
                            className={`absolute inset-0 transition-opacity duration-300 ${showCheckmark ? 'opacity-100' : 'opacity-0'}`}
                            strokeWidth={1.2}
                        />
                         <ArrowPathIcon
                            className={`absolute inset-0 transition-opacity duration-300 ${showCheckmark ? 'opacity-0' : 'opacity-100'} ${isSpinning ? 'animate-reverse-spin' : ''}`}
                            strokeWidth={1.2}
                        />
                    </div>
                </button>
            </div>


             <MealPlanRecipeSelectorModal
                 isOpen={isRecipeSelectorOpen}
                 onClose={() => { setIsRecipeSelectorOpen(false); setSelectedDay(null); }}
                 onToggleItem={handleToggleItem}
                 recipes={recipes}
                 allTags={allTags}
                 categories={allUniqueCategories}
                 currentPlanForDay={selectedDay ? (mealPlan[selectedDay] || []) : []}
             />
             <ConfirmationModal
                isOpen={isClearConfirmOpen}
                onClose={() => setIsClearConfirmOpen(false)}
                onConfirm={handleClearConfirm}
                title="献立をクリア"
                message="現在表示している週の献立をすべて削除します。この操作は元に戻せません。よろしいですか？"
            />
            <ConfirmationModal
                isOpen={isDeleteWeekConfirmOpen}
                onClose={() => setIsDeleteWeekConfirmOpen(false)}
                onConfirm={handleDeleteWeekConfirm}
                title="週の献立を削除"
                message={`この週（${currentWeeklyPlan?.startDate} ~）の献立をすべて削除します。この操作は元に戻せません。よろしいですか？`}
            />
        </div>
    );
};

const InventoryView: React.FC = () => {
    const { inventory, mealPlans, currentWeekIndex, updateInventoryItem, addInventoryItem } = useContext(AppContext)!;
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const displayedInventory = useMemo(() => {
        let currentStock = JSON.parse(JSON.stringify(inventory));
        for (let i = 0; i <= currentWeekIndex; i++) {
            const week = mealPlans[i];
            if (week?.consumedItems) {
                for (const consumed of week.consumedItems) {
                    const item = currentStock.find((inv: InventoryItem) => inv.id === consumed.inventoryId);
                    if (item) {
                        item.quantity -= consumed.consumedAmount;
                    }
                }
            }
        }
        currentStock.forEach((item: InventoryItem) => {
            item.quantity = parseFloat(item.quantity.toFixed(3));
        });
        return currentStock.filter((item: InventoryItem) => item.isPersisted);
    }, [inventory, mealPlans, currentWeekIndex]);

    const handleQuantityChange = (id: string, newQuantityValue: string) => {
        const newQuantity = parseFloat(newQuantityValue);
        if (isNaN(newQuantity) || newQuantity < 0) return;

        const originalPristineItem = inventory.find(i => i.id === id);
        const displayedItem = displayedInventory.find((i: InventoryItem) => i.id === id);

        if (originalPristineItem && displayedItem) {
            const quantityDiff = newQuantity - displayedItem.quantity;
            const newPristineQuantity = originalPristineItem.quantity + quantityDiff;
            updateInventoryItem(id, { quantity: parseFloat(newPristineQuantity.toFixed(3)) });
        }
    };

    const handleStepChange = (id: string, step: number) => {
        const displayedItem = displayedInventory.find((i: InventoryItem) => i.id === id);
        if (displayedItem) {
            const newQuantity = Math.max(0, displayedItem.quantity + step);
            handleQuantityChange(id, String(newQuantity));
        }
    };

    return (
        <>
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12">
                <div className="flex flex-col items-center text-center gap-8 mb-4 sm:flex-row sm:justify-between sm:items-center sm:text-left">
                    <h2 className="text-4xl font-bold text-gray-800 font-serif">在庫</h2>
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <button onClick={() => setIsAddModalOpen(true)} className="w-full sm:w-auto flex-grow flex items-center justify-center bg-primary-dark text-white px-4 py-2.5 font-semibold text-sm tracking-widest font-sans h-11">
                            <PlusIcon className="w-5 h-5 mr-2" />
                            在庫を追加
                        </button>
                        <LowStockNotification />
                    </div>
                </div>

                <div className="max-w-2xl mx-auto">
                    <ul className="divide-y divide-gray-300">
                        {displayedInventory.map((item: InventoryItem) => (
                            <li key={item.id} className="flex items-center justify-between py-4">
                                <div>
                                    <span className="text-lg font-serif block">{item.name}</span>
                                    <ThresholdEditor item={item} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => handleStepChange(item.id, -1)} className="p-1 rounded-full text-gray-600 hover:bg-gray-200"><MinusIcon className="w-5 h-5"/></button>
                                    <input 
                                        type="number" 
                                        value={String(item.quantity)}
                                        onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                                        className="w-20 text-center bg-transparent focus:outline-none text-lg font-serif"
                                    />
                                    <span className="w-12 text-gray-500 font-serif">{item.unit}</span>
                                    <button onClick={() => handleStepChange(item.id, 1)} className="p-1 rounded-full text-gray-600 hover:bg-gray-200"><PlusIcon className="w-5 h-5"/></button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
            <AddInventoryItemModal 
                isOpen={isAddModalOpen} 
                onClose={() => setIsAddModalOpen(false)} 
                onAddItem={addInventoryItem}
            />
        </>
    );
};

const ShoppingListView: React.FC = () => {
    const { shoppingList, updateShoppingList, addPurchasedItemsToInventory, addManualShoppingItem, clearShoppingList, updateShoppingItemQuantity, toggleShoppingItem, removeShoppingItem } = useContext(AppContext)!;
    const [newItemName, setNewItemName] = useState('');
    const [newItemQuantity, setNewItemQuantity] = useState('');
    const [quantitySuggestions, setQuantitySuggestions] = useState<string[]>([]);
    const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
    
    const quantityInputRef = useRef<HTMLInputElement>(null);
    const debounceTimer = useRef<number | null>(null);
    const latestName = useRef(newItemName);
    const latestQuantity = useRef(newItemQuantity);
    latestName.current = newItemName;
    latestQuantity.current = newItemQuantity;
    
    const hasCheckedItems = useMemo(() => shoppingList.some(item => item.checked), [shoppingList]);


    const handleAddItem = (e: React.FormEvent) => {
        e.preventDefault();
        const finalName = newItemName.trim();
        const finalQuantity = newItemQuantity.trim();
        if (!finalName || !finalQuantity) return;
        
        addManualShoppingItem(finalName, finalQuantity);
        setNewItemName('');
        setNewItemQuantity('');
        setQuantitySuggestions([]);
    };

    const handleSuggestionClick = (suggestion: string) => {
        setNewItemQuantity(suggestion);
        setQuantitySuggestions([]);
        quantityInputRef.current?.focus();
    };
    
    const handleQuantityBlur = () => {
        setTimeout(() => {
            if (document.activeElement !== quantityInputRef.current) {
                 setQuantitySuggestions([]);
            }
        }, 200);
    }
    
    const handleClearConfirm = () => {
        clearShoppingList();
        setIsClearConfirmOpen(false);
    };
    
    useEffect(() => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        const name = newItemName.trim();
        const quantityMatch = newItemQuantity.trim().match(/^[\d.]+$/);
        
        if (!name || !quantityMatch) {
            if (quantitySuggestions.length > 0) {
                 setQuantitySuggestions([]);
            }
            return;
        }

        const quantityNumber = quantityMatch[0];

        debounceTimer.current = window.setTimeout(async () => {
            if (document.activeElement !== quantityInputRef.current) {
                return;
            }
            if (latestName.current.trim() !== name || latestQuantity.current.trim() !== newItemQuantity.trim()) {
                 return;
            }

            try {
                const suggestions = await getUnitSuggestionsForIngredient(name, quantityNumber);
                if (document.activeElement === quantityInputRef.current) {
                    setQuantitySuggestions(suggestions || []);
                }
            } catch (error) {
                console.error("Error fetching unit suggestions:", error);
                if (document.activeElement === quantityInputRef.current) {
                    setQuantitySuggestions([]);
                }
            }
        }, 500);

        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        }
    }, [newItemName, newItemQuantity]);

    return (
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12">
            <div className="flex flex-col items-center text-center gap-8 mb-4 sm:flex-row sm:justify-between sm:items-center sm:text-left">
                <h2 className="text-4xl font-bold text-gray-800 font-serif">買物</h2>
                 <div className="flex gap-2 w-full sm:w-auto">
                    <button onClick={() => updateShoppingList()} className="flex-grow flex items-center justify-center bg-primary-dark text-white px-4 py-2.5 font-semibold text-sm tracking-widest font-sans h-11">
                        <SparklesIcon className="w-5 h-5 mr-2" />
                        献立から生成
                    </button>
                    <button onClick={() => setIsClearConfirmOpen(true)} className="flex items-center justify-center bg-transparent border border-primary-dark text-primary-dark px-4 py-2.5 font-semibold text-sm tracking-widest font-sans h-11">
                        <TrashIcon className="w-5 h-5 mr-2"/>クリア
                    </button>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch gap-4 sm:mb-8 mb-4">
                 <form onSubmit={handleAddItem} className="flex flex-col sm:flex-row items-stretch gap-4 w-full">
                    <div className="flex flex-row gap-4 flex-grow">
                        <input 
                            type="text" 
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            placeholder="材料名"
                            className="flex-grow bg-transparent border border-primary-dark px-4 py-2 focus:outline-none placeholder-gray-400 placeholder:text-sm font-serif h-11"
                        />
                         <div className="relative w-40">
                            <input 
                                ref={quantityInputRef}
                                type="text" 
                                value={newItemQuantity}
                                onBlur={handleQuantityBlur}
                                onChange={(e) => setNewItemQuantity(e.target.value)}
                                placeholder="数量"
                                className="w-full bg-transparent border border-primary-dark px-4 py-2 focus:outline-none placeholder-gray-400 placeholder:text-sm font-serif h-11"
                                autoComplete="off"
                            />
                            {quantitySuggestions.length > 0 && (
                                <div className="absolute z-10 w-full mt-1 bg-base border border-gray-300 rounded-md shadow-lg">
                                    <ul className="py-1 max-h-48 overflow-y-auto">
                                        {quantitySuggestions.map((suggestion, index) => (
                                            <li key={index}>
                                                <button
                                                    type="button"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() => handleSuggestionClick(suggestion)}
                                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 font-serif"
                                                >
                                                    {suggestion}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                    <button type="submit" className="flex-grow flex items-center justify-center bg-primary-dark text-white px-4 py-2.5 font-semibold text-sm tracking-widest font-sans h-11">追加</button>
                </form>
            </div>

            <div className="mt-8">
                {shoppingList.length > 0 ? (
                    <div className="border-t border-gray-200">
                        {shoppingList.map((item, index) => {
                            if (item.isHeader) return null;

                            return (
                                <div key={`${item.name}-${index}`} className="flex items-center justify-between py-3 group border-b border-gray-200">
                                    <div className="flex items-center flex-grow mr-4">
                                        <div 
                                            onClick={() => toggleShoppingItem(item.name)} 
                                            className="w-4 h-4 border border-primary-dark mr-4 flex-shrink-0 flex items-center justify-center cursor-pointer"
                                        >
                                            {item.checked && <CheckIcon className="w-3 h-3 text-primary-dark" />}
                                        </div>
                                        <span className={`font-serif text-lg ${item.checked ? 'text-primary-dark line-through decoration-primary-dark' : 'text-primary-dark'}`}>
                                            {item.name}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={item.quantity}
                                            onChange={(e) => updateShoppingItemQuantity(item.name, e.target.value)}
                                            className={`font-serif text-lg text-right w-32 bg-transparent focus:outline-none focus:bg-gray-100 px-2 py-1 ${item.checked ? 'text-primary-dark placeholder-gray-400 line-through decoration-primary-dark' : 'text-primary-dark placeholder-gray-500'}`}
                                        />
                                        <button 
                                            onClick={() => removeShoppingItem(index)} 
                                            className="p-1 text-primary-dark hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                                            aria-label={`「${item.name}」を削除`}
                                        >
                                            <XIcon className="w-5 h-5"/>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                     <div className="text-center py-16">
                        <p className="text-gray-500 font-serif">買い物リストは空です。</p>
                    </div>
                )}
            </div>
            
            {shoppingList.length > 0 && (
                 <div className="mt-8">
                    <button 
                        onClick={addPurchasedItemsToInventory} 
                        disabled={!hasCheckedItems} 
                        className="w-full md:w-auto flex items-center justify-center bg-primary-dark text-white px-4 py-2.5 font-semibold text-sm tracking-widest font-sans disabled:bg-[#e6e6e6] disabled:text-primary-dark disabled:cursor-not-allowed h-11"
                    >
                        <PlusIcon className="w-5 h-5 mr-2" />
                        在庫に登録
                    </button>
                </div>
            )}

            <ConfirmationModal
                isOpen={isClearConfirmOpen}
                onClose={() => setIsClearConfirmOpen(false)}
                onConfirm={handleClearConfirm}
                title="買い物リストをクリア"
                message="買い物リストのすべての項目を削除します。この操作は在庫に影響しません。よろしいですか？"
            />
        </div>
    );
};

const ErrorToast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 5000);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div className="fixed bottom-24 sm:bottom-6 right-6 bg-red-600 text-white p-4 rounded-lg shadow-lg z-50 flex items-start max-w-sm font-sans" role="alert">
            <span className="flex-grow">{message}</span>
            <button onClick={onClose} className="ml-4 -mr-1 -mt-1 p-1 rounded-full hover:bg-red-700" aria-label="Close">
                <XIcon className="w-5 h-5" />
            </button>
        </div>
    );
};


// --- MAIN APP COMPONENT ---
export const App: React.FC = () => {
    const getMonday = (date: Date): Date => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setHours(0, 0, 0, 0);
        return new Date(d.setDate(diff));
    };

    const formatDate = (date: Date): string => {
        const y = date.getFullYear();
        const m = ('0' + (date.getMonth() + 1)).slice(-2);
        const d = ('0' + date.getDate()).slice(-2);
        return `${y}/${m}/${d}`;
    };

    const getInitialMealPlans = (): WeeklyMealPlan[] => {
        const today = new Date();
        const monday = getMonday(today);
        const startDate = formatDate(monday);
        return [{
            id: `week-${Date.now()}`,
            startDate: startDate,
            plan: {}
        }];
    };

    const [activeTab, setActiveTab] = useState(AppTab.Recipe);
    const [recipes, setRecipes] = useState<Recipe[]>(() => {
        try {
            const saved = localStorage.getItem('recipes');
            return saved ? JSON.parse(saved) : INITIAL_RECIPES;
        } catch (error) {
            console.error("Failed to load recipes from localStorage", error);
            return INITIAL_RECIPES;
        }
    });

    const [mealPlans, setMealPlans] = useState<WeeklyMealPlan[]>(() => {
        try {
            const saved = localStorage.getItem('mealPlans');
            const parsed = saved ? JSON.parse(saved) : null;
            if (parsed && parsed.length > 0) {
                return parsed;
            }
            return getInitialMealPlans();
        } catch (error) {
            console.error("Failed to load meal plans from localStorage", error);
            return getInitialMealPlans();
        }
    });

    const [currentWeekIndex, _setCurrentWeekIndex] = useState<number>(() => {
        try {
            const savedPlans = localStorage.getItem('mealPlans');
            const plans: WeeklyMealPlan[] = savedPlans ? JSON.parse(savedPlans) : getInitialMealPlans();
            const today = new Date();
            const monday = getMonday(today);
            const startDate = formatDate(monday);
            const index = plans.findIndex(plan => plan.startDate === startDate);
            return index !== -1 ? index : Math.max(0, plans.length - 1);
        } catch {
            return 0;
        }
    });

    const [inventory, setInventory] = useState<InventoryItem[]>(() => {
        try {
            const saved = localStorage.getItem('inventory');
            return saved ? JSON.parse(saved) : INITIAL_INVENTORY;
        } catch (error) {
            console.error("Failed to load inventory from localStorage", error);
            return INITIAL_INVENTORY;
        }
    });

    const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>(() => {
        try {
            const saved = localStorage.getItem('shoppingList');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error("Failed to load shopping list from localStorage", error);
            return [];
        }
    });

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
    const [lastInteractedDay, setLastInteractedDay] = useState<keyof MealPlanData | null>(null);
    const [isSwapMode, setIsSwapMode] = useState(false);
    const [firstSelectedItem, setFirstSelectedItem] = useState<keyof MealPlanData | null>(null);
    const [isLowStockModalOpen, setIsLowStockModalOpen] = useState(false);

    const [extraTags, setExtraTags] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('extraTags');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            return [];
        }
    });
    
    const allTags = useMemo(() => {
        const tagsFromRecipes = recipes.flatMap(r => r.tags || []);
        return Array.from(new Set([...tagsFromRecipes, ...extraTags])).sort();
    }, [recipes, extraTags]);
    
    const lowStockItems = useMemo(() => {
        let currentStock = JSON.parse(JSON.stringify(inventory));
        for (let i = 0; i <= currentWeekIndex; i++) {
            const week = mealPlans[i];
            if (week?.consumedItems) {
                for (const consumed of week.consumedItems) {
                    const item = currentStock.find((inv: InventoryItem) => inv.id === consumed.inventoryId);
                    if (item) {
                        item.quantity -= consumed.consumedAmount;
                    }
                }
            }
        }
        return currentStock.filter((item: InventoryItem) => item.notificationThreshold > 0 && item.quantity < item.notificationThreshold);
    }, [inventory, mealPlans, currentWeekIndex]);

    const onNotificationClick = useCallback(() => {
        setIsLowStockModalOpen(true);
    }, []);

    const dynamicConversionCache = useRef<{ [key: string]: number | null }>({});

    useEffect(() => { try { localStorage.setItem('recipes', JSON.stringify(recipes)); } catch (e) { console.error(e) } }, [recipes]);
    useEffect(() => { try { localStorage.setItem('mealPlans', JSON.stringify(mealPlans)); } catch (e) { console.error(e) } }, [mealPlans]);
    useEffect(() => { try { localStorage.setItem('inventory', JSON.stringify(inventory)); } catch (e) { console.error(e) } }, [inventory]);
    useEffect(() => { try { localStorage.setItem('shoppingList', JSON.stringify(shoppingList)); } catch (e) { console.error(e) } }, [shoppingList]);
    useEffect(() => { try { localStorage.setItem('extraTags', JSON.stringify(extraTags)); } catch (e) { console.error(e) } }, [extraTags]);

    const handleError = useCallback((err: any, duration = 5000) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Error handled:", message);
        setError(message);
        const timer = setTimeout(() => setError(null), duration);
        return () => clearTimeout(timer);
    }, []);
    
    const FREQUENTLY_COOKED_TAG = 'よく作る献立';
    const FREQUENTLY_COOKED_THRESHOLD = 10;

    useEffect(() => {
        const today = new Date();
        const mondayOfToday = getMonday(today);
    
        const recipesToUpdate: { [key: string]: number } = {};
        let plansNeedUpdating = false;
    
        const updatedMealPlans = mealPlans.map(plan => {
            if (new Date(plan.startDate).getTime() < mondayOfToday.getTime() && !plan.isCounted) {
                plansNeedUpdating = true;
                Object.values(plan.plan).flat().forEach(recipeId => {
                    if (recipes.some(r => r.id === recipeId)) {
                        recipesToUpdate[recipeId] = (recipesToUpdate[recipeId] || 0) + 1;
                    }
                });
                return { ...plan, isCounted: true };
            }
            return plan;
        });
    
        setRecipes(prevRecipes => {
            let hasChanges = plansNeedUpdating;
            const updatedRecipes = prevRecipes.map(recipe => {
                const timesToAdd = recipesToUpdate[recipe.id] || 0;
                const newTimesCooked = (recipe.timesCooked || 0) + timesToAdd;
                const currentTags = new Set(recipe.tags || []);
                const shouldHaveTag = newTimesCooked >= FREQUENTLY_COOKED_THRESHOLD;
                let tagsChanged = false;
                if (shouldHaveTag && !currentTags.has(FREQUENTLY_COOKED_TAG)) {
                    currentTags.add(FREQUENTLY_COOKED_TAG);
                    tagsChanged = true;
                }
    
                if (timesToAdd > 0 || tagsChanged) {
                    hasChanges = true;
                    return {
                        ...recipe,
                        timesCooked: newTimesCooked,
                        tags: Array.from(currentTags),
                    };
                }
                
                return recipe;
            });
    
            return hasChanges ? updatedRecipes : prevRecipes;
        });
        
        if (plansNeedUpdating) {
            setMealPlans(updatedMealPlans);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        let updatedPlans: WeeklyMealPlan[] = JSON.parse(JSON.stringify(mealPlans));
        
        if (updatedPlans.length > 6) {
            const sortedPlans = [...updatedPlans].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
            updatedPlans = sortedPlans.slice(-6);
        }

        const today = new Date();
        const mondayOfToday = getMonday(today);
        const startDateOfToday = formatDate(mondayOfToday);
        const todayWeekExists = updatedPlans.some(p => p.startDate === startDateOfToday);

        if (!todayWeekExists) {
             const newWeek: WeeklyMealPlan = { id: `week-${Date.now()}`, startDate: startDateOfToday, plan: {} };
             updatedPlans.push(newWeek);
             updatedPlans.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        }

        const newIndex = updatedPlans.findIndex(p => p.startDate === startDateOfToday);
        if (newIndex !== -1 && currentWeekIndex !== newIndex) {
            _setCurrentWeekIndex(newIndex);
        }
        if(JSON.stringify(updatedPlans) !== JSON.stringify(mealPlans)) {
            setMealPlans(updatedPlans);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const findInventoryItem = useCallback((itemName: string, inventoryToSearch: InventoryItem[]) => {
        const lowerItemName = itemName.toLowerCase();
        const itemSynonyms = new Set(synonymGroups.find(g => g.includes(lowerItemName))?.map(s => s.toLowerCase()) || [lowerItemName]);
    
        for (const invItem of inventoryToSearch) {
            const lowerInvName = invItem.name.toLowerCase();
            const invSynonyms = new Set(synonymGroups.find(g => g.includes(lowerInvName))?.map(s => s.toLowerCase()) || [lowerInvName]);
            if ([...itemSynonyms].some(syn => invSynonyms.has(syn))) {
                return invItem;
            }
        }
        return null;
    }, []);
    
    const getConversionRate = useCallback(async (from: string, to: string, name: string): Promise<number | null> => {
        from = from.trim();
        to = to.trim();

        if (from.toLowerCase() === to.toLowerCase()) return 1;

        // 1. Check ingredient-specific rules
        for (const ingName in INGREDIENT_SPECIFIC_CONVERSIONS) {
             if (synonymGroups.find(g => g.includes(ingName.toLowerCase()))?.includes(name.toLowerCase())) {
                 const specificRule = INGREDIENT_SPECIFIC_CONVERSIONS[ingName]?.find(r => r.from === from && r.to === to);
                 if (specificRule) {
                    return specificRule.rate;
                 }
             }
        }
        
        // 2. Check standard conversions
        const fromBase = getBaseAmount(1, from);
        const toBase = getBaseAmount(1, to);
        if (fromBase && toBase && fromBase.baseUnit === toBase.baseUnit) {
            return fromBase.baseAmount / toBase.baseAmount;
        }

        // 3. Fallback to AI (with caching)
        const cacheKey = `${from}-to-${to}-for-${name}`;
        if (dynamicConversionCache.current[cacheKey] !== undefined) {
            return dynamicConversionCache.current[cacheKey];
        }
        const aiRate = await getDynamicConversionRate(name, from, to);
        dynamicConversionCache.current[cacheKey] = aiRate;
        return aiRate;
    }, []);

    const addRecipeFromImage = useCallback(async (coverImage: File, infoImages: File[]) => {
        setIsLoading(true);
        setError(null);
        try {
            const newRecipeData = await extractRecipeFromImage(infoImages);
            const newRecipe: Recipe = {
                id: `recipe-${Date.now()}`,
                ...newRecipeData,
                timesCooked: 0,
                memo: '',
                isFavorite: false,
            };
            
            const reader = new FileReader();
            reader.onloadend = () => {
                newRecipe.imageUrl = reader.result as string;
                setRecipes(prev => [newRecipe, ...prev]);
                setIsLoading(false);
            };
            reader.readAsDataURL(coverImage);
        } catch (err) {
            setIsLoading(false);
            handleError(err);
        }
    }, [handleError]);

    const addManualRecipe = useCallback((recipeData: NewRecipeData, imageFile: File | null, memo: string) => {
        const newRecipe: Recipe = {
            id: `recipe-${Date.now()}`,
            ...recipeData,
            timesCooked: 0,
            memo,
            isFavorite: false,
        };

        if (imageFile) {
            const reader = new FileReader();
            reader.onloadend = () => {
                newRecipe.imageUrl = reader.result as string;
                setRecipes(prev => [newRecipe, ...prev]);
            };
            reader.readAsDataURL(imageFile);
        } else {
            setRecipes(prev => [newRecipe, ...prev]);
        }
    }, []);
    
    const updateRecipe = useCallback(async (recipeId: string, updatedFields: Partial<Omit<Recipe, 'id' | 'imageUrl'>>) => {
        setRecipes(prev => prev.map(r => r.id === recipeId ? { ...r, ...updatedFields } : r));
    }, []);

    const updateRecipeImage = useCallback(async (recipeId: string, imageFile: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const imageUrl = reader.result as string;
            setRecipes(prev => prev.map(r => r.id === recipeId ? { ...r, imageUrl } : r));
        };
        reader.readAsDataURL(imageFile);
    }, []);

    const deleteRecipe = useCallback(async (recipeId: string) => {
        setRecipes(prev => prev.filter(r => r.id !== recipeId));
        setMealPlans(prev => {
            const updatedPlans: WeeklyMealPlan[] = JSON.parse(JSON.stringify(prev));
            for (const week of updatedPlans) {
                for (const day in week.plan) {
                    week.plan[day as keyof MealPlanData] = week.plan[day as keyof MealPlanData]?.filter(id => id !== recipeId);
                }
            }
            return updatedPlans;
        });
    }, []);

    const toggleFavorite = useCallback((recipeId: string) => {
        setRecipes(prev => prev.map(r => r.id === recipeId ? { ...r, isFavorite: !r.isFavorite } : r));
    }, []);

    const handleGenerateMealPlan = useCallback(async (request?: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const currentPlan = mealPlans[currentWeekIndex].plan;
            const newPlan = await generateMealPlan(recipes, currentPlan, request);
            setMealPlans(prev => {
                const newPlans = [...prev];
                newPlans[currentWeekIndex] = { ...newPlans[currentWeekIndex], plan: newPlan, consumedItems: [] };
                return newPlans;
            });
            setShoppingList([]);
            setIsLoading(false);
            return true;
        } catch (err) {
            setIsLoading(false);
            handleError(err);
            return false;
        }
    }, [recipes, mealPlans, currentWeekIndex, handleError]);

    const updateShoppingList = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        dynamicConversionCache.current = {};
    
        try {
            const planWithState = mealPlans[currentWeekIndex];
            if (!planWithState || Object.keys(planWithState.plan).length === 0) {
                setShoppingList([]);
                setMealPlans(prev => prev.map((p, i) => i === currentWeekIndex ? { ...p, consumedItems: [] } : p));
                setIsLoading(false);
                return;
            }
    
            let availableInventory = JSON.parse(JSON.stringify(inventory));
            for (let i = 0; i < currentWeekIndex; i++) {
                const pastWeek = mealPlans[i];
                if (pastWeek?.consumedItems) {
                    for (const consumed of pastWeek.consumedItems) {
                        const item = availableInventory.find((inv: InventoryItem) => inv.id === consumed.inventoryId);
                        if (item) {
                            item.quantity -= consumed.consumedAmount;
                        }
                    }
                }
            }
    
            const requiredIngredients = new Map<string, { originalName: string, totalAmount: number, unit: string }>();
            Object.values(planWithState.plan).flat().forEach(recipeId => {
                const recipe = recipes.find(r => r.id === recipeId);
                if (!recipe) return;
                recipe.ingredients.forEach(ing => {
                    const parsed = parseQuantity(ing.quantity);
                    if (!parsed) return;
    
                    const key = `${ing.name.toLowerCase()}|${parsed.unit}`;
                    const existing = requiredIngredients.get(key);
                    if (existing) {
                        existing.totalAmount += parsed.amount;
                    } else {
                        requiredIngredients.set(key, { originalName: ing.name, totalAmount: parsed.amount, unit: parsed.unit });
                    }
                });
            });
    
            const consumedItemsThisWeek: ConsumedItem[] = [];
            const shortfallList: { name: string; quantity: string; isNewItem: boolean }[] = [];
    
            for (const [, required] of requiredIngredients.entries()) {
                const invItem = findInventoryItem(required.originalName, availableInventory);
                let neededAmount = required.totalAmount;
    
                if (invItem && invItem.quantity > 0) {
                    let amountToConsume = 0;
                    const rate = await getConversionRate(required.unit, invItem.unit, required.originalName);

                    if (rate !== null) {
                        const neededInInvUnit = neededAmount * rate;
                        amountToConsume = Math.min(invItem.quantity, neededInInvUnit);
                        
                        if (amountToConsume > 0.0001) {
                            invItem.quantity -= amountToConsume;
                            consumedItemsThisWeek.push({ inventoryId: invItem.id, consumedAmount: amountToConsume });
                            neededAmount -= amountToConsume / rate;
                        }
                    }
                }
    
                if (neededAmount > 0.001) {
                    shortfallList.push({
                        name: required.originalName,
                        quantity: `${parseFloat(neededAmount.toFixed(2))}${required.unit}`,
                        isNewItem: !invItem
                    });
                }
            }
    
            setMealPlans(prev => prev.map((p, i) => i === currentWeekIndex ? { ...p, consumedItems: consumedItemsThisWeek } : p));
    
            if (shortfallList.length === 0) {
                setShoppingList([]);
                setIsLoading(false);
                return;
            }
    
            const shortfallText = shortfallList.map(i => `- ${i.name} ${i.quantity}`).join('\n');
            const categorizedItems: { name: string, quantity: string }[] = [];
    
            await new Promise<void>((resolve, reject) => {
                generateShoppingListStream(
                    shortfallText,
                    (item) => categorizedItems.push(item),
                    resolve,
                    reject
                );
            });
    
            const newShoppingList: ShoppingListItem[] = categorizedItems.map(item => {
                const original = shortfallList.find(s => s.name === item.name);
                return {
                    name: item.name,
                    quantity: item.quantity,
                    checked: false,
                    isNewItem: original?.isNewItem ?? true,
                    shortfallQuantity: original?.quantity ?? item.quantity,
                    isManual: false,
                };
            });
    
            setShoppingList(newShoppingList);
    
        } catch (err) {
            handleError(err);
        } finally {
            setIsLoading(false);
        }
    }, [mealPlans, currentWeekIndex, inventory, recipes, handleError, findInventoryItem, getConversionRate]);
    
    const addPurchasedItemsToInventory = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        dynamicConversionCache.current = {};
    
        try {
            const itemsToStock = shoppingList.filter(item => item.checked && !item.isHeader);
            if (itemsToStock.length === 0) {
                setIsLoading(false);
                return;
            }
    
            let newPristineInventory = JSON.parse(JSON.stringify(inventory));
    
            for (const shoppingItem of itemsToStock) {
                const purchasedParsed = parseQuantity(shoppingItem.quantity);
                if (!purchasedParsed || purchasedParsed.amount <= 0) continue;
    
                const invItem = findInventoryItem(shoppingItem.name, newPristineInventory);
    
                if (invItem) {
                    let amountToAddInInvUnit = purchasedParsed.amount;
                    if (purchasedParsed.unit.trim().toLowerCase() !== invItem.unit.trim().toLowerCase()) {
                        const rate = await getConversionRate(purchasedParsed.unit, invItem.unit, shoppingItem.name);
                        if (rate !== null) {
                            amountToAddInInvUnit = purchasedParsed.amount * rate;
                        } else {
                            handleError(`「${shoppingItem.name}」の単位(${purchasedParsed.unit}→${invItem.unit})を変換できず、在庫に追加できませんでした。`);
                            continue;
                        }
                    }
                    invItem.quantity += amountToAddInInvUnit;
                } else {
                    if (shoppingItem.isManual) {
                        newPristineInventory.push({
                            id: `inv-${Date.now()}-${Math.random()}`, name: shoppingItem.name, category: 'その他・加工品',
                            quantity: parseFloat(purchasedParsed.amount.toFixed(3)), unit: purchasedParsed.unit,
                            notificationThreshold: 0, purchaseUnit: purchasedParsed.unit, purchaseQuantity: purchasedParsed.amount, isPersisted: true,
                        });
                        continue;
                    }

                    const shortfallParsed = parseQuantity(shoppingItem.shortfallQuantity);
                    if (!shortfallParsed) {
                        handleError(`「${shoppingItem.name}」の必要量を計算できませんでした。`);
                        continue;
                    }
                    
                    let purchasedAmountInShortfallUnit = purchasedParsed.amount;
                    if (purchasedParsed.unit.trim().toLowerCase() !== shortfallParsed.unit.trim().toLowerCase()) {
                         const rate = await getConversionRate(purchasedParsed.unit, shortfallParsed.unit, shoppingItem.name);
                         if (rate !== null) {
                             purchasedAmountInShortfallUnit = purchasedParsed.amount * rate;
                         } else {
                             handleError(`「${shoppingItem.name}」の単位(${purchasedParsed.unit}→${shortfallParsed.unit})を変換できず、余剰を計算できませんでした。`);
                             continue;
                         }
                    }

                    const surplus = purchasedAmountInShortfallUnit - shortfallParsed.amount;
    
                    if (surplus > 0.001) {
                        newPristineInventory.push({
                            id: `inv-${Date.now()}-${Math.random()}`, name: shoppingItem.name, category: 'その他・加工品',
                            quantity: parseFloat(surplus.toFixed(3)), unit: shortfallParsed.unit,
                            notificationThreshold: 0, purchaseUnit: shortfallParsed.unit, purchaseQuantity: surplus, isPersisted: true,
                        });
                    }
                }
            }
            
            setInventory(newPristineInventory.sort((a: InventoryItem, b: InventoryItem) => a.name.localeCompare(b.name, 'ja')));
            setShoppingList(prev => prev.filter(item => !item.checked));
    
        } catch (err) {
            handleError(err);
        } finally {
            setIsLoading(false);
        }
    }, [shoppingList, inventory, handleError, findInventoryItem, getConversionRate]);
    
    const clearMealPlan = useCallback(async () => {
        setMealPlans(prev => prev.map((p, index) => 
            index === currentWeekIndex ? { ...p, plan: {}, consumedItems: [] } : p
        ));
        setShoppingList([]);
    }, [currentWeekIndex]);

    const addMealPlanItem = useCallback((day: keyof MealPlanData, value: string) => {
        setMealPlans(prev => {
            const newPlans = [...prev];
            const currentPlan = { ...(newPlans[currentWeekIndex].plan) };
            const dayItems = currentPlan[day] ? [...currentPlan[day]!] : [];
            dayItems.push(value);
            currentPlan[day] = dayItems;
            newPlans[currentWeekIndex] = { ...newPlans[currentWeekIndex], plan: currentPlan, consumedItems: [] };
            return newPlans;
        });
        setShoppingList([]);
    }, [currentWeekIndex]);
    
    const removeMealPlanItem = useCallback((day: keyof MealPlanData, itemIndex: number) => {
        setMealPlans(prev => {
            const newPlans = [...prev];
            const currentPlan = { ...(newPlans[currentWeekIndex].plan) };
            if (currentPlan[day]) {
                currentPlan[day] = currentPlan[day]!.filter((_, i) => i !== itemIndex);
                if (currentPlan[day]!.length === 0) {
                    delete currentPlan[day];
                }
            }
            newPlans[currentWeekIndex] = { ...newPlans[currentWeekIndex], plan: currentPlan, consumedItems: [] };
            return newPlans;
        });
        setShoppingList([]);
    }, [currentWeekIndex]);
    
    const addNextWeek = useCallback(() => {
        setMealPlans(prev => {
            const lastPlan = prev[prev.length - 1];
            const lastDate = new Date(lastPlan.startDate);
            lastDate.setDate(lastDate.getDate() + 7);
            const newStartDate = formatDate(lastDate);
            
            const newWeek: WeeklyMealPlan = { id: `week-${Date.now()}`, startDate: newStartDate, plan: {} };
            const newPlans = [...prev, newWeek];

            _setCurrentWeekIndex(newPlans.length - 1);
            return newPlans;
        });
    }, []);
    
    const setCurrentWeekIndex = useCallback((index: number) => {
        if(index >= 0 && index < mealPlans.length) {
            _setCurrentWeekIndex(index);
        }
    }, [mealPlans.length]);

    const deleteWeek = useCallback((weekId: string) => {
        if (mealPlans.length <= 1) {
            handleError("最後の献立は削除できません。");
            return;
        }
        
        setMealPlans(prev => {
            const newPlans = prev.filter(p => p.id !== weekId);
            const newIndex = Math.min(currentWeekIndex, newPlans.length - 1);
            _setCurrentWeekIndex(newIndex);
            return newPlans;
        });
    }, [mealPlans, currentWeekIndex, handleError]);

    const updateInventoryItem = useCallback((id: string, updatedFields: Partial<Omit<InventoryItem, 'id'>>) => {
        setInventory(prev => {
            return prev.map(i => i.id === id ? { ...i, ...updatedFields } : i);
        });
    }, []);

    const addInventoryItem = useCallback((item: Omit<InventoryItem, 'id' | 'isPersisted'>) => {
        const newItem: InventoryItem = {
            id: `inv-${Date.now()}`,
            ...item,
            isPersisted: true,
        };
        setInventory(prev => [...prev, newItem].sort((a,b) => a.name.localeCompare(b.name, 'ja')));
    }, []);
    
    const reorganizeShoppingList = useCallback(async (listToReorganize?: ShoppingListItem[]) => {
        const currentList = listToReorganize || shoppingList;
        if (currentList.length === 0) {
            if (listToReorganize) {
                setShoppingList(currentList);
            }
            return;
        }
    
        setIsLoading(true);
        setError(null);
        
        const listText = currentList
            .filter(item => !item.isHeader)
            .map(item => `- ${item.name} ${item.quantity}`)
            .join('\n');
            
        const newItems: ShoppingListItem[] = [];
    
        try {
            await new Promise<void>((resolve, reject) => {
                reorganizeShoppingListStream(
                    listText,
                    (newItem) => {
                        const originalItem = currentList.find(i => i.name === newItem.name && !i.isHeader);
                        if (originalItem) {
                            newItems.push({ ...newItem, ...originalItem });
                        }
                    },
                    () => {
                        setShoppingList(newItems);
                        resolve();
                    },
                    (err) => {
                        reject(err);
                    }
                );
            });
        } catch(err) {
            if (listToReorganize) {
                setShoppingList(listToReorganize);
            }
            handleError(err);
        } finally {
            setIsLoading(false);
        }
    }, [shoppingList, handleError]);
    
    const addManualShoppingItem = useCallback(async (name: string, quantity: string) => {
        const listWithNewItem = [...shoppingList, { name, quantity, checked: false, isHeader: false, isNewItem: true, shortfallQuantity: quantity, isManual: true }];
        await reorganizeShoppingList(listWithNewItem);
    }, [shoppingList, reorganizeShoppingList]);

    const clearShoppingList = useCallback(() => {
        setShoppingList([]);
    }, []);

    const updateShoppingItemQuantity = useCallback((name: string, newQuantity: string) => {
        setShoppingList(prev => prev.map(item => item.name === name ? { ...item, quantity: newQuantity } : item));
    }, []);

    const toggleShoppingItem = useCallback((name: string) => {
        setShoppingList(prev => prev.map(item => item.name === name ? { ...item, checked: !item.checked } : item));
    }, []);

    const removeShoppingItem = useCallback((index: number) => {
        setShoppingList(prev => prev.filter((_, i) => i !== index));
    }, []);
    
    const handleRenameTag = useCallback((oldName: string, newName: string) => {
        setRecipes(prev => prev.map(recipe => ({
            ...recipe,
            tags: recipe.tags.map(tag => tag === oldName ? newName : tag)
        })));
        setExtraTags(prev => prev.map(tag => tag === oldName ? newName : tag).filter(tag => tag !== newName || !prev.includes(newName)));
    }, []);

    const handleDeleteTagGlobally = useCallback((tagName: string) => {
        setRecipes(prev => prev.map(recipe => ({
            ...recipe,
            tags: recipe.tags.filter(tag => tag !== tagName)
        })));
        setExtraTags(prev => prev.filter(tag => tag !== tagName));
    }, []);
    
    const handleAddGlobalTag = useCallback((tagName: string) => {
        if (!extraTags.includes(tagName)) {
            setExtraTags(prev => [...prev, tagName]);
        }
    }, [extraTags]);

    const handleSelectRecipe = useCallback((recipeId: string | null) => {
        setSelectedRecipeId(recipeId);
    }, []);

    const toggleSwapMode = useCallback(() => {
        setIsSwapMode(prev => !prev);
        setFirstSelectedItem(null);
    }, []);

    const swapMealPlanDays = useCallback((day1: keyof MealPlanData, day2: keyof MealPlanData) => {
         setMealPlans(prev => {
            const newPlans = [...prev];
            const currentPlan = { ...(newPlans[currentWeekIndex].plan) };
            
            const temp = currentPlan[day1];
            currentPlan[day1] = currentPlan[day2];
            currentPlan[day2] = temp;

            if (currentPlan[day1] === undefined) delete currentPlan[day1];
            if (currentPlan[day2] === undefined) delete currentPlan[day2];

            newPlans[currentWeekIndex] = { ...newPlans[currentWeekIndex], plan: currentPlan, consumedItems: [] };
            return newPlans;
        });
        setShoppingList([]);
    }, [currentWeekIndex]);

    const isPastWeek = useMemo(() => {
        if (!mealPlans[currentWeekIndex]) return false;
        const today = new Date();
        const mondayOfToday = getMonday(today);
        const planDate = new Date(mealPlans[currentWeekIndex].startDate);
        return planDate.getTime() < mondayOfToday.getTime();
    }, [mealPlans, currentWeekIndex]);

    const isNextWeekDisabled = useMemo(() => {
        return currentWeekIndex === mealPlans.length - 1 && mealPlans.length >= 6;
    }, [currentWeekIndex, mealPlans.length]);

    const contextValue: AppContextType = {
        recipes,
        mealPlans,
        currentWeekIndex,
        inventory,
        shoppingList,
        isLoading,
        error,
        addRecipeFromImage,
        addManualRecipe,
        updateRecipe,
        updateRecipeImage,
        deleteRecipe,
        toggleFavorite,
        handleGenerateMealPlan,
        clearMealPlan,
        addMealPlanItem,
        removeMealPlanItem,
        addNextWeek,
        setCurrentWeekIndex,
        deleteWeek,
        updateShoppingList,
        addPurchasedItemsToInventory,
        updateInventoryItem,
        addInventoryItem,
        addManualShoppingItem,
        updateShoppingItemQuantity,
        reorganizeShoppingList,
        toggleShoppingItem,
        removeShoppingItem,
        clearShoppingList,
        handleRenameTag,
        handleDeleteTagGlobally,
        handleAddGlobalTag,
        allTags,
        handleSelectRecipe,
        selectedRecipeId,
        lastInteractedDay,
        setLastInteractedDay,
        isSwapMode,
        firstSelectedItem,
        toggleSwapMode,
        setFirstSelectedItem,
        swapMealPlanDays,
        isPastWeek,
        isNextWeekDisabled,
        lowStockItems,
        onNotificationClick
    };

    const selectedRecipe = useMemo(() => {
        if (!selectedRecipeId) return null;
        return recipes.find(r => r.id === selectedRecipeId) || null;
    }, [selectedRecipeId, recipes]);
    
    // Handle opening recipe from URL hash
    useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash;
            const match = hash.match(/^#\/recipe\/(recipe-\d+)$/);
            if (match && match[1]) {
                const recipeExists = recipes.some(r => r.id === match[1]);
                if (recipeExists) {
                    setSelectedRecipeId(match[1]);
                    setActiveTab(AppTab.Recipe);
                }
            }
        };
        
        window.addEventListener('hashchange', handleHashChange);
        handleHashChange(); // Check on initial load
        
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, [recipes]);
    
    const handleCloseRecipeDetail = () => {
        setSelectedRecipeId(null);
        if (window.location.hash) {
            history.pushState("", document.title, window.location.pathname + window.location.search);
        }
    }


    return React.createElement(AppContext.Provider, { value: contextValue },
        React.createElement('div', { className: 'min-h-screen flex flex-col bg-base text-primary-dark' },
            React.createElement(Header, { activeTab: activeTab, setActiveTab: setActiveTab }),
            React.createElement('main', { className: 'flex-grow pb-16 md:pb-0' },
                activeTab === AppTab.Recipe && React.createElement(RecipeView, { onSelectRecipe: handleSelectRecipe }),
                activeTab === AppTab.WeeklyMenu && React.createElement(MealPlanView, null),
                activeTab === AppTab.StockList && React.createElement(InventoryView, null),
                activeTab === AppTab.ShoppingList && React.createElement(ShoppingListView, null)
            ),
            isLoading && React.createElement(LoadingOverlay, { message: 'AIが考えています…' }),
            error && React.createElement(ErrorToast, { message: error, onClose: () => setError(null) }),
            React.createElement(RecipeDetailModal, { recipe: selectedRecipe, allTags: allTags, onClose: handleCloseRecipeDetail }),
            React.createElement(LowStockNotificationModal, { isOpen: isLowStockModalOpen, onClose: () => setIsLowStockModalOpen(false), items: lowStockItems })
        )
    );
};

export default App;
