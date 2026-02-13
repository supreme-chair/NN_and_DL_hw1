import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js";

// ===== ПОЛУЧАЕМ ЭЛЕМЕНТЫ =====
const reviewBox = document.getElementById('reviewBox');
const analyzeBtn = document.getElementById('analyzeBtn');
const resultDiv = document.getElementById('result');
const statusDiv = document.getElementById('status');
const errorDiv = document.getElementById('error');
const footerDiv = document.getElementById('footer');
const actionDiv = document.getElementById('action-result'); // Новый элемент для действий

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

/**
 * ОПРЕДЕЛЕНИЕ БИЗНЕС-ДЕЙСТВИЯ НА ОСНОВЕ АНАЛИЗА
 * Это главная новая функция - "Мозг" системы
 */
function determineBusinessAction(confidence, label) {
    console.log('🧠 Принимаем решение на основе:', { label, confidence });
    
    // 1. Нормализуем оценку в шкалу от 0 (плохо) до 1 (хорошо)
    let normalizedScore = 0.5; // По умолчанию нейтрально
    
    if (label === "POSITIVE") {
        // Для позитивных: confidence сразу показывает насколько хорошо
        normalizedScore = confidence; // 0.9 -> 0.9 (отлично)
    } else if (label === "NEGATIVE") {
        // Для негативных: инвертируем confidence
        normalizedScore = 1.0 - confidence; // 0.9 негатива -> 0.1 (ужасно)
    }
    
    console.log('📊 Нормализованная оценка:', normalizedScore.toFixed(2));
    
    // 2. Применяем бизнес-правила из таблицы
    if (normalizedScore <= 0.4) {
        // 🔴 КРИТИЧЕСКИЙ РИСК: негативный отзыв с высокой уверенностью
        return {
            actionCode: "OFFER_COUPON",
            uiMessage: "🚨 Нам искренне жаль! Пожалуйста, примите купон на 50% скидку.",
            uiColor: "#ef4444", // Красный
            icon: "fa-gift",
            buttonText: "Получить купон"
        };
    } else if (normalizedScore < 0.7) {
        // 🟡 НЕОПРЕДЕЛЕННОСТЬ: нейтральный или неуверенный отзыв
        return {
            actionCode: "REQUEST_FEEDBACK",
            uiMessage: "📝 Спасибо! Расскажите подробнее, как мы можем улучшить сервис?",
            uiColor: "#6b7280", // Серый
            icon: "fa-comment",
            buttonText: "Оставить отзыв"
        };
    } else {
        // 🔵 ЛОЯЛЬНЫЙ КЛИЕНТ: позитивный отзыв с высокой уверенностью
        return {
            actionCode: "ASK_REFERRAL",
            uiMessage: "⭐ Рады, что вам понравилось! Порекомендуйте нас друзьям и получите бонусы.",
            uiColor: "#3b82f6", // Синий
            icon: "fa-share-alt",
            buttonText: "Пригласить друзей"
        };
    }
}

/**
 * ОТОБРАЖЕНИЕ БИЗНЕС-ДЕЙСТВИЯ В ИНТЕРФЕЙСЕ
 */
function showAction(decision) {
    if (!actionDiv) return;
    
    // Создаем HTML для действия
    actionDiv.innerHTML = `
        <div style="
            background: ${decision.uiColor}15;
            border: 2px solid ${decision.uiColor};
            border-radius: 10px;
            padding: 20px;
            margin-top: 20px;
            text-align: center;
        ">
            <i class="fas ${decision.icon}" style="
                font-size: 32px;
                color: ${decision.uiColor};
                margin-bottom: 10px;
            "></i>
            <p style="
                font-size: 18px;
                color: ${decision.uiColor};
                margin: 10px 0;
                font-weight: bold;
            ">${decision.uiMessage}</p>
            <button style="
                background: ${decision.uiColor};
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
                margin-top: 10px;
            " onclick="alert('${decision.actionCode}')">
                ${decision.buttonText}
            </button>
        </div>
    `;
    actionDiv.style.display = 'block';
}

