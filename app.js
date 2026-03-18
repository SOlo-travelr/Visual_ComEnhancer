const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const downloadBtn = document.getElementById("downloadBtn");

const previewVideo = document.getElementById("previewVideo");
const statusText = document.getElementById("statusText");
const supportText = document.getElementById("supportText");
const sessionTimer = document.getElementById("sessionTimer");
const transcriptText = document.getElementById("transcriptText");

const wpmMetric = document.getElementById("wpmMetric");
const fillerMetric = document.getElementById("fillerMetric");
const pauseMetric = document.getElementById("pauseMetric");
const energyMetric = document.getElementById("energyMetric");

const feedbackList = document.getElementById("feedbackList");
const overallScore = document.getElementById("overallScore");

const debateTopicInput = document.getElementById("debateTopicInput");
const userStanceSelect = document.getElementById("userStanceSelect");
const enableDebateBtn = document.getElementById("enableDebateBtn");
const disableDebateBtn = document.getElementById("disableDebateBtn");
const debateStatusText = document.getElementById("debateStatusText");
const lastUserPointText = document.getElementById("lastUserPointText");
const debateFeed = document.getElementById("debateFeed");

const fillerWords = [
  "um",
  "uh",
  "like",
  "you know",
  "so",
  "actually",
  "basically",
  "literally",
  "kind of",
  "sort of"
];

let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];

let recognition = null;
let recognitionActive = false;

let audioContext = null;
let analyser = null;
let audioData = null;
let micInterval = null;

let sessionInterval = null;
let metricsInterval = null;
let sessionStart = null;
let lastSpeechTimestamp = null;

let transcript = "";
let totalWordCount = 0;
let fillerCount = 0;
let longPauseCount = 0;
let averageEnergy = 0;
let energySamples = 0;

let debateEnabled = false;
let debateTopic = "";
let userStance = "for";
let pendingDebatePoint = "";
let debateTurnTimer = null;
let isAiSpeaking = false;

const supportsSpeechRecognition = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
const supportsMediaRecorder = "MediaRecorder" in window;
const supportsSpeechSynthesis = "speechSynthesis" in window;

if (!supportsMediaRecorder) {
  supportText.textContent = "MediaRecorder is not supported in this browser. Use latest Chrome, Edge, or Firefox.";
}

if (!supportsSpeechRecognition) {
  supportText.textContent += (supportText.textContent ? " " : "") +
    "Live speech transcript is not available in this browser, but video/audio recording and vocal energy tracking will still work.";
}

if (!supportsSpeechSynthesis) {
  supportText.textContent += (supportText.textContent ? " " : "") +
    "Speech synthesis is not available in this browser, so AI debate replies will be text only.";
}

startBtn.addEventListener("click", startSession);
stopBtn.addEventListener("click", stopSession);
downloadBtn.addEventListener("click", downloadRecording);
enableDebateBtn.addEventListener("click", enableDebateMode);
disableDebateBtn.addEventListener("click", () => disableDebateMode(true));

async function startSession() {
  resetSessionData();

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    previewVideo.srcObject = mediaStream;

    if (supportsMediaRecorder) {
      mediaRecorder = new MediaRecorder(mediaStream);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };
      mediaRecorder.start(1000);
    }

    setupMicAnalyser(mediaStream);
    setupSpeechRecognition();

    sessionStart = Date.now();
    sessionInterval = setInterval(updateTimer, 500);
    metricsInterval = setInterval(updateLiveMetrics, 1200);

    statusText.textContent = "Status: live coaching in progress";
    startBtn.disabled = true;
    stopBtn.disabled = false;
    downloadBtn.disabled = true;

    feedbackList.innerHTML = "<li>Live analysis running. Speak naturally and present as if on stage.</li>";
    overallScore.textContent = "--";
  } catch (error) {
    statusText.textContent = "Status: failed to start session";
    supportText.textContent = "Camera/microphone access was denied or unavailable. Allow permissions and retry.";
    console.error("Failed to start session", error);
    await hardStop(false);
  }
}

function setupMicAnalyser(stream) {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  audioData = new Uint8Array(analyser.frequencyBinCount);
  source.connect(analyser);

  micInterval = setInterval(() => {
    if (!analyser) {
      return;
    }

    analyser.getByteFrequencyData(audioData);
    let sum = 0;
    for (let i = 0; i < audioData.length; i += 1) {
      sum += audioData[i];
    }

    const currentEnergy = Math.round((sum / audioData.length / 255) * 100);
    averageEnergy += currentEnergy;
    energySamples += 1;
    energyMetric.textContent = `${currentEnergy}%`;
  }, 400);
}

function setupSpeechRecognition() {
  if (!supportsSpeechRecognition) {
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onresult = (event) => {
    let interim = "";
    const finalSnippets = [];

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const content = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        const finalText = content.trim();
        transcript += `${finalText} `;
        if (finalText) {
          finalSnippets.push(finalText);
        }
      } else {
        interim += content;
      }
    }

    const now = Date.now();
    if (lastSpeechTimestamp && now - lastSpeechTimestamp > 2000) {
      longPauseCount += 1;
    }
    lastSpeechTimestamp = now;

    updateTranscript(transcript + interim);
    analyzeTranscript();

    if (finalSnippets.length > 0 && debateEnabled && !isAiSpeaking) {
      scheduleDebateResponse(finalSnippets.join(" "));
    }
  };

  recognition.onerror = () => {
    // Recognition can fail intermittently depending on browser permissions.
  };

  recognition.onend = () => {
    if (recognitionActive) {
      recognition.start();
    }
  };

  recognitionActive = true;
  recognition.start();
}

