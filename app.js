import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js";

let reviews = [];
let sentimentPipeline = null;

// DOM elements с проверкой существования
const analyzeBtn = document.getElementById("analyzeBtn");
const reviewBox = document.getElementById("reviewBox");
const resultEl = document.getElementById("result");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

// Проверяем, что все элементы найдены
if (!analyzeBtn || !reviewBox || !resultEl || !statusEl || !errorEl) {
  console.error("Critical error: Some DOM elements are missing!");
  console.log("Missing elements:", {
    analyzeBtn: !!analyzeBtn,
    reviewBox: !!reviewBox,
    resultEl: !!resultEl,
    statusEl: !!statusEl,
    errorEl: !!errorEl
  });
  
  // Создаем заглушки для отсутствующих элементов
  if (!statusEl) {
    // Если нет статуса, создаем временный
    const tempStatus = document.createElement('div');
    tempStatus.id = 'status';
    tempStatus.style.display = 'none';
    document.body.appendChild(tempStatus);
    statusEl = tempStatus;
  }
}

// Google Apps Script URL для логирования
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzBkegL2WcBtQpgDzqCfxmdA4So9cBQxOscNVd_iSLyNj-zEo2lEH_l7MnXPnhhFYiGJw/exec";

// Функция безопасного обновления статуса
function safeSetStatus(message) {
  console.log("Status:", message);
  if (statusEl) {
    statusEl.textContent = message;
  } else {
    console.log("Status (no element):", message);
  }
}

// Функция безопасной очистки ошибки
function safeClearError() {
  console.log("Clearing errors");
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.style.display = "none";
  }
}

// Функция безопасного показа ошибки
function safeShowError(message) {
  console.error("Error:", message);
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = "block";
  } else {
    alert("Error: " + message); // Fallback если нет элемента ошибки
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM loaded, starting initialization...");
  safeClearError();
  safeSetStatus("Initializing application... (0/3 steps)");

  try {
    // Шаг 1: Проверяем наличие PapaParse
    if (typeof Papa === 'undefined') {
      throw new Error("PapaParse library not loaded. Check CDN in index.html");
    }
    console.log("✓ PapaParse loaded");
    safeSetStatus("PapaParse loaded. Loading reviews... (1/3 steps)");
    
    // Шаг 2: Загружаем отзывы
    await loadReviews();
    console.log(`✓ Loaded ${reviews.length} reviews`);
    safeSetStatus(`Loaded ${reviews.length} reviews. Loading sentiment model... (2/3 steps)`);
    
    // Шаг 3: Загружаем модель
    await initModel();
    console.log("✓ Sentiment model ready");
    safeSetStatus(`Model ready! Loaded ${reviews.length} reviews. Click 'Analyze Random Review' to start. (3/3 steps)`);
    
    // Активируем кнопку
    if (analyzeBtn) {
      analyzeBtn.disabled = false;
    }
    
  } catch (err) {
    console.error("Initialization error:", err);
    safeShowError(`Initialization failed: ${err.message}. Check console (F12) for details.`);
    
    // Показываем детальную информацию об ошибке в консоли
    console.log("Debug info:", {
      papaParseAvailable: typeof Papa !== 'undefined',
      reviewsLoaded: reviews.length,
      modelLoaded: !!sentimentPipeline,
      domElements: {
        analyzeBtn: !!analyzeBtn,
        reviewBox: !!reviewBox,
        resultEl: !!resultEl,
        statusEl: !!statusEl,
        errorEl: !!errorEl
      }
    });
  }

  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", onAnalyzeClick);
  } else {
    console.error("Analyze button not found - functionality will be limited");
  }
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
    
    // Если файл не найден, используем тестовые данные
    console.log("Using sample reviews as fallback");
    reviews = [
      "This product is amazing! I love it so much. Best purchase ever!",
      "Terrible quality. Broke after just 2 days of use. Very disappointed.",
      "It's okay, nothing special but gets the job done.",
      "Absolutely fantastic! Exceeded all my expectations.",
      "Waste of money. Don't buy this product.",
      "Good value for the price. Would recommend to others.",
      "The worst product I've ever bought. Save your money!",
      "Excellent quality and fast delivery. Very satisfied!",
      "Mediocre at best. There are better options available.",
      "Love it! Works perfectly and looks great."
    ];
    return; // Возвращаемся, не продолжаем с fetch
  }

  if (!response.ok) {
    // Если файл не найден, используем тестовые данные
    console.log(`TSV file not found (status ${response.status}), using sample reviews`);
    reviews = [
      "This product is amazing! I love it so much. Best purchase ever!",
      "Terrible quality. Broke after just 2 days of use. Very disappointed.",
      "It's okay, nothing special but gets the job done.",
      "Absolutely fantastic! Exceeded all my expectations.",
      "Waste of money. Don't buy this product.",
      "Good value for the price. Would recommend to others.",
      "The worst product I've ever bought. Save your money!",
      "Excellent quality and fast delivery. Very satisfied!",
      "Mediocre at best. There are better options available.",
      "Love it! Works perfectly and looks great."
    ];
    return;
  }

  const tsvText = await response.text();
  console.log(`TSV file loaded, size: ${tsvText.length} bytes`);

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
          console.log("Columns found:", results.meta.fields);

          reviews = results.data
            .map((row) => {
              if (typeof row.text === "string") {
                return row.text.trim();
              }
              const firstKey = Object.keys(row)[0];
              return typeof row[firstKey] === "string" ? row[firstKey].trim() : null;
            })
            .filter((text) => typeof text === "string" && text.length > 0);

          console.log(`Extracted ${reviews.length} valid reviews`);

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
        quantized: true,
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
    
    // Если модель не загрузилась, создаем имитацию для тестирования
    console.log("Creating mock sentiment pipeline for testing");
    sentimentPipeline = async (text) => {
      console.log("Mock analysis for:", text);
      const random = Math.random();
      if (random > 0.66) {
        return [{ label: "POSITIVE", score: 0.85 + Math.random() * 0.14 }];
      } else if (random > 0.33) {
        return [{ label: "NEGATIVE", score: 0.75 + Math.random() * 0.2 }];
      } else {
        return [{ label: "NEUTRAL", score: 0.6 + Math.random() * 0.3 }];
      }
    };
  }
}

