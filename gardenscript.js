const gameArea = document.getElementById("game-area");
const shovelSlot = document.querySelector(".shovel-slot");
const platformLanes = Array.from(document.querySelectorAll(".platform-lane")).map((lane, index) => ({
  lane,
  index,
  slots: new Array(10).fill(null),
  zombies: []
}));
const LANE_SLOT_COUNT = 10;
const PEASHOOTER_FIRE_MS = 2000;
const BULLET_SPEED = 520;
const ZOMBIE_SPEED = 40;
const SHOVEL_GHOST_SIZE = 56;
const peashooterSlot = document.querySelector(".peashooter-slot");
let selectedObject = null;
let offsetX = 0;
let offsetY = 0;
let bullets = [];
let shovelGhost = null;
let shovelDragging = false;
let lastShovelPoint = { x: 0, y: 0 };
let shovelClickBlockUntil = 0;
let lastFrameTimestamp = performance.now();
function buildLaneTiles() {
  platformLanes.forEach(({ lane, slots }) => {
    lane.innerHTML = "";
    for (let i = 0; i < slots.length; i++) {
      const tile = document.createElement("div");
      tile.className = "lane-tile";
      tile.dataset.slotIndex = i;
      lane.appendChild(tile);
    }
  });
}
buildLaneTiles();
function getWrapperSize() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--obj-size");
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 88 : n;
}

function getGameAreaRect() {
  return gameArea.getBoundingClientRect();
}
const playButton = document.getElementById("play-button");
const restartButton = document.getElementById("restart-button");
let gameRunning = false;
let zombieSpawnTimeout = null;
function scheduleNextZombie() {
  if (!gameRunning) return;
  spawnZombie(); 
  const nextDelay = 900 + Math.random() * 1600; 
  zombieSpawnTimeout = setTimeout(scheduleNextZombie, nextDelay);
}
function startGame() {
  if (gameRunning) return;
  gameRunning = true;
  if (playButton) playButton.disabled = true;
  scheduleNextZombie();
}
function stopGame() {
  gameRunning = false;
  if (zombieSpawnTimeout) {
    clearTimeout(zombieSpawnTimeout);
    zombieSpawnTimeout = null;
  }
  if (playButton) playButton.disabled = false;
}
function restartGame() {
  stopGame();
  if (shovelDragging) {
    destroyShovelGhost();
    shovelDragging = false;
    document.removeEventListener("mousemove", shovelMove);
    document.removeEventListener("mouseup", stopShovelDrag);
    document.removeEventListener("touchmove", shovelMove);
    document.removeEventListener("touchend", stopShovelDrag);
    document.removeEventListener("touchcancel", stopShovelDrag);
  }
  for (const b of bullets) b.remove();
  bullets = [];
  const objs = Array.from(document.querySelectorAll(".object"));
  for (const obj of objs) removeObject(obj);
  platformLanes.forEach((lane) => {
    lane.slots.fill(null);
    lane.zombies = [];
  });
  selectedObject = null;
}
if (playButton) playButton.addEventListener("click", startGame);
if (restartButton) restartButton.addEventListener("click", restartGame);
function getLaneSlotPosition(laneConfig, slotIndex) {
  const laneRect = laneConfig.lane.getBoundingClientRect();
  const gameRect = getGameAreaRect();
  const slotWidth = laneRect.width / laneConfig.slots.length;
  const horizontalMargin = Math.max((slotWidth - getWrapperSize()) / 2, 0);
  const left = laneRect.left - gameRect.left + slotWidth * slotIndex + horizontalMargin;
  const top = laneRect.top - gameRect.top + Math.max((laneRect.height - getWrapperSize()) / 2, 0);
  return { left, top };
}
function placePlantInSlot(obj, laneConfig, slotIndex) {
  if (!obj || !laneConfig) return;
  releaseSlot(obj);

  laneConfig.slots[slotIndex] = obj;
  obj.dataset.laneIndex = laneConfig.index;
  obj.dataset.slotIndex = slotIndex;

  const { left, top } = getLaneSlotPosition(laneConfig, slotIndex);
  obj.style.left = `${left}px`;
  obj.style.top = `${top}px`;

  obj.dataset.locked = "true";
  obj.classList.add("locked");
}

