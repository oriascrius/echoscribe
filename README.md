# EchoScribe 語音轉文字網站

上傳音訊或直接錄音，由 Google Gemini 轉成臺灣繁體中文逐字稿，可輸出純文字、時間軸、SRT 字幕。

## 架構

```
瀏覽器（React）──音訊──▶ Google Gemini API ──逐字稿 JSON──▶ 瀏覽器排版、簡轉繁、下載
```

- 純前端，**沒有自己的後端**。API 金鑰由使用者在網頁「設定」輸入，存在瀏覽器 localStorage。
- 小於 14MB 的檔案直接放在請求裡送出；更大的檔案走 Gemini Files API 上傳，轉完會自動刪除。
- m4a、webm、mp4 影片、瀏覽器錄音等格式，會先在瀏覽器內轉成 16kHz 單聲道 WAV。
- 為什麼不用 notebook 裡的 Whisper：Whisper large-v3 需要 GPU，Vercel 這類平台沒有 GPU。

## 本地執行

需要 Node.js 18 以上。

```bash
cd web
npm install
npm run dev
```

打開 http://localhost:5173 ，到右上角「設定」貼上金鑰（到 https://aistudio.google.com/apikey 申請）。

## 部署到 Vercel

1. 把 `web` 資料夾推到 GitHub。
2. 在 Vercel 匯入專案，Root Directory 選 `web`，Framework 選 Vite（通常會自動偵測）。
3. 不需要設定環境變數，每位使用者都在網頁上輸入自己的金鑰。

> 不要把金鑰寫進程式碼或 `VITE_` 開頭的環境變數。前端打包後任何人都看得到這些值。

## 檔案結構

| 檔案 | 用途 |
| --- | --- |
| `src/App.jsx` | 主畫面：三步驟流程、進度、錯誤處理 |
| `src/components/AudioInput.jsx` | 上傳／拖放／錄音 |
| `src/components/Result.jsx` | 結果檢視、對照播放、複製、下載 |
| `src/components/Settings.jsx` | 金鑰與模型設定 |
| `src/components/Guide.jsx` | 功能說明與使用限制（要改說明文字就改這裡） |
| `src/lib/gemini.js` | 呼叫 Gemini、提示詞、錯誤訊息 |
| `src/lib/audio.js` | 格式判斷、轉 WAV、大小限制 |
| `src/lib/format.js` | 純文字／時間軸／SRT 輸出、簡轉繁 |
| `src/lib/docx.js` | 匯出 Word（.docx） |

## 限制

- 需要 Gemini API 金鑰。免費版（Gemini 3.8 Flash）每天 20 次、每分鐘 5 次，每分鐘輸入上限 250K tokens（約 2 小時音訊）。可在 AI Studio 的「Rate Limit」頁面查看。
- 音訊會上傳到 Google 處理；免費方案的資料可能被 Google 用於改善服務，機密內容請改用付費方案。
- mp3、wav、aac、ogg、flac、aiff 最大 2GB；其他格式要在瀏覽器內轉檔，最大 200MB。
- 建議單檔 60 分鐘內，太長可能超過單次輸出上限，請先切段。
- 時間戳由 AI 估計，可能差幾秒；講者標籤是推測的。
- 錄音需要 https 或 localhost，且要允許麥克風權限。
- 只在瀏覽器保留最近一次結果。
