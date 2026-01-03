document.addEventListener('DOMContentLoaded', () => {
    const charInput = document.getElementById('charInput');
    const colorInput = document.getElementById('colorInput');
    const hexInput = document.getElementById('hexInput');
    
    const bgTransparent = document.getElementById('bgTransparent');
    const bgControls = document.getElementById('bgControls');
    const bgColorInput = document.getElementById('bgColorInput');
    const bgHexInput = document.getElementById('bgHexInput');

    const rotationInput = document.getElementById('rotationInput');
    const rotationValue = document.getElementById('rotationValue');
    const previewCanvas = document.getElementById('previewCanvas');
    const downloadBtn = document.getElementById('downloadBtn');

    // Update preview on any input change
    const updatePreview = () => {
        const text = charInput.value || ' ';
        const color = colorInput.value;
        const rotation = parseInt(rotationInput.value, 10);
        const isBgTransparent = bgTransparent.checked;
        const bgColor = bgColorInput.value;
        
        rotationValue.textContent = rotation;

        // Toggle UI state
        if (isBgTransparent) {
            bgControls.style.opacity = '0.5';
            bgControls.style.pointerEvents = 'none';
        } else {
            bgControls.style.opacity = '1';
            bgControls.style.pointerEvents = 'auto';
        }

        drawIcon(previewCanvas, text, color, rotation, isBgTransparent, bgColor);
    };

    // Event Listeners
    charInput.addEventListener('input', updatePreview);
    rotationInput.addEventListener('input', updatePreview);

    // Foreground Color Sync
    colorInput.addEventListener('input', (e) => {
        hexInput.value = e.target.value.toUpperCase();
        updatePreview();
    });
    hexInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (/^#[0-9A-F]{6}$/i.test(val)) {
            colorInput.value = val;
            updatePreview();
        }
    });

    // Background Color Sync
    bgTransparent.addEventListener('change', updatePreview);
    bgColorInput.addEventListener('input', (e) => {
        bgHexInput.value = e.target.value.toUpperCase();
        updatePreview();
    });
    bgHexInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (/^#[0-9A-F]{6}$/i.test(val)) {
            bgColorInput.value = val;
            updatePreview();
        }
    });

    // Initial draw
    updatePreview();

    downloadBtn.addEventListener('click', async () => {
        downloadBtn.disabled = true;
        downloadBtn.textContent = 'Generating...';

        try {
            await generateAndDownloadZip();
        } catch (err) {
            console.error(err);
            alert('Error generating ZIP file.');
        } finally {
            downloadBtn.disabled = false;
            downloadBtn.textContent = 'Download Assets (ZIP)';
        }
    });

    function drawIcon(canvas, text, color, rotation, isBgTransparent, bgColor) {
        const size = canvas.width;
        const ctx = canvas.getContext('2d');

        // Clear or Fill Background
        ctx.clearRect(0, 0, size, size);
        if (!isBgTransparent) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, size, size);
        }

        // 1. Measure the character at a reference font size to get its tight bounding box
        const refSize = 100;
        ctx.font = `${refSize}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const metrics = ctx.measureText(text);
        
        // Use actual bounding box if available for precision
        const left = metrics.actualBoundingBoxLeft !== undefined ? -metrics.actualBoundingBoxLeft : 0;
        const right = metrics.actualBoundingBoxRight !== undefined ? metrics.actualBoundingBoxRight : metrics.width;
        const top = metrics.actualBoundingBoxAscent !== undefined ? -metrics.actualBoundingBoxAscent : -refSize * 0.8;
        const bottom = metrics.actualBoundingBoxDescent !== undefined ? metrics.actualBoundingBoxDescent : refSize * 0.2;

        const charW = right - left;
        const charH = bottom - top;
        const charCenterX = (left + right) / 2;
        const charCenterY = (top + bottom) / 2;

        // 2. Calculate the bounding box after rotation
        const angle = rotation * Math.PI / 180;
        const corners = [
            { x: left - charCenterX, y: top - charCenterY },
            { x: right - charCenterX, y: top - charCenterY },
            { x: right - charCenterX, y: bottom - charCenterY },
            { x: left - charCenterX, y: bottom - charCenterY }
        ];

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        corners.forEach(p => {
            const rotatedX = p.x * Math.cos(angle) - p.y * Math.sin(angle);
            const rotatedY = p.x * Math.sin(angle) + p.y * Math.cos(angle);
            minX = Math.min(minX, rotatedX);
            maxX = Math.max(maxX, rotatedX);
            minY = Math.min(minY, rotatedY);
            maxY = Math.max(maxY, rotatedY);
        });

        const rotatedW = maxX - minX;
        const rotatedH = maxY - minY;

        // 3. Scale to fill
        const scale = Math.min(size / rotatedW, size / rotatedH);
        
        // 4. Draw
        ctx.save();
        ctx.translate(size / 2, size / 2);
        ctx.rotate(angle);
        ctx.scale(scale, scale);
        
        ctx.font = `${refSize}px sans-serif`;
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        // Draw relative to the measured center
        ctx.fillText(text, -charCenterX, -charCenterY);
        
        ctx.restore();
    }

    async function generateAndDownloadZip() {
        const text = charInput.value || ' ';
        const color = colorInput.value;
        const rotation = parseInt(rotationInput.value, 10);
        const isBgTransparent = bgTransparent.checked;
        const bgColor = bgColorInput.value;

        const zip = new JSZip();

        // 1. Generate PNGs
        const sizes = [
            { name: 'android-chrome-192x192.png', size: 192 },
            { name: 'android-chrome-512x512.png', size: 512 },
            { name: 'apple-touch-icon.png', size: 180 },
            { name: 'favicon-16x16.png', size: 16 },
            { name: 'favicon-32x32.png', size: 32 }
        ];

        // Helper to create blob from canvas
        const getBlob = (s) => {
            const c = document.createElement('canvas');
            c.width = s;
            c.height = s;
            drawIcon(c, text, color, rotation, isBgTransparent, bgColor);
            return new Promise(resolve => c.toBlob(resolve));
        };

        for (const item of sizes) {
            const blob = await getBlob(item.size);
            zip.file(item.name, blob);
        }

        // 2. Generate favicon.ico (containing 32x32 PNG)
        const png32Blob = await getBlob(32);
        const icoBlob = await pngToIco(png32Blob);
        zip.file('favicon.ico', icoBlob);

        // 3. Generate favicon.svg
        const svgContent = generateSvg(text, color, rotation, isBgTransparent, bgColor);
        zip.file('favicon.svg', svgContent);

        // 4. Generate site.webmanifest
        const manifest = {
            name: "Favicon",
            short_name: "Favicon",
            icons: [
                { src: "android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
                { src: "android-chrome-512x512.png", sizes: "512x512", type: "image/png" }
            ],
            theme_color: isBgTransparent ? "#ffffff" : bgColor,
            background_color: isBgTransparent ? "#ffffff" : bgColor,
            display: "standalone"
        };
        zip.file('site.webmanifest', JSON.stringify(manifest, null, 2));

        // Download
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'favicons.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function pngToIco(pngBlob) {
        const pngBuffer = await pngBlob.arrayBuffer();
        const pngData = new Uint8Array(pngBuffer);

        const header = new Uint8Array([
            0, 0,             // Reserved
            1, 0,             // Type (1 = ICO)
            1, 0,             // Count (1 image)
        ]);

        const entry = new Uint8Array([
            32,               // Width
            32,               // Height
            0,                // Colors (0 = 256 or more)
            0,                // Reserved
            1, 0,             // Planes
            32, 0,            // BPP
            ...int32ToBytes(pngData.length), // Size
            22, 0, 0, 0       // Offset (6 + 16 = 22)
        ]);

        const icoBytes = new Uint8Array(header.length + entry.length + pngData.length);
        icoBytes.set(header, 0);
        icoBytes.set(entry, header.length);
        icoBytes.set(pngData, header.length + entry.length);

        return new Blob([icoBytes], { type: 'image/x-icon' });
    }

    function int32ToBytes(num) {
        const arr = new Uint8Array(4);
        arr[0] = num & 0xFF;
        arr[1] = (num >> 8) & 0xFF;
        arr[2] = (num >> 16) & 0xFF;
        arr[3] = (num >> 24) & 0xFF;
        return arr;
    }

    function generateSvg(text, color, rotation, isBgTransparent, bgColor) {
        // We need to replicate the centering and scaling logic in SVG if possible.
        // However, SVG "text" bounding box behavior varies. 
        // A robust way for SVG is to just center it and let the user handle details,
        // BUT we want it to match the canvas output.
        // Since we can't easily "measure" text in a static SVG string generation without DOM,
        // we will stick to a reasonable default or try to match the logic roughly.
        // Actually, the simplest reliable SVG approach for a "perfect fit" is tricky without JS.
        // We will keep the previous simple SVG logic but add the background rect.
        
        let bgRect = '';
        if (!isBgTransparent) {
            bgRect = `<rect width="100%" height="100%" fill="${bgColor}"/>`;
        }

        return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  ${bgRect}
  <style>
    text {
      font-family: sans-serif;
      fill: ${color};
      font-size: 60px;
      dominant-baseline: middle;
      text-anchor: middle;
    }
  </style>
  <text x="50" y="55" transform="rotate(${rotation}, 50, 50)">${text}</text>
</svg>`.trim();
    }
});