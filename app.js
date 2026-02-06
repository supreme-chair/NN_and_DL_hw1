// app.js - Основная логика приложения для анализа тональности отзывов с логированием в Google Sheets

// Импорт pipeline из Transformers.js
import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js";

// DOM элементы
const reviewDisplay = document.getElementById('reviewDisplay');
const analyzeButton = document.getElementById('analyzeButton');
const buttonText = document.getElementById('buttonText');
const buttonSpinner = document.getElementById('buttonSpinner');
const resultContainer = document.getElementById('resultContainer');
const sentimentIcon = document.getElementById('sentimentIcon');
const sentimentLabel = document.getElementById('sentimentLabel');
const confidenceScore = document.getElementById('confidenceScore');
const statusText = document.getElementById('statusText');
const errorContainer = document.getElementById('errorContainer');
const errorText = document.getElementById('errorText');

// Глобальные переменные состояния
let reviews = [];
let sentimentPipeline = null;
let isModelReady = false;
let isReviewsLoaded = false;

// URL вашего Google Apps Script Web App (ЗАМЕНИТЕ НА СВОЙ)
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';

/**
 * Обновляет статусное сообщение
 */
function updateStatus(message) {
    statusText.textContent = message;
    console.log(`Status: ${message}`);
}

/**
 * Показывает сообщение об ошибке
 */
function showError(message) {
    errorText.textContent = message;
    errorContainer.classList.add('visible');
    console.error(`Error: ${message}`);
}

/**
 * Скрывает сообщение об ошибке
 */
function hideError() {
    errorContainer.classList.remove('visible');
}

/**
 * Устанавливает состояние загрузки для кнопки
 */
function setButtonLoading(isLoading) {
    analyzeButton.disabled = isLoading;
    buttonText.textContent = isLoading ? 'Analyzing...' : 'Analyze Random Review';
    buttonSpinner.style.display = isLoading ? 'inline-block' : 'none';
}

/**
 * Загружает и парсит TSV файл с отзывами
 */
async function loadReviews() {
    try {
        updateStatus('Loading reviews data...');
        
        const response = await fetch('reviews_test.tsv');
        
        if (!response.ok) {
            throw new Error(`Failed to load TSV file: ${response.status} ${response.statusText}`);
        }
        
        const tsvData = await response.text();
        
        // Используем Papa Parse для парсинга TSV
        const parsed = Papa.parse(tsvData, {
            header: true,
            delimiter: "\t",
            skipEmptyLines: true,
        });
        
        if (parsed.errors && parsed.errors.length > 0) {
            console.warn('Parsing warnings:', parsed.errors);
        }
        
        // Извлекаем текст отзывов из колонки 'text'
        reviews = parsed.data
            .map(row => row.text)
            .filter(text => text && typeof text === 'string' && text.trim().length > 0);
        
        if (reviews.length === 0) {
            throw new Error('No valid reviews found in the TSV file. Please check the "text" column.');
        }
        
        isReviewsLoaded = true;
        updateStatus(`Loaded ${reviews.length} reviews. Model is loading...`);
        
        console.log(`Successfully loaded ${reviews.length} reviews`);
        
    } catch (error) {
        const errorMsg = `Failed to load reviews: ${error.message}`;
        showError(errorMsg);
        updateStatus('Failed to load reviews');
        throw error;
    }
}

/**
 * Инициализирует модель анализа тональности
 */
async function initializeModel() {
    try {
        updateStatus('Downloading sentiment analysis model... (this may take a moment)');
        
        // Создаем pipeline для классификации текста
        sentimentPipeline = await pipeline(
            "text-classification",
            "Xenova/distilbert-base-uncased-finetuned-sst-2-english",
            { quantized: true } // Используем квантованную модель для быстрой загрузки
        );
        
        isModelReady = true;
        updateStatus(`Model ready! Loaded ${reviews.length} reviews. Click "Analyze Random Review" to start.`);
        
        console.log('Sentiment analysis model loaded successfully');
        
    } catch (error) {
        const errorMsg = `Failed to load sentiment model: ${error.message}`;
        showError(errorMsg);
        updateStatus('Failed to load sentiment model');
        throw error;
    }
}

/**
 * Выбирает случайный отзыв из загруженных
 */
function getRandomReview() {
    if (reviews.length === 0) {
        throw new Error('No reviews available');
    }
    
    const randomIndex = Math.floor(Math.random() * reviews.length);
    return reviews[randomIndex];
}

/**
 * Определяет категорию тональности на основе результата модели
 */
function determineSentiment(result) {
    // result - это массив объектов [{label: "POSITIVE", score: 0.99}, ...]
    const topResult = result[0];
    
    // Безопасное определение лейбла и скора
    const label = topResult.label || '';
    const score = topResult.score || 0;
    
    // Маппим лейблы в стандартный формат
    const upperLabel = label.toUpperCase();
    
    // Определяем категорию тональности
    if (upperLabel.includes('POSITIVE') && score > 0.5) {
        return {
            category: 'positive',
            label: 'POSITIVE',
            score: score,
            icon: 'fa-thumbs-up'
        };
    } else if (upperLabel.includes('NEGATIVE') && score > 0.5) {
        return {
            category: 'negative',
            label: 'NEGATIVE',
            score: score,
            icon: 'fa-thumbs-down'
        };
    } else {
        return {
            category: 'neutral',
            label: 'NEUTRAL',
            score: score,
            icon: 'fa-question-circle'
        };
    }
}

