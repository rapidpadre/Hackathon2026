const canvas = document.querySelector("#challenge-canvas");
const ctx = canvas.getContext("2d");
const form = document.querySelector("#profile-form");
const colorInput = document.querySelector("#color-input");
const animalInput = document.querySelector("#animal-input");
const emptyState = document.querySelector("#empty-state");
const successOverlay = document.querySelector("#success-overlay");
const overlayTitle = document.querySelector("#overlay-title");
const overlayDetail = document.querySelector("#overlay-detail");
const resultMessage = document.querySelector("#result-message");
const challengeText = document.querySelector("#challenge-text");
const timerText = document.querySelector("#timer-text");
const movementText = document.querySelector("#movement-text");
const resetButton = document.querySelector("#reset-button");
const randomButton = document.querySelector("#random-button");

const logicalCanvas = {
  width: 980,
  height: 640
};

const challengeDuration = 20;
const humanMovementThreshold = 60;

const animalCatalog = [
  "cat",
  "dog",
  "fox",
  "lion",
  "tiger",
  "bear",
  "panda",
  "rabbit",
  "bird",
  "frog",
  "giraffe",
  "horse",
  "fish",
  "turtle",
  "owl"
];

const palette = {
  red: "#ef1b1b",
  orange: "#f97316",
  yellow: "#facc15",
  green: "#65a30d",
  emerald: "#047857",
  blue: "#2563eb",
  purple: "#7c3aed",
  pink: "#ec4899",
  teal: "#0891d1",
  gold: "#b7791f",
  black: "#f8fafc",
  white: "#f8fafc",
  gray: "#64748b",
  grey: "#64748b",
  brown: "#92400e"
};

const decoyColors = Object.entries(palette).filter(([name]) => name !== "white");
const randomColorNames = Object.keys(palette).filter((name) => name !== "grey");
const animalNames = animalCatalog;
let challenge = null;
let isResetting = false;
let isAuthenticated = false;
let resetTimer = null;
let countdownTimer = null;
let secondsRemaining = challengeDuration;
let movementSamples = [];
let movementStartedAt = 0;
let lastMovementScore = null;
let lowConfidenceAttempts = 0;

function setControlsLocked(isLocked) {
  colorInput.disabled = isLocked;
  animalInput.disabled = isLocked;
  randomButton.disabled = isLocked;
  form.querySelector('button[type="submit"]').disabled = isLocked;
}

function setOverlay(type) {
  if (!successOverlay) return;

  successOverlay.classList.remove("is-visible", "is-denied");
  if (!type) return;

  const isDenied = type === "denied";
  overlayTitle.textContent = isDenied ? "Access denied" : "Authenticated";
  overlayDetail.textContent = isDenied ? "Reset to try again." : "You found the matching image.";
  successOverlay.classList.toggle("is-denied", isDenied);
  successOverlay.classList.add("is-visible");
}

