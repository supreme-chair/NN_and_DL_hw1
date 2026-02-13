import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js";

// ===== ПОЛУЧАЕМ ЭЛЕМЕНТЫ - ИСПОЛЬЗУЕМ let ВМЕСТО const =====
let reviewBox = document.getElementById('reviewBox');
let analyzeBtn = document.getElementById('analyzeBtn');
let resultDiv = document.getElementById('result');
let statusDiv = document.getElementById('status');
let errorDiv = document.getElementById('error');
let footerDiv = document.getElementById('footer');

// СОЗДАЕМ элемент для действий
let actionDiv = document.getElementById('action-result');
if (!actionDiv) {
    actionDiv = document.createElement('div');
    actionDiv.id = 'action-result';
    actionDiv.style.marginTop = '20px';
    if (resultDiv && resultDiv.parentNode) {
        resultDiv.parentNode.insertBefore(actionDiv, resultDiv.nextSibling);
    } else {
        document.querySelector('.container').appendChild(actionDiv);
    }
}

// ===== ПЕРЕМЕННЫЕ =====
let reviews = [];
let model = null;
let isModelReady = false;
let isDataLoaded = false;

// URL для логирования
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbzGke3cRoZ_naSn_s-LibMNvzuKsKWYV90HAtsP5-E8xWwlfAYd9JMauFlsUhW_a6Dl/exec';

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
function updateStatus(text) {
    console.log('📌', text);
    if (statusDiv) statusDiv.textContent = text;
}

function showError(text) {
    console.error('❌', text);
    if (errorDiv) {
        errorDiv.textContent = text;
        errorDiv.style.display = 'block';
    }
}

function hideError() {
    if (errorDiv) errorDiv.style.display = 'none';
}

function showResult(text, type) {
    if (!resultDiv) return;
    resultDiv.className = `result ${type}`;
    resultDiv.innerHTML = text;
    resultDiv.style.display = 'block';
}

/**
 * ОПРЕДЕЛЕНИЕ БИЗНЕС-ДЕЙСТВИЯ
 */
function determineBusinessAction(confidence, label) {
    console.log('🧠 Принимаем решение:', { label, confidence });
    
    let normalizedScore = 0.5;
    
    if (label === "POSITIVE") {
        normalizedScore = confidence;
    } else if (label === "NEGATIVE") {
        normalizedScore = 1.0 - confidence;
    }
    
    console.log('📊 Нормализованная оценка:', normalizedScore.toFixed(2));
    
    if (normalizedScore <= 0.4) {
        return {
            actionCode: "OFFER_COUPON",
            uiMessage: "🚨 Нам искренне жаль! Пожалуйста, примите купон на 50% скидку.",
            uiColor: "#ef4444",
            icon: "fa-gift",
            buttonText: "Получить купон"
        };
    } else if (normalizedScore < 0.7) {
        return {
            actionCode: "REQUEST_FEEDBACK",
            uiMessage: "📝 Спасибо! Расскажите подробнее, как мы можем улучшить сервис?",
            uiColor: "#6b7280",
            icon: "fa-comment",
            buttonText: "Оставить отзыв"
        };
    } else {
        return {
            actionCode: "ASK_REFERRAL",
            uiMessage: "⭐ Рады, что вам понравилось! Порекомендуйте нас друзьям и получите бонусы.",
            uiColor: "#3b82f6",
            icon: "fa-share-alt",
            buttonText: "Пригласить друзей"
        };
    }
}

/**
 * ОТОБРАЖЕНИЕ ДЕЙСТВИЯ
 */