function findNearestEmptySlot(laneConfig, originIndex) {
  if (!laneConfig) return null;
  const length = laneConfig.slots.length;
  if (originIndex >= 0 && originIndex < length && !laneConfig.slots[originIndex]) return originIndex;
  for (let distance = 1; distance < length; distance += 1) {
    const forward = originIndex + distance;
    const backward = originIndex - distance;
    if (forward < length && !laneConfig.slots[forward]) return forward;
    if (backward >= 0 && !laneConfig.slots[backward]) return backward;
  }
  return null;
}
function getLaneSlotAtPosition(x, y) {
  if (typeof x !== "number" || typeof y !== "number") return null;
  for (const laneConfig of platformLanes) {
    const rect = laneConfig.lane.getBoundingClientRect();
    if (y < rect.top || y > rect.bottom) continue;
    const relativeX = Math.min(Math.max(x - rect.left, 0), rect.width);
    const slotIndex = Math.min(Math.floor((relativeX / rect.width) * laneConfig.slots.length), laneConfig.slots.length - 1);
    return { laneConfig, slotIndex };
  }
  return null;
}
function tryPlacePlantAtPosition(obj, x, y) {
  const laneSlot = getLaneSlotAtPosition(x, y);
  if (!laneSlot) return false;
  const { laneConfig, slotIndex } = laneSlot;
  if (!laneConfig.slots[slotIndex] || laneConfig.slots[slotIndex] === obj) {
    placePlantInSlot(obj, laneConfig, slotIndex);
    return true;
  }
  const fallbackIndex = findNearestEmptySlot(laneConfig, slotIndex);
  if (fallbackIndex !== null) {
    placePlantInSlot(obj, laneConfig, fallbackIndex);
    return true;
  }
  return false;
}
function rememberPlantSlot(obj) {
  if (!obj || obj.dataset.type !== "plant") return;

  if (obj.dataset.laneIndex != null) {
    obj.dataset.lastLaneIndex = obj.dataset.laneIndex;
  }
  if (obj.dataset.slotIndex != null) {
    obj.dataset.lastSlotIndex = obj.dataset.slotIndex;
  }
}
function releaseSlot(obj) {
  if (!obj) return;
  const laneIndex = Number(obj.dataset.laneIndex);
  const slotIndex = Number(obj.dataset.slotIndex);
  if (!Number.isInteger(laneIndex) || !Number.isInteger(slotIndex)) return;
  const laneConfig = platformLanes[laneIndex];
  if (!laneConfig) return;
  if (laneConfig.slots[slotIndex] === obj) {
    laneConfig.slots[slotIndex] = null;
  }
  delete obj.dataset.laneIndex;
  delete obj.dataset.slotIndex;
}
function removeZombieFromLane(zombie) {
  const laneIndex = Number(zombie.dataset.laneIndex);
  if (!Number.isInteger(laneIndex)) return;
  const laneConfig = platformLanes[laneIndex];
  if (!laneConfig) return;
  laneConfig.zombies = laneConfig.zombies.filter((entry) => entry !== zombie);
}
function removeObject(obj) {
  if (!obj) return;
  if (obj.dataset.type === "plant") releaseSlot(obj);
  if (obj.dataset.type === "zombie") {
    if (obj.eatingPlant) {
      delete obj.eatingPlant;
      delete obj.eatingUntil;
    }
    removeZombieFromLane(obj);
  }
  if (selectedObject === obj) {
    selectedObject = null;
  }
  obj.remove();
}
function removeSelected() {
  if (!selectedObject) return;
  removeObject(selectedObject);
}
function createObject(type) {
  const wrapper = document.createElement("div");
  wrapper.className = `object ${type}`;
  const sprite = document.createElement("div");
  sprite.className = "sprite";
  wrapper.appendChild(sprite);
  wrapper.dataset.type = type;
  wrapper.addEventListener("click", (e) => {
    e.stopPropagation();
    selectObject(wrapper);
  });
  return wrapper;
}
function startPeashooterDrag(e) {
  e.preventDefault();

  const pointer = e.touches?.[0] ?? e;
  const wrapper = createObject("plant");
  wrapper.addEventListener("mousedown", startDrag);
  wrapper.addEventListener("touchstart", startTouchDrag, { passive: false });
  const gameRect = getGameAreaRect();
  const size = getWrapperSize();
  offsetX = size / 2;
  offsetY = size / 2;
  wrapper.style.left = `${pointer.clientX - gameRect.left - offsetX}px`;
  wrapper.style.top  = `${pointer.clientY - gameRect.top - offsetY}px`;
  gameArea.appendChild(wrapper);
  selectObject(wrapper);
  if (e.type.startsWith("touch")) {
    document.addEventListener("touchmove", touchMove, { passive: false });
    document.addEventListener("touchend", stopTouchDrag);
    document.addEventListener("touchcancel", stopTouchDrag);
  } else {
    document.addEventListener("mousemove", drag);
    document.addEventListener("mouseup", stopDrag);
  }
}
if (peashooterSlot) {
  peashooterSlot.removeAttribute("onclick");
  peashooterSlot.addEventListener("mousedown", startPeashooterDrag);
  peashooterSlot.addEventListener("touchstart", startPeashooterDrag, { passive: false });
}
function spawnPlant() {
  const wrapper = createObject("plant");
  wrapper.addEventListener("mousedown", startDrag);
  wrapper.addEventListener("touchstart", startTouchDrag, { passive: false });
  const initialLeft = (gameArea.clientWidth - getWrapperSize()) / 2;
  wrapper.style.left = `${initialLeft}px`;
  wrapper.style.top = "120px";
  gameArea.appendChild(wrapper);
  selectObject(wrapper);
}
function spawnZombie() {
  if (platformLanes.length === 0) return;
  const laneConfig = platformLanes[Math.floor(Math.random() * platformLanes.length)];
  const wrapper = createObject("zombie");
  const gameRect = getGameAreaRect();
  const laneRect = laneConfig.lane.getBoundingClientRect();
  const left = Math.max(laneRect.right - gameRect.left - getWrapperSize() - 8, 0);
  const top = laneRect.top - gameRect.top + Math.max((laneRect.height - getWrapperSize()) / 2, 0);
  wrapper.style.left = `${left}px`;
  wrapper.style.top = `${top}px`;
  wrapper.dataset.laneIndex = laneConfig.index;
  wrapper.dataset.health = "3";
  laneConfig.zombies.push(wrapper);
  gameArea.appendChild(wrapper);
}
function selectObject(obj) {
  if (!obj) return;
  document.querySelectorAll(".object").forEach((o) => o.classList.remove("selected"));
  selectedObject = obj;
  obj.classList.add("selected");
}
function startDrag(e) {
  const target = e.currentTarget;
  if (target.dataset.type === "plant" && target.dataset.locked === "true") {
    selectObject(target);
    return;
  }
  e.preventDefault();
  selectObject(target);
  if (selectedObject && selectedObject.dataset.type === "plant") {
    rememberPlantSlot(selectedObject);
    releaseSlot(selectedObject);
  }
  const rect = target.getBoundingClientRect();
  offsetX = e.clientX - rect.left;
  offsetY = e.clientY - rect.top;

  document.addEventListener("mousemove", drag);
  document.addEventListener("mouseup", stopDrag);
  target.style.cursor = "grabbing";
}
function drag(e) {
  if (!selectedObject) return;
  const gameRect = getGameAreaRect();
  selectedObject.style.left = `${e.clientX - gameRect.left - offsetX}px`;
  selectedObject.style.top = `${e.clientY - gameRect.top - offsetY}px`;
}
function stopDrag(e) {
  if (selectedObject) {
    selectedObject.style.cursor = "grab";
  }
  document.removeEventListener("mousemove", drag);
  document.removeEventListener("mouseup", stopDrag);
  if (selectedObject && selectedObject.dataset.type === "plant") {
    finalizePlantPlacement(selectedObject, e?.clientX, e?.clientY);
  }
}
function startTouchDrag(e) {
  const target = e.currentTarget;

  if (target.dataset.type === "plant" && target.dataset.locked === "true") {
    selectObject(target);
    return;
  }

  if (!e.touches || e.touches.length === 0) return;
  e.preventDefault();
  selectObject(target);

  if (selectedObject && selectedObject.dataset.type === "plant") {
    rememberPlantSlot(selectedObject);
    releaseSlot(selectedObject);
  }

  const rect = target.getBoundingClientRect();
  offsetX = e.touches[0].clientX - rect.left;
  offsetY = e.touches[0].clientY - rect.top;

  document.addEventListener("touchmove", touchMove, { passive: false });
  document.addEventListener("touchend", stopTouchDrag);
}