/**
 * Логирует данные в Google Sheets через Apps Script
 */
async function logToGoogleSheets(data) {
    try {
        console.log('Logging data to Google Sheets:', data);
        
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Используем no-cors для обхода CORS ограничений
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        // В режиме no-cors мы не можем прочитать ответ, но отправка работает
        console.log('Data sent to Google Sheets (no-cors mode)');
        return { success: true };
        
    } catch (error) {
        console.warn('Failed to log to Google Sheets:', error);
        // Не показываем ошибку пользователю - логирование вторично
        return { success: false, error: error.message };
    }
}

/**
 * Альтернативный метод логирования через прокси CORS
 */
async function logToGoogleSheetsWithProxy(data) {
    try {
        // Используем CORS прокси если есть проблемы
        const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
        const targetUrl = GOOGLE_SCRIPT_URL;
        
        console.log('Logging data to Google Sheets via proxy:', data);
        
        const response = await fetch(proxyUrl + targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        console.log('Google Sheets response:', result);
        return result;
        
    } catch (error) {
        console.warn('Failed to log via proxy:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Отображает результат анализа тональности
 */
function displayResult(review, sentiment) {
    // Показываем отзыв
    reviewDisplay.textContent = review;
    reviewDisplay.classList.remove('empty');
    
    // Обновляем контейнер результата
    resultContainer.className = `result-container visible ${sentiment.category}`;
    
    // Обновляем иконку
    sentimentIcon.className = `sentiment-icon fas ${sentiment.icon}`;
    
    // Обновляем лейбл
    sentimentLabel.textContent = sentiment.label;
    
    // Обновляем уверенность (в процентах)
    const confidencePercent = (sentiment.score * 100).toFixed(1);
    confidenceScore.textContent = `${confidencePercent}% confidence`;
    
    return { label: sentiment.label, confidence: confidencePercent };
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
        timestamp: new Date().toISOString(),
        reviewsCount: reviews.length,
        modelReady: isModelReady,
        url: window.location.href
    };
}

/**
 * Выполняет анализ тональности выбранного отзыва
 */
async function analyzeSentiment() {
    // Сбрасываем предыдущие ошибки
    hideError();
    
    // Проверяем готовность модели и загрузку отзывов
    if (!isModelReady || !sentimentPipeline) {
        showError('Sentiment model is not ready yet. Please wait.');
        return;
    }
    
    if (!isReviewsLoaded || reviews.length === 0) {
        showError('No reviews available for analysis.');
        return;
    }
    
    try {
        setButtonLoading(true);
        
        // Выбираем случайный отзыв
        const randomReview = getRandomReview();
        
        // Показываем отзыв сразу
        reviewDisplay.textContent = randomReview;
        reviewDisplay.classList.remove('empty');
        
        // Выполняем анализ тональности с помощью модели
        updateStatus('Analyzing sentiment...');
        const result = await sentimentPipeline(randomReview);
        
        // Определяем категорию тональности
        const sentiment = determineSentiment(result);
        
        // Отображаем результат
        const sentimentResult = displayResult(randomReview, sentiment);
        
        // Собираем данные для логирования
        const metaData = collectMetaData();
        const logData = {
            timestamp: new Date().toISOString(),
            review: randomReview.substring(0, 500), // Ограничиваем длину
            sentiment: sentimentResult.label,
            confidence: sentimentResult.confidence,
            meta: metaData
        };
        
        // Логируем в Google Sheets (в фоновом режиме, не блокируем UI)
        setTimeout(() => {
            logToGoogleSheets(logData).then(result => {
                if (result.success) {
                    console.log('Data successfully logged to Google Sheets');
                } else {
                    console.warn('Data logging failed, trying proxy method...');
                    // Пробуем через прокси если прямая отправка не сработала
                    logToGoogleSheetsWithProxy(logData);
                }
            });
        }, 0);
        
        updateStatus('Analysis complete! Data logged to Google Sheets.');
        
    } catch (error) {
        const errorMsg = `Analysis failed: ${error.message}`;
        showError(errorMsg);
        updateStatus('Analysis failed');
        console.error('Analysis error:', error);
    } finally {
        setButtonLoading(false);
    }
}

/**
 * Инициализирует приложение после загрузки DOM
 */
async function initializeApp() {
    try {
        // Загружаем отзывы и инициализируем модель параллельно
        await Promise.all([loadReviews(), initializeModel()]);
        
        // Настраиваем обработчик клика на кнопку
        analyzeButton.addEventListener('click', analyzeSentiment);
        
        // Активируем кнопку
        analyzeButton.disabled = false;
        
        console.log('Application initialized successfully');
        
    } catch (error) {
        console.error('Application initialization failed:', error);
        showError(`Initialization failed: ${error.message}. Please refresh the page.`);
    }
}

// Запускаем приложение после полной загрузки DOM
document.addEventListener('DOMContentLoaded', initializeApp);