function showAction(decision) {
    if (!actionDiv) {
        console.error('actionDiv не найден');
        return;
    }
    
    console.log('🎯 Показываем действие:', decision.actionCode);
    
    actionDiv.innerHTML = `
        <div style="
            background: ${decision.uiColor}20;
            border: 2px solid ${decision.uiColor};
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
        ">
            <i class="fas ${decision.icon}" style="
                font-size: 36px;
                color: ${decision.uiColor};
                margin-bottom: 10px;
            "></i>
            <p style="
                font-size: 16px;
                color: #333;
                margin: 10px 0;
                font-weight: 500;
            ">${decision.uiMessage}</p>
            <button onclick="alert('✅ ${decision.actionCode}')" style="
                background: ${decision.uiColor};
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                margin-top: 10px;
            ">
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
            throw new Error('Файл не найден');
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
            throw new Error('Нет отзывов');
        }
        
        updateStatus(`Загружено ${reviews.length} отзывов`);
        
    } catch (error) {
        console.warn('Ошибка загрузки:', error);
        
        // Тестовые данные
        reviews = [
            "This product is amazing! I love it so much. Best purchase ever!",
            "Terrible quality, broke after 2 days. Very disappointed.",
            "It's okay, nothing special but works.",
            "Absolutely fantastic! Best purchase ever.",
            "Waste of money. Don't buy this."
        ];
        
        showError('Используются тестовые данные');
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
        
        // Тестовая модель
        model = async (text) => {
            const rand = Math.random();
            if (rand > 0.6) return [{ label: 'POSITIVE', score: 0.95 }];
            if (rand > 0.3) return [{ label: 'NEGATIVE', score: 0.9 }];
            return [{ label: 'NEUTRAL', score: 0.6 }];
        };
        
        isModelReady = true;
        showError('Используется тестовая модель');
        updateStatus('Тестовая модель готова ⚠️');
    }
}

// ===== ЛОГИРОВАНИЕ - ИСПРАВЛЕННАЯ ВЕРСИЯ =====
async function logToSheet(data) {
    try {
        console.log('📤 Отправляем данные:', data);
        
        // Создаем объект с данными
        const payload = {
            timestamp: data.timestamp,
            review: data.review.substring(0, 200),
            sentiment: data.sentiment,
            confidence: data.confidence,
            action_taken: data.action_taken,
            meta: JSON.stringify(data.meta)
        };
        
        console.log('📦 Payload:', payload);
        
        // Пробуем отправить через fetch с JSON
        try {
            const response = await fetch(SHEET_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });
            
            console.log('📤 Fetch отправлен');
            
        } catch (fetchError) {
            console.warn('Fetch error, пробуем GET:', fetchError);
            
            // Если POST не работает, пробуем GET с параметрами
            const params = new URLSearchParams(payload);
            const img = new Image();
            img.src = SHEET_URL + '?' + params.toString();
        }
        
        if (footerDiv) {
            footerDiv.innerHTML = '✅ Данные отправлены';
            footerDiv.style.color = '#4caf50';
        }
        
    } catch (error) {
        console.error('❌ Ошибка логирования:', error);
        if (footerDiv) {
            footerDiv.innerHTML = '⚠️ Ошибка сохранения';
            footerDiv.style.color = '#f44336';
        }
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
        
        let type = 'neutral';
        let icon = 'fa-question-circle';
        let text = 'NEUTRAL';
        
        if (sentiment.label === 'POSITIVE' && sentiment.score > 0.5) {
            type = 'positive';
            icon = 'fa-thumbs-up';
            text = 'POSITIVE';
        } else if (sentiment.label === 'NEGATIVE' && sentiment.score > 0.5) {
            type = 'negative';
            icon = 'fa-thumbs-down';
            text = 'NEGATIVE';
        }
        
        const confidence = (sentiment.score * 100).toFixed(1);
        
        // Показываем результат
        showResult(`
            <i class="fas ${icon}" style="font-size: 24px; margin-right: 10px;"></i>
            <strong>${text}</strong> (${confidence}% confidence)
        `, type);
        
        // Принимаем решение
        const decision = determineBusinessAction(sentiment.score, sentiment.label);
        console.log('✅ Решение:', decision.actionCode);
        
        // Показываем действие
        showAction(decision);
        
        updateStatus('Анализ завершён');
        
        // Логируем
        const meta = {
            userAgent: navigator.userAgent.substring(0, 50),
            language: navigator.language,
            screen: `${window.screen.width}x${window.screen.height}`,
            url: window.location.href
        };
        
        await logToSheet({
            timestamp: new Date().toISOString(),
            review: review.substring(0, 200),
            sentiment: text,
            confidence: confidence,
            action_taken: decision.actionCode,
            meta: meta
        });
        
    } catch (error) {
        console.error('Ошибка:', error);
        showError('Ошибка при анализе');
        updateStatus('Ошибка');
        
    } finally {
        analyzeBtn.disabled = false;
    }
}

// ===== ЗАПУСК =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Запуск приложения');
    updateStatus('Инициализация...');
    
    // Загружаем всё
    await loadReviews();
    await loadModel();
    
    // Вешаем обработчик
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', analyze);
    }
    
    updateStatus('Готово! Нажмите кнопку для анализа');
    if (footerDiv) footerDiv.innerHTML = '📊 Бизнес-логика активна';
});
