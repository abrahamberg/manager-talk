const progressEl = document.querySelector('#progress');
const formatEl = document.querySelector('#format');
const messagesEl = document.querySelector('#messages');
const formEl = document.querySelector('#chat-form');
const inputEl = document.querySelector('#message-input');
const submitButtonEl = document.querySelector('#submit-button');
const nextButtonEl = document.querySelector('#next-button');
const micButtonEl = document.querySelector('#mic-button');
const replayButtonEl = document.querySelector('#replay-button');
const stopSpeakingButtonEl = document.querySelector('#stop-speaking-button');
const autoSpeakToggleEl = document.querySelector('#auto-speak-toggle');
const speechStatusEl = document.querySelector('#speech-status');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const canSpeakText = 'speechSynthesis' in window;
const canRecognizeSpeech = Boolean(SpeechRecognition);

let mode = 'answering';
let currentQuestion = null;
let roundContext = null;
let recognition = null;
let isListening = false;
let lastCoachMessage = '';

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();

  const message = inputEl.value.trim();

  if (!message) {
    return;
  }

  if (mode === 'answering') {
    await submitAnswer(message);
    return;
  }

  await submitFollowUp(message);
});

nextButtonEl.addEventListener('click', async () => {
  await loadNextQuestion(false);
});

micButtonEl.addEventListener('click', () => {
  toggleSpeechRecognition();
});

replayButtonEl.addEventListener('click', () => {
  speakText(lastCoachMessage);
});

stopSpeakingButtonEl.addEventListener('click', () => {
  stopSpeaking();
});

setupSpeechTools();

await startSession();

async function startSession() {
  const session = await apiGet('/api/session');

  updateProgress(session.currentLevel, session.consecutiveGoodAnswers);
  await loadNextQuestion(false);
}

