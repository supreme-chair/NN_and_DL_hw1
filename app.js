// Подключаем Transformers.js
import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js";

// ===== ПОЛУЧАЕМ ЭЛЕМЕНТЫ =====
const reviewBox = document.getElementById('reviewBox');
const analyzeBtn = document.getElementById('analyzeBtn');
const resultDiv = document.getElementById('result');
const statusDiv = document.getElementById('status');
const errorDiv = document.getElementById('error');
const footerDiv = document.getElementById('footer');

// ===== ПЕРЕМЕННЫЕ =====
let reviews = [];           // массив отзывов
let model = null;           // модель анализа
let isModelReady = false;   // флаг готовности модели
let isDataLoaded = false;   // флаг загрузки данных

// URL для логирования
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbzBkegL2WcBtQpgDzqCfxmdA4So9cBQxOscNVd_iSLyNj-zEo2lEH_l7MnXPnhhFYiGJw/exec';

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
function updateStatus(text) {
    console.log('📌', text);
    statusDiv.textContent = text;
}

function showError(text) {
    console.error('❌', text);
    errorDiv.textContent = text;
    errorDiv.style.display = 'block';
}

function hideError() {
    errorDiv.style.display = 'none';
}

function showResult(text, type) {
    resultDiv.className = `result ${type}`;
    resultDiv.innerHTML = text;
    resultDiv.style.display = 'block';
}

// ===== ЗАГРУЗКА ДАННЫХ =====
async function loadReviews() {
    updateStatus('Загрузка отзывов...');
    
    try {
        // Пробуем загрузить файл
        const response = await fetch('reviews_test.tsv');
        
        if (!response.ok) {
            throw new Error('Файл не найден, используем тестовые данные');
        }
        
        const text = await response.text();
        
        // Парсим TSV
        const result = Papa.parse(text, {
            header: true,
            delimiter: '\t',
            skipEmptyLines: true
        });
        
        // Извлекаем отзывы
        reviews = result.data
            .map(row => row.text || Object.values(row)[0])
            .filter(text => text && text.length > 10);
        
        if (reviews.length === 0) {
            throw new Error('Нет отзывов в файле');
        }
        
        updateStatus(`Загружено ${reviews.length} отзывов`);
        
    } catch (error) {
        console.warn('Ошибка загрузки файла:', error);
        
        // Тестовые данные
        reviews = [
            "This product is amazing! I love it so much.",
            "Terrible quality, broke after 2 days.",
            "It's okay, nothing special but works.",
            "Absolutely fantastic! Best purchase ever.",
            "Waste of money. Don't buy this."
        ];
        
        showError('Используются тестовые данные (файл не найден)');
        updateStatus(`Загружено ${reviews.length} тестовых отзывов`);
    }
    
    isDataLoaded = true;
}

// ===== ЗАГРУЗКА МОДЕЛИ =====
async function loadModel() {
    updateStatus('Загрузка модели... (может занять минуту)');
    
    try {
        model = await pipeline(
            'text-classification',
            'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
            { quantized: true }
        );
        
        isModelReady = true;
        updateStatus('Модель готова! ✅');
        
    } catch (error) {
        console.error('Ошибка модели:', error);
        
        // Создаём заглушку для тестирования
        model = async (text) => {
            const rand = Math.random();
            if (rand > 0.6) return [{ label: 'POSITIVE', score: 0.9 }];
            if (rand > 0.3) return [{ label: 'NEGATIVE', score: 0.8 }];
            return [{ label: 'NEUTRAL', score: 0.7 }];
        };
        
        isModelReady = true;
        showError('Используется тестовая модель (без реального AI)');
        updateStatus('Тестовая модель готова ⚠️');
    }
}

// ===== ЛОГИРОВАНИЕ =====
async function logToSheet(data) {
    try {
        const formData = new URLSearchParams();
        formData.append('timestamp', data.timestamp);
        formData.append('review', data.review);
        formData.append('sentiment', data.sentiment);
        formData.append('confidence', data.confidence);
        formData.append('meta', JSON.stringify(data.meta));
        
        await fetch(SHEET_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        });
        
        footerDiv.innerHTML = '✅ Данные сохранены';
        
    } catch (error) {
        console.warn('Ошибка логирования:', error);
        footerDiv.innerHTML = '⚠️ Ошибка сохранения';
    }
}

// ===== АНАЛИЗ =====
async function analyze() {
    // Проверки
    hideError();
    
    if (!isDataLoaded || reviews.length === 0) {
        showError('Нет отзывов для анализа');
        return;
    }
    
    if (!isModelReady || !model) {
        showError('Модель ещё не готова');
        return;
    }
    
    // Блокируем кнопку
    analyzeBtn.disabled = true;
    
    try {
        // Выбираем случайный отзыв
        const randomIndex = Math.floor(Math.random() * reviews.length);
        const review = reviews[randomIndex];
        
        // Показываем отзыв
        reviewBox.textContent = review;
        updateStatus('Анализ...');
        
        // Анализируем
        const result = await model(review);
        const sentiment = result[0];
        
        // Определяем тип
        let type = 'neutral';
        let icon = 'fa-question-circle';
        let text = 'НЕЙТРАЛЬНО';
        
        if (sentiment.label === 'POSITIVE' && sentiment.score > 0.5) {
            type = 'positive';
            icon = 'fa-thumbs-up';
            text = 'ПОЗИТИВНО';
        } else if (sentiment.label === 'NEGATIVE' && sentiment.score > 0.5) {
            type = 'negative';
            icon = 'fa-thumbs-down';
            text = 'НЕГАТИВНО';
        }
        
        // Показываем результат
        const confidence = (sentiment.score * 100).toFixed(1);
        showResult(`
            <i class="fas ${icon}" style="font-size: 24px; margin-right: 10px;"></i>
            <strong>${text}</strong> (${confidence}% уверенности)
        `, type);
        
        updateStatus('Анализ завершён');
        
        // Логируем
        const meta = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            screen: `${window.screen.width}x${window.screen.height}`,
            url: window.location.href
        };
        
        await logToSheet({
            timestamp: new Date().toISOString(),
            review: review.substring(0, 500),
            sentiment: text,
            confidence: confidence,
            meta: meta
        });
        
    } catch (error) {
        console.error('Ошибка анализа:', error);
        showError('Ошибка при анализе: ' + error.message);
        updateStatus('Ошибка');
        
    } finally {
        // Разблокируем кнопку
        analyzeBtn.disabled = false;
    }
}

// ===== ЗАПУСК =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Запуск приложения');
    updateStatus('Инициализация...');
    
    // Загружаем всё параллельно
    await Promise.all([
        loadReviews(),
        loadModel()
    ]);
    
    // Вешаем обработчик на кнопку
    analyzeBtn.addEventListener('click', analyze);
    
    // Всё готово
    updateStatus('Готово! Нажмите кнопку для анализа');
    footerDiv.innerHTML = '📊 Логирование готово';
});
