const POLLINATIONS_FOOTER = /Powered by Pollinations\.AI.*?\(https:\/\/pollinations\.ai\/redirect\/kofi\).*?\./i;

function formatMessage(text, role) {
  if (text.startsWith("### ")) {
    text = text.slice(4).toUpperCase();
  }
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  if (role === 'bot') {
    text = text.replace(/([^]+)\s*([^)]+)/g,
      '<a href="$2" style="color: #00e571;" target="_blank" rel="noopener noreferrer">$1</a>');
  }
  return text;
}

const chatEl = document.getElementById('chat');
const form = document.getElementById('messageForm');
const input = document.getElementById('messageInput');
const micButton = document.getElementById('micButton');
const STORAGE_KEY = 'wrpl_chat_history';
let conversationHistory = [];

let db;
const request = indexedDB.open('WRPLChatDB', 1);
request.onupgradeneeded = (event) => {
  db = event.target.result;
  db.createObjectStore('media', { keyPath: 'id', autoIncrement: true });
};
request.onsuccess = (event) => {
  db = event.target.result;
};
request.onerror = (event) => {
  console.error('Ошибка IndexedDB:', event.target.errorCode);
};

async function saveMediaToDB(blob) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['media'], 'readwrite');
    const store = transaction.objectStore('media');
    const request = store.add({ blob });
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

async function getMediaFromDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['media'], 'readonly');
    const store = transaction.objectStore('media');
    const request = store.get(id);
    request.onsuccess = (event) => resolve(event.target.result.blob);
    request.onerror = (event) => reject(event.target.error);
  });
}

const userAvatar = `<svg width="40" height="40" viewBox="0 0 40 40">
  <circle cx="20" cy="20" r="20" fill="#00e571"/>
  <text x="50%" y="50%" fill="#002c11" font-size="20" text-anchor="middle" dy=".3em">Я</text>
</svg>`;
const botAvatar = `<img src="ava.png" alt="Bot Avatar" width="40" height="40">`;

function saveChat() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversationHistory));
}

async function loadChat() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      conversationHistory = JSON.parse(saved);
      chatEl.innerHTML = "";
      for (const msg of conversationHistory) {
        if (msg.isImage || msg.isAudio) {
          const blob = await getMediaFromDB(msg.mediaId);
          if (blob) {
            const url = URL.createObjectURL(blob);
            addMessage(url, msg.role, msg.isImage, false, msg.isAudio);
          } else {
            addMessage('Медиа не найдено', msg.role, false, false);
          }
        } else {
          addMessage(msg.text, msg.role, false, false);
        }
      }
    } else {
      const welcomeText = `Привет! Я нейросеть WRPL🙂
Вот что я могу:
- Отвечать на вопросы.
- Генерировать фото (напиши "сгенерируй фото кота").
- Генерировать голос (напиши "гс сколько лет солнцу").
Меня создал tg: @worpli.`;
      addMessage(welcomeText, 'bot', false, true);
    }
  } catch (e) {
    console.error("Ошибка загрузки чата:", e);
    const welcomeText = `Привет! Я нейросеть WRPL🙂
Вот что я могу:
- Отвечать на вопросы.
- Генерировать фото (напиши "сгенерируй фото кота").
- Генерировать голос (напиши "гс сколько лет солнцу").
Меня создал tg: @worpli.`;
    addMessage(welcomeText, 'bot', false, true);
  }
}

const ttsRe = /^(?:гс|gs)\s+(.+)/i;

