// Background service worker — handles extension lifecycle events

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Humanizer] Extension installed.");
});