async function loadNextQuestion(forceNew) {
  clearRoundUi();
  setBusy(true);

  try {
    currentQuestion = await apiPost('/api/question/next', { forceNew });
    formatEl.textContent = currentQuestion.answerFormatSummary;
    updateProgress(currentQuestion.level, null);
    addMessage('coach', currentQuestion.questionText);
  } catch (error) {
    addMessage('coach', getErrorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function submitAnswer(answerText) {
  if (!currentQuestion) {
    addMessage('coach', 'No active question. Request the next question first.');
    return;
  }

  addMessage('user', answerText);
  inputEl.value = '';
  setBusy(true);

  try {
    const feedback = await apiPost('/api/answer', {
      level: currentQuestion.level,
      questionId: currentQuestion.questionId,
      questionText: currentQuestion.questionText,
      answerText
    });

    roundContext = {
      level: currentQuestion.level,
      questionText: currentQuestion.questionText,
      answerText,
      feedbackToUser: feedback.feedbackToUser
    };

    addMessage('coach', formatFeedback(feedback));
    updateProgress(feedback.currentLevel, feedback.consecutiveGoodAnswers);
    enterFollowUpMode();
  } catch (error) {
    addMessage('coach', getErrorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function submitFollowUp(message) {
  if (message.toLowerCase() === 'next') {
    await loadNextQuestion(false);
    return;
  }

  addMessage('user', message);
  inputEl.value = '';
  setBusy(true);

  try {
    const response = await apiPost('/api/follow-up', { roundContext, message });

    if (response.next) {
      await loadNextQuestion(false);
      return;
    }

    addMessage('coach', response.answer);
  } catch (error) {
    addMessage('coach', getErrorMessage(error));
  } finally {
    setBusy(false);
  }
}

function enterFollowUpMode() {
  mode = 'follow_up';
  inputEl.placeholder = 'Ask a follow-up, or type next';
  nextButtonEl.hidden = false;
}

function clearRoundUi() {
  mode = 'answering';
  currentQuestion = null;
  roundContext = null;
  messagesEl.innerHTML = '';
  inputEl.value = '';
  inputEl.placeholder = 'Type your answer';
  nextButtonEl.hidden = true;
}

function updateProgress(level, consecutiveGoodAnswers) {
  const streak = consecutiveGoodAnswers === null ? '' : ` | Good answers in a row: ${consecutiveGoodAnswers}/5`;

  progressEl.textContent = `Level ${level}${streak}`;
}

function formatFeedback(feedback) {
  const parts = [feedback.feedbackToUser];

  if (feedback.improvedAnswer) {
    parts.push(`Try this: ${feedback.improvedAnswer}`);
  }

  if (feedback.movedToNextLevel) {
    parts.push(`You moved to Level ${feedback.currentLevel}.`);
  }

  return parts.join('\n\n');
}

function addMessage(role, content) {
  const messageEl = document.createElement('div');
  messageEl.className = `message ${role}`;
  messageEl.textContent = content;
  messagesEl.append(messageEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  if (role === 'coach') {
    lastCoachMessage = content;
    speakTextIfEnabled(content);
  }
}

function setBusy(isBusy) {
  submitButtonEl.disabled = isBusy;
  nextButtonEl.disabled = isBusy;
  micButtonEl.disabled = isBusy || !canRecognizeSpeech;
}

function setupSpeechTools() {
  setupSpeechSynthesisControls();
  setupSpeechRecognition();
  updateSpeechStatus();
}

function setupSpeechSynthesisControls() {
  replayButtonEl.disabled = !canSpeakText;
  stopSpeakingButtonEl.disabled = !canSpeakText;
  autoSpeakToggleEl.disabled = !canSpeakText;
}

function setupSpeechRecognition() {
  micButtonEl.disabled = !canRecognizeSpeech;

  if (!canRecognizeSpeech) {
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.addEventListener('result', handleSpeechResult);
  recognition.addEventListener('end', stopListeningUi);
  recognition.addEventListener('error', handleSpeechError);
}

function toggleSpeechRecognition() {
  if (!recognition) {
    setSpeechStatus('Speech-to-text is not supported in this browser.');
    return;
  }

  if (isListening) {
    recognition.stop();
    return;
  }

  startListening();
}

function startListening() {
  stopSpeaking();
  isListening = true;
  micButtonEl.textContent = 'Listening...';
  micButtonEl.classList.add('is-listening');
  setSpeechStatus('Listening. Speak your answer now.');
  recognition.start();
}

function handleSpeechResult(event) {
  const transcript = Array.from(event.results)
    .map((result) => result[0]?.transcript ?? '')
    .join('')
    .trim();

  inputEl.value = transcript;
}

function handleSpeechError(event) {
  stopListeningUi();
  setSpeechStatus(`Speech-to-text stopped: ${event.error}.`);
}

function stopListeningUi() {
  isListening = false;
  micButtonEl.textContent = 'Speak';
  micButtonEl.classList.remove('is-listening');
  updateSpeechStatus();
}

function speakTextIfEnabled(text) {
  if (!autoSpeakToggleEl.checked) {
    return;
  }

  speakText(text);
}

function speakText(text) {
  if (!canSpeakText || !text) {
    return;
  }

  stopSpeaking();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.95;
  utterance.pitch = 1;

  window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  if (canSpeakText) {
    window.speechSynthesis.cancel();
  }
}

function updateSpeechStatus() {
  if (canSpeakText && canRecognizeSpeech) {
    setSpeechStatus('Voice input and coach audio are available.');
    return;
  }

  if (canSpeakText) {
    setSpeechStatus('Coach audio is available. Speech-to-text is not supported in this browser.');
    return;
  }

  if (canRecognizeSpeech) {
    setSpeechStatus('Voice input is available. Text-to-speech is not supported in this browser.');
    return;
  }

  setSpeechStatus('Speech tools are not supported in this browser. Try Chrome or Edge.');
}

function setSpeechStatus(message) {
  speechStatusEl.textContent = message;
}

async function apiGet(path) {
  const response = await fetch(path);

  return parseApiResponse(response);
}

async function apiPost(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  return parseApiResponse(response);
}

async function parseApiResponse(response) {
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? 'Request failed.');
  }

  return payload;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'Unexpected error.';
}
