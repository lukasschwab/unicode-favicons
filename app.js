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
    const rotateCCW = document.getElementById('rotateCCW');
    const rotateCW = document.getElementById('rotateCW');
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

    // Rotation Buttons
    rotateCCW.addEventListener('click', () => {
        let current = parseInt(rotationInput.value, 10);
        current = (current - 45 + 360) % 360;
        rotationInput.value = current;
        updatePreview();
    });

    rotateCW.addEventListener('click', () => {
        let current = parseInt(rotationInput.value, 10);
        current = (current + 45) % 360;
        rotationInput.value = current;
        updatePreview();
    });

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

    // --- SEARCH LOGIC ---
    const keywordInput = document.getElementById('keywordInput');
    const codepointInput = document.getElementById('codepointInput');
    const blockFiltersContainer = document.getElementById('blockFilters');
    const searchResultsContainer = document.getElementById('searchResults');

    // Debounce Utility
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    let unicodeData = null;
    let unicodeBlocks = null;
    let isDataLoading = false;

    // Load Data Immediately
    function loadData() {
        if (isDataLoading) return;
        isDataLoading = true;
        searchResultsContainer.innerHTML = '<p class="placeholder-text">Loading Unicode data...</p>';
        
        // Helper to load script
        const loadScript = (src) => {
            return new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = src;
                s.onload = resolve;
                s.onerror = reject;
                document.body.appendChild(s);
            });
        };

        Promise.all([
            loadScript('unicode_blocks.js'),
            loadScript('unicode_data.js')
        ]).then(() => {
            if (window.UNICODE_BLOCKS && window.UNICODE_DATA) {
                unicodeBlocks = window.UNICODE_BLOCKS;
                unicodeData = window.UNICODE_DATA;
                
                renderBlockFilters(unicodeBlocks);
                searchResultsContainer.innerHTML = '';
            } else {
                throw new Error('Data format incorrect');
            }
        }).catch(err => {
            console.error(err);
            searchResultsContainer.innerHTML = '<p class="placeholder-text" style="color:red">Error loading data.</p>';
        }).finally(() => {
            isDataLoading = false;
        });
    }
    loadData();

    function renderBlockFilters(blocks) {
        blockFiltersContainer.innerHTML = '';
        blocks.forEach(block => {
            const div = document.createElement('div');
            div.className = 'block-filter-item';
            div.dataset.blockName = block.name; // For filtering visibility
            
            // Generate a safe ID
            const safeId = 'block-' + block.name.replace(/[^a-zA-Z0-9]/g, '-');
            
            div.innerHTML = `
                <input type="checkbox" id="${safeId}" value="${block.name}" checked>
                <label for="${safeId}">${block.name}</label>
            `;
            blockFiltersContainer.appendChild(div);
        });
    }

    // Handle Checkbox Changes
    blockFiltersContainer.addEventListener('change', () => {
        // Just re-render results based on current query and new checkbox state
        // We don't re-filter the block list visibility on checkbox change, only on text query change
        filterAndRenderResults();
    });

    // --- GLYPH SUPPORT DETECTION ---
    const glyphTestCanvas = document.createElement('canvas');
    glyphTestCanvas.width = 32;
    glyphTestCanvas.height = 32;
    const glyphCtx = glyphTestCanvas.getContext('2d', { willReadFrequently: true });
    glyphCtx.font = '24px sans-serif';
    glyphCtx.textBaseline = 'middle';
    glyphCtx.textAlign = 'center';

    const tofuChar = '\u{10FFFF}'; // Max Unicode, likely unsupported
    // Draw tofu once to get baseline
    const tofuWidth = glyphCtx.measureText(tofuChar).width;
    glyphCtx.clearRect(0,0,32,32);
    glyphCtx.fillText(tofuChar, 16, 16);
    const tofuData = glyphCtx.getImageData(0,0,32,32).data;
    
    const supportCache = new Map();

    function isGlyphSupported(code) {
        if (supportCache.has(code)) return supportCache.get(code);

        const char = String.fromCodePoint(code);
        
        // 1. Fast Check: Width
        const width = glyphCtx.measureText(char).width;
        
        // If width is 0, it's invisible or zero-width. 
        // We consider these "unsupported" for favicon purposes (or at least valid to exclude).
        if (width === 0) {
            supportCache.set(code, false);
            return false;
        }

        // If width is significantly different from tofu, it's likely supported
        // (unless it's a different style of tofu, but standardizing on one helps)
        if (Math.abs(width - tofuWidth) > 0.5) {
             supportCache.set(code, true);
             return true;
        }

        // 2. Slow Check: Pixel Comparison
        // Characters with same width as tofu need pixel verification
        glyphCtx.clearRect(0,0,32,32);
        glyphCtx.fillText(char, 16, 16);
        const data = glyphCtx.getImageData(0,0,32,32).data;

        // Compare with tofu pixels
        let isDifferent = false;
        for (let i = 0; i < data.length; i++) {
            if (data[i] !== tofuData[i]) {
                isDifferent = true;
                break;
            }
        }

        supportCache.set(code, isDifferent);
        return isDifferent;
    }

    const debouncedSearch = debounce(performSearch, 300);
    keywordInput.addEventListener('input', debouncedSearch);
    codepointInput.addEventListener('input', debouncedSearch);

    let currentMatches = []; // Store matches to avoid re-searching when only toggling blocks

    function performSearch() {
        if (!unicodeData || !unicodeBlocks) return;

        const keyword = keywordInput.value.toLowerCase().trim();
        const codepoint = codepointInput.value.toUpperCase().trim();
        
        // Check if we should search: Need at least 2 chars in either field
        // Exception: If codepoint is just 1 char, maybe wait? Or let it fly?
        // Let's stick to >=2 chars generally to avoid massive render of Plane 1 (1000 items instantly).
        if (keyword.length < 2 && codepoint.length < 2) {
            currentMatches = [];
            // Show all blocks
            const items = blockFiltersContainer.querySelectorAll('.block-filter-item');
            items.forEach(item => item.style.display = 'flex');
            searchResultsContainer.innerHTML = '';
            return;
        }

        // 1. Search ALL data for text matches
        currentMatches = [];
        
        // Optimization: For very large datasets, this linear scan is okay (77k items ~10-20ms in V8).
        // A trie or index would be faster but this is acceptable for a prototype.
        for (const item of unicodeData) {
            // item is [code, name]
            const hexCode = item[0].toString(16).toUpperCase();
            
            const matchKeyword = !keyword || item[1].toLowerCase().includes(keyword);
            const matchCodepoint = !codepoint || hexCode.startsWith(codepoint);

            if (matchKeyword && matchCodepoint) {
                if (isGlyphSupported(item[0])) {
                    currentMatches.push({ code: item[0], name: item[1] });
                }
            }
        }

        // 2. Identify which blocks have hits
        const blocksWithHits = new Set();
        // Map matches to blocks. Efficient way:
        // We can sort matches by code, or just iterate. 
        // Or, for each match, find its block.
        // Since blocks are sorted ranges, binary search is best, but linear scan of blocks is slow per char.
        // Let's optimize: Blocks are ranges.
        // We can iterate through matches.
        
        // Actually, let's just create a set of "active block names" based on the matches.
        // To do this fast:
        // We can pre-calculate block assignment for every char? Memory heavy.
        // Or just iterate: For each match, find which block it belongs to.
        // With 346 blocks, `find` is 346 ops. With 1000 matches, 346k ops. Fast enough.
        
        currentMatches.forEach(match => {
            // Find block
            // Simple linear search is fine here
            const block = unicodeBlocks.find(b => match.code >= b.start && match.code <= b.end);
            if (block) {
                blocksWithHits.add(block.name);
            }
        });

        // 3. Update Block Filter Visibility
        const filterItems = blockFiltersContainer.querySelectorAll('.block-filter-item');
        filterItems.forEach(item => {
            const name = item.dataset.blockName;
            if (blocksWithHits.has(name)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });

        // 4. Render Results
        filterAndRenderResults();
    }

    function filterAndRenderResults() {
        const keyword = keywordInput.value.toLowerCase().trim();
        const codepoint = codepointInput.value.toUpperCase().trim();

        if (!currentMatches.length && (keyword.length >= 2 || codepoint.length >= 2)) {
            searchResultsContainer.innerHTML = '<p class="placeholder-text">No matches found.</p>';
            return;
        }

        // Get currently checked blocks (only visible ones matter effectively, but let's check actual state)
        const checkedBoxes = Array.from(blockFiltersContainer.querySelectorAll('input:checked'));
        const checkedBlockNames = new Set(checkedBoxes.map(cb => cb.value));

        // Filter matches by checked blocks
        // We need to know block of each match again. 
        // Doing it in one pass during performSearch would be better, but "filtering" is distinct.
        // Let's re-verify block ownership.
        
        const resultsToRender = [];
        const limit = 5000;

        for (const match of currentMatches) {
            if (resultsToRender.length >= limit) break;

            // Check if its block is enabled
            // Optimization: We could store the blockName on the match object in performSearch
            // But let's just find it.
            const block = unicodeBlocks.find(b => match.code >= b.start && match.code <= b.end);
            if (block && checkedBlockNames.has(block.name)) {
                resultsToRender.push(match);
            }
        }

        renderResults(resultsToRender);
    }

    function renderResults(results) {
        searchResultsContainer.innerHTML = '';
        if (results.length === 0) {
            const keyword = keywordInput.value.toLowerCase().trim();
            const codepoint = codepointInput.value.toUpperCase().trim();
            if (keyword.length >= 2 || codepoint.length >= 2) {
                 searchResultsContainer.innerHTML = '<p class="placeholder-text">No matches in selected blocks.</p>';
            }
            return;
        }

        results.forEach(item => {
            const char = String.fromCodePoint(item.code);
            const div = document.createElement('div');
            div.className = 'result-item';
            div.title = item.name;
            div.innerHTML = `
                <span class="result-char">${char}</span>
                <span class="result-name">${item.name.toLowerCase()}</span>
            `;
            div.addEventListener('click', () => {
                charInput.value = char;
                updatePreview();
                // Optional: Scroll generator into view on mobile
                if (window.innerWidth <= 850) {
                    document.querySelector('.generator-panel').scrollIntoView({ behavior: 'smooth' });
                }
            });
            searchResultsContainer.appendChild(div);
        });
    }

    // --- END SEARCH LOGIC ---

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
        
        const codePoint = text.codePointAt(0);
        const hex = codePoint.toString(16).toUpperCase();
        a.download = `U+${hex}.zip`;

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
        // Create off-screen canvas for precise measurement
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const refSize = 100; // Reference size for measurement
        ctx.font = `${refSize}px sans-serif`;
        
        const metrics = ctx.measureText(text);
        
        // Calculate unrotated bounding box
        const left = metrics.actualBoundingBoxLeft !== undefined ? -metrics.actualBoundingBoxLeft : 0;
        const right = metrics.actualBoundingBoxRight !== undefined ? metrics.actualBoundingBoxRight : metrics.width;
        const top = metrics.actualBoundingBoxAscent !== undefined ? -metrics.actualBoundingBoxAscent : -refSize * 0.8;
        const bottom = metrics.actualBoundingBoxDescent !== undefined ? metrics.actualBoundingBoxDescent : refSize * 0.2;
        
        const w = right - left;
        const h = bottom - top;
        const cx = (left + right) / 2;
        const cy = (top + bottom) / 2;

        // Calculate rotated bounding box to determine scale
        const angle = rotation * Math.PI / 180;
        const corners = [
            { x: left - cx, y: top - cy },
            { x: right - cx, y: top - cy },
            { x: right - cx, y: bottom - cy },
            { x: left - cx, y: bottom - cy }
        ];
        
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        corners.forEach(p => {
            const rx = p.x * Math.cos(angle) - p.y * Math.sin(angle);
            const ry = p.x * Math.sin(angle) + p.y * Math.cos(angle);
            minX = Math.min(minX, rx);
            maxX = Math.max(maxX, rx);
            minY = Math.min(minY, ry);
            maxY = Math.max(maxY, ry);
        });
        
        const rotatedW = maxX - minX;
        const rotatedH = maxY - minY;
        
        // Target size is 100x100
        const targetSize = 100;
        // Prevent division by zero if empty string
        const scale = (rotatedW > 0 && rotatedH > 0) ? Math.min(targetSize / rotatedW, targetSize / rotatedH) : 1;
        
        const fontSize = refSize * scale;
        
        // Position:
        // We place the text origin so that the visual center (cx, cy) ends up at (50, 50).
        // The text element's x/y attributes define the origin (0,0) of the glyph.
        const tx = 50 - (cx * scale);
        const ty = 50 - (cy * scale);

        let bgRect = '';
        if (!isBgTransparent) {
            bgRect = `<rect width="100%" height="100%" fill="${bgColor}"/>`;
        }

        return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  ${bgRect}
  <style>
    text {
      font-family: sans-serif;
      fill: ${color};
      font-size: ${fontSize}px;
      /* Default dominant-baseline (auto/alphabetic) and text-anchor (start) are used */
    }
  </style>
  <text x="${tx}" y="${ty}" transform="rotate(${rotation}, 50, 50)">${text}</text>
</svg>`.trim();
    }
});
