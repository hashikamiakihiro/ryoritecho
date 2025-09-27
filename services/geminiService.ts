
import { Recipe, MealPlanData, InventoryItem, ShoppingListItem } from '../src/types';

// This is a simulated environment. The backend infrastructure proxies requests to Google's API.
// The proxy URL is derived from the error message provided by the user.
const PROXY_BASE_URL = 'https://ai-chef-assistant-1062542352173.us-west1.run.app/api-proxy/v1beta';
const GEMINI_MODEL = 'gemini-2.5-flash';
const API_TIMEOUT = 30000; // 30 seconds

// Helper for adding a timeout to promises
const withTimeout = <T>(promise: Promise<T>, ms: number, timeoutError = new Error('AIとの通信がタイムアウトしました。')): Promise<T> => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(timeoutError);
        }, ms);

        promise
            .then(value => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch(reason => {
                clearTimeout(timer);
                reject(reason);
            });
    });
};

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== 'string') {
                return reject(new Error('Failed to read file as base64 string'));
            }
            // Return only the base64 part
            resolve(reader.result.split(',')[1]);
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
}

const robustJsonParse = (jsonText: string) => {
    let textToParse = jsonText.trim();
    // Look for JSON in markdown code blocks
    const jsonMatch = textToParse.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
        textToParse = jsonMatch[1];
    } else {
        // Fallback for non-markdown wrapped JSON
        const startIndex = textToParse.indexOf('{');
        const lastIndex = textToParse.lastIndexOf('}');
        if (startIndex !== -1 && lastIndex > startIndex) {
            textToParse = textToParse.substring(startIndex, lastIndex + 1);
        } else {
             const arrayStartIndex = textToParse.indexOf('[');
             const arrayLastIndex = textToParse.lastIndexOf(']');
             if(arrayStartIndex !== -1 && arrayLastIndex > arrayStartIndex){
                textToParse = textToParse.substring(arrayStartIndex, arrayLastIndex + 1);
             }
        }
    }

    if (!textToParse) {
        throw new Error("AIからの応答が空か、解析可能なJSONを含んでいませんでした。");
    }
    
    try {
        return JSON.parse(textToParse);
    } catch(e) {
        console.error("Failed to parse JSON:", textToParse, e);
        throw new Error("AIが献立を正しい形式で生成できませんでした。返却されたテキストを解析できません。");
    }
};

/**
 * A generic function to call the Gemini API via a proxy using fetch.
 * This avoids using the @google/genai library which causes ReadableStream issues in some environments.
 * @param endpoint The API endpoint to call (e.g., 'generateContent').
 * @param payload The request payload, typically { contents: [...] }.
 * @param config Additional configuration like responseMimeType.
 * @returns The text response from the AI.
 */
async function callGemini(endpoint: string, payload: object, config: { responseMimeType?: string } = {}): Promise<string> {
    // Correct URL construction by adding /models/ path segment.
    const url = `${PROXY_BASE_URL}/models/${GEMINI_MODEL}:${endpoint}`;
    
    const bodyObject = {
        ...payload,
        generationConfig: {
            responseMimeType: config.responseMimeType || "text/plain",
        }
    };
    
    // Create a Blob from the JSON string. This prevents streaming uploads which fail on iOS Safari with certain proxies.
    const bodyBlob = new Blob([JSON.stringify(bodyObject)], { type: 'application/json' });

    const headers = {
        'Content-Type': 'application/json',
    };

    // --- START OF DEBUG CODE ---
    console.log("AI Request URL:", url);
    console.log("AI Request Headers:", headers);
    // --- END OF DEBUG CODE ---

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: bodyBlob, // Use the Blob as the body to ensure non-streaming upload
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("AI API Error Response:", errorBody);
        throw new Error(`AIサーバーでエラーが発生しました (ステータス: ${response.status})`);
    }

    const data = await response.json();
    
    if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content || !data.candidates[0].content.parts || data.candidates[0].content.parts.length === 0) {
        // Attempt to find text in other common locations for safety
        if (data.candidates?.[0]?.text) {
             return data.candidates[0].text;
        }
        throw new Error("AIからの応答が予期せぬ形式でした。");
    }

    return data.candidates[0].content.parts[0].text;
}

