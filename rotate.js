const TARGET_URL = "garden.html";

function isMobileDevice() {
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints > 1);
}

function isLandscape() {
  return window.matchMedia("(orientation: landscape)").matches;
}

function check() {
  // desktop -> go straight to game
  if (!isMobileDevice()) {
    window.location.replace(TARGET_URL);
    return;
  }

  // mobile landscape -> go to game
  if (isLandscape()) {
    window.location.replace(TARGET_URL);
  }
}

window.addEventListener("resize", check);
window.addEventListener("orientationchange", check);
check();
