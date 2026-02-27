const form = document.getElementById("url-form");
const resultDiv = document.getElementById("result");
const qrButton = document.getElementById("qr-button");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const urlInput = document.getElementById("long-url");
  const url = urlInput.value.trim();
  if (!url) return alert("Please enter a URL");

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
                <button id="copy-btn" onclick="copyUrl(event, '${data.shortUrl}')">
                    Copy
                </button>
            </div>
        `;
    } else {
      alert(data.error || "Failed to shorten URL");
    }
  } catch (err) {
    console.error("Error:", err);
    alert("An error occurred while shortening the URL");
  }
});

qrButton.addEventListener("click", async () => {
    const urlInput = document.getElementById("long-url");
    const url = urlInput.value.trim();
    // validate URL format before sending to server
    try {
        new URL(url);
    } catch (err) {
        return alert("Please enter a valid URL");
    }

    if (!url) return alert("Please enter a URL");

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
            <button id="download-image">Download</button>
            `;
            const downloadBtn = document.getElementById("download-image");
                downloadBtn.addEventListener("click", () => {
                const img = document.getElementById("qr-image");
                if (!img) return alert("No QR code to download");

                const link = document.createElement("a");
                link.href = img.src;
                link.download = "qr-code.png";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        } else {
        alert(data.error);
        }
    } catch (err) {
    console.error("Error:", err);
    alert("An error occurred while generating the QR code");
  }
});

function openLink(url) {
    window.open(url, '_blank');
}

function copyUrl(event, url) {
    event.stopPropagation();

    navigator.clipboard.writeText(url).then(() => {
        const btn = event.target;
        btn.innerText = "Copied!";
        setTimeout(() => btn.innerText = "Copy", 2000);
    });
}


document.addEventListener('keydown', function(e) {
    if (e.key === '/') {

    const activeElem = document.activeElement.tagName;
    if (activeElem === 'INPUT' || activeElem === 'TEXTAREA') {
        return;
    }

    const searchInput = document.getElementById('long-url');

    if (searchInput) {
        e.preventDefault();
        searchInput.focus();
    }
    }
});