function formatTime(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

function addMessage(content, role, isImage = false, persist = true, isAudio = false) {
  const container = document.createElement('div');
  container.classList.add('message-container', role);

  const avatarDiv = document.createElement('div');
  avatarDiv.classList.add('avatar');
  avatarDiv.innerHTML = role === 'user' ? userAvatar : botAvatar;

  const contentDiv = document.createElement('div');
  contentDiv.classList.add('message-content');

  let span;
  if (isImage) {
    const img = document.createElement('img');
    img.src = content;
    img.style.maxWidth = "100%";
    contentDiv.appendChild(img);
  } else if (isAudio) {
    const player = document.createElement('div');
    player.classList.add('custom-audio-player');
    const audio = document.createElement('audio');
    audio.src = content;
    audio.preload = 'metadata';
    const playPauseBtn = document.createElement('button');
    playPauseBtn.classList.add('play-pause-btn');
    playPauseBtn.innerHTML = '▶';
    playPauseBtn.type = 'button';
    const progressContainer = document.createElement('div');
    progressContainer.classList.add('progress-container');
    const progressBar = document.createElement('div');
    progressBar.classList.add('progress-bar');
    progressContainer.appendChild(progressBar);
    const timeDisplay = document.createElement('div');
    timeDisplay.classList.add('time-display');
    timeDisplay.textContent = '0:00 / 0:00';

    playPauseBtn.addEventListener('click', () => {
      if (audio.paused) {
        audio.play();
        playPauseBtn.innerHTML = '⏸';
        playPauseBtn.classList.add('playing');
      } else {
        audio.pause();
        playPauseBtn.innerHTML = '▶';
        playPauseBtn.classList.remove('playing');
      }
    });

    audio.addEventListener('timeupdate', () => {
      const currentTime = audio.currentTime;
      const duration = audio.duration || 0;
      progressBar.style.width = `${(currentTime / duration) * 100}%`;
      timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    });

    audio.addEventListener('ended', () => {
      playPauseBtn.innerHTML = '▶';
      playPauseBtn.classList.remove('playing');
      progressBar.style.width = '0%';
      audio.currentTime = 0;
    });

    progressContainer.addEventListener('click', (e) => {
      const rect = progressContainer.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      const seekTime = (clickX / width) * audio.duration;
      audio.currentTime = seekTime;
    });

    audio.addEventListener('loadedmetadata', () => {
      timeDisplay.textContent = `0:00 / ${formatTime(audio.duration)}`;
    });

    player.appendChild(playPauseBtn);
    player.appendChild(progressContainer);
    player.appendChild(timeDisplay);
    player.appendChild(audio);
    contentDiv.appendChild(player);
  } else {
    span = document.createElement('span');
    span.innerHTML = formatMessage(content, role);
    if (role === 'bot') {
      span.classList.add('bot-text');
    }
    contentDiv.appendChild(span);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn fade-in';
    btn.textContent = '📋';
    btn.dataset.text = content;
    contentDiv.appendChild(btn);
  }

  container.appendChild(avatarDiv);
  container.appendChild(contentDiv);
  chatEl.appendChild(container);
  chatEl.scrollTop = chatEl.scrollHeight;

  if (role === 'bot' && !isImage && !isAudio) {
    setTimeout(() => {
      span.classList.add('visible');
    }, 100);
  }

  if (persist) {
    if (isImage || isAudio) {
      fetch(content)
        .then(res => res.blob())
        .then(blob => saveMediaToDB(blob))
        .then(mediaId => {
          conversationHistory.push({ role, mediaId, isImage, isAudio });
          saveChat();
        });
    } else {
      conversationHistory.push({ role, text: content, isImage, isAudio });
      saveChat();
    }
  }
  return container;
}

async function sendChatRequest(prompt) {
  try {
    const textHistory = conversationHistory.filter(msg => !msg.isImage && !msg.isAudio);
    const messages = textHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.text
    }));
    messages.push({ role: 'user', content: prompt });

    const response = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai', messages })
    });

    if (!response.ok) {
      throw new Error(`Ошибка HTTP: ${response.status}`);
    }

    const data = await response.json();
    let assistantMessage = data.choices[0].message.content;
    assistantMessage = assistantMessage.replace(POLLINATIONS_FOOTER, '').trim();
    return assistantMessage;
  } catch (error) {
    console.error('Ошибка чата:', error);
    return 'Ошибка ответа от сервера: ' + error.message;
  }
}

