import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js";

let reviews = [];
let sentimentPipeline = null;

// DOM elements
const analyzeBtn = document.getElementById("analyzeBtn");
const reviewBox = document.getElementById("reviewBox");
const resultEl = document.getElementById("result");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

// Google Apps Script URL для логирования
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzBkegL2WcBtQpgDzqCfxmdA4So9cBQxOscNVd_iSLyNj-zEo2lEH_l7MnXPnhhFYiGJw/exec";

document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM loaded, starting initialization...");
  clearError();
  setStatus("Initializing application... (0/3 steps)");

  try {
    // Шаг 1: Проверяем наличие PapaParse
    if (typeof Papa === 'undefined') {
      throw new Error("PapaParse library not loaded. Check CDN in index.html");
    }
    console.log("✓ PapaParse loaded");
    setStatus("PapaParse loaded. Loading reviews... (1/3 steps)");
    
    // Шаг 2: Загружаем отзывы
    await loadReviews();
    console.log(`✓ Loaded ${reviews.length} reviews`);
    setStatus(`Loaded ${reviews.length} reviews. Loading sentiment model... (2/3 steps)`);
    
    // Шаг 3: Загружаем модель
    await initModel();
    console.log("✓ Sentiment model ready");
    setStatus(`Model ready! Loaded ${reviews.length} reviews. Click 'Analyze Random Review' to start. (3/3 steps)`);
    
    // Активируем кнопку
    analyzeBtn.disabled = false;
    
  } catch (err) {
    console.error("Initialization error:", err);
    handleError(err, `Initialization failed: ${err.message}. Check console (F12) for details.`);
    
    // Показываем детальную информацию об ошибке в консоли
    console.log("Debug info:", {
      papaParseAvailable: typeof Papa !== 'undefined',
      reviewsLoaded: reviews.length,
      modelLoaded: !!sentimentPipeline
    });
  }

  analyzeBtn.addEventListener("click", onAnalyzeClick);
});

/**
 * Fetches and parses the TSV file containing reviews.
 */
async function loadReviews() {
  let response;
  try {
    console.log("Attempting to fetch reviews_test.tsv...");
    response = await fetch("reviews_test.tsv");
    console.log("Fetch response status:", response.status);
  } catch (err) {
    console.error("Network error details:", err);
    throw new Error(`Network error: ${err.message}. Make sure reviews_test.tsv exists in the same folder as index.html`);
  }

  if (!response.ok) {
    throw new Error(`Failed to load TSV file (status ${response.status}). File not found or inaccessible.`);
  }

  const tsvText = await response.text();
  console.log(`TSV file loaded, size: ${tsvText.length} bytes`);
  console.log("First 200 chars:", tsvText.substring(0, 200));

  return new Promise((resolve, reject) => {
    console.log("Starting PapaParse parsing...");
    Papa.parse(tsvText, {
      header: true,
      delimiter: "\t",
      skipEmptyLines: true,
      complete: (results) => {
        console.log("PapaParse complete:", results);
        try {
          if (!results.data || !Array.isArray(results.data)) {
            throw new Error("Parsed data is invalid.");
          }
          
          console.log(`Parsed ${results.data.length} rows from TSV`);
          console.log("First row:", results.data[0]);
          console.log("Columns found:", results.meta.fields);

          // Attempt to extract the "text" column; fallback to first column if needed
          reviews = results.data
            .map((row, index) => {
              if (typeof row.text === "string") {
                return row.text.trim();
              }
              // Если нет колонки 'text', пробуем найти любую колонку с текстом
              const firstKey = Object.keys(row)[0];
              if (firstKey && typeof row[firstKey] === "string") {
                console.log(`Using column "${firstKey}" for reviews (no 'text' column found)`);
                return row[firstKey].trim();
              }
              console.warn(`Row ${index} has no valid text:`, row);
              return null;
            })
            .filter((text) => typeof text === "string" && text.length > 0);

          console.log(`Extracted ${reviews.length} valid reviews`);
          if (reviews.length > 0) {
            console.log("Sample review:", reviews[0]);
          }

          if (reviews.length === 0) {
            throw new Error("No valid review texts found in TSV. Check file format.");
          }

          resolve();
        } catch (err) {
          reject(err);
        }
      },
      error: (err) => {
        console.error("PapaParse error:", err);
        reject(new Error(`TSV parsing error: ${err.message}`));
      },
    });
  });
}

/**
 * Initializes the Transformers.js sentiment analysis pipeline.
 */
async function initModel() {
  try {
    console.log("Initializing sentiment model...");
    console.log("This may take a moment (downloading model if not cached)");
    
    sentimentPipeline = await pipeline(
      "text-classification",
      "Xenova/distilbert-base-uncased-finetuned-sst-2-english",
      { 
        quantized: true, // Используем квантованную модель для быстрой загрузки
        progress_callback: (progress) => {
          if (progress.status === 'progress') {
            console.log(`Model download progress: ${progress.progress}%`);
          }
        }
      }
    );
    
    console.log("Model pipeline created successfully");
  } catch (err) {
    console.error("Model loading error details:", err);
    throw new Error(`Failed to load sentiment model: ${err.message}`);
  }
}

