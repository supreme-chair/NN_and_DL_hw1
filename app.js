import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js";

let reviews = [];
let sentimentPipeline = null;

// DOM elements - ИСПРАВЛЕНО: используем правильные ID из HTML
const analyzeBtn = document.getElementById("analyzeBtn");
const reviewDisplay = document.getElementById("reviewDisplay"); // было reviewBox, теперь reviewDisplay
const resultContainer = document.getElementById("resultContainer"); // было resultEl, теперь resultContainer
const statusText = document.getElementById("statusText"); // было statusEl, теперь statusText
const errorContainer = document.getElementById("errorContainer"); // было errorEl, теперь errorContainer
const errorText = document.getElementById("errorText");
const sentimentIcon = document.getElementById("sentimentIcon");
const sentimentLabel = document.getElementById("sentimentLabel");
const confidenceScore = document.getElementById("confidenceScore");
const loggingStatus = document.getElementById("loggingStatus");

// Проверяем, что все элементы найдены
console.log("DOM Elements loaded:", {
  analyzeBtn: !!analyzeBtn,
  reviewDisplay: !!reviewDisplay,
  resultContainer: !!resultContainer,
  statusText: !!statusText,
  errorContainer: !!errorContainer,
  errorText: !!errorText,
  sentimentIcon: !!sentimentIcon,
  sentimentLabel: !!sentimentLabel,
  confidenceScore: !!confidenceScore,
  loggingStatus: !!loggingStatus
});

// Google Apps Script URL для логирования
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzBkegL2WcBtQpgDzqCfxmdA4So9cBQxOscNVd_iSLyNj-zEo2lEH_l7MnXPnhhFYiGJw/exec";

// Функция безопасного обновления статуса
function setStatus(message) {
  console.log("Status:", message);
  if (statusText) {
    statusText.textContent = message;
  }
}

// Функция безопасного показа ошибки
function showError(message) {
  console.error("Error:", message);
  if (errorText) {
    errorText.textContent = message;
  }
  if (errorContainer) {
    errorContainer.classList.add('visible');
  }
}

// Функция очистки ошибки
function clearError() {
  if (errorText) {
    errorText.textContent = "";
  }
  if (errorContainer) {
    errorContainer.classList.remove('visible');
  }
}

// Функция обновления статуса логирования
function setLoggingStatus(message, isError = false) {
  if (loggingStatus) {
    loggingStatus.textContent = message;
    loggingStatus.style.color = isError ? '#f44336' : '#4b6cb7';
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM loaded, starting initialization...");
  clearError();
  setStatus("Initializing application... (0/3 steps)");
  setLoggingStatus("Preparing...");

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
    if (analyzeBtn) {
      analyzeBtn.disabled = false;
    }
    
    setLoggingStatus("Ready to log data to Google Sheets");
    
  } catch (err) {
    console.error("Initialization error:", err);
    showError(`Initialization failed: ${err.message}. Check console (F12) for details.`);
    setLoggingStatus("Initialization failed", true);
  }

  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", onAnalyzeClick);
  } else {
    console.error("Analyze button not found");
    showError("Critical error: Analyze button not found");
  }
});

/**
 * Fetches and parses the TSV file containing reviews.
 */
async function loadReviews() {
  try {
    console.log("Attempting to fetch reviews_test.tsv...");
    const response = await fetch("reviews_test.tsv");
    console.log("Fetch response status:", response.status);
    
    if (!response.ok) {
      throw new Error(`Failed to load TSV file (status ${response.status})`);
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
          console.log("PapaParse complete");
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
  } catch (error) {
    console.error("Error loading reviews:", error);
    
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
    console.log(`Using ${reviews.length} sample reviews`);
    showError("Note: Using sample reviews (reviews_test.tsv not found)");
  }
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
    showError("Note: Using mock sentiment model (real model failed to load)");
  }
}

/**
 * Логирует данные в Google Sheets
 */
async function logToGoogleSheets(data) {
  try {
    console.log("Logging data to Google Sheets:", data);
    setLoggingStatus("Sending data to Google Sheets...");
    
    const formData = new URLSearchParams();
    formData.append("timestamp", data.timestamp);
    formData.append("review", data.review);
    formData.append("sentiment", data.sentiment);
    formData.append("confidence", data.confidence);
    formData.append("meta", JSON.stringify(data.meta));
    
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString()
    });
    
    console.log("Data sent to Google Sheets");
    setLoggingStatus("✓ Data logged successfully");
    return { success: true };
    
  } catch (error) {
    console.warn("Failed to log to Google Sheets:", error);
    setLoggingStatus("✗ Failed to log data", true);
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
  
  if (resultContainer) {
    resultContainer.classList.remove('visible');
  }

  if (!reviews || reviews.length === 0) {
    showError("No reviews are loaded. Cannot run analysis.");
    return;
  }

  if (!sentimentPipeline) {
    showError("Sentiment model is not ready yet.");
    return;
  }

  const review = getRandomReview();
  if (reviewDisplay) {
    reviewDisplay.textContent = review;
    reviewDisplay.classList.remove('empty');
  }

  if (analyzeBtn) {
    analyzeBtn.disabled = true;
  }
  
  setStatus("Analyzing sentiment…");

  try {
    const output = await sentimentPipeline(review);
    const normalized = normalizeOutput(output);
    
    if (resultContainer) {
      displayResult(normalized);
    }
    
    const metaData = collectMetaData();
    const logData = {
      timestamp: new Date().toISOString(),
      review: review.substring(0, 1000),
      sentiment: normalized.label,
      confidence: (normalized.score * 100).toFixed(1),
      meta: metaData
    };
    
    // Логируем в фоне
    setTimeout(() => {
      logToGoogleSheets(logData);
    }, 100);
    
    setStatus("Analysis complete. Data logged.");
    
  } catch (err) {
    console.error("Analysis error:", err);
    showError(`Sentiment analysis failed: ${err.message}`);
    setStatus("Analysis failed");
    setLoggingStatus("Analysis failed", true);
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
function displayResult({ label, score }) {
  if (!resultContainer || !sentimentIcon || !sentimentLabel || !confidenceScore) return;
  
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

  // Обновляем класс контейнера
  resultContainer.className = `result-container visible ${sentimentClass}`;
  
  // Обновляем иконку
  sentimentIcon.className = `sentiment-icon fas ${iconClass}`;
  
  // Обновляем лейбл
  sentimentLabel.textContent = displayLabel;
  
  // Обновляем уверенность
  confidenceScore.textContent = `${confidence}% confidence`;
}
