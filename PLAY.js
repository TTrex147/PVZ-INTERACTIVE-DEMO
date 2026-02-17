const GAME_URL = "garden.html";
const ROTATE_URL = "rotate.html";

function isMobileDevice() {
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints > 1);
}

function isLandscape() {
  return window.matchMedia("(orientation: landscape)").matches;
}

document.getElementById("playButton").addEventListener("click", () => {
  if (isMobileDevice() && !isLandscape()) {
    window.location.href = ROTATE_URL;
  } else {
    window.location.href = GAME_URL;
  }
});
