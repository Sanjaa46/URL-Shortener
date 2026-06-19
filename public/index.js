const form = document.getElementById("url-form");
const resultDiv = document.getElementById("result");
const qrButton = document.getElementById("qr-button");
const submitBtn = form.querySelector('button[type="submit"]');
const toast = document.getElementById("toast");
let toastTimer = null;

function showToast(message, type = "error") {
    toast.textContent = message;
    toast.className = `show toast-${type}`;

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}


form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = document.getElementById("long-url").value.trim();

  submitBtn.classList.add("loading");
  submitBtn.disabled = true;

  try {
    const res = await fetch('/shorten', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (res.ok) {
      resultDiv.innerHTML = `
        <div id="url-container" onclick="openLink('${data.shortUrl}')">
          <span id="url-text">${data.shortUrl}</span>
          <button id="copy-btn" onclick="copyUrl(event, '${data.shortUrl}')">Copy</button>
        </div>
      `;
    } else {
      showToast(data.error || "Failed to shorten URL");
    }
  } catch (err) {
    console.error("Error:", err);
    showToast("Network error — could not reach the server");
  } finally {
    submitBtn.classList.remove("loading");
    submitBtn.disabled = false;
  }
});

qrButton.addEventListener("click", async () => {
  const url = document.getElementById("long-url").value.trim();

  qrButton.disabled = true;
  qrButton.style.opacity = "0.6";

  try {
    const res = await fetch('/qr', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (res.ok) {
      resultDiv.innerHTML = `
        <img src="${data}" alt="QR Code" id="qr-image" />
        <button id="download-image">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
          </svg>
          Download PNG
        </button>
      `;
      document.getElementById("download-image").addEventListener("click", () => {
        const img = document.getElementById("qr-image");
        if (!img) return;
        const link = document.createElement("a");
        link.href = img.src;
        link.download = "qr-code.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    } else {
      showToast(data.error || "Failed to generate QR code");
    }
  } catch (err) {
    console.error("Error:", err);
    showToast("Network error — could not reach the server");
  } finally {
    qrButton.disabled = false;
    qrButton.style.opacity = "";
  }
});

function openLink(url) {
  window.open(url, '_blank');
}

function copyUrl(event, url) {
  event.stopPropagation();
  const btn = event.target;
  navigator.clipboard.writeText(url).then(() => {
    btn.innerText = "Copied!";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.innerText = "Copy";
      btn.classList.remove("copied");
    }, 2000);
  });
}

document.addEventListener('keydown', function(e) {
  if (e.key === '/') {
    const activeElem = document.activeElement.tagName;
    if (activeElem === 'INPUT' || activeElem === 'TEXTAREA') return;
    const searchInput = document.getElementById('long-url');
    if (searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
  }
});