function updateTranscript(text) {
  transcriptText.textContent = text.trim() || "Listening...";
}

function analyzeTranscript() {
  const cleaned = transcript.toLowerCase().replace(/[^a-z0-9\s']/g, " ");
  const words = cleaned.split(/\s+/).filter(Boolean);
  totalWordCount = words.length;

  fillerCount = 0;
  for (let i = 0; i < fillerWords.length; i += 1) {
    const phrase = fillerWords[i];
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "g");
    const matches = cleaned.match(regex);
    if (matches) {
      fillerCount += matches.length;
    }
  }
}

function updateTimer() {
  if (!sessionStart) {
    return;
  }

  const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");
  sessionTimer.textContent = `${minutes}:${seconds}`;
}

function updateLiveMetrics() {
  if (!sessionStart) {
    return;
  }

  const elapsedMinutes = Math.max((Date.now() - sessionStart) / 60000, 1 / 60);
  const wpm = Math.round(totalWordCount / elapsedMinutes);
  wpmMetric.textContent = Number.isFinite(wpm) ? String(wpm) : "0";
  fillerMetric.textContent = String(fillerCount);
  pauseMetric.textContent = String(longPauseCount);
}

function enableDebateMode() {
  if (!sessionStart) {
    debateStatusText.textContent = "Debate status: start a live session first";
    return;
  }

  if (debateEnabled) {
    return;
  }

  debateTopic = debateTopicInput.value.trim() || "general public policy";
  userStance = userStanceSelect.value;
  debateEnabled = true;

  enableDebateBtn.disabled = true;
  disableDebateBtn.disabled = false;
  debateStatusText.textContent = `Debate status: live on topic \"${debateTopic}\"`;
  appendDebateLine("AI", `Debate mode enabled. You are ${userStance.toUpperCase()} the topic. Make your opening argument.`);
  speakResponse(`Debate mode is active. You are ${userStance}. Please give your first argument.`);
}

function disableDebateMode(announce = true) {
  if (typeof announce !== "boolean") {
    announce = true;
  }

  debateEnabled = false;
  pendingDebatePoint = "";
  if (debateTurnTimer) {
    clearTimeout(debateTurnTimer);
    debateTurnTimer = null;
  }

  if (supportsSpeechSynthesis) {
    speechSynthesis.cancel();
  }

  enableDebateBtn.disabled = false;
  disableDebateBtn.disabled = true;
  debateStatusText.textContent = "Debate status: off";
  if (announce) {
    appendDebateLine("AI", "Debate mode disabled.");
  }
}

function scheduleDebateResponse(finalText) {
  pendingDebatePoint = `${pendingDebatePoint} ${finalText}`.trim();
  if (debateTurnTimer) {
    clearTimeout(debateTurnTimer);
  }

  debateTurnTimer = setTimeout(() => {
    const point = pendingDebatePoint.trim();
    pendingDebatePoint = "";
    if (!point || !debateEnabled) {
      return;
    }
    handleDebateTurn(point);
  }, 1700);
}

function handleDebateTurn(userPoint) {
  lastUserPointText.textContent = `Your last argument: ${userPoint}`;
  appendDebateLine("You", userPoint);

  const aiReply = buildDebateReply(userPoint);
  appendDebateLine("AI", aiReply);
  speakResponse(aiReply);
}

function buildDebateReply(userPoint) {
  const opposite = userStance === "for" ? "against" : "for";
  const openerPool = [
    "I challenge that claim because",
    "Strong point, but the counterargument is",
    "From the opposite side, I would argue",
    "Cross-argument:"
  ];

  const probePool = [
    "What measurable evidence supports your claim?",
    "How would your argument handle unintended consequences?",
    "Why should this approach outperform alternatives in the real world?",
    "What trade-off are you willing to accept for this position?"
  ];

  const topicKeywords = extractKeywords(userPoint);
  const opener = openerPool[Math.floor(Math.random() * openerPool.length)];
  const probe = probePool[Math.floor(Math.random() * probePool.length)];
  const keywordPhrase = topicKeywords.length > 0 ? ` especially around ${topicKeywords.join(" and ")}` : "";

  return `${opener} if we are ${opposite} \"${debateTopic}\", your point may underplay practical risks${keywordPhrase}. ${probe}`;
}

function extractKeywords(text) {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "to", "for", "of", "and", "or", "that", "this", "it", "in", "on",
    "as", "with", "be", "by", "at", "from", "we", "you", "they", "i", "our", "their", "should", "can", "will"
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 4 && !stopWords.has(word))
    .slice(0, 3);
}

