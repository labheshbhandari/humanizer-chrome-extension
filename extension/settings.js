const input = document.getElementById("backendUrl");
const saveBtn = document.getElementById("saveBtn");
const savedMsg = document.getElementById("savedMsg");

// Load saved value
chrome.storage.sync.get({ backendUrl: "http://localhost:3000" }, (data) => {
  input.value = data.backendUrl;
});

saveBtn.addEventListener("click", () => {
  const url = input.value.trim().replace(/\/$/, ""); // remove trailing slash
  chrome.storage.sync.set({ backendUrl: url }, () => {
    savedMsg.classList.add("show");
    setTimeout(() => savedMsg.classList.remove("show"), 2000);
  });
});