async function addWatermark(imageUrl, applyWatermark) {
  if (!applyWatermark) {
    return imageUrl;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageUrl;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      ctx.drawImage(img, 0, 0);

      const text = 'tg: @worpli';
      const fontSize = 60;
      const opacity = 0.7;
      ctx.font = `${fontSize}px Arial`;
      ctx.textBaseline = 'bottom';

      const textMetrics = ctx.measureText(text);
      const textWidth = textMetrics.width;
      const textHeight = fontSize;

      const x = img.width - textWidth - 10;
      const y = img.height - 10;

      ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
      for (let dx of [-1, 1]) {
        for (let dy of [-1, 1]) {
          ctx.fillText(text, x + dx, y + dy);
        }
      }

      ctx.fillStyle = `rgba(0, 255, 0, ${opacity})`;
      ctx.fillText(text, x, y);

      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        resolve(url);
      }, 'image/png');
    };

    img.onerror = () => reject(new Error('Не удалось загрузить изображение для водяного знака'));
  });
}

async function generateImage(prompt) {
  try {
    const applyWatermark = !prompt.toLowerCase().includes('wrpl');
    const cleanPrompt = prompt.replace(/\bwrpl\b/gi, '').trim();

    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?nologo=true`;
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`Ошибка HTTP: ${response.status}`);
    }

    const blob = await response.blob();
    const originalUrl = URL.createObjectURL(blob);

    const finalUrl = await addWatermark(originalUrl, applyWatermark);
    return finalUrl;
  } catch (error) {
    console.error('Ошибка генерации изображения:', error);
    throw error;
  }
}

async function generateAudio(text, voice = 'nova') {
  try {
    const url = `https://text.pollinations.ai/${encodeURIComponent(text)}?model=openai-audio&voice=${voice}`;
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok || !response.headers.get('Content-Type').includes('audio/')) {
      throw new Error(`Ошибка HTTP: ${response.status}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Ошибка генерации аудио:', error);
    throw error;
  }
}

form.onsubmit = async (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  input.value = '';

  if (/^сгенерируй\s+фото/i.test(message)) {
    addMessage(message, 'user');
    const prompt = message.replace(/^сгенерируй\s+фото\s+/i, '');
    const loadingEl = addMessage('Генерирую изображение...', 'bot', false, false);

    try {
      const imageUrl = await generateImage(prompt);
      chatEl.removeChild(loadingEl);
      addMessage(imageUrl, 'bot', true, true);
    } catch {
      chatEl.removeChild(loadingEl);
      addMessage('Ошибка генерации изображения.', 'bot');
    }

  } else if (ttsRe.test(message)) {
    addMessage(message, 'user');
    const prompt = message.replace(ttsRe, '$1');
    const loadingEl = addMessage('Генерирую аудио...', 'bot', false, false);

    try {
      const audioUrl = await generateAudio(prompt, 'nova');
      chatEl.removeChild(loadingEl);
      addMessage(audioUrl, 'bot', false, true, true);
    } catch (err) {
      chatEl.removeChild(loadingEl);
      addMessage('Ошибка генерации аудио.', 'bot');
    }

  } else {
    addMessage(message, 'user');
    const loadingEl = addMessage('Думаю🤗', 'bot', false, false);
    const result = await sendChatRequest(message);
    chatEl.removeChild(loadingEl);
    addMessage(result, 'bot');
  }
};

document.addEventListener("click", function (event) {
  if (event.target.classList.contains("copy-btn")) {
    const btn = event.target;
    const textToCopy = btn.dataset.text;
    navigator.clipboard.writeText(textToCopy).then(() => {
      btn.classList.remove("fade-in");
      btn.classList.add("fade-out");
      setTimeout(() => {
        btn.textContent = "✓";
        btn.classList.remove("fade-out");
        btn.classList.add("copied", "fade-in");
      }, 150);
      setTimeout(() => {
        btn.classList.remove("fade-in");
        btn.classList.add("fade-out");
        setTimeout(() => {
          btn.textContent = "📋";
          btn.classList.remove("fade-out", "copied");
          btn.classList.add("fade-in");
        }, 150);
      }, 1500);
    });
  }
});

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = 'ru-RU';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    input.value = event.results[0][0].transcript;
  };
  recognition.onerror = (event) => {
    console.error('Ошибка распознавания речи:', event.error);
  };
  recognition.onend = () => micButton.classList.remove('recording');
  micButton.addEventListener('click', () => {
    recognition.start();
    micButton.classList.add('recording');
  });
} else {
  micButton.disabled = true;
  micButton.title = "Ваш браузер не поддерживает распознавание речи";
}

window.onload = () => {
  loadChat();
};