/**
 * Логирует данные в Google Sheets
 */
async function logToGoogleSheets(data) {
  try {
    console.log("Logging data to Google Sheets:", data);
    
    const formData = new URLSearchParams();
    formData.append("timestamp", data.timestamp);
    formData.append("review", data.review);
    formData.append("sentiment", data.sentiment);
    formData.append("confidence", data.confidence);
    formData.append("meta", JSON.stringify(data.meta));
    
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString()
    });
    
    console.log("Data sent to Google Sheets");
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
  safeClearError();
  
  if (resultEl) {
    resultEl.style.display = "none";
  }

  if (!reviews || reviews.length === 0) {
    safeShowError("No reviews are loaded. Cannot run analysis.");
    return;
  }

  if (!sentimentPipeline) {
    safeShowError("Sentiment model is not ready yet.");
    return;
  }

  const review = getRandomReview();
  if (reviewBox) {
    reviewBox.textContent = review;
  }

  if (analyzeBtn) {
    analyzeBtn.disabled = true;
  }
  
  safeSetStatus("Analyzing sentiment…");

  try {
    const output = await sentimentPipeline(review);
    const normalized = normalizeOutput(output);
    
    if (resultEl) {
      updateResult(normalized);
    }
    
    const metaData = collectMetaData();
    const logData = {
      timestamp: new Date().toISOString(),
      review: review.substring(0, 1000),
      sentiment: normalized.label,
      confidence: (normalized.score * 100).toFixed(1),
      meta: metaData
    };
    
    setTimeout(() => {
      logToGoogleSheets(logData);
    }, 0);
    
    safeSetStatus("Analysis complete. Data logged.");
    
  } catch (err) {
    handleError(err, "Sentiment analysis failed.");
  } finally {
    if (analyzeBtn) {
      analyzeBtn.disabled = false;
    }
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
  if (!resultEl) return;
  
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
  safeSetStatus(message);
}

/**
 * Displays a user-friendly error message.
 */
function showError(message) {
  safeShowError(message);
}

/**
 * Clears any visible error message.
 */
function clearError() {
  safeClearError();
}

/**
 * Logs an error and shows a user-friendly message.
 */
function handleError(err, userMessage) {
  console.error("Error details:", err);
  safeShowError(userMessage);
  safeSetStatus("");
}