// ===== ЗАГРУЗКА ДАННЫХ =====
async function loadReviews() {
    updateStatus('Загрузка отзывов...');
    
    try {
        const response = await fetch('reviews_test.tsv');
        
        if (!response.ok) {
            throw new Error('Файл не найден, используем тестовые данные');
        }
        
        const text = await response.text();
        
        const result = Papa.parse(text, {
            header: true,
            delimiter: '\t',
            skipEmptyLines: true
        });
        
        reviews = result.data
            .map(row => row.text || Object.values(row)[0])
            .filter(text => text && text.length > 10);
        
        if (reviews.length === 0) {
            throw new Error('Нет отзывов в файле');
        }
        
        updateStatus(`Загружено ${reviews.length} отзывов`);
        
    } catch (error) {
        console.warn('Ошибка загрузки файла:', error);
        
        reviews = [
            "This product is amazing! I love it so much. Best purchase ever!",
            "Terrible quality, broke after 2 days. Very disappointed.",
            "It's okay, nothing special but works.",
            "Absolutely fantastic! Best purchase ever.",
            "Waste of money. Don't buy this.",
            "Good value for the price, would recommend.",
            "The worst experience I've ever had."
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
        
        model = async (text) => {
            const rand = Math.random();
            if (rand > 0.6) return [{ label: 'POSITIVE', score: 0.95 }];
            if (rand > 0.3) return [{ label: 'NEGATIVE', score: 0.9 }];
            return [{ label: 'NEUTRAL', score: 0.6 }];
        };
        
        isModelReady = true;
        showError('Используется тестовая модель (без реального AI)');
        updateStatus('Тестовая модель готова ⚠️');
    }
}

// ===== ЛОГИРОВАНИЕ В GOOGLE SHEETS =====
async function logToSheet(data) {
    try {
        const formData = new URLSearchParams();
        formData.append('timestamp', data.timestamp);
        formData.append('review', data.review);
        formData.append('sentiment', data.sentiment);
        formData.append('confidence', data.confidence);
        formData.append('action_taken', data.action_taken); // НОВАЯ КОЛОНКА
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
    hideError();
    
    if (!isDataLoaded || reviews.length === 0) {
        showError('Нет отзывов для анализа');
        return;
    }
    
    if (!isModelReady || !model) {
        showError('Модель ещё не готова');
        return;
    }
    
    analyzeBtn.disabled = true;
    
    // Прячем предыдущее действие
    if (actionDiv) actionDiv.style.display = 'none';
    
    try {
        const randomIndex = Math.floor(Math.random() * reviews.length);
        const review = reviews[randomIndex];
        
        reviewBox.textContent = review;
        updateStatus('Анализ...');
        
        const result = await model(review);
        const sentiment = result[0];
        
        // Определяем тип тональности для отображения
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
        
        const confidence = (sentiment.score * 100).toFixed(1);
        
        // Показываем результат анализа
        showResult(`
            <i class="fas ${icon}" style="font-size: 24px; margin-right: 10px;"></i>
            <strong>${text}</strong> (${confidence}% уверенности)
        `, type);
        
        // ===== НОВАЯ ЧАСТЬ: ПРИНИМАЕМ БИЗНЕС-РЕШЕНИЕ =====
        const decision = determineBusinessAction(sentiment.score, sentiment.label);
        console.log('✅ Принято решение:', decision.actionCode);
        
        // Показываем действие в интерфейсе
        showAction(decision);
        
        updateStatus('Анализ завершён, решение принято');
        
        // Логируем с новой колонкой action_taken
        const meta = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            screen: `${window.screen.width}x${window.screen.height}`,
            url: window.location.href,
            normalizedScore: decision.normalizedScore
        };
        
        await logToSheet({
            timestamp: new Date().toISOString(),
            review: review.substring(0, 500),
            sentiment: text,
            confidence: confidence,
            action_taken: decision.actionCode, // НОВАЯ КОЛОНКА
            meta: meta
        });
        
    } catch (error) {
        console.error('Ошибка анализа:', error);
        showError('Ошибка при анализе: ' + error.message);
        updateStatus('Ошибка');
        
    } finally {
        analyzeBtn.disabled = false;
    }
}

// ===== ЗАПУСК =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Запуск приложения');
    updateStatus('Инициализация...');
    
    // Добавляем контейнер для действий, если его нет
    if (!document.getElementById('action-result')) {
        const main = document.querySelector('.container') || document.body;
        const newActionDiv = document.createElement('div');
        newActionDiv.id = 'action-result';
        newActionDiv.style.display = 'none';
        main.appendChild(newActionDiv);
        // Переопределяем переменную
        actionDiv = newActionDiv;
    }
    
    await Promise.all([
        loadReviews(),
        loadModel()
    ]);
    
    analyzeBtn.addEventListener('click', analyze);
    
    updateStatus('Готово! Нажмите кнопку для анализа');
    footerDiv.innerHTML = '📊 Бизнес-логика активна';
});
