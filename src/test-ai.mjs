import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

const API_KEY = process.env.VITE_GEMINI_KEY;
if (!API_KEY) {
  throw new Error("APIキーが設定されていません。");
}

const genAI = new GoogleGenerativeAI(API_KEY);

async function listModels() {
  console.log("利用可能なモデルのリストを問い合わせています...");
  try {
    // これはGoogle AIのAPIクライアントの隠れた機能ですが、これでモデル一覧が取得できます
    const result = await genAI.getGenerativeModel({ model: "" })._listModels();

    console.log("--- 利用可能なモデルリスト ---");
    for (const model of result.models) {
      console.log(`- ${model.name}`);
    }
    console.log("--------------------------");
  } catch (error) {
    console.error("モデルリストの取得中にエラー:", error.message);
  }
}

listModels();
