const TARGET_URL = "test.html";

// Mobile detection (works fine for Android Chrome + iOS Safari)
function isMobileDevice() {
  const ua = navigator.userAgent || "";
  const uaMobile = /Android|iPhone|iPad|iPod/i.test(ua);

  // extra fallback for tablets/modern devices
  const touchLikely = navigator.maxTouchPoints && navigator.maxTouchPoints > 1;
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 900;

  return uaMobile || (touchLikely && smallScreen);
}

function isLandscape() {
  return window.matchMedia("(orientation: landscape)").matches;
}

function check() {
  // If not mobile, go straight to the game
  if (!isMobileDevice()) {
    window.location.replace(TARGET_URL);
    return;
  }

  // If mobile and landscape, go to the game
  if (isLandscape()) {
    window.location.replace(TARGET_URL);
  }
}

window.addEventListener("resize", check);
window.addEventListener("orientationchange", check);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) check();
});

check();