export const extractRecipeFromImage = async (imageFiles: File[]) => {
    if (!imageFiles || imageFiles.length === 0) {
        throw new Error("画像ファイルが提供されていません。");
    }

    try {
        const imageParts = await Promise.all(imageFiles.map(async (file) => {
            const base64Data = await fileToBase64(file);
            return {
                inlineData: {
                    mimeType: file.type,
                    data: base64Data
                }
            };
        }));
        
        const textPart = { text: `あなたはプロの料理研究家です。与えられた画像から料理のレシピを抽出し、以下のルールに厳密に従って、必ずJSON形式で応答してください。

【ルール】
- 応答は、'name', 'category', 'cookingTime', 'tags', 'ingredients', 'instructions' のキーを持つJSONオブジェクトでなければなりません。
- 全てのキーの値を必ず生成してください。
- 画像から情報を読み取れない場合でも、料理の内容から最も妥当な値を推測して設定してください。特に「調理時間」と「タグ」は重要です。
- cookingTime: 調理時間（分単位の数値）を推定してください。
- tags: 料理に合いそうなタグを文字列の配列として3つ提案してください。
- ingredients: {name: string, quantity: string} の形式のオブジェクトの配列としてください。
- instructions: 各工程を改行で区切った単一の文字列としてください。

以上のルールに従い、JSONオブジェクトのみを返してください。説明や前置き、\`\`\`jsonマーカーは不要です。` };

        const payload = {
            contents: [{ parts: [...imageParts, textPart] }]
        };
        const generateContentPromise = callGemini('generateContent', payload, { responseMimeType: 'application/json' });
        
        const jsonText = await withTimeout(generateContentPromise, API_TIMEOUT);
        const recipeData = robustJsonParse(jsonText);
        
        if (!recipeData.name || !recipeData.category || !recipeData.ingredients || !recipeData.instructions || !recipeData.tags || typeof recipeData.cookingTime === 'undefined') {
            const missingFields = [];
            if (!recipeData.name) missingFields.push('レシピ名');
            if (!recipeData.category) missingFields.push('カテゴリ');
            if (!recipeData.ingredients) missingFields.push('材料');
            if (!recipeData.instructions) missingFields.push('作り方');
            if (!recipeData.tags) missingFields.push('タグ');
            if (typeof recipeData.cookingTime === 'undefined') missingFields.push('調理時間');
            throw new Error(`AIからの応答が不完全でした。必須項目（${missingFields.join(', ')}）が不足しています。`);
        }
        recipeData.linkUrl = "";
        recipeData.memo = "";
        return recipeData;

    } catch (error) {
        console.error("Error extracting recipe from image:", error);
        throw error;
    }
};

