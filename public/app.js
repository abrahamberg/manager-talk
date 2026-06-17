const progressEl = document.querySelector('#progress');
const formatEl = document.querySelector('#format');
const messagesEl = document.querySelector('#messages');
const formEl = document.querySelector('#chat-form');
const inputEl = document.querySelector('#message-input');
const submitButtonEl = document.querySelector('#submit-button');
const nextButtonEl = document.querySelector('#next-button');

let mode = 'answering';
let currentQuestion = null;
let roundContext = null;

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
  await loadNextQuestion(true);
});

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
    await loadNextQuestion(true);
    return;
  }

  addMessage('user', message);
  inputEl.value = '';
  setBusy(true);

  try {
    const response = await apiPost('/api/follow-up', { roundContext, message });

    if (response.next) {
      await loadNextQuestion(true);
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
}

function setBusy(isBusy) {
  submitButtonEl.disabled = isBusy;
  nextButtonEl.disabled = isBusy;
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
