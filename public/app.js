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
const speechSilenceTimeoutMs = 3500;

let mode = 'answering';
let currentQuestion = null;
let pendingNextQuestion = null;
let roundContext = null;
let recognition = null;
let isListening = false;
let lastCoachMessage = '';
let currentAudio = null;
let currentAudioUrl = null;
let shouldKeepListening = false;
let silenceTimer = null;

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
  await showNextQuestion();
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
    pendingNextQuestion = feedback.nextQuestion;
    enterFollowUpMode();
  } catch (error) {
    addMessage('coach', getErrorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function submitFollowUp(message) {
  if (message.toLowerCase() === 'next') {
    await showNextQuestion();
    return;
  }

  addMessage('user', message);
  inputEl.value = '';
  setBusy(true);

  try {
    const response = await apiPost('/api/follow-up', { roundContext, message });

    if (response.next) {
      await showNextQuestion();
      return;
    }

    addMessage('coach', response.answer);
  } catch (error) {
    addMessage('coach', getErrorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function showNextQuestion() {
  if (pendingNextQuestion) {
    showQuestion(pendingNextQuestion);
    return;
  }

  await loadNextQuestion(false);
}

function showQuestion(question) {
  clearRoundUi();
  currentQuestion = toQuestionResponse(question);
  formatEl.textContent = currentQuestion.answerFormatSummary;
  updateProgress(currentQuestion.level, null);
  addMessage('coach', currentQuestion.questionText);
}

function toQuestionResponse(question) {
  return {
    level: question.level,
    questionId: question.questionId ?? question.id,
    questionText: question.questionText ?? question.text,
    answerFormatSummary: question.answerFormatSummary,
    expectedPattern: question.expectedPattern,
    reasonForSelection: question.reasonForSelection ?? 'Preselected after previous answer.',
    isIntentionalRepeat: question.isIntentionalRepeat ?? question.repeatIntentional ?? false
  };
}

function enterFollowUpMode() {
  mode = 'follow_up';
  inputEl.placeholder = 'Ask a follow-up, or type next';
  nextButtonEl.hidden = false;
}

function clearRoundUi() {
  mode = 'answering';
  currentQuestion = null;
  pendingNextQuestion = null;
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
  replayButtonEl.disabled = false;
  stopSpeakingButtonEl.disabled = false;
  autoSpeakToggleEl.disabled = false;
}

function setupSpeechRecognition() {
  micButtonEl.disabled = !canRecognizeSpeech;

  if (!canRecognizeSpeech) {
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.addEventListener('result', handleSpeechResult);
  recognition.addEventListener('end', handleSpeechEnd);
  recognition.addEventListener('error', handleSpeechError);
}

function toggleSpeechRecognition() {
  if (!recognition) {
    setSpeechStatus('Speech-to-text is not supported in this browser.');
    return;
  }

  if (isListening) {
    stopListening();
    return;
  }

  startListening();
}

function startListening() {
  stopSpeaking();
  isListening = true;
  shouldKeepListening = true;
  micButtonEl.textContent = 'Listening...';
  micButtonEl.classList.add('is-listening');
  setSpeechStatus('Listening. Short pauses are okay; I stop after a few seconds of silence.');
  restartSilenceTimer();
  recognition.start();
}

function handleSpeechResult(event) {
  restartSilenceTimer();

  const transcript = Array.from(event.results)
    .map((result) => result[0]?.transcript ?? '')
    .join('')
    .trim();

  inputEl.value = transcript;
}

function handleSpeechError(event) {
  shouldKeepListening = false;
  stopListeningUi();
  setSpeechStatus(`Speech-to-text stopped: ${event.error}.`);
}

function handleSpeechEnd() {
  if (!shouldKeepListening) {
    stopListeningUi();
    return;
  }

  try {
    recognition.start();
  } catch {
    stopListeningUi();
  }
}

function stopListening() {
  shouldKeepListening = false;
  clearSilenceTimer();
  recognition.stop();
  stopListeningUi();
}

function stopListeningUi() {
  isListening = false;
  shouldKeepListening = false;
  clearSilenceTimer();
  micButtonEl.textContent = 'Speak';
  micButtonEl.classList.remove('is-listening');
  updateSpeechStatus();
}

function restartSilenceTimer() {
  clearSilenceTimer();
  silenceTimer = window.setTimeout(() => {
    stopListening();
    setSpeechStatus('Stopped after a short silence. You can press Speak again to continue.');
  }, speechSilenceTimeoutMs);
}

function clearSilenceTimer() {
  if (silenceTimer) {
    window.clearTimeout(silenceTimer);
    silenceTimer = null;
  }
}

async function speakTextIfEnabled(text) {
  if (!autoSpeakToggleEl.checked) {
    return;
  }

  await speakText(text);
}

async function speakText(text) {
  if (!text) {
    return;
  }

  stopSpeaking();

  try {
    await playPremiumSpeech(text);
  } catch {
    speakWithBrowserFallback(text);
  }
}

async function playPremiumSpeech(text) {
  setSpeechStatus('Generating premium coach voice...');

  const response = await fetch('/api/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    throw new Error('Premium speech failed.');
  }

  const audioBlob = await response.blob();
  currentAudioUrl = URL.createObjectURL(audioBlob);
  currentAudio = new Audio(currentAudioUrl);
  currentAudio.addEventListener('ended', clearCurrentAudio);
  currentAudio.addEventListener('error', clearCurrentAudio);

  await currentAudio.play();
  setSpeechStatus('Playing premium coach voice.');
}

function speakWithBrowserFallback(text) {
  if (!canSpeakText) {
    setSpeechStatus('Premium voice failed and browser text-to-speech is unavailable.');
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.95;
  utterance.pitch = 1;
  utterance.addEventListener('end', updateSpeechStatus);

  window.speechSynthesis.speak(utterance);
  setSpeechStatus('Premium voice unavailable. Playing browser fallback voice.');
}

function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }

  clearCurrentAudio();

  if (canSpeakText) {
    window.speechSynthesis.cancel();
  }
}

function clearCurrentAudio() {
  currentAudio = null;

  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }
}

function updateSpeechStatus() {
  if (canSpeakText && canRecognizeSpeech) {
    setSpeechStatus('Premium coach voice is available when OPENAI_API_KEY is set. Voice input is available.');
    return;
  }

  if (canSpeakText) {
    setSpeechStatus('Premium coach voice is available when OPENAI_API_KEY is set. Speech-to-text is not supported in this browser.');
    return;
  }

  if (canRecognizeSpeech) {
    setSpeechStatus('Premium coach voice is available when OPENAI_API_KEY is set. Voice input is available.');
    return;
  }

  setSpeechStatus('Premium coach voice is available when OPENAI_API_KEY is set. Speech-to-text may need Chrome or Edge.');
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
