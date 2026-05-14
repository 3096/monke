// ==UserScript==
// @name        Blocked Reddit QR Code
// @namespace   https://github.com/3096/monke
// @version     1.0.0
// @description When Reddit blocks your IP (403 Forbidden), replaces the sad Snoo image with a QR code of the current page URL so you can scan it on your phone.
// @author      3096
// @match       https://www.reddit.com/*
// @match       https://old.reddit.com/*
// @grant       none
// @require     https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js
// ==/UserScript==

(function () {
    'use strict';

    // --- Detection ---
    // The blocked page has a very specific structure:
    //   div.items-center > div.overflow-hidden > img[src^="data:image/png;base64,"]
    // and a heading that says "You've been blocked by network security."
    // We check for both to avoid false positives on normal Reddit pages.

    function isBlockedPage() {
        const heading = document.querySelector('div.font-bold.text-24');
        return heading && heading.textContent.includes("You've been blocked by network security");
    }

    function getSnooImageContainer() {
        // The image sits inside: div.overflow-hidden > img[src^="data:image/png;base64,"]
        const img = document.querySelector(
            'div.overflow-hidden > img[src^="data:image/png;base64,"]'
        );
        return img ? img.parentElement : null;
    }

    // --- QR Code Generation ---

    function generateQRCodeDataURL(text) {
        // qrcode-generator is loaded via @require
        // TypeNumber 0 = auto-detect, ErrorCorrectionLevel M
        const qr = qrcode(0, 'M');
        qr.addData(text);
        qr.make();
        return qr.createDataURL(8, 4); // cellSize=8, margin=4
    }

    // --- DOM Replacement ---

    function replaceSnooWithQR() {
        const container = getSnooImageContainer();
        if (!container) return;

        const currentURL = window.location.href;
        const qrDataURL = generateQRCodeDataURL(currentURL);

        // Clear the container and insert the QR code
        container.innerHTML = '';
        container.classList.remove('overflow-hidden');
        container.style.padding = '1rem';

        const qrImg = document.createElement('img');
        qrImg.src = qrDataURL;
        qrImg.alt = 'QR code for this page';
        qrImg.style.cssText = 'width: 256px; height: 256px; image-rendering: pixelated;';
        container.appendChild(qrImg);

        // Add a small label below the QR code
        const label = document.createElement('div');
        label.textContent = 'Scan to open on your phone';
        label.style.cssText = 'margin-top: 0.5rem; font-size: 0.875rem; color: var(--color-neutral-content-weak, #576F76); text-align: center;';
        container.appendChild(label);

        // Also add the raw URL as a copyable text field
        const urlBox = document.createElement('input');
        urlBox.type = 'text';
        urlBox.readOnly = true;
        urlBox.value = currentURL;
        urlBox.style.cssText = 'margin-top: 0.5rem; width: 256px; text-align: center; font-size: 0.75rem; padding: 0.25rem; border: 1px solid var(--color-neutral-border, #00000033); border-radius: 4px; background: var(--color-neutral-background-weak, #F9FAFA); color: var(--color-neutral-content, #2A3C42);';
        urlBox.addEventListener('click', () => { urlBox.select(); });
        container.appendChild(urlBox);
    }

    // --- Entry Point ---

    // Reddit's blocked page is a static HTML page (no SPA routing), so we can
    // run detection once the DOM is ready.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (isBlockedPage()) replaceSnooWithQR();
        });
    } else {
        if (isBlockedPage()) replaceSnooWithQR();
    }
})();