/**
 * Логирует данные в Google Sheets
 */
async function logToGoogleSheets(data) {
  try {
    console.log("Logging data to Google Sheets:", data);
    
    // Создаем FormData для отправки
    const formData = new URLSearchParams();
    formData.append("timestamp", data.timestamp);
    formData.append("review", data.review);
    formData.append("sentiment", data.sentiment);
    formData.append("confidence", data.confidence);
    formData.append("meta", JSON.stringify(data.meta));
    
    // Отправляем данные через POST запрос
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString()
    });
    
    console.log("Data sent to Google Sheets (no-cors mode)");
    return { success: true };
    
  } catch (error) {
    console.warn("Failed to log to Google Sheets:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Собирает мета-данные о клиенте
 */
function collectMetaData() {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    url: window.location.href,
    reviewsCount: reviews.length,
    modelReady: !!sentimentPipeline,
    timestamp: new Date().toISOString()
  };
}

/**
 * Handles the analyze button click.
 */
async function onAnalyzeClick() {
  clearError();
  resultEl.style.display = "none";

  if (!reviews || reviews.length === 0) {
    showError("No reviews are loaded. Cannot run analysis.");
    return;
  }

  if (!sentimentPipeline) {
    showError("Sentiment model is not ready yet.");
    return;
  }

  const review = getRandomReview();
  reviewBox.textContent = review;

  analyzeBtn.disabled = true;
  setStatus("Analyzing sentiment…");

  try {
    const output = await sentimentPipeline(review);
    const normalized = normalizeOutput(output);
    
    // Обновляем UI
    updateResult(normalized);
    
    // Собираем данные для логирования
    const metaData = collectMetaData();
    const logData = {
      timestamp: new Date().toISOString(),
      review: review.substring(0, 1000),
      sentiment: normalized.label,
      confidence: (normalized.score * 100).toFixed(1),
      meta: metaData
    };
    
    // Логируем в Google Sheets (асинхронно)
    setTimeout(() => {
      logToGoogleSheets(logData).then(result => {
        if (result.success) {
          console.log("✓ Data successfully logged to Google Sheets");
          setStatus("Analysis complete. Data logged.");
        } else {
          console.warn("⚠ Data logging failed (but analysis worked)");
          setStatus("Analysis complete. Logging failed.");
        }
      });
    }, 0);
    
  } catch (err) {
    handleError(err, "Sentiment analysis failed.");
  } finally {
    analyzeBtn.disabled = false;
  }
}

/**
 * Selects a random review from the loaded list.
 */
function getRandomReview() {
  const index = Math.floor(Math.random() * reviews.length);
  return reviews[index];
}

/**
 * Normalizes the pipeline output into a single { label, score } object.
 */
function normalizeOutput(output) {
  if (!Array.isArray(output) || output.length === 0) {
    throw new Error("Invalid model output.");
  }

  const top = output[0];
  if (typeof top.label !== "string" || typeof top.score !== "number") {
    throw new Error("Unexpected sentiment output format.");
  }

  return {
    label: top.label.toUpperCase(),
    score: top.score,
  };
}

/**
 * Maps the sentiment to positive, negative, or neutral and updates the UI.
 */
function updateResult({ label, score }) {
  let sentimentClass = "neutral";
  let iconClass = "fa-question-circle";
  let displayLabel = "NEUTRAL";

  if (label === "POSITIVE" && score > 0.5) {
    sentimentClass = "positive";
    iconClass = "fa-thumbs-up";
    displayLabel = "POSITIVE";
  } else if (label === "NEGATIVE" && score > 0.5) {
    sentimentClass = "negative";
    iconClass = "fa-thumbs-down";
    displayLabel = "NEGATIVE";
  }

  const confidence = (score * 100).toFixed(1);

  resultEl.className = `result ${sentimentClass}`;
  resultEl.innerHTML = `
    <i class="fa ${iconClass}"></i>
    <span>${displayLabel} (${confidence}% confidence)</span>
  `;
  resultEl.style.display = "flex";
}

/**
 * Updates the status text.
 */
function setStatus(message) {
  console.log("Status:", message);
  statusEl.textContent = message;
}

/**
 * Displays a user-friendly error message.
 */
function showError(message) {
  errorEl.textContent = message;
  errorEl.style.display = "block";
}

/**
 * Clears any visible error message.
 */
function clearError() {
  errorEl.textContent = "";
  errorEl.style.display = "none";
}

/**
 * Logs an error and shows a user-friendly message.
 */
function handleError(err, userMessage) {
  console.error("Error details:", err);
  showError(userMessage);
  setStatus("");
}
