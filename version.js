// Change this single text string whenever you update your app!
const CURRENT_VERSION = "v1.5.1";

// Wait for the page to load, then inject the version into any badge it finds
document.addEventListener("DOMContentLoaded", () => {
    const versionBadges = document.querySelectorAll(".app-version");
    versionBadges.forEach(badge => {
        badge.innerText = CURRENT_VERSION;
    });
});