function appendDebateLine(speaker, text) {
  const line = document.createElement("p");
  line.className = "debate-line";
  line.innerHTML = `<strong>${speaker}</strong>: ${text}`;
  debateFeed.appendChild(line);
  debateFeed.scrollTop = debateFeed.scrollHeight;
}

function speakResponse(text) {
  if (!supportsSpeechSynthesis || !text) {
    return;
  }

  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;

  utterance.onstart = () => {
    isAiSpeaking = true;
  };

  utterance.onend = () => {
    isAiSpeaking = false;
  };

  utterance.onerror = () => {
    isAiSpeaking = false;
  };

  speechSynthesis.speak(utterance);
}

async function stopSession() {
  await hardStop(true);
  generateFeedback();

  statusText.textContent = "Status: session complete";
  startBtn.disabled = false;
  stopBtn.disabled = true;
  downloadBtn.disabled = recordedChunks.length === 0;
}

async function hardStop(keepRecording) {
  if (sessionInterval) {
    clearInterval(sessionInterval);
    sessionInterval = null;
  }
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
  if (micInterval) {
    clearInterval(micInterval);
    micInterval = null;
  }

  disableDebateMode(false);

  recognitionActive = false;
  if (recognition) {
    try {
      recognition.stop();
    } catch (error) {
      console.warn("Recognition stop warning", error);
    }
    recognition = null;
  }

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  if (!keepRecording) {
    recordedChunks = [];
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  if (previewVideo.srcObject) {
    previewVideo.srcObject = null;
  }

  if (audioContext) {
    await audioContext.close();
    audioContext = null;
  }
}

function generateFeedback() {
  const tips = [];
  const elapsedMinutes = sessionStart ? Math.max((Date.now() - sessionStart) / 60000, 1 / 60) : 1;
  const wpm = Math.round(totalWordCount / elapsedMinutes);
  const avgEnergy = energySamples ? Math.round(averageEnergy / energySamples) : 0;

  let score = 100;

  if (wpm < 110) {
    tips.push({ level: "warn", text: `Your pace was calm (${wpm} WPM). Try increasing pace a little to sound more energetic.` });
    score -= 10;
  } else if (wpm > 170) {
    tips.push({ level: "warn", text: `Your pace was fast (${wpm} WPM). Slow down to improve clarity.` });
    score -= 12;
  } else {
    tips.push({ level: "good", text: `Strong pacing at about ${wpm} WPM.` });
  }

  if (fillerCount > 12) {
    tips.push({ level: "bad", text: `High filler use (${fillerCount}). Practice replacing fillers with short silent pauses.` });
    score -= 22;
  } else if (fillerCount > 6) {
    tips.push({ level: "warn", text: `Moderate filler use (${fillerCount}). Keep tightening transitions.` });
    score -= 12;
  } else {
    tips.push({ level: "good", text: `Great control of filler words (${fillerCount}).` });
  }

  if (longPauseCount > 8) {
    tips.push({ level: "warn", text: `Many long pauses (${longPauseCount}). Use slide cues or section prompts to stay fluent.` });
    score -= 10;
  } else {
    tips.push({ level: "good", text: `Pause rhythm looked stable (${longPauseCount} long pauses).` });
  }

  if (avgEnergy < 16) {
    tips.push({ level: "warn", text: `Vocal energy was low (${avgEnergy}%). Increase projection and vary tone.` });
    score -= 16;
  } else if (avgEnergy > 75) {
    tips.push({ level: "warn", text: `Vocal energy was very high (${avgEnergy}%). Relax your volume to avoid sounding tense.` });
    score -= 8;
  } else {
    tips.push({ level: "good", text: `Good vocal energy (${avgEnergy}%).` });
  }

  if (totalWordCount < 35) {
    tips.push({ level: "warn", text: "Short speaking sample detected. For better feedback, practice at least 2 minutes next run." });
    score -= 6;
  }

  score = Math.max(35, Math.min(100, score));

  feedbackList.innerHTML = "";
  tips.forEach((tip) => {
    const li = document.createElement("li");
    li.className = tip.level;
    li.textContent = tip.text;
    feedbackList.appendChild(li);
  });

  overallScore.textContent = `${score}/100`;
}

function downloadRecording() {
  if (recordedChunks.length === 0) {
    return;
  }

  const blob = new Blob(recordedChunks, { type: "video/webm" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `presentation-session-${Date.now()}.webm`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function resetSessionData() {
  transcript = "";
  totalWordCount = 0;
  fillerCount = 0;
  longPauseCount = 0;
  averageEnergy = 0;
  energySamples = 0;
  sessionStart = null;
  lastSpeechTimestamp = null;
  recordedChunks = [];

  transcriptText.textContent = "Listening...";
  wpmMetric.textContent = "0";
  fillerMetric.textContent = "0";
  pauseMetric.textContent = "0";
  energyMetric.textContent = "0%";
  sessionTimer.textContent = "00:00";
  lastUserPointText.textContent = "Your last argument: not captured yet.";
  debateStatusText.textContent = "Debate status: off";
  debateFeed.innerHTML = "";
  appendDebateLine("AI", "Enable debate mode during a live session and I will challenge your points with spoken cross-arguments.");
}