function touchMove(e) {
  if (!selectedObject || !e.touches || e.touches.length === 0) return;
  const gameRect = getGameAreaRect();
  selectedObject.style.left = `${e.touches[0].clientX - gameRect.left - offsetX}px`;
  selectedObject.style.top  = `${e.touches[0].clientY - gameRect.top - offsetY}px`;
}
function stopTouchDrag(e) {
  document.removeEventListener("touchmove", touchMove);
  document.removeEventListener("touchend", stopTouchDrag);
  if (selectedObject && selectedObject.dataset.type === "plant") {
    const pointer = e.changedTouches?.[0];
    finalizePlantPlacement(selectedObject, pointer?.clientX, pointer?.clientY);
  }
}
function finalizePlantPlacement(obj, pointerX, pointerY) {
  if (!obj || obj.dataset.type !== "plant") return;
  if (tryPlacePlantAtPosition(obj, pointerX, pointerY)) {
    delete obj.dataset.lastLaneIndex;
    delete obj.dataset.lastSlotIndex;
    return;
  }
  const fallbackLane = Number(obj.dataset.lastLaneIndex);
  const fallbackSlot = Number(obj.dataset.lastSlotIndex);
  if (Number.isInteger(fallbackLane) && Number.isInteger(fallbackSlot)) {
    const laneConfig = platformLanes[fallbackLane];
    if (laneConfig && !laneConfig.slots[fallbackSlot]) {
      placePlantInSlot(obj, laneConfig, fallbackSlot);
      delete obj.dataset.lastLaneIndex;
      delete obj.dataset.lastSlotIndex;
      return;
    }
  }
  removeObject(obj);
}
function createBullet(shooter, laneIndex) {
  const bullet = document.createElement("div");
  const shooterRect = shooter.getBoundingClientRect();
  const gameRect = getGameAreaRect();
  const left = shooterRect.right - gameRect.left;
  bullet.className = "bullet pixelart-to-css";
  const top = shooterRect.top - gameRect.top + shooterRect.height / 2;
  bullet.style.left = `${left}px`;
  bullet.style.top = `${top}px`;
  bullet.dataset.laneIndex = laneIndex;
  bullet.dataset.type = "bullet";
  gameArea.appendChild(bullet);
  bullets.push(bullet);
}
function handlePeashooterFiring(timestamp) {
  for (const laneConfig of platformLanes) {
    if (laneConfig.zombies.length === 0) continue;
    for (const shooter of laneConfig.slots) {
      if (!shooter) continue;
      const nextFire = Number(shooter.dataset.nextFire) || 0;
      if (timestamp >= nextFire) {
        createBullet(shooter, laneConfig.index);
        shooter.dataset.nextFire = timestamp + PEASHOOTER_FIRE_MS;
      }
    }
  }
}
function updateBullets(delta) {
  const activeBullets = [];
  for (const bullet of bullets) {
    const deltaPixels = (BULLET_SPEED * delta) / 1000;
    bullet.style.left = `${bullet.offsetLeft + deltaPixels}px`;
    if (bullet.offsetLeft > gameArea.clientWidth) {
      bullet.remove();
      continue;
    }
    const laneIndex = Number(bullet.dataset.laneIndex);
    const laneConfig = platformLanes[laneIndex];
    if (laneConfig && checkBulletCollision(bullet, laneConfig)) {
      bullet.remove();
      continue;
    }
    activeBullets.push(bullet);
  }
  bullets = activeBullets;
}
function checkBulletCollision(bullet, laneConfig) {
  const bulletRect = bullet.getBoundingClientRect();
  for (const zombie of [...laneConfig.zombies]) {
    const zombieRect = zombie.getBoundingClientRect();
    if (bulletRect.right >= zombieRect.left && bulletRect.left <= zombieRect.right && bulletRect.top <= zombieRect.bottom && bulletRect.bottom >= zombieRect.top) {
      const remaining = Number(zombie.dataset.health) - 1;
      if (remaining <= 0) {
        removeObject(zombie);
      } else {
        zombie.dataset.health = String(remaining);
      }
      return true;
    }
  }
  return false;
}
function findFirstPlantInLane(laneConfig) {
  for (const slot of laneConfig.slots) {
    if (slot) return slot;
  }
  return null;
}
const ZOMBIE_EAT_DURATION = 3000;
function updateZombies(delta, timestamp) {
  const deltaPixels = (ZOMBIE_SPEED * delta) / 1000;
  for (const laneConfig of platformLanes) {
    for (const zombie of [...laneConfig.zombies]) {
      if (zombie.eatingPlant) {
        if (timestamp >= zombie.eatingUntil) {
          removeObject(zombie.eatingPlant);
          delete zombie.eatingPlant;
          delete zombie.eatingUntil;
        }
        continue;
      }
      const targetPlant = findFirstPlantInLane(laneConfig);
      if (targetPlant) {
        const zombieRect = zombie.getBoundingClientRect();
        const plantRect = targetPlant.getBoundingClientRect();
        if (zombieRect.left <= plantRect.right + 4) {
          zombie.eatingPlant = targetPlant;
          zombie.eatingUntil = timestamp + ZOMBIE_EAT_DURATION;
          continue;
        }
      }
      const nextLeft = zombie.offsetLeft - deltaPixels;
      zombie.style.left = `${nextLeft}px`;

      if (zombie.offsetLeft + zombie.offsetWidth < 0) {
        removeObject(zombie);
      }
    }
  }
}
function gameLoop(timestamp) {
  const delta = timestamp - lastFrameTimestamp;
  lastFrameTimestamp = timestamp;
  updateZombies(delta, timestamp);
  updateBullets(delta);
  handlePeashooterFiring(timestamp);
  requestAnimationFrame(gameLoop);
}
function createShovelGhost() {
  shovelGhost = document.createElement("img");
  shovelGhost.src = "diashovel.png";
  shovelGhost.className = "shovel-ghost";
  shovelGhost.draggable = false;
  shovelGhost.style.width = `${SHOVEL_GHOST_SIZE}px`;
  shovelGhost.style.height = `${SHOVEL_GHOST_SIZE}px`;
  document.body.appendChild(shovelGhost);
}
function updateShovelGhost(x, y) {
  if (!shovelGhost) return;
  shovelGhost.style.left = `${x}px`;
  shovelGhost.style.top = `${y}px`;
}
function destroyShovelGhost() {
  if (!shovelGhost) return;
  shovelGhost.remove();
  shovelGhost = null;
}
function handleShovelDrop(x, y) {
  if (x == null || y == null) return;
  const target = document.elementFromPoint(x, y);
  const object = target?.closest(".object");
  if (!object) return;
  removeObject(object);
}
function startShovelDrag(e) {
  e.preventDefault();
  if (shovelDragging) return;
  shovelDragging = true;
  createShovelGhost();
  const pointer = e.touches?.[0] ?? e;
  lastShovelPoint = { x: pointer.clientX, y: pointer.clientY };
  updateShovelGhost(lastShovelPoint.x, lastShovelPoint.y);
  document.addEventListener("mousemove", shovelMove);
  document.addEventListener("mouseup", stopShovelDrag);
  document.addEventListener("touchmove", shovelMove, { passive: false });
  document.addEventListener("touchend", stopShovelDrag);
  document.addEventListener("touchcancel", stopShovelDrag);
}
function shovelMove(e) {
  if (!shovelDragging) return;
  const pointer = e.touches?.[0] ?? e;
  lastShovelPoint = { x: pointer.clientX, y: pointer.clientY };
  updateShovelGhost(lastShovelPoint.x, lastShovelPoint.y);
}
function stopShovelDrag(e) {
  if (!shovelDragging) return;
  const pointer = e.changedTouches?.[0] ?? e;
  if (pointer) {
    lastShovelPoint = { x: pointer.clientX, y: pointer.clientY };
  }
  handleShovelDrop(lastShovelPoint.x, lastShovelPoint.y);
  destroyShovelGhost();
  shovelDragging = false;
  shovelClickBlockUntil = Date.now() + 150;
  document.removeEventListener("mousemove", shovelMove);
  document.removeEventListener("mouseup", stopShovelDrag);
  document.removeEventListener("touchmove", shovelMove);
  document.removeEventListener("touchend", stopShovelDrag);
  document.removeEventListener("touchcancel", stopShovelDrag);
}
if (shovelSlot) {
  shovelSlot.removeAttribute("onclick");
  shovelSlot.addEventListener("mousedown", startShovelDrag);
  shovelSlot.addEventListener("touchstart", startShovelDrag, { passive: false });
  shovelSlot.addEventListener("click", (event) => {
    if (Date.now() < shovelClickBlockUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    removeSelected();
  });
}
gameArea.addEventListener("click", (e) => {
  if (e.target === gameArea || e.target.classList.contains("platform-lane")) {
    document.querySelectorAll(".object").forEach((o) => o.classList.remove("selected"));
    selectedObject = null;
  }
});
window.addEventListener("keydown", (e) => {
  if (!selectedObject) return;
  if (e.key === "Delete" || e.key === "Backspace") removeSelected();
});
requestAnimationFrame(gameLoop);