export const generateMealPlan = async (recipes: Recipe[], currentMealPlan: MealPlanData, request?: string) => {
    const allDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const emptyDays = allDays.filter(day => !currentMealPlan[day as keyof MealPlanData] || currentMealPlan[day as keyof MealPlanData]!.length === 0);

    if (emptyDays.length === 0) {
        throw new Error("献立のすべての曜日が埋まっています。");
    }

    const recipesForPrompt = recipes.map(r => ({ 
        id: r.id, 
        name: r.name,
        category: r.category,
    }));
    
    const prefilledDays = Object.entries(currentMealPlan)
        .filter(([, items]) => Array.isArray(items) && items.length > 0)
        .reduce((acc, [day, items]) => {
            acc[day as keyof MealPlanData] = items as string[];
            return acc;
        }, {} as MealPlanData);

    const prompt = `あなたは日本の家庭向けの献立作成アシスタントです。
以下の情報を基に、1週間の夕食の献立を完成させてください。

# 利用可能なレシピのリスト
${JSON.stringify(recipesForPrompt, null, 2)}

# 既に決定済みの献立
${JSON.stringify(prefilledDays, null, 2)}

# ユーザーからの追加要望
${(request && request.trim()) ? request : "特になし"}

# 実行内容と出力形式
1. 「既に決定済みの献立」は絶対に編集しないでください。
2. 空いている曜日を、「利用可能なレシピ」のリストからレシピID（例: "recipe-1"）を選んで埋めてください。
3. 栄養バランスや味の多様性を考慮してください。
4. 汁物（カテゴリが '汁物' のもの）は、週に2〜3回程度にしてください。
5. **必ず、以下のJSON形式に従って、JSONオブジェクトのみを返してください。説明や前置き、\`\`\`jsonマーカーは不要です。**

出力形式の例:
{
  "monday": ["recipe-1"],
  "tuesday": ["外食"],
  "wednesday": ["recipe-3"],
  "thursday": ["recipe-4"],
  "friday": ["recipe-5", "recipe-6"],
  "saturday": ["recipe-2"],
  "sunday": ["デリバリー"]
}
`;

    try {
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const generateContentPromise = callGemini('generateContent', payload, { responseMimeType: 'application/json' });
        const jsonText = await withTimeout(generateContentPromise, API_TIMEOUT);
        return robustJsonParse(jsonText);

    } catch (error) {
        console.error("Error generating meal plan:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`AIサーバーで問題が発生したか、リクエストが複雑すぎる可能性があります。\n詳細: ${errorMessage}`);
    }
};

export const generateShoppingListStream = async (
    shortfallText: string,
    onNewItem: (item: { name: string; quantity: string; }) => void,
    onComplete: () => void,
    onError: (error: Error) => void
) => {
    if (!shortfallText.trim()) {
        onComplete();
        return;
    }

    const prompt = `あなたはプロの買い物リスト作成アシスタントです。あなたのタスクは、提示されたリストを、指定されたカテゴリー順に並べ替えることです。

# 指示
- 以下の「買い物リスト」の各項目を、【カテゴリーの並び順】に従って並べ替えてください。
- **カテゴリー名は絶対に出力しないでください。**
- 最終的な出力は、並べ替えられたマークダウン形式のアイテムリストのみにしてください。他の文章（「これが買い物リストです」のような前置きなど）は一切不要です。
- 各項目を「- 材料名 数量」の形式でリストアップしてください。
- 元のリストに含まれるヘッダー（例: ## 野菜・果物）は無視し、出力に含めないでください。
- 元のリストの数量表現を尊重してください。

# 【カテゴリーの並び順】
- 野菜・果物
- 肉
- 魚介類
- 乳製品・卵・大豆製品
- 調味料・スパイス
- 乾物・穀物・粉類
- その他・加工品

# 買い物リスト
${shortfallText}
`;
    
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
    };
    const url = `${PROXY_BASE_URL}/models/${GEMINI_MODEL}:streamGenerateContent`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("AI API Error Response:", errorBody);
            throw new Error(`AIサーバーでエラーが発生しました (ステータス: ${response.status})`);
        }

        if (!response.body) {
            throw new Error("ストリーミング応答がありません。");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            
            let processFrom = 0;
            while (processFrom < buffer.length) {
                const start = buffer.indexOf('{', processFrom);
                if (start === -1) break;
                
                let balance = 1;
                let end = start + 1;
                while (end < buffer.length && balance > 0) {
                    if (buffer[end] === '{') balance++;
                    if (buffer[end] === '}') balance--;
                    end++;
                }

                if (balance === 0) {
                    const jsonStr = buffer.substring(start, end);
                    try {
                        const json = JSON.parse(jsonStr);
                        const textChunk = json?.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (textChunk) {
                            accumulatedText += textChunk;
                            let newlineIndex;
                            while ((newlineIndex = accumulatedText.indexOf('\n')) !== -1) {
                                const line = accumulatedText.substring(0, newlineIndex).trim();
                                accumulatedText = accumulatedText.substring(newlineIndex + 1);
                                if (line) {
                                    if (line.startsWith('- ') || line.startsWith('* ')) {
                                        const itemText = line.substring(2).trim();
                                        const lastSpaceIndex = itemText.lastIndexOf(' ');
                                        
                                        if (itemText && lastSpaceIndex > 0) {
                                            const name = itemText.substring(0, lastSpaceIndex).trim();
                                            const quantity = itemText.substring(lastSpaceIndex + 1).trim();
                                            if (name && quantity) {
                                                onNewItem({ name, quantity });
                                            }
                                        } else if (itemText) {
                                            onNewItem({ name: itemText, quantity: '' });
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // Incomplete or invalid JSON, ignore and continue
                    }
                    processFrom = end;
                } else {
                    break;
                }
            }
            buffer = buffer.substring(processFrom);
        }
        
        // Process any remaining text in accumulatedText
        if (accumulatedText.trim()) {
            const lines = accumulatedText.trim().split('\n');
            for(const line of lines) {
                 if (line.startsWith('- ') || line.startsWith('* ')) {
                    const itemText = line.substring(2).trim();
                    const lastSpaceIndex = itemText.lastIndexOf(' ');
                    if (itemText && lastSpaceIndex > 0) {
                        const name = itemText.substring(0, lastSpaceIndex).trim();
                        const quantity = itemText.substring(lastSpaceIndex + 1).trim();
                        if (name && quantity) {
                            onNewItem({ name, quantity });
                        }
                    } else if (itemText) {
                        onNewItem({ name: itemText, quantity: '' });
                    }
                }
            }
        }
        onComplete();
    } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
    }
};

export const reorganizeShoppingListStream = async (
    shoppingListText: string,
    onNewItem: (item: ShoppingListItem) => void,
    onComplete: () => void,
    onError: (error: Error) => void
) => {
    const prompt = `あなたはプロの買い物リスト整理アシスタントです。あなたのタスクは、提示されたリストを、指定されたカテゴリー順に並べ替えることです。

# 指示
- 以下の「買い物リスト」の各項目を、【カテゴリーの並び順】に従って並べ替えてください。
- **カテゴリー名は絶対に出力しないでください。**
- 最終的な出力は、並べ替えられたマークダウン形式のアイテムリストのみにしてください。他の文章（「これが買い物リストです」のような前置きなど）は一切不要です。
- 各項目を「- 材料名 数量」の形式でリストアップしてください。
- 元のリストに含まれるヘッダー（例: ## 野菜・果物）は無視し、出力に含めないでください。

# 【カテゴリーの並び順】
- 野菜・果物
- 肉
- 魚介類
- 乳製品・卵・大豆製品
- 調味料・スパイス
- 乾物・穀物・粉類
- その他・加工品

# 買い物リスト
${shoppingListText}
`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
    };
    const url = `${PROXY_BASE_URL}/models/${GEMINI_MODEL}:streamGenerateContent`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("AI API Error Response:", errorBody);
            throw new Error(`AIサーバーでエラーが発生しました (ステータス: ${response.status})`);
        }

        if (!response.body) {
            throw new Error("ストリーミング応答がありません。");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            
            let processFrom = 0;
            while (processFrom < buffer.length) {
                const start = buffer.indexOf('{', processFrom);
                if (start === -1) break;
                
                let balance = 1;
                let end = start + 1;
                while (end < buffer.length && balance > 0) {
                    if (buffer[end] === '{') balance++;
                    if (buffer[end] === '}') balance--;
                    end++;
                }

                if (balance === 0) {
                    const jsonStr = buffer.substring(start, end);
                    try {
                        const json = JSON.parse(jsonStr);
                        const textChunk = json?.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (textChunk) {
                            accumulatedText += textChunk;
                            let newlineIndex;
                            while ((newlineIndex = accumulatedText.indexOf('\n')) !== -1) {
                                const line = accumulatedText.substring(0, newlineIndex).trim();
                                accumulatedText = accumulatedText.substring(newlineIndex + 1);
                                if (line) {
                                    if (line.startsWith('- ') || line.startsWith('* ')) {
                                        const itemText = line.substring(2).trim();
                                        const lastSpaceIndex = itemText.lastIndexOf(' ');
                                        
                                        if (itemText && lastSpaceIndex > 0) {
                                            const name = itemText.substring(0, lastSpaceIndex).trim();
                                            const quantity = itemText.substring(lastSpaceIndex + 1).trim();
                                            if (name && quantity) {
                                                onNewItem({ name, quantity, checked: false, isHeader: false, isNewItem: false, shortfallQuantity: quantity });
                                            }
                                        } else if (itemText) {
                                            onNewItem({ name: itemText, quantity: '', checked: false, isHeader: false, isNewItem: false, shortfallQuantity: '' });
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // Incomplete or invalid JSON, ignore and continue
                    }
                    processFrom = end;
                } else {
                    break;
                }
            }
            buffer = buffer.substring(processFrom);
        }
        
        if (accumulatedText.trim()) {
            const lines = accumulatedText.trim().split('\n');
            for(const line of lines) {
                 if (line.startsWith('- ') || line.startsWith('* ')) {
                    const itemText = line.substring(2).trim();
                    const lastSpaceIndex = itemText.lastIndexOf(' ');
                    if (itemText && lastSpaceIndex > 0) {
                        const name = itemText.substring(0, lastSpaceIndex).trim();
                        const quantity = itemText.substring(lastSpaceIndex + 1).trim();
                        if (name && quantity) {
                             onNewItem({ name, quantity, checked: false, isHeader: false, isNewItem: false, shortfallQuantity: quantity });
                        }
                    } else if (itemText) {
                        onNewItem({ name: itemText, quantity: '', checked: false, isHeader: false, isNewItem: false, shortfallQuantity: '' });
                    }
                }
            }
        }
        onComplete();
    } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
    }
};


export const getUnitSuggestionsForIngredient = async (ingredientName: string, quantityNumber: string): Promise<string[]> => {
    if (!ingredientName.trim() || !quantityNumber.trim()) {
        return [];
    }

    const prompt = `「${ingredientName}」という材料と「${quantityNumber}」という数量を組み合わせた、日本の家庭料理で最も一般的ないくつかの分量表現を提案してください。例えば、「豆腐」と「1」なら「1丁」「1パック」、「牛乳」と「100」なら「100ml」「100cc」のように、3〜5個の候補をリスト形式で返してください。 **必ず、{ "suggestions": ["1個", "1玉"] } のようなJSON形式で返してください。**`;

    try {
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const generateContentPromise = callGemini('generateContent', payload, { responseMimeType: 'application/json' });
        const jsonText = await withTimeout(generateContentPromise, API_TIMEOUT);
        const result = robustJsonParse(jsonText);
        return result.suggestions || [];
    } catch (error) {
        console.error("Error getting unit suggestions:", error);
        return []; // Fail silently for this non-critical feature
    }
};

export const getDynamicConversionRate = async (ingredientName: string, fromUnit: string, toUnit: string): Promise<number | null> => {
    if (fromUnit === toUnit) {
        return 1;
    }

    const prompt = `「${ingredientName}」の「1${fromUnit}」は、およそ何「${toUnit}」に相当しますか？
応答は、例のようにrateキーに数値のみを入れたJSONオブジェクトで返してください: {"rate": 18}
説明や他のテキストは一切含めないでください。変換できない場合は {"rate": null} と返してください。`;

    try {
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        // This is a quick, specific query, so a shorter timeout is appropriate.
        const generateContentPromise = callGemini('generateContent', payload, { responseMimeType: 'application/json' });
        const jsonText = await withTimeout(generateContentPromise, 15000, new Error('単位換算のためのAI通信がタイムアウトしました。'));
        const result = robustJsonParse(jsonText);
        
        const rate = result.rate;

        if (rate !== null && typeof rate === 'number' && isFinite(rate)) {
            console.log(`AI Conversion: 1 ${fromUnit} of ${ingredientName} ≈ ${rate} ${toUnit}`);
            return rate;
        }

        if (rate === null) {
            console.warn(`AI determined no conversion possible for ${ingredientName} from ${fromUnit} to ${toUnit}.`);
        } else {
            console.warn(`AI returned invalid rate for conversion:`, result);
        }
        return null;

    } catch (error) {
        console.error(`Error getting dynamic conversion rate for ${ingredientName}:`, error);
        return null; // Fail gracefully
    }
};