function resizeCanvasForDisplay() {
  const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = logicalCanvas.width * pixelRatio;
  canvas.height = logicalCanvas.height * pixelRatio;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function normalize(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function colorToHex(colorName) {
  const normalized = normalize(colorName);
  if (palette[normalized]) return palette[normalized];

  const scratch = document.createElement("canvas").getContext("2d");
  scratch.fillStyle = "#000000";
  scratch.fillStyle = normalized;
  return scratch.fillStyle === "#000000" && normalized !== "black" ? "#0f766e" : scratch.fillStyle;
}

function animalKey(animal) {
  const normalized = normalize(animal);
  return animalCatalog.includes(normalized) ? normalized : animalCatalog[0];
}

function animalLabel(animal) {
  const normalized = normalize(animal);
  return normalized.toUpperCase().slice(0, 10) || "CUSTOM";
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function setResult(message, type = "") {
  resultMessage.textContent = message;
  resultMessage.className = `result-message ${type}`.trim();
}

function setTimerText() {
  timerText.textContent = challenge ? `Timer: ${secondsRemaining}s` : "Timer: --";
}

function setMovementText(message) {
  movementText.textContent = message;
}

function resetMovementTracking() {
  movementSamples = [];
  movementStartedAt = performance.now();
  lastMovementScore = null;
  setMovementText("Movement: tracking...");
}

function retryMovementTracking() {
  movementSamples = [];
  movementStartedAt = performance.now();
  lastMovementScore = null;
  setMovementText("Movement: try again");
}

function regenerateChallengeImage() {
  if (!challenge) return;

  const previousTargetSlot = challenge.tokens.find((token) => token.isTarget)?.slot;
  challenge.tokens = buildTokens(challenge.colorName, challenge.animalName, previousTargetSlot);
  renderChallenge();
}

function stopMovementTracking() {
  movementStartedAt = 0;
}

function recordMovement(event) {
  if (!challenge || isResetting || isAuthenticated || !movementStartedAt) return;

  const point = canvasPoint(event);
  const now = performance.now();
  const lastSample = movementSamples[movementSamples.length - 1];

  if (lastSample && now - lastSample.time < 24) return;

  movementSamples.push({
    x: point.x,
    y: point.y,
    time: now
  });

  if (movementSamples.length > 180) {
    movementSamples.shift();
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function bellScore(value, ideal, tolerance) {
  return clamp(1 - Math.abs(value - ideal) / tolerance, 0, 1);
}

function rateMovement() {
  const samples = movementSamples;
  const elapsedMs = movementStartedAt ? performance.now() - movementStartedAt : 0;

  if (samples.length < 3) {
    lastMovementScore = {
      score: 8,
      label: "Too little movement",
      detail: "Only a tiny cursor trail was recorded."
    };
    setMovementText("Movement: 8% - too little data");
    return lastMovementScore;
  }

  let pathLength = 0;
  let directionChanges = 0;
  let pauses = 0;
  const speeds = [];
  let previousAngle = null;

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const distance = Math.hypot(dx, dy);
    const dt = Math.max(1, current.time - previous.time);
    const speed = distance / dt;

    pathLength += distance;
    speeds.push(speed);

    if (dt > 180 || speed < 0.045) {
      pauses += 1;
    }

    if (distance > 4) {
      const angle = Math.atan2(dy, dx);
      if (previousAngle !== null) {
        const angleDelta = Math.abs(Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle)));
        if (angleDelta > 0.28) directionChanges += 1;
      }
      previousAngle = angle;
    }
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const straightDistance = Math.hypot(last.x - first.x, last.y - first.y);
  const efficiency = straightDistance / Math.max(pathLength, 1);
  const meanSpeed = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
  const speedVariance = speeds.reduce((sum, speed) => sum + (speed - meanSpeed) ** 2, 0) / speeds.length;
  const speedVariation = Math.sqrt(speedVariance) / Math.max(meanSpeed, 0.01);
  const elapsedSeconds = elapsedMs / 1000;

  const sampleScore = clamp(samples.length / 34, 0, 1);
  const durationScore = elapsedSeconds < 0.35 ? 0.1 : bellScore(elapsedSeconds, 4.4, 6.5);
  const distanceScore = clamp(pathLength / 360, 0, 1);
  const efficiencyScore = efficiency > 0.94 ? 0.25 : bellScore(efficiency, 0.58, 0.48);
  const variationScore = bellScore(speedVariation, 0.85, 0.9);
  const directionScore = clamp(directionChanges / 10, 0, 1);
  const pauseScore = pauses === 0 ? 0.55 : bellScore(pauses, 4, 8);

  const score = Math.round(
    100 *
      (sampleScore * 0.16 +
        durationScore * 0.17 +
        distanceScore * 0.17 +
        efficiencyScore * 0.17 +
        variationScore * 0.16 +
        directionScore * 0.1 +
        pauseScore * 0.07)
  );

  const label = score >= 74 ? "Very human-like" : score >= 52 ? "Moderately human-like" : "Low confidence";
  const detail = `${label}: ${score}%. Path ${Math.round(pathLength)}px, ${samples.length} samples, ${directionChanges} turns.`;

  lastMovementScore = {
    score,
    label,
    detail
  };
  setMovementText(`Movement: ${score}% - ${label.toLowerCase()}`);
  return lastMovementScore;
}

function movementResultText() {
  const movement = lastMovementScore || rateMovement();
  return `${movement.label} movement score: ${movement.score}%.`;
}

function stopCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = null;
}

function startCountdown() {
  stopCountdown();
  secondsRemaining = challengeDuration;
  setControlsLocked(true);
  resetButton.disabled = true;
  setTimerText();

  countdownTimer = setInterval(() => {
    secondsRemaining -= 1;
    setTimerText();

    if (secondsRemaining <= 0) {
      stopCountdown();
      const movement = rateMovement();
      stopMovementTracking();
      isResetting = true;
      setControlsLocked(true);
      resetButton.disabled = false;
      setOverlay("denied");
      overlayDetail.textContent = `${movement.label} movement score: ${movement.score}%. Reset to try again.`;
      setResult(`Time expired. ${movementResultText()} Reset to try again.`, "error");
    }
  }, 1000);
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, logicalCanvas.width, logicalCanvas.height);
  gradient.addColorStop(0, "#03111a");
  gradient.addColorStop(0.38, "#062737");
  gradient.addColorStop(0.72, "#071532");
  gradient.addColorStop(1, "#180a2f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, logicalCanvas.width, logicalCanvas.height);

  ctx.strokeStyle = "rgba(32, 247, 196, 0.12)";
  ctx.lineWidth = 1;
  for (let x = 32; x < logicalCanvas.width; x += 54) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 160, logicalCanvas.height);
    ctx.stroke();
  }

  for (let i = 0; i < 18; i += 1) {
    ctx.fillStyle = i % 3 === 0 ? "rgba(156, 255, 26, 0.14)" : i % 3 === 1 ? "rgba(17, 217, 232, 0.14)" : "rgba(139, 92, 246, 0.13)";
    ctx.beginPath();
    ctx.arc((i * 151) % logicalCanvas.width, 42 + ((i * 83) % (logicalCanvas.height - 84)), 12 + (i % 4) * 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawToken(token) {
  ctx.save();
  ctx.translate(token.x, token.y);
  ctx.rotate(token.rotation);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.imageSmoothingEnabled = true;

  ctx.shadowColor = "rgba(23, 33, 38, 0.18)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8;
  const animalScale = {
    bird: 0.88,
    cat: 0.78,
    fox: 0.82,
    giraffe: 0.78,
    horse: 0.84
  };
  drawAnimalShape(token.animal, token.size * (animalScale[token.animal] || 1), token.color);

  ctx.shadowColor = "transparent";

  ctx.fillStyle = "#d8fff8";
  ctx.strokeStyle = "rgba(1, 8, 13, 0.92)";
  ctx.lineWidth = Math.max(4, token.size * 0.045);
  ctx.shadowColor = "rgba(17, 217, 232, 0.28)";
  ctx.shadowBlur = 10;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${Math.max(14, token.size * 0.14)}px Inter, Arial, sans-serif`;
  wrapText(token.label, 0, token.size * 0.62, token.size * 0.9, token.size * 0.15 + 4);
  ctx.restore();
}

function fillEllipse(x, y, radiusX, radiusY) {
  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();
}

function fillCircle(x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function fillTriangle(points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fill();
}

function fillPath(points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fill();
}

function fillCurvePath(steps) {
  ctx.beginPath();
  steps.forEach((step) => {
    if (step.type === "move") ctx.moveTo(step.x, step.y);
    if (step.type === "line") ctx.lineTo(step.x, step.y);
    if (step.type === "quad") ctx.quadraticCurveTo(step.cx, step.cy, step.x, step.y);
    if (step.type === "curve") ctx.bezierCurveTo(step.c1x, step.c1y, step.c2x, step.c2y, step.x, step.y);
  });
  ctx.closePath();
  ctx.fill();
}

function roundedLeg(x, y, width, height) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, Math.max(2, width * 0.45));
  ctx.fill();
}

function drawLegs(size) {
  const legWidth = size * 0.085;
  roundedLeg(-size * 0.3, size * 0.13, legWidth, size * 0.27);
  roundedLeg(-size * 0.08, size * 0.16, legWidth, size * 0.25);
  roundedLeg(size * 0.17, size * 0.13, legWidth, size * 0.27);
}

function drawFourLegs(size, stance = "neutral") {
  const lift = stance === "cat" ? -size * 0.04 : 0;
  const width = size * 0.07;
  roundedLeg(-size * 0.24, size * 0.13 + lift, width, size * 0.28);
  roundedLeg(-size * 0.09, size * 0.16, width, size * 0.25);
  roundedLeg(size * 0.11, size * 0.15, width, size * 0.26);
  roundedLeg(size * 0.27, size * 0.12 + lift, width, size * 0.29);
}

function drawAnimalShape(animal, size, color) {
  const dark = "rgba(23, 33, 38, 0.55)";
  const light = contrastFor(color) === "#ffffff" ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.72)";
  const accent = color === "#111827" ? "rgba(255, 255, 255, 0.86)" : "rgba(24, 16, 38, 0.5)";
  ctx.fillStyle = color;

  if (animal === "giraffe") {
    fillEllipse(size * 0.04, size * 0.12, size * 0.34, size * 0.17);
    fillPath([
      [-size * 0.24, -size * 0.04],
      [-size * 0.17, -size * 0.51],
      [-size * 0.05, -size * 0.51],
      [-size * 0.01, -size * 0.12],
      [size * 0.07, size * 0.02],
      [-size * 0.04, size * 0.09]
    ]);
    fillEllipse(-size * 0.03, -size * 0.56, size * 0.18, size * 0.08);
    fillTriangle([[-size * 0.2, -size * 0.56], [-size * 0.35, -size * 0.62], [-size * 0.2, -size * 0.65]]);
    ctx.fillRect(-size * 0.15, -size * 0.68, size * 0.035, size * 0.15);
    ctx.fillRect(-size * 0.01, -size * 0.69, size * 0.035, size * 0.15);
    fillCircle(-size * 0.13, -size * 0.7, size * 0.035);
    fillCircle(size * 0.01, -size * 0.71, size * 0.035);
    ctx.fillRect(-size * 0.19, size * 0.22, size * 0.07, size * 0.27);
    ctx.fillRect(size * 0.01, size * 0.23, size * 0.07, size * 0.26);
    ctx.fillRect(size * 0.2, size * 0.2, size * 0.07, size * 0.28);
    fillTriangle([[size * 0.34, size * 0.08], [size * 0.56, -size * 0.03], [size * 0.48, size * 0.12]]);
    return;
  }

  if (animal === "fish") {
    fillCurvePath([
      { type: "move", x: -size * 0.48, y: 0 },
      { type: "curve", c1x: -size * 0.3, c1y: -size * 0.28, c2x: size * 0.16, c2y: -size * 0.28, x: size * 0.32, y: 0 },
      { type: "curve", c1x: size * 0.15, c1y: size * 0.28, c2x: -size * 0.3, c2y: size * 0.28, x: -size * 0.48, y: 0 }
    ]);
    fillCurvePath([
      { type: "move", x: size * 0.28, y: 0 },
      { type: "curve", c1x: size * 0.48, c1y: -size * 0.28, c2x: size * 0.59, c2y: -size * 0.19, x: size * 0.54, y: 0 },
      { type: "curve", c1x: size * 0.59, c1y: size * 0.19, c2x: size * 0.48, c2y: size * 0.28, x: size * 0.28, y: 0 }
    ]);
    fillCurvePath([
      { type: "move", x: -size * 0.08, y: -size * 0.14 },
      { type: "quad", cx: size * 0.05, cy: -size * 0.44, x: size * 0.15, y: -size * 0.09 },
      { type: "quad", cx: size * 0.04, cy: -size * 0.02, x: -size * 0.08, y: -size * 0.14 }
    ]);
    ctx.fillStyle = light;
    fillCircle(-size * 0.28, -size * 0.05, size * 0.04);
    return;
  }

  if (animal === "bird") {
    fillCurvePath([
      { type: "move", x: -size * 0.62, y: -size * 0.08 },
      { type: "curve", c1x: -size * 0.46, c1y: -size * 0.14, c2x: -size * 0.24, c2y: -size * 0.19, x: -size * 0.1, y: -size * 0.28 },
      { type: "curve", c1x: size * 0.05, c1y: -size * 0.48, c2x: size * 0.29, c2y: -size * 0.43, x: size * 0.42, y: -size * 0.25 },
      { type: "line", x: size * 0.62, y: -size * 0.2 },
      { type: "line", x: size * 0.44, y: -size * 0.14 },
      { type: "curve", c1x: size * 0.39, c1y: size * 0.06, c2x: size * 0.26, c2y: size * 0.25, x: size * 0.03, y: size * 0.27 },
      { type: "curve", c1x: -size * 0.19, c1y: size * 0.3, c2x: -size * 0.35, c2y: size * 0.15, x: -size * 0.5, y: size * 0.03 },
      { type: "line", x: -size * 0.72, y: size * 0.1 },
      { type: "line", x: -size * 0.5, y: -size * 0.02 },
      { type: "line", x: -size * 0.62, y: -size * 0.08 }
    ]);
    fillCurvePath([
      { type: "move", x: -size * 0.03, y: size * 0.22 },
      { type: "curve", c1x: size * 0.05, c1y: size * 0.33, c2x: size * 0.12, c2y: size * 0.43, x: size * 0.22, y: size * 0.45 },
      { type: "line", x: size * 0.13, y: size * 0.48 },
      { type: "curve", c1x: size * 0.04, c1y: size * 0.39, c2x: -size * 0.03, c2y: size * 0.3, x: -size * 0.1, y: size * 0.24 }
    ]);
    fillCurvePath([
      { type: "move", x: size * 0.18, y: size * 0.2 },
      { type: "curve", c1x: size * 0.27, c1y: size * 0.33, c2x: size * 0.32, c2y: size * 0.43, x: size * 0.42, y: size * 0.45 },
      { type: "line", x: size * 0.34, y: size * 0.49 },
      { type: "curve", c1x: size * 0.26, c1y: size * 0.38, c2x: size * 0.17, c2y: size * 0.28, x: size * 0.1, y: size * 0.22 }
    ]);
    ctx.beginPath();
    ctx.moveTo(size * 0.14, size * 0.46);
    ctx.lineTo(size * 0.01, size * 0.51);
    ctx.lineTo(size * 0.2, size * 0.5);
    ctx.moveTo(size * 0.36, size * 0.46);
    ctx.lineTo(size * 0.23, size * 0.53);
    ctx.lineTo(size * 0.44, size * 0.49);
    ctx.lineWidth = size * 0.035;
    ctx.strokeStyle = color;
    ctx.stroke();
    return;
  }

  if (animal === "turtle") {
    fillCurvePath([
      { type: "move", x: -size * 0.42, y: -size * 0.02 },
      { type: "curve", c1x: -size * 0.31, c1y: -size * 0.29, c2x: size * 0.22, c2y: -size * 0.31, x: size * 0.4, y: -size * 0.02 },
      { type: "curve", c1x: size * 0.26, c1y: size * 0.25, c2x: -size * 0.25, c2y: size * 0.28, x: -size * 0.42, y: -size * 0.02 }
    ]);
    fillCircle(-size * 0.43, -size * 0.02, size * 0.12);
    fillCircle(-size * 0.24, -size * 0.25, size * 0.08);
    fillCircle(size * 0.24, -size * 0.25, size * 0.08);
    fillCircle(-size * 0.24, size * 0.25, size * 0.08);
    fillCircle(size * 0.24, size * 0.25, size * 0.08);
    fillTriangle([[size * 0.36, 0], [size * 0.52, -size * 0.08], [size * 0.52, size * 0.08]]);
    ctx.fillStyle = light;
    fillEllipse(0, 0, size * 0.23, size * 0.15);
    return;
  }

  if (animal === "rabbit") {
    fillCurvePath([
      { type: "move", x: -size * 0.42, y: -size * 0.08 },
      { type: "curve", c1x: -size * 0.3, c1y: -size * 0.3, c2x: -size * 0.08, c2y: -size * 0.18, x: size * 0.2, y: -size * 0.08 },
      { type: "curve", c1x: size * 0.44, c1y: size * 0.01, c2x: size * 0.31, c2y: size * 0.31, x: size * 0.02, y: size * 0.28 },
      { type: "curve", c1x: -size * 0.23, c1y: size * 0.24, c2x: -size * 0.48, c2y: size * 0.11, x: -size * 0.42, y: -size * 0.08 }
    ]);
    fillEllipse(-size * 0.33, -size * 0.37, size * 0.055, size * 0.28);
    fillEllipse(-size * 0.18, -size * 0.37, size * 0.055, size * 0.28);
    fillCircle(size * 0.43, size * 0.01, size * 0.09);
    ctx.fillRect(-size * 0.08, size * 0.22, size * 0.1, size * 0.18);
    ctx.fillRect(size * 0.22, size * 0.21, size * 0.11, size * 0.16);
    return;
  }

  if (animal === "owl") {
    fillEllipse(0, size * 0.03, size * 0.32, size * 0.4);
    fillTriangle([[-size * 0.21, -size * 0.31], [-size * 0.08, -size * 0.52], [0, -size * 0.27]]);
    fillTriangle([[size * 0.21, -size * 0.31], [size * 0.08, -size * 0.52], [0, -size * 0.27]]);
    fillEllipse(-size * 0.24, size * 0.06, size * 0.11, size * 0.28);
    fillEllipse(size * 0.24, size * 0.06, size * 0.11, size * 0.28);
    ctx.fillStyle = light;
    fillCircle(-size * 0.11, -size * 0.1, size * 0.08);
    fillCircle(size * 0.11, -size * 0.1, size * 0.08);
    ctx.fillStyle = dark;
    fillTriangle([[-size * 0.04, 0], [size * 0.04, 0], [0, size * 0.08]]);
    ctx.fillStyle = color;
    ctx.fillRect(-size * 0.13, size * 0.38, size * 0.07, size * 0.1);
    ctx.fillRect(size * 0.06, size * 0.38, size * 0.07, size * 0.1);
    return;
  }

  if (animal === "frog") {
    fillCurvePath([
      { type: "move", x: -size * 0.4, y: size * 0.08 },
      { type: "curve", c1x: -size * 0.34, c1y: -size * 0.2, c2x: size * 0.34, c2y: -size * 0.2, x: size * 0.4, y: size * 0.08 },
      { type: "curve", c1x: size * 0.29, c1y: size * 0.35, c2x: -size * 0.29, c2y: size * 0.35, x: -size * 0.4, y: size * 0.08 }
    ]);
    fillCircle(-size * 0.2, -size * 0.2, size * 0.13);
    fillCircle(size * 0.2, -size * 0.2, size * 0.13);
    fillEllipse(-size * 0.35, size * 0.26, size * 0.16, size * 0.08);
    fillEllipse(size * 0.35, size * 0.26, size * 0.16, size * 0.08);
    fillEllipse(-size * 0.19, size * 0.28, size * 0.08, size * 0.16);
    fillEllipse(size * 0.19, size * 0.28, size * 0.08, size * 0.16);
    ctx.fillStyle = light;
    fillCircle(-size * 0.18, -size * 0.23, size * 0.05);
    fillCircle(size * 0.18, -size * 0.23, size * 0.05);
    return;
  }

  if (animal === "horse") {
    fillCurvePath([
      { type: "move", x: -size * 0.43, y: size * 0.28 },
      { type: "curve", c1x: -size * 0.51, c1y: size * 0.02, c2x: -size * 0.31, c2y: -size * 0.1, x: -size * 0.13, y: -size * 0.17 },
      { type: "curve", c1x: size * 0.03, c1y: -size * 0.39, c2x: size * 0.1, c2y: -size * 0.55, x: size * 0.27, y: -size * 0.5 },
      { type: "curve", c1x: size * 0.43, c1y: -size * 0.45, c2x: size * 0.44, c2y: -size * 0.21, x: size * 0.31, y: -size * 0.07 },
      { type: "curve", c1x: size * 0.45, c1y: -size * 0.03, c2x: size * 0.58, c2y: size * 0.1, x: size * 0.45, y: size * 0.22 },
      { type: "curve", c1x: size * 0.25, c1y: size * 0.17, c2x: size * 0.12, c2y: size * 0.12, x: -size * 0.05, y: size * 0.23 },
      { type: "curve", c1x: -size * 0.16, c1y: size * 0.34, c2x: -size * 0.32, c2y: size * 0.39, x: -size * 0.43, y: size * 0.28 }
    ]);
    fillCurvePath([
      { type: "move", x: size * 0.18, y: -size * 0.48 },
      { type: "curve", c1x: size * 0.29, c1y: -size * 0.7, c2x: size * 0.56, c2y: -size * 0.55, x: size * 0.45, y: -size * 0.31 },
      { type: "curve", c1x: size * 0.35, c1y: -size * 0.14, c2x: size * 0.2, c2y: -size * 0.18, x: size * 0.18, y: -size * 0.48 }
    ]);
    fillTriangle([[size * 0.22, -size * 0.58], [size * 0.29, -size * 0.79], [size * 0.34, -size * 0.56]]);
    fillTriangle([[size * 0.39, -size * 0.53], [size * 0.52, -size * 0.72], [size * 0.49, -size * 0.45]]);
    fillCurvePath([
      { type: "move", x: size * 0.21, y: -size * 0.15 },
      { type: "curve", c1x: size * 0.55, c1y: -size * 0.03, c2x: size * 0.64, c2y: size * 0.24, x: size * 0.37, y: size * 0.27 },
      { type: "curve", c1x: size * 0.31, c1y: size * 0.17, c2x: size * 0.15, c2y: size * 0.02, x: size * 0.21, y: -size * 0.15 }
    ]);
    fillCurvePath([
      { type: "move", x: size * 0.04, y: size * 0.15 },
      { type: "curve", c1x: size * 0.14, c1y: size * 0.38, c2x: size * 0.24, c2y: size * 0.48, x: size * 0.36, y: size * 0.61 },
      { type: "line", x: size * 0.24, y: size * 0.64 },
      { type: "curve", c1x: size * 0.09, c1y: size * 0.49, c2x: -size * 0.03, c2y: size * 0.34, x: -size * 0.08, y: size * 0.18 }
    ]);
    fillCurvePath([
      { type: "move", x: -size * 0.2, y: size * 0.2 },
      { type: "curve", c1x: -size * 0.28, c1y: size * 0.42, c2x: -size * 0.29, c2y: size * 0.56, x: -size * 0.18, y: size * 0.69 },
      { type: "line", x: -size * 0.31, y: size * 0.7 },
      { type: "curve", c1x: -size * 0.43, c1y: size * 0.47, c2x: -size * 0.42, c2y: size * 0.28, x: -size * 0.31, y: size * 0.14 }
    ]);
    fillCurvePath([
      { type: "move", x: -size * 0.37, y: size * 0.18 },
      { type: "curve", c1x: -size * 0.6, c1y: size * 0.28, c2x: -size * 0.63, c2y: size * 0.56, x: -size * 0.52, y: size * 0.69 },
      { type: "curve", c1x: -size * 0.49, c1y: size * 0.47, c2x: -size * 0.47, c2y: size * 0.3, x: -size * 0.31, y: size * 0.16 }
    ]);
    ctx.fillStyle = accent;
    [-0.05, 0.03, 0.11, 0.18].forEach((x, index) => {
      fillCurvePath([
        { type: "move", x: size * x, y: -size * (0.34 + index * 0.035) },
        { type: "curve", c1x: size * (x - 0.22), c1y: -size * (0.43 + index * 0.02), c2x: size * (x - 0.14), c2y: -size * (0.5 + index * 0.02), x: size * (x + 0.02), y: -size * (0.45 + index * 0.015) }
      ]);
    });
    return;
  }

  if (animal === "fox") {
    fillCurvePath([
      { type: "move", x: -size * 0.28, y: size * 0.36 },
      { type: "curve", c1x: -size * 0.55, c1y: size * 0.24, c2x: -size * 0.54, c2y: -size * 0.04, x: -size * 0.32, y: -size * 0.22 },
      { type: "curve", c1x: -size * 0.18, c1y: -size * 0.42, c2x: -size * 0.1, c2y: -size * 0.58, x: -size * 0.05, y: -size * 0.76 },
      { type: "curve", c1x: size * 0.03, c1y: -size * 0.58, c2x: size * 0.21, c2y: -size * 0.49, x: size * 0.22, y: -size * 0.28 },
      { type: "curve", c1x: size * 0.27, c1y: -size * 0.06, c2x: size * 0.24, c2y: size * 0.2, x: size * 0.08, y: size * 0.34 },
      { type: "curve", c1x: -size * 0.02, c1y: size * 0.43, c2x: -size * 0.16, c2y: size * 0.43, x: -size * 0.28, y: size * 0.36 }
    ]);
    fillTriangle([[-size * 0.07, -size * 0.68], [-size * 0.1, -size * 0.98], [size * 0.12, -size * 0.72]]);
    fillTriangle([[size * 0.06, -size * 0.67], [size * 0.2, -size * 0.92], [size * 0.24, -size * 0.61]]);
    fillCurvePath([
      { type: "move", x: size * 0.14, y: -size * 0.56 },
      { type: "curve", c1x: size * 0.36, c1y: -size * 0.55, c2x: size * 0.44, c2y: -size * 0.43, x: size * 0.31, y: -size * 0.31 },
      { type: "curve", c1x: size * 0.17, c1y: -size * 0.23, c2x: size * 0.05, c2y: -size * 0.34, x: size * 0.14, y: -size * 0.56 }
    ]);
    fillCurvePath([
      { type: "move", x: size * 0.03, y: size * 0.23 },
      { type: "curve", c1x: size * 0.24, c1y: size * 0.05, c2x: size * 0.54, c2y: size * 0.09, x: size * 0.7, y: size * 0.27 },
      { type: "curve", c1x: size * 0.53, c1y: size * 0.48, c2x: size * 0.17, c2y: size * 0.5, x: -size * 0.08, y: size * 0.36 },
      { type: "curve", c1x: -size * 0.03, c1y: size * 0.32, c2x: size * 0.01, c2y: size * 0.28, x: size * 0.03, y: size * 0.23 }
    ]);
    roundedLeg(-size * 0.1, size * 0.19, size * 0.06, size * 0.29);
    roundedLeg(size * 0.03, size * 0.2, size * 0.05, size * 0.27);
    fillEllipse(-size * 0.04, size * 0.46, size * 0.13, size * 0.05);
    return;
  }

  if (animal === "lion") {
    ctx.fillStyle = "rgba(146, 64, 14, 0.9)";
    fillCircle(-size * 0.22, -size * 0.18, size * 0.31);
    ctx.fillStyle = color;
    fillCircle(-size * 0.22, -size * 0.18, size * 0.2);
    fillEllipse(size * 0.12, size * 0.09, size * 0.36, size * 0.19);
    fillTriangle([[size * 0.43, size * 0.02], [size * 0.59, -size * 0.12], [size * 0.54, size * 0.1]]);
    drawLegs(size);
    return;
  }

  if (animal === "tiger") {
    fillCurvePath([
      { type: "move", x: -size * 0.46, y: -size * 0.22 },
      { type: "curve", c1x: -size * 0.36, c1y: -size * 0.36, c2x: -size * 0.2, c2y: -size * 0.28, x: -size * 0.12, y: -size * 0.12 },
      { type: "curve", c1x: size * 0.12, c1y: -size * 0.21, c2x: size * 0.43, c2y: -size * 0.08, x: size * 0.45, y: size * 0.08 },
      { type: "curve", c1x: size * 0.47, c1y: size * 0.25, c2x: size * 0.19, c2y: size * 0.32, x: -size * 0.1, y: size * 0.25 },
      { type: "curve", c1x: -size * 0.34, c1y: size * 0.2, c2x: -size * 0.47, c2y: size * 0.04, x: -size * 0.46, y: -size * 0.22 }
    ]);
    fillTriangle([[-size * 0.38, -size * 0.34], [-size * 0.31, -size * 0.52], [-size * 0.2, -size * 0.3]]);
    fillTriangle([[-size * 0.18, -size * 0.29], [-size * 0.06, -size * 0.47], [-size * 0.03, -size * 0.22]]);
    fillCurvePath([
      { type: "move", x: size * 0.4, y: size * 0.03 },
      { type: "curve", c1x: size * 0.62, c1y: -size * 0.24, c2x: size * 0.68, c2y: -size * 0.02, x: size * 0.5, y: size * 0.16 },
      { type: "line", x: size * 0.39, y: size * 0.08 }
    ]);
    drawFourLegs(size, "cat");
    ctx.strokeStyle = dark;
    ctx.lineWidth = size * 0.03;
    [-0.17, -0.02, 0.13, 0.28].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(size * x, -size * 0.12);
      ctx.lineTo(size * (x + 0.07), size * 0.18);
      ctx.stroke();
    });
    return;
  }

  if (animal === "bear" || animal === "panda") {
    fillCircle(-size * 0.24, -size * 0.18, size * 0.24);
    fillCircle(-size * 0.38, -size * 0.34, size * 0.09);
    fillCircle(-size * 0.1, -size * 0.34, size * 0.09);
    fillEllipse(size * 0.11, size * 0.1, size * 0.37, size * 0.24);
    fillCircle(size * 0.42, size * 0.02, size * 0.07);
    drawLegs(size);
    if (animal === "panda") {
      ctx.fillStyle = light;
      fillCircle(-size * 0.24, -size * 0.18, size * 0.14);
      ctx.fillStyle = dark;
      fillCircle(-size * 0.32, -size * 0.2, size * 0.05);
      fillCircle(-size * 0.16, -size * 0.2, size * 0.05);
    }
    return;
  }

  if (animal === "dog") {
    fillCurvePath([
      { type: "move", x: -size * 0.52, y: -size * 0.19 },
      { type: "curve", c1x: -size * 0.43, c1y: -size * 0.34, c2x: -size * 0.24, c2y: -size * 0.26, x: -size * 0.18, y: -size * 0.1 },
      { type: "curve", c1x: size * 0.03, c1y: -size * 0.17, c2x: size * 0.31, c2y: -size * 0.11, x: size * 0.39, y: size * 0.03 },
      { type: "curve", c1x: size * 0.47, c1y: size * 0.17, c2x: size * 0.24, c2y: size * 0.28, x: -size * 0.02, y: size * 0.25 },
      { type: "curve", c1x: -size * 0.31, c1y: size * 0.22, c2x: -size * 0.47, c2y: size * 0.04, x: -size * 0.52, y: -size * 0.19 }
    ]);
    fillCurvePath([
      { type: "move", x: -size * 0.46, y: -size * 0.29 },
      { type: "curve", c1x: -size * 0.34, c1y: -size * 0.48, c2x: -size * 0.16, c2y: -size * 0.38, x: -size * 0.17, y: -size * 0.15 },
      { type: "curve", c1x: -size * 0.31, c1y: -size * 0.08, c2x: -size * 0.51, c2y: -size * 0.12, x: -size * 0.46, y: -size * 0.29 }
    ]);
    fillEllipse(-size * 0.55, -size * 0.17, size * 0.11, size * 0.06);
    fillEllipse(-size * 0.37, -size * 0.07, size * 0.06, size * 0.16);
    fillCurvePath([
      { type: "move", x: size * 0.34, y: size * 0.02 },
      { type: "curve", c1x: size * 0.54, c1y: -size * 0.11, c2x: size * 0.55, c2y: size * 0.1, x: size * 0.41, y: size * 0.18 },
      { type: "line", x: size * 0.34, y: size * 0.08 }
    ]);
    drawFourLegs(size);
    return;
  }

  if (animal === "cat") {
    fillCurvePath([
      { type: "move", x: -size * 0.52, y: -size * 0.14 },
      { type: "line", x: size * 0.21, y: -size * 0.14 },
      { type: "curve", c1x: size * 0.36, c1y: -size * 0.15, c2x: size * 0.47, c2y: -size * 0.07, x: size * 0.49, y: size * 0.05 },
      { type: "curve", c1x: size * 0.5, c1y: size * 0.19, c2x: size * 0.35, c2y: size * 0.25, x: size * 0.11, y: size * 0.25 },
      { type: "line", x: -size * 0.49, y: size * 0.25 },
      { type: "curve", c1x: -size * 0.56, c1y: size * 0.15, c2x: -size * 0.58, c2y: -size * 0.02, x: -size * 0.52, y: -size * 0.14 }
    ]);
    fillCurvePath([
      { type: "move", x: size * 0.25, y: -size * 0.13 },
      { type: "curve", c1x: size * 0.33, c1y: -size * 0.31, c2x: size * 0.57, c2y: -size * 0.28, x: size * 0.59, y: -size * 0.08 },
      { type: "curve", c1x: size * 0.58, c1y: size * 0.06, c2x: size * 0.43, c2y: size * 0.11, x: size * 0.32, y: size * 0.03 },
      { type: "curve", c1x: size * 0.3, c1y: -size * 0.02, c2x: size * 0.28, c2y: -size * 0.08, x: size * 0.25, y: -size * 0.13 }
    ]);
    fillTriangle([[size * 0.33, -size * 0.23], [size * 0.36, -size * 0.43], [size * 0.46, -size * 0.22]]);
    fillTriangle([[size * 0.48, -size * 0.2], [size * 0.56, -size * 0.39], [size * 0.58, -size * 0.15]]);
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, -size * 0.12);
    ctx.bezierCurveTo(-size * 0.62, -size * 0.38, -size * 0.39, -size * 0.54, -size * 0.3, -size * 0.33);
    ctx.bezierCurveTo(-size * 0.22, -size * 0.17, -size * 0.33, -size * 0.08, -size * 0.45, -size * 0.05);
    ctx.lineWidth = size * 0.085;
    ctx.strokeStyle = color;
    ctx.stroke();
    roundedLeg(-size * 0.39, size * 0.2, size * 0.09, size * 0.31);
    roundedLeg(-size * 0.1, size * 0.22, size * 0.08, size * 0.31);
    roundedLeg(size * 0.2, size * 0.2, size * 0.08, size * 0.31);
    roundedLeg(size * 0.37, size * 0.17, size * 0.08, size * 0.32);
    fillEllipse(-size * 0.34, size * 0.5, size * 0.1, size * 0.05);
    fillEllipse(-size * 0.05, size * 0.52, size * 0.09, size * 0.05);
    fillEllipse(size * 0.25, size * 0.5, size * 0.09, size * 0.05);
    fillEllipse(size * 0.42, size * 0.49, size * 0.09, size * 0.05);
    return;
  }

  fillCircle(0, 0, size * 0.24);
  fillCircle(-size * 0.25, -size * 0.14, size * 0.1);
  fillCircle(0, -size * 0.24, size * 0.1);
  fillCircle(size * 0.25, -size * 0.14, size * 0.1);
  fillCircle(size * 0.13, -size * 0.36, size * 0.08);
  fillCircle(-size * 0.13, -size * 0.36, size * 0.08);
}

function contrastFor(hex) {
  const value = hex.startsWith("#") ? hex.slice(1) : hex;
  if (value.length !== 6) return "#ffffff";
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#172126" : "#ffffff";
}

function wrapText(text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  });
  lines.push(line);

  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((lineText, index) => {
    const lineY = startY + index * lineHeight;
    ctx.strokeText(lineText, x, lineY);
    ctx.fillText(lineText, x, lineY);
  });
}

function buildTokens(colorName, animalName, excludedTargetSlot = null) {
  const targetColor = colorToHex(colorName);
  const targetAnimal = animalKey(animalName);
  const availableTargetSlots = Array.from({ length: 12 }, (_, index) => index).filter(
    (slot) => slot !== excludedTargetSlot
  );
  const targetSlot = randomItem(availableTargetSlots);
  const slots = shuffle(Array.from({ length: 12 }, (_, index) => index));
  const otherColors = decoyColors.map(([, hex]) => hex).filter((hex) => hex !== targetColor);
  const otherAnimals = animalNames.filter((animal) => animal !== targetAnimal);

  return slots.map((slot, index) => {
    const col = slot % 4;
    const row = Math.floor(slot / 4);
    const isTarget = slot === targetSlot;
    let decoyColor = randomItem(decoyColors)[1];
    let decoyAnimal = randomItem(animalNames);

    if (!isTarget && index % 4 === 1) {
      decoyColor = randomItem(otherColors);
      decoyAnimal = targetAnimal;
    }

    if (!isTarget && index % 4 === 2) {
      decoyColor = targetColor;
      decoyAnimal = randomItem(otherAnimals);
    }

    if (!isTarget && decoyColor === targetColor && decoyAnimal === targetAnimal) {
      decoyAnimal = randomItem(otherAnimals);
    }

    return {
      x: 150 + col * 225 + Math.random() * 28 - 14,
      y: 130 + row * 185 + Math.random() * 24 - 12,
      size: 112 + Math.random() * 18,
      rotation: (Math.random() - 0.5) * 0.22,
      color: isTarget ? targetColor : decoyColor,
      animal: isTarget ? targetAnimal : decoyAnimal,
      label: isTarget ? animalLabel(animalName) : animalLabel(decoyAnimal),
      isTarget,
      slot
    };
  });
}

function renderChallenge() {
  if (!challenge) return;

  ctx.clearRect(0, 0, logicalCanvas.width, logicalCanvas.height);
  drawBackground();
  challenge.tokens.forEach(drawToken);
}

function generateChallenge(colorName, animalName) {
  clearTimeout(resetTimer);
  stopCountdown();
  setControlsLocked(false);
  resetButton.disabled = true;
  setOverlay(null);
  isResetting = false;
  isAuthenticated = false;
  lowConfidenceAttempts = 0;
  challenge = {
    colorName: normalize(colorName),
    animalName: normalize(animalName),
    tokens: buildTokens(colorName, animalName)
  };

  emptyState.classList.add("is-hidden");
  challengeText.textContent = `Find your ${challenge.colorName} ${challenge.animalName}.`;
  setResult("Click the matching item in the generated image.");
  renderChallenge();
  resetMovementTracking();
  startCountdown();
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * logicalCanvas.width,
    y: ((event.clientY - rect.top) / rect.height) * logicalCanvas.height
  };
}

function hitTest(point, token) {
  const dx = point.x - token.x;
  const dy = point.y - token.y;
  return Math.hypot(dx, dy) <= token.size * 0.62;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  generateChallenge(data.get("color"), data.get("animal"));
});

randomButton.addEventListener("click", () => {
  const colorName = randomItem(randomColorNames);
  const animalName = randomItem(animalNames);
  colorInput.value = colorName;
  animalInput.value = animalName;
  generateChallenge(colorName, animalName);
});

canvas.addEventListener("click", (event) => {
  if (!challenge || isResetting || isAuthenticated) return;

  recordMovement(event);

  const point = canvasPoint(event);
  const clicked = challenge.tokens.find((token) => hitTest(point, token));
  const movement = rateMovement();
  stopMovementTracking();

  if (clicked?.isTarget) {
    if (movement.score < humanMovementThreshold) {
      lowConfidenceAttempts += 1;

      if (lowConfidenceAttempts >= 2) {
        stopCountdown();
        isResetting = true;
        setControlsLocked(true);
        resetButton.disabled = false;
        setOverlay("denied");
        overlayDetail.textContent = `${movement.label} movement score: ${movement.score}%. Reset to try again.`;
        setResult(`Access denied. Movement score stayed below ${humanMovementThreshold}%. Reset to try again.`, "error");
        return;
      }

      regenerateChallengeImage();
      retryMovementTracking();
      setOverlay(null);
      challengeText.textContent = `Find your ${challenge.colorName} ${challenge.animalName}.`;
      setResult(
        `Correct animal, but the movement check was too low. The image regenerated. Select your ${challenge.animalName} again.`,
        "error"
      );
      return;
    }

    stopCountdown();
    isAuthenticated = true;
    setControlsLocked(true);
    resetButton.disabled = false;
    setOverlay("success");
    overlayDetail.textContent = `${movement.label} movement score: ${movement.score}%.`;
    setResult(`Authenticated. ${movementResultText()}`, "success");
  } else {
    stopCountdown();
    isResetting = true;
    setControlsLocked(true);
    resetButton.disabled = false;
    setOverlay("denied");
    overlayDetail.textContent = "Incorrect animal. Reset to try again.";
    setResult("Access denied. Incorrect animal. Reset to try again.", "error");
  }
});

canvas.addEventListener("pointermove", recordMovement);

resetButton.addEventListener("click", () => {
  if (!challenge) return;

  clearTimeout(resetTimer);
  stopCountdown();
  stopMovementTracking();
  isResetting = false;
  isAuthenticated = false;
  challenge = null;
  movementSamples = [];
  lastMovementScore = null;
  lowConfidenceAttempts = 0;
  ctx.clearRect(0, 0, logicalCanvas.width, logicalCanvas.height);
  emptyState.classList.remove("is-hidden");
  setOverlay(null);
  form.reset();
  setControlsLocked(false);
  resetButton.disabled = true;
  challengeText.textContent = "Enter your details to begin.";
  setTimerText();
  setMovementText("Movement: --");
  setResult("Waiting for a challenge.");
});

window.addEventListener("resize", () => {
  resizeCanvasForDisplay();
  renderChallenge();
});

resizeCanvasForDisplay();
setTimerText();
setMovementText("Movement: --");
resetButton.disabled = true;
