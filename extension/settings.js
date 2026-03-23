const backendUrlInput = document.getElementById("backendUrl");
const officeSecretInput = document.getElementById("officeSecret");
const saveBtn  = document.getElementById("saveBtn");
const savedMsg = document.getElementById("savedMsg");

const DEFAULT_BACKEND_URL = "http://localhost:3000";

// Load saved values
chrome.storage.sync.get({ backendUrl: DEFAULT_BACKEND_URL, officeSecret: "" }, (data) => {
  backendUrlInput.value  = data.backendUrl;
  officeSecretInput.value = data.officeSecret;
});

saveBtn.addEventListener("click", () => {
  const url    = backendUrlInput.value.trim().replace(/\/$/, "");
  const secret = officeSecretInput.value.trim();

  chrome.storage.sync.set({ backendUrl: url, officeSecret: secret }, () => {
    savedMsg.classList.add("show");
    setTimeout(() => savedMsg.classList.remove("show"), 2000);
